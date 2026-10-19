/**
 * Hyunk AI Hub - Six Thinking Hats endpoint
 *
 * One request of the panel produces six AI requests: every hat gets its own
 * system prompt. The first five hats run in parallel, the Blue Hat runs last
 * and summarises the other five.
 *
 * The feature is reserved for Premium 3, Premium 4 and the administrator.
 * Every hat is counted against the daily quota of the account, a full
 * analysis therefore costs six requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultRouter } from '@/lib/ai/router';
import { ProviderId } from '@/lib/ai/types';
import {
  saveMessage,
  createConversation,
  checkAndIncrementUsage,
  getUsageSnapshot,
  recordUsageRole,
} from '@/lib/storage';
import { getEffectiveRole } from '@/lib/roles';
import { getTierConfig, canAccessTier, roleForModel, tierLabel } from '@/lib/ai/tiers';
import { getModelById } from '@/lib/ai/models';
import { getSessionFromRequest } from '@/lib/auth';
import { buildConversationTitle } from '@/lib/conversationTitle';
import {
  SIX_HATS,
  SIX_HATS_MIN_TIER,
  SIX_HATS_REQUIRED_LABEL,
  PARALLEL_HAT_IDS,
  BLUE_HAT_ID,
  SixHatDefinition,
  SixHatResults,
  buildBlueHatContext,
  buildSixHatsMarkdown,
  canUseSixHats,
  getSixHat,
} from '@/lib/ai/sixHats';

const sixHatsRequestSchema = z.object({
  /** The topic that is analysed by the six hats. */
  topic: z.string().min(3).max(4000),
  model: z.string().min(1),
  provider: z.enum(['radox', 'inkstone', 'auto']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  /** The conversation the analysis is stored in. */
  conversationId: z.string().optional(),
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The output budget of a single hat. */
const MAX_TOKENS_PER_HAT = 2000;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Silakan login terlebih dahulu untuk menggunakan Six Thinking Hats.' },
        { status: 401 }
      );
    }

    const json = await req.json();
    const parsed = sixHatsRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { topic, model, provider, temperature, conversationId } = parsed.data;
    const providerParam = provider === 'auto' ? undefined : (provider as ProviderId);

    // -----------------------------------------------------------------------
    // Role & tier: the feature belongs to Premium 3, Premium 4 and admin.
    // -----------------------------------------------------------------------
    const role = await getEffectiveRole(user.id, user.email);
    const tierConfig = getTierConfig(role);
    const tier = tierConfig.tier;

    if (!canUseSixHats(role, tier)) {
      return NextResponse.json(
        {
          error: `Fitur ini membutuhkan ${SIX_HATS_REQUIRED_LABEL} atau lebih tinggi.`,
          code: 'SIX_HATS_TIER_REQUIRED',
          upgradeRequired: true,
          requiredTier: SIX_HATS_MIN_TIER,
          requiredLabel: SIX_HATS_REQUIRED_LABEL,
          role,
          tier,
        },
        { status: 403 }
      );
    }

    // The model of the account must be usable, the rule is the same as in the
    // chat endpoint.
    const selectedModel = getModelById(model, providerParam);
    if (selectedModel && !canAccessTier(role, selectedModel.minTier)) {
      const required = tierLabel(selectedModel.minTier);

      return NextResponse.json(
        {
          error: `Model ini membutuhkan ${required}. Upgrade akun kamu untuk mengaksesnya.`,
          code: 'MODEL_TIER_REQUIRED',
          upgradeRequired: true,
          requiredTier: selectedModel.minTier,
          requiredRole: roleForModel(selectedModel.minTier),
          requiredLabel: required,
          role,
          tier,
        },
        { status: 403 }
      );
    }

    // -----------------------------------------------------------------------
    // Quota: the analysis costs six requests, they must all be available.
    // -----------------------------------------------------------------------
    const snapshot = await getUsageSnapshot(user.id, tierConfig.dailyRequestLimit);
    if (snapshot.remaining < SIX_HATS.length) {
      const limitLabel = Number.isFinite(snapshot.limit)
        ? `${snapshot.limit} request`
        : 'tak terbatas';

      return NextResponse.json(
        {
          error: `Analisis Six Thinking Hats membutuhkan ${SIX_HATS.length} request, kuota harianmu tinggal ${snapshot.remaining}. Batas ${limitLabel} per hari.`,
          code: 'PLAN_LIMIT_REACHED',
          upgradeRequired: true,
          role,
          tier,
          tierLabel: tierConfig.name,
          limit: Number.isFinite(snapshot.limit) ? snapshot.limit : null,
          remaining: snapshot.remaining,
          required: SIX_HATS.length,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': Number.isFinite(snapshot.limit) ? String(snapshot.limit) : '0',
            'X-RateLimit-Remaining': String(snapshot.remaining),
            'X-Role': role,
            'X-Tier': String(tier),
          },
        }
      );
    }

    // -----------------------------------------------------------------------
    // Conversation: the topic and the analysis end up in the history.
    // -----------------------------------------------------------------------
    let activeConvId = conversationId;
    let createdConversation: { id: string; title: string } | null = null;

    if (!activeConvId) {
      try {
        const newConv = await createConversation(
          buildConversationTitle(topic),
          model,
          provider ?? 'auto',
          user.id
        );
        activeConvId = newConv.id;
        createdConversation = { id: newConv.id, title: newConv.title };
      } catch (err) {
        console.warn('[SixHats] Failed to auto-create conversation:', err);
      }
    }

    if (activeConvId) {
      await saveMessage(
        activeConvId,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: topic,
          createdAt: new Date().toISOString(),
        },
        user.id
      );
    }

    const maxTokens = Math.min(MAX_TOKENS_PER_HAT, tierConfig.maxTokensPerRequest);
    const encoder = new TextEncoder();
    const results: SixHatResults = {};
    let promptTokens = 0;
    let completionTokens = 0;
    let finalModel = model;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        if (createdConversation) {
          controller.enqueue(
            encoder.encode(
              `event: conversation\ndata: ${JSON.stringify({
                conversationId: createdConversation.id,
                conversationTitle: createdConversation.title,
              })}\n\n`
            )
          );
        }

        /**
         * Runs one hat: one AI request, one quota unit.
         */
        const runHat = async (
          hat: SixHatDefinition,
          userPrompt: string,
          isSummary = false
        ): Promise<string> => {
          const usage = await checkAndIncrementUsage(user.id, tierConfig.dailyRequestLimit);
          if (!usage.allowed) {
            send({ hatId: hat.id, error: 'Kuota harian sudah habis.' });
            return '';
          }

          let text = '';
          try {
            const result = await defaultRouter.streamChat(
              {
                messages: [
                  { role: 'system', content: hat.systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                model,
                provider: providerParam,
                temperature: temperature ?? 0.7,
                maxTokens,
                maxTier: tier,
                signal: req.signal,
              },
              (chunk) => {
                if (chunk.text) {
                  text += chunk.text;
                  // The Blue Hat is streamed with the summary flag, the client
                  // shows it in the big blue card below the grid.
                  send(isSummary
                    ? { hatId: hat.id, summary: true, chunk: chunk.text }
                    : { hatId: hat.id, chunk: chunk.text });
                }
                if (chunk.model) finalModel = chunk.model;
              }
            );

            text = text || result.text || '';
            promptTokens += result.usage?.promptTokens ?? 0;
            completionTokens += result.usage?.completionTokens ?? 0;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            send({ hatId: hat.id, error: message });
          }

          results[hat.id] = text;
          return text;
        };

        try {
          // 1. The five perspectives run in parallel.
          await Promise.all(
            PARALLEL_HAT_IDS.map((id) => {
              const hat = getSixHat(id);
              if (!hat) return Promise.resolve('');
              return runHat(hat, topic);
            })
          );

          // 2. The Blue Hat summarises the five perspectives.
          const blueHat = getSixHat(BLUE_HAT_ID);
          if (blueHat) {
            const context = buildBlueHatContext(results);
            const bluePrompt = `Topik: ${topic}\n\nBerikut hasil dari lima topi lainnya:\n\n${context}\n\nBuat rangkuman menyeluruh: fakta utama, emosi yang muncul, risiko, peluang, ide kreatif, lalu tentukan langkah selanjutnya yang paling tepat dan kesimpulan final yang bisa langsung dijalankan.`;

            await runHat(blueHat, bluePrompt, true);
          }

          // 3. The analysis is stored as a single assistant message.
          const markdown = buildSixHatsMarkdown(topic, results);
          if (activeConvId) {
            await saveMessage(
              activeConvId,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: markdown,
                model: finalModel,
                tokensPrompt: promptTokens,
                tokensCompletion: completionTokens,
                createdAt: new Date().toISOString(),
              },
              user.id
            );
          }

          await recordUsageRole(user.id, role);

          send({
            done: true,
            conversationId: activeConvId,
            markdown,
            model: finalModel,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          send({ error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Role': role,
        'X-Tier': String(tier),
        'X-Max-Tokens': String(maxTokens),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
