/**
 * Hyunk AI Hub - Scheduled Run Engine
 *
 * Executes the cron driven background prompts. On a serverless platform there
 * is no long lived worker, so the schedules are evaluated when the app is
 * used: the client pings `/api/schedules/tick` and every schedule that is due
 * is executed, its result stored in a new conversation.
 */

import { defaultRouter } from './ai/router';
import type { ProviderId } from './ai/types';
import { nextCronRuns } from './ai/tools/utility';
import { listSchedules, updateSchedule, ScheduledRun } from './featureStorage';
import { createConversation, saveMessage } from './storage';

export interface ScheduleExecutionResult {
  scheduleId: string;
  name: string;
  ok: boolean;
  output?: string;
  error?: string;
  conversationId?: string;
}

/**
 * Returns true when the schedule should have run already.
 */
export function isScheduleDue(schedule: ScheduledRun, now: Date = new Date()): boolean {
  if (!schedule.enabled) return false;

  try {
    const reference = schedule.lastRunAt ? new Date(schedule.lastRunAt) : new Date(now.getTime() - 60_000);
    const occurrences = nextCronRuns(schedule.cron, 3, reference);
    return occurrences.some((occurrence) => new Date(occurrence).getTime() <= now.getTime());
  } catch {
    // An invalid cron expression never fires, it is reported by the API.
    return false;
  }
}

/**
 * Returns the next execution time of a schedule (ISO string) or null when the
 * expression is invalid.
 */
export function nextRunAt(schedule: ScheduledRun, now: Date = new Date()): string | null {
  try {
    return nextCronRuns(schedule.cron, 1, now)[0] || null;
  } catch {
    return null;
  }
}

/**
 * Executes one schedule and stores the answer in a new conversation.
 */
export async function executeSchedule(
  schedule: ScheduledRun,
  userId?: string
): Promise<ScheduleExecutionResult> {
  let conversationId: string | undefined;

  try {
    const conversation = await createConversation(
      `⏰ ${schedule.name}`,
      schedule.model,
      schedule.provider,
      userId
    );
    conversationId = conversation.id;

    const result = await defaultRouter.completeChat({
      messages: [{ role: 'user', content: schedule.prompt }],
      model: schedule.model,
      provider: schedule.provider === 'auto' ? undefined : (schedule.provider as ProviderId),
      temperature: 0.7,
      maxTokens: 2048,
    });

    const now = new Date().toISOString();

    await saveMessage(
      conversation.id,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: schedule.prompt,
        createdAt: now,
      },
      userId
    );

    await saveMessage(
      conversation.id,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.text,
        model: result.model,
        provider: result.provider,
        isFallback: result.isFallback,
        createdAt: now,
      },
      userId
    );

    await updateSchedule(schedule.id, {
      lastRunAt: now,
      lastResult: result.text.slice(0, 500),
    });

    return {
      scheduleId: schedule.id,
      name: schedule.name,
      ok: true,
      output: result.text,
      conversationId: conversation.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSchedule(schedule.id, {
      lastRunAt: new Date().toISOString(),
      lastResult: `Error: ${message}`,
    }).catch(() => undefined);

    return {
      scheduleId: schedule.id,
      name: schedule.name,
      ok: false,
      error: message,
      conversationId,
    };
  }
}

/**
 * Runs every schedule of the user that is due and returns what happened.
 */
export async function runDueSchedules(userId?: string): Promise<ScheduleExecutionResult[]> {
  const schedules = await listSchedules(userId);
  const now = new Date();
  const results: ScheduleExecutionResult[] = [];

  for (const schedule of schedules) {
    if (!isScheduleDue(schedule, now)) continue;
    results.push(await executeSchedule(schedule, userId));
  }

  return results;
}
