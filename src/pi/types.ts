// src/pi/types.ts
// Coverage note: this file is pure TypeScript interfaces (no runtime
// statements). v8 coverage reports 0% because there's nothing to execute.
// The types are the contract — they're "covered" via every consuming module.
import type { UiAdapter } from './ui';

export type { UiAdapter };

export interface ToolCallContext {
  toolName: string;
  input: Record<string, unknown>;
  block(reason: string): void;
}

export interface ExtensionAPI {
  ui: UiAdapter;
  registerTool(name: string, handler: (input: unknown) => Promise<unknown>): void;
  registerSlashCommand(name: string, handler: (rest: string) => Promise<void>): void;
  onToolCall(handler: (ctx: ToolCallContext) => Promise<void> | void): void;
  appendEntry(entry: unknown): void;
  log(message: string): void;
  repoRoot(): string;
  runAgentTurn?: (prompt: string) => Promise<{
    filesChanged?: string[];
    commandsRun?: string[];
    exitCode?: number;
    errorSummary?: string;
  }>;
}

export type ExtensionEntry = (api: ExtensionAPI) => Promise<void> | void;
