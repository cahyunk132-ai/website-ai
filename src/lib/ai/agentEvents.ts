/**
 * Hyunk AI Hub - Agent Event Contracts (client & server shared)
 *
 * These types describe the SSE payloads the agent emits. They are intentionally
 * free of any server only import so the UI components can use them directly.
 */

export interface AgentCallView {
  type: 'tool' | 'skill';
  /** Tool name or skill slug. */
  name: string;
  target?: string;
  payload?: string;
}

export interface AgentToolResultView {
  tool: string;
  target?: string;
  success: boolean;
  output: string;
  durationMs?: number;
}

export interface AgentSkillView {
  slug: string;
  name: string;
  description?: string;
}

export interface AgentStepView {
  step: number;
  thought?: string;
  calls?: AgentCallView[];
  toolResults?: AgentToolResultView[];
  loadedSkills?: AgentSkillView[];
  isFinal?: boolean;
}
