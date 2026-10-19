/**
 * Hyunk AI Hub - Manual Tool Runner
 *
 * Lets the user run a tool directly from the Tools panel (without going
 * through the agent). The tool runs on the server with exactly the same
 * implementation the agent uses, so the result is identical.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/auth';
import { executeAgentToolCall } from '@/lib/ai/tools';
import { AGENT_TOOL_NAMES } from '@/lib/ai/tools';

/** Tools that may be triggered manually from the UI. */
const MANUAL_TOOLS = [
  'website_security_scan',
  'page_inspector',
  'dns_lookup',
  'hash_calculate',
  'base64_codec',
  'json_select',
  'regex_extract',
  'unit_convert',
  'password_entropy',
  'cron_next',
  'text_diff',
] as const;

const runRequestSchema = z.object({
  tool: z.enum(MANUAL_TOOLS),
  args: z.record(z.any()).optional(),
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Silakan login terlebih dahulu untuk menggunakan tools.' },
        { status: 401 }
      );
    }

    const json = await req.json();
    const parsed = runRequestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid tool request', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { tool, args } = parsed.data;

    if (!AGENT_TOOL_NAMES.includes(tool)) {
      return NextResponse.json({ error: `Unknown tool "${tool}"` }, { status: 400 });
    }

    const result = await executeAgentToolCall({
      type: 'tool',
      tool,
      target: typeof args?.url === 'string' ? args.url : undefined,
      payload: '',
      args: args || {},
    } as any);

    return NextResponse.json({
      success: result.success,
      tool: result.tool,
      output: result.output,
      data: result.data ?? null,
      durationMs: result.durationMs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
