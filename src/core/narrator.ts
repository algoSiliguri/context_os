/**
 * Narrator — single source of truth for terminal narration lines.
 * Pure function. No I/O. Callers route output through ui.notify.
 *
 * Format: "[tag] message" — single line, trimmed, internal newlines collapsed.
 */

export type NarrationTag =
  | 'pack'
  | 'phase'
  | 'doc'
  | 'validator'
  | 'step'
  | 'memory'
  | 'plan'
  | 'verify'
  | 'review'
  | 'evaluate'
  | 'doctor'
  | 'trace';

const ALLOWED_TAGS: ReadonlySet<NarrationTag> = new Set<NarrationTag>([
  'pack', 'phase', 'doc', 'validator', 'step',
  'memory', 'plan', 'verify', 'review', 'evaluate',
  'doctor', 'trace',
]);

export function narrate(tag: NarrationTag, message: string): string {
  if (!ALLOWED_TAGS.has(tag)) {
    throw new Error(`narrator: unknown tag "${tag}"`);
  }
  const normalized = message.replace(/\s*\n\s*/g, ' ').trim();
  if (!normalized) {
    throw new Error('narrator: message must be non-empty');
  }
  return `[${tag}] ${normalized}`;
}
