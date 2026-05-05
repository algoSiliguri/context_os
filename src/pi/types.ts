// src/pi/types.ts
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
}

export type ExtensionEntry = (api: ExtensionAPI) => Promise<void> | void;
