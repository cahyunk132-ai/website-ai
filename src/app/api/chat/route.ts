/**
 * Hyunk AI Hub - Multi-Provider Chat Completion SSE Endpoint
 * Supports Multimodal Vision, Document Attachments, Live Web Search, Custom System Prompts,
 * Parameter Controls (Temperature, Top P, Max Tokens), Agent Skills, and a real
 * multi-step Autonomous Agent Mode with live tool execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultRouter } from '@/lib/ai/router';
import { ProviderId, ChatMessage, FileAttachment } from '@/lib/ai/types';
import {
  saveMessage,
  createConversation,
  checkAndIncrementUsage,
  recordUsageRole,
} from '@/lib/storage';
import { getUserPlan, planFor, isPremiumPlan } from '@/lib/plans';
import { getEffectiveRole } from '@/lib/roles';
import { getTierConfig, canAccessTier, roleForModel, tierLabel } from '@/lib/ai/tiers';
import { getModelById } from '@/lib/ai/models';
import { executeWebSearch } from '@/lib/ai/tools';
import { getSessionFromRequest } from '@/lib/auth';
import { buildConversationTitle } from '@/lib/conversationTitle';
import { buildAgentSystemPrompt, buildPersonaSystemPrompt } from '@/lib/ai/agentProtocol';
import { runAgent, AgentStepResult } from '@/lib/ai/agent';
import { AGENT_TOOLS } from '@/lib/ai/tools';
import { isFileCreationRequest } from '@/lib/ai/generatedFiles';
import { getSkillCatalog, loadSkillContent, loadPinnedSkills } from '@/lib/skills/registry';
import { listMemories, buildMemoryPrompt } from '@/lib/featureStorage';
import { ActivatedSkill } from '@/lib/skills/types';

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['image', 'document']),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().optional(),
  extractedText: z.string().optional(),
});

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().max(100000),
      attachments: z.array(attachmentSchema).optional(),
    })
  ).min(1),
  model: z.string().min(1),
  provider: z.enum(['radox', 'inkstone', 'auto']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(1).max(32768).optional(),
  systemPrompt: z.string().optional(),
  webSearch: z.boolean().optional(),
  conversationId: z.string().optional(),
  mode: z.enum(['chat', 'agent']).optional().default('chat'),
  /** Slugs of the skills pinned by the user (manual preset personas). */
  skills: z.array(z.string().max(80)).max(10).optional(),
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s timeout for streaming completions on Vercel

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Silakan login terlebih dahulu untuk mengakses layanan AI.' },
        { status: 401 }
      );
    }

    const json = await req.json();
    const parsed = chatRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------------------
    // Role & tier: the role decides the quota, the answer length and which
    // models may be used. It is resolved on every request, an upgrade is
    // therefore visible immediately and never needs a new login.
    // ---------------------------------------------------------------------
    const role = await getEffectiveRole(user.id, user.email);
    const tierConfig = getTierConfig(role);
    const tier = tierConfig.tier;

    // The plan is still tracked, it decides the label of the premium panel.
    const plan = await getUserPlan(user.id);

    const {
      messages,
      model,
      provider,
      temperature,
      topP,
      maxTokens,
      systemPrompt,
      webSearch,
      conversationId,
      mode: requestedMode,
      skills: requestedSkillSlugs,
    } = parsed.data;

    const latestUserText = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
    const mode = requestedMode === 'agent' || isFileCreationRequest(latestUserText) ? 'agent' : 'chat';

    const providerParam = provider === 'auto' ? undefined : (provider as ProviderId);

    // 1. Model access: a model of a higher tier may not be used. The check
    //    runs before the quota is counted, a rejected request is free.
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

    // 1.5 Vision auto-switch: if images are attached but the selected model
    //     doesn't support vision, switch to a vision-capable model.
    const hasImageAttachments = messages.some((msg) =>
      msg.attachments?.some((a) => a.type === 'image' && a.url)
    );

    let effectiveModel = model;
    let effectiveProvider = providerParam;
    let visionSwitchNotice: string | undefined;

    if (hasImageAttachments && selectedModel && !selectedModel.supportsVision) {
      // Find a vision-capable model in the same provider, or fallback to any vision model
      const { getModelsByProvider } = await import('@/lib/ai/models');
      const providerModels = effectiveProvider
        ? getModelsByProvider(effectiveProvider)
        : [];
      
      let visionModel = providerModels.find(
        (m) => m.supportsVision && canAccessTier(role, m.minTier)
      );

      // If no vision model in the same provider, try any provider
      if (!visionModel) {
        const allModels = await import('@/lib/ai/models').then((m) => m.getModelsByProvider('radox'));
        visionModel = allModels.find(
          (m) => m.supportsVision && canAccessTier(role, m.minTier)
        );
      }

      if (visionModel) {
        visionSwitchNotice = `Model "${selectedModel.name}" tidak support vision. Auto-switch ke "${visionModel.name}" untuk memproses gambar.`;
        effectiveModel = visionModel.id;
        effectiveProvider = visionModel.provider;
      }
    }

    // 2. Daily quota of the tier. Malformed requests are rejected before they
    //    are counted.
    const usage = await checkAndIncrementUsage(user.id, tierConfig.dailyRequestLimit);
    if (!usage.allowed) {
      const limitLabel = Number.isFinite(usage.limit)
        ? `${usage.limit} request`
        : 'tak terbatas';
      const upgradeHint = isPremiumPlan(plan)
        ? 'Coba lagi besok, kuota direset setiap pukul 00:00 UTC.'
        : 'Upgrade ke tier yang lebih tinggi, atau coba lagi besok pukul 00:00 UTC.';

      return NextResponse.json(
        {
          error: `Batas penggunaan harian paket ${tierConfig.name} (${limitLabel}) telah tercapai. ${upgradeHint}`,
          code: 'PLAN_LIMIT_REACHED',
          upgradeRequired: true,
          role,
          tier,
          tierLabel: tierConfig.name,
          plan,
          planLabel: planFor(plan).label,
          limit: Number.isFinite(usage.limit) ? usage.limit : null,
          remaining: 0,
          upgradeAvailable: !isPremiumPlan(plan),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': Number.isFinite(usage.limit) ? String(usage.limit) : '0',
            'X-RateLimit-Remaining': '0',
            'X-Plan': plan,
            'X-Role': role,
            'X-Tier': String(tier),
            'Retry-After': '3600',
          },
        }
      );
    }

    // 3. The output of a single request is limited by the tier.
    const effectiveMaxTokens = Math.min(
      maxTokens ?? tierConfig.maxTokensPerRequest,
      tierConfig.maxTokensPerRequest
    );

    // 4. The history that is sent to the model is limited by the tier.
    const contextMessages = messages.slice(-tierConfig.maxContextMessages);

    // ---------------------------------------------------------------------
    // Skill library: discovery catalog + the personas pinned by the user
    // ---------------------------------------------------------------------
    const [catalog, dbPinnedSkills] = await Promise.all([
      getSkillCatalog(user.id),
      loadPinnedSkills(user.id),
    ]);

    const pinnedSlugs = Array.from(
      new Set([...dbPinnedSkills.map((skill) => skill.slug), ...(requestedSkillSlugs || [])])
    );

    const pinnedSkills: ActivatedSkill[] = [];
    for (const slug of pinnedSlugs) {
      const skill = await loadSkillContent(slug, user.id);
      if (skill) pinnedSkills.push(skill);
    }

    // ---------------------------------------------------------------------
    // AI memory: the facts the user asked the assistant to remember
    // ---------------------------------------------------------------------
    const memories = await listMemories(user.id);
    const memoryPrompt = buildMemoryPrompt(memories);

    // Prepare message array
    const preparedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }> = [];

    if (memoryPrompt) {
      preparedMessages.push({ role: 'system', content: memoryPrompt });
    }

    if (mode === 'agent') {
      // The agent gets the full protocol, the tool catalogue and the skill
      // discovery catalog (name + description only, bodies load on demand).
      preparedMessages.push({
        role: 'system',
        content: buildAgentSystemPrompt({
          catalog,
          tools: AGENT_TOOLS,
          pinnedSkills: pinnedSkills.map((skill) => ({
            name: skill.name,
            content: skill.content,
          })),
          extraInstructions: systemPrompt && systemPrompt.trim()
            ? `Additional instructions from the user:\n${systemPrompt.trim()}`
            : undefined,
        }),
      });
    } else {
      // Standard chat: pinned skills act as a manual preset persona.
      const personaPrompt = buildPersonaSystemPrompt(
        pinnedSkills.map((skill) => ({ name: skill.name, content: skill.content })),
        systemPrompt
      );
      if (personaPrompt) {
        preparedMessages.push({ role: 'system', content: personaPrompt });
      } else if (systemPrompt && systemPrompt.trim()) {
        preparedMessages.push({ role: 'system', content: systemPrompt.trim() });
      }
    }

    // Process incoming conversation messages & multimodal attachments
    for (let i = 0; i < contextMessages.length; i++) {
      const msg = contextMessages[i];
      const isLastUser = i === messages.length - 1 && msg.role === 'user';

      if (msg.attachments && msg.attachments.length > 0) {
        const imageAttachments = msg.attachments.filter((a) => a.type === 'image' && a.url);
        const docAttachments = msg.attachments.filter((a) => a.type === 'document');

        let textBody = msg.content;

        // Prepend extracted document text if any
        if (docAttachments.length > 0) {
          const docContext = docAttachments
            .map((d) => `[Attached Document: "${d.name}" (${Math.round(d.size / 1024)} KB)]\n${d.extractedText || '(Binary file attached)'}`)
            .join('\n\n');
          textBody = `${docContext}\n\n${textBody}`;
        }

        // Format for vision models if image attachments exist
        if (imageAttachments.length > 0) {
          const contentParts: any[] = [{ type: 'text', text: textBody }];
          for (const img of imageAttachments) {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: img.url,
              },
            });
          }
          preparedMessages.push({
            role: msg.role,
            content: contentParts,
          });
        } else {
          preparedMessages.push({
            role: msg.role,
            content: textBody,
          });
        }
      } else {
        preparedMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const lastUserMsg = contextMessages[contextMessages.length - 1];
    let liveSearchResults: any[] = [];
    let liveSearchProvider = '';

    // Execute real Web Search if enabled
    if (webSearch && lastUserMsg.role === 'user') {
      try {
        const searchRes = await executeWebSearch(lastUserMsg.content, 4);
        liveSearchResults = searchRes.results;
        liveSearchProvider = searchRes.provider;

        // The search context is injected into the last user prompt. It has to
        // be explicit: without it the model simply answers from its training
        // data and ignores the live results.
        const lastIdx = preparedMessages.length - 1;
        const currentContent = preparedMessages[lastIdx].content;
        const today = new Date().toISOString().slice(0, 10);
        const searchContext =
          searchRes.results.length > 0
            ? [
                `[LIVE WEB SEARCH RESULTS - ${searchRes.provider.toUpperCase()}]`,
                `Today is ${today}.`,
                searchRes.recency
                  ? 'The user asks for the latest information: rely on the most recent source below and state the date of every fact you report.'
                  : '',
                '',
                searchRes.summary,
                '',
                'Rules:',
                '- Answer the question from the results above and cite them as [1], [2], ...',
                '- If the results do not contain the answer, say so explicitly instead of inventing one.',
                '- Do not replace the live results with older knowledge from your training data.',
                '',
                '---',
                'User Query: ',
              ]
                .filter((line) => line !== '')
                .join('\n')
            : [
                `[LIVE WEB SEARCH - NO RESULTS FOUND]`,
                `Today is ${today}.`,
                `The live search for "${lastUserMsg.content}" returned no result.`,
                'Answer from your general knowledge, but tell the user clearly that the information could not be verified live and may be outdated.',
                '',
                '---',
                'User Query: ',
              ].join('\n');

        if (typeof currentContent === 'string') {
          preparedMessages[lastIdx].content = searchContext + currentContent;
        } else if (Array.isArray(currentContent)) {
          const firstPart = currentContent.find((p) => p.type === 'text');
          if (firstPart) {
            firstPart.text = searchContext + firstPart.text;
          }
        }
      } catch (err) {
        console.warn('[WebSearch Error]', err);
      }
    }

    // Resolve (or auto-create) the conversation this turn belongs to.
    let activeConvId = conversationId;
    let createdConversation: { id: string; title: string } | null = null;

    if (!activeConvId && lastUserMsg.role === 'user') {
      // The client did not provide a conversation (e.g. first chat of a session).
      // Create one on behalf of the authenticated user so nothing is lost.
      const title = buildConversationTitle(lastUserMsg.content);
      try {
        const newConv = await createConversation(
          title,
          model,
          provider ?? 'auto',
          user.id
        );
        activeConvId = newConv.id;
        createdConversation = { id: newConv.id, title: newConv.title };
      } catch (err) {
        console.warn('[Chat] Failed to auto-create conversation:', err);
      }
    }

    // Save incoming user message if conversationId exists
    if (activeConvId && lastUserMsg.role === 'user') {
      const userMessageObj: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: lastUserMsg.content,
        attachments: lastUserMsg.attachments as FileAttachment[] | undefined,
        createdAt: new Date().toISOString(),
      };
      await saveMessage(activeConvId, userMessageObj, user.id);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullAssistantContent = '';
        // In agent mode only the text of the last step is the deliverable: the
        // previous steps were intermediate reasoning.
        let currentStepContent = '';
        const generatedAttachments: FileAttachment[] = [];
        let finalModel = effectiveModel;
        let finalProvider: ProviderId = (effectiveProvider || 'radox');
        let wasFallback = false;
        let fallbackNoticeText: string | undefined;
        let agentSteps: AgentStepResult[] = [];
        let activatedSkills: ActivatedSkill[] = [];
        let promptTokens = 0;
        let completionTokens = 0;

        // Inform the client about the conversation that was created for this turn
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

        // Emit search results if web search was executed
        if (liveSearchResults.length > 0) {
          controller.enqueue(
            encoder.encode(
              `event: web_search\ndata: ${JSON.stringify({
                sources: liveSearchResults,
                provider: liveSearchProvider,
              })}\n\n`
            )
          );
        }

        try {
          if (mode === 'agent') {
            // ---------------------------------------------------------------
            // Autonomous agent: real multi step loop with feedback
            // ---------------------------------------------------------------
            // Emit vision switch notice if applicable
            if (visionSwitchNotice) {
              controller.enqueue(
                encoder.encode(`event: notice\\ndata: ${JSON.stringify({ type: 'vision_switch', message: visionSwitchNotice })}\\n\\n`)
              );
            }

            const agentResult = await runAgent({
              messages: preparedMessages,
              model: effectiveModel,
              provider: effectiveProvider,
              temperature,
              maxTokens: effectiveMaxTokens,
              maxTier: tier,
              signal: req.signal,
              loadSkill: async (slug) => loadSkillContent(slug, user.id),
              onStepStart: (step, maxSteps) => {
                currentStepContent = '';
                controller.enqueue(
                  encoder.encode(
                    `event: agent_step_start\ndata: ${JSON.stringify({ step, maxSteps })}\n\n`
                  )
                );
              },
              onText: (text) => {
                currentStepContent += text;
                fullAssistantContent += text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              },
              onToolOutput: (result) => {
                if (result.success && result.data?.artifact && generatedAttachments.length < 18) {
                  const artifact = result.data.artifact as FileAttachment;
                  generatedAttachments.push(artifact);
                  controller.enqueue(encoder.encode(`event: artifact\ndata: ${JSON.stringify(artifact)}\n\n`));
                }
                controller.enqueue(
                  encoder.encode(
                    `event: tool_output\ndata: ${JSON.stringify({
                      tool: result.tool,
                      target: result.target,
                      success: result.success,
                      output: result.output,
                      durationMs: result.durationMs,
                    })}\n\n`
                  )
                );
              },
              onSkillLoaded: (skill) => {
                controller.enqueue(
                  encoder.encode(
                    `event: skill_loaded\ndata: ${JSON.stringify({
                      skill: skill.slug,
                      name: skill.name,
                      description: skill.description,
                    })}\n\n`
                  )
                );
              },
              onStep: (step) => {
                agentSteps.push(step);
                controller.enqueue(
                  encoder.encode(
                    `event: agent_step\ndata: ${JSON.stringify({
                      step: step.step,
                      thought: step.thought,
                      calls: step.calls.map((call) =>
                        call.type === 'skill'
                          ? { type: 'skill', name: call.skill }
                          : {
                              type: 'tool',
                              name: call.tool,
                              target: call.target,
                              payload: call.payload,
                            }
                      ),
                      toolResults: step.toolResults.map((result) => ({
                        tool: result.tool,
                        target: result.target,
                        success: result.success,
                        output: result.output,
                        durationMs: result.durationMs,
                      })),
                      loadedSkills: step.loadedSkills.map((skill) => ({
                        slug: skill.slug,
                        name: skill.name,
                        description: skill.description,
                      })),
                      isFinal: step.isFinal,
                    })}\n\n`
                  )
                );
              },
              onFallback: (notice) => {
                wasFallback = true;
                fallbackNoticeText = notice;
                controller.enqueue(
                  encoder.encode(
                    `event: fallback\ndata: ${JSON.stringify({ notice: notice })}\n\n`
                  )
                );
              },
            });

            finalModel = agentResult.model;
            finalProvider = agentResult.provider;
            if (agentResult.isFallback) wasFallback = true;
            agentSteps = agentResult.steps;
            activatedSkills = agentResult.activatedSkills;
            promptTokens = agentResult.usage.promptTokens;
            completionTokens = agentResult.usage.completionTokens;
            // The deliverable is the last step (its reasoning stays attached so
            // the timeline can be rebuilt when the conversation is reloaded).
            fullAssistantContent = currentStepContent || agentResult.text;
          } else {
            // ---------------------------------------------------------------
            // Standard chat mode
            // ---------------------------------------------------------------
            // Emit vision switch notice if applicable
            if (visionSwitchNotice) {
              controller.enqueue(
                encoder.encode(`event: notice\\ndata: ${JSON.stringify({ type: 'vision_switch', message: visionSwitchNotice })}\\n\\n`)
              );
            }

            const result = await defaultRouter.streamChat(
              {
                messages: preparedMessages,
                model: effectiveModel,
                provider: effectiveProvider,
                temperature,
                maxTokens: effectiveMaxTokens,
                maxTier: tier,
                signal: req.signal,
              },
              async (chunk) => {
                if (chunk.fallbackNotice) {
                  wasFallback = true;
                  fallbackNoticeText = chunk.fallbackNotice;
                  controller.enqueue(
                    encoder.encode(`event: fallback\ndata: ${JSON.stringify({ notice: chunk.fallbackNotice, provider: chunk.provider, model: chunk.model })}\n\n`)
                  );
                }

                if (chunk.text) {
                  fullAssistantContent += chunk.text;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: chunk.text })}\n\n`)
                  );
                }

                if (chunk.model) finalModel = chunk.model;
                if (chunk.provider) finalProvider = chunk.provider;
              }
            );

            if (result.isFallback) {
              wasFallback = true;
            }
            promptTokens = result.usage?.promptTokens ?? 0;
            completionTokens = result.usage?.completionTokens ?? 0;
          }

          // Save completed assistant message to conversation if conversationId is active
          if (activeConvId && fullAssistantContent) {
            const assistantMessageObj: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: fullAssistantContent,
              attachments: generatedAttachments.length ? generatedAttachments : undefined,
              model: finalModel,
              provider: finalProvider,
              isFallback: wasFallback,
              fallbackReason: fallbackNoticeText,
              tokensPrompt: promptTokens,
              tokensCompletion: completionTokens,
              createdAt: new Date().toISOString(),
            };
            await saveMessage(activeConvId, assistantMessageObj, user.id);
          }

          // The role is tracked per request so the usage can be attributed
          // to a tier. A failure here never breaks the answer.
          await recordUsageRole(user.id, role);

          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({
                model: finalModel,
                provider: finalProvider,
                isFallback: wasFallback,
                usage: {
                  promptTokens,
                  completionTokens,
                  totalTokens: promptTokens + completionTokens,
                },
                steps: agentSteps.length,
                activatedSkills: activatedSkills.map((skill) => ({
                  slug: skill.slug,
                  name: skill.name,
                })),
              })}\n\n`
            )
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`)
          );
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
        'X-RateLimit-Limit': Number.isFinite(usage.limit) ? String(usage.limit) : '0',
        'X-RateLimit-Remaining': Number.isFinite(usage.remaining) ? String(usage.remaining) : '0',
        'X-Plan': plan,
        'X-Role': role,
        'X-Tier': String(tier),
        'X-Max-Tokens': String(effectiveMaxTokens),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
