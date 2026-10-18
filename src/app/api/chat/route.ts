/**
 * Hyunk AI Hub - Multi-Provider Chat Completion SSE Endpoint
 * Supports Multimodal Vision, Document Attachments, Live Web Search, Custom System Prompts,
 * Parameter Controls (Temperature, Top P, Max Tokens), and Real Agent Mode Tool Execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultRouter } from '@/lib/ai/router';
import { ProviderId, ChatMessage, FileAttachment } from '@/lib/ai/types';
import { saveMessage, getConversationMessages } from '@/lib/storage';
import { executeWebSearch, runAgentTool } from '@/lib/ai/tools';
import { getSessionFromRequest } from '@/lib/auth';

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
});

const AGENT_SYSTEM_PROMPT = `You are the Hyunk AI Hub Autonomous AI Agent equipped with live tool execution capabilities.
When answering in Agent Mode, act as an autonomous, self-directed senior engineer and researcher.
Follow this strict operational pipeline:
1. FORMULATE REASONING & EXECUTION PLAN:
   Wrap your initial thoughts, constraints analysis, and numbered execution plan inside <thought> ... </thought>.
   Be explicit about what steps you will execute and why.
2. TOOL & ACTION SIMULATIONS:
   When executing steps, declare tool action blocks:
   <agent_action tool="tool_name" target="target_item">summary of action/code/query</agent_action>
   Connected Live Tools:
   - "web_search": Real-time web queries and fact retrieval
   - "code_interpreter": Executes JavaScript/Node.js code in a secure sandbox
   - "calculator": Exact numerical and mathematical evaluation
   - "fetch_url": Fetches and reads live web pages and documentation
3. FINAL PRODUCTION DELIVERABLE:
   Provide the complete, exhaustive, production-grade implementation or answer outside of the thought and action blocks. Do not use placeholders or omit critical logic.
Always maintain high technical precision, thoroughness, and structured clarity.`;

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
      mode,
    } = parsed.data;

    const providerParam = provider === 'auto' ? undefined : (provider as ProviderId);

    // Prepare message array
    const preparedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }> = [];

    // Inject custom system prompt if provided
    if (systemPrompt && systemPrompt.trim()) {
      preparedMessages.push({
        role: 'system',
        content: systemPrompt.trim(),
      });
    }

    // Inject Agent Mode system prompt if active
    if (mode === 'agent') {
      preparedMessages.push({
        role: 'system',
        content: AGENT_SYSTEM_PROMPT,
      });
    }

    // Process incoming conversation messages & multimodal attachments
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
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

    const lastUserMsg = messages[messages.length - 1];
    let liveSearchResults: any[] = [];

    // Execute real Web Search if enabled
    if (webSearch && lastUserMsg.role === 'user') {
      try {
        const searchRes = await executeWebSearch(lastUserMsg.content, 4);
        liveSearchResults = searchRes.results;
        if (searchRes.results.length > 0) {
          // Inject live search context into the last user prompt
          const lastIdx = preparedMessages.length - 1;
          const currentContent = preparedMessages[lastIdx].content;
          const searchContext = `[Live Grounded Web Search Results for: "${lastUserMsg.content}"]:\n${searchRes.summary}\n\nUse the above verified live web information to provide an up-to-date, cited answer.\n\n---\nUser Query: `;

          if (typeof currentContent === 'string') {
            preparedMessages[lastIdx].content = searchContext + currentContent;
          } else if (Array.isArray(currentContent)) {
            const firstPart = currentContent.find((p) => p.type === 'text');
            if (firstPart) {
              firstPart.text = searchContext + firstPart.text;
            }
          }
        }
      } catch (err) {
        console.warn('[WebSearch Error]', err);
      }
    }

    // Save incoming user message if conversationId exists
    let activeConvId = conversationId;
    if (activeConvId && lastUserMsg.role === 'user') {
      const userMessageObj: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: lastUserMsg.content,
        attachments: lastUserMsg.attachments as FileAttachment[] | undefined,
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

        // Emit search results if web search was executed
        if (liveSearchResults.length > 0) {
          controller.enqueue(
            encoder.encode(
              `event: web_search\ndata: ${JSON.stringify({ sources: liveSearchResults })}\n\n`
            )
          );
        }

        try {
          const result = await defaultRouter.streamChat(
            {
              messages: preparedMessages,
              model,
              provider: providerParam,
              temperature,
              maxTokens,
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

          // If in Agent Mode, scan for generated <agent_action> blocks and execute real tools!
          if (mode === 'agent' && fullAssistantContent.includes('<agent_action')) {
            const actionRegex = /<agent_action\s+tool=["']([^"']+)["'](?:\s+target=["']([^"']+)["'])?>([\s\S]*?)<\/agent_action>/gi;
            let match;
            while ((match = actionRegex.exec(fullAssistantContent)) !== null) {
              const toolName = match[1];
              const target = match[2];
              const queryOrCode = match[3];

              try {
                const toolRes = await runAgentTool(toolName, queryOrCode, target);
                controller.enqueue(
                  encoder.encode(
                    `event: tool_output\ndata: ${JSON.stringify({
                      tool: toolName,
                      target,
                      success: toolRes.success,
                      output: toolRes.output,
                      durationMs: toolRes.durationMs,
                    })}\n\n`
                  )
                );
              } catch (e) {
                // Ignore tool execution error
              }
            }
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
