/**
 * Hyunk AI Hub - Multi-Provider Chat Completion SSE Endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultRouter } from '@/lib/ai/router';
import { ProviderId, ChatMessage } from '@/lib/ai/types';
import { saveMessage, createConversation } from '@/lib/storage';

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(50000),
    })
  ).min(1),
  model: z.string().min(1),
  provider: z.enum(['radox', 'inkstone', 'experiential', 'auto']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  conversationId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = chatRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { messages, model, provider, temperature, conversationId } = parsed.data;
    const providerParam = provider === 'auto' ? undefined : (provider as ProviderId);

    // Save incoming user message if conversationId exists
    const lastUserMsg = messages[messages.length - 1];
    let activeConvId = conversationId;
    if (activeConvId && lastUserMsg.role === 'user') {
      const userMessageObj: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: lastUserMsg.content,
        createdAt: new Date().toISOString(),
      };
      await saveMessage(activeConvId, userMessageObj);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullAssistantContent = '';
        let finalModel = model;
        let finalProvider: ProviderId = (providerParam || 'radox');
        let wasFallback = false;
        let fallbackNoticeText: string | undefined;

        try {
          const result = await defaultRouter.streamChat(
            {
              messages,
              model,
              provider: providerParam,
              temperature,
              signal: req.signal,
            },
            (chunk) => {
              if (chunk.fallbackNotice) {
                wasFallback = true;
                fallbackNoticeText = chunk.fallbackNotice;
                // Emit fallback notice event to client
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

          // Save completed assistant message to conversation if conversationId is active
          if (activeConvId && fullAssistantContent) {
            const assistantMessageObj: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: fullAssistantContent,
              model: finalModel,
              provider: finalProvider,
              isFallback: wasFallback,
              fallbackReason: fallbackNoticeText,
              createdAt: new Date().toISOString(),
            };
            await saveMessage(activeConvId, assistantMessageObj);
          }

          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({
                model: finalModel,
                provider: finalProvider,
                isFallback: wasFallback,
                usage: result.usage,
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
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
