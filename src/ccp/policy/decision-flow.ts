import type { ProjectConfig } from '../../core/manifest';
import { type Tier, resolveEffectiveTier } from './tier-resolver';
import type { ToolRegistry } from './tool-registry';

export interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
}

export type SessionApprovalCache = Map<string, boolean>;

export interface DecisionContext {
  registry: ToolRegistry;
  cache: SessionApprovalCache;
  config: ProjectConfig;
}

export type Decision =
  | { outcome: 'pass'; tier: Tier; cacheKey: string | null }
  | { outcome: 'ask'; tier: Tier; cacheKey: string | null; reason: string }
  | { outcome: 'block'; tier: Tier | null; reason: string };

/**
 * Compute a stable cache key from (toolName, input shape).
 * "Shape" means: same set of keys, same value-types, same path-prefix.
 * This makes "approve once" approve a class of input rather than an exact one.
 */
function inputShapeKey(toolName: string, input: Record<string, unknown>): string {
  const keys = Object.keys(input).sort();
  const shape = keys.map((k) => `${k}:${typeof input[k]}`).join(',');
  return `${toolName}::${shape}`;
}

export function decideToolCall(call: ToolCall, ctx: DecisionContext): Decision {
  // 1. Lookup tool
  const tool = ctx.registry.lookup(call.toolName);
  if (!tool) {
    return { outcome: 'block', tier: null, reason: `unknown tool: ${call.toolName}` };
  }

  // 2. Resolve effective tier
  const tier = resolveEffectiveTier(tool, call.input, ctx.config);

  // 3. Apply tier rule
  switch (tier) {
    case 1:
      return { outcome: 'pass', tier, cacheKey: null };
    case 2: {
      const key = inputShapeKey(call.toolName, call.input);
      if (ctx.cache.get(key) === true) {
        return { outcome: 'pass', tier, cacheKey: key };
      }
      return {
        outcome: 'ask',
        tier,
        cacheKey: key,
        reason: 'tier-2 needs approval (once per session)',
      };
    }
    case 3:
      return {
        outcome: 'ask',
        tier,
        cacheKey: null,
        reason: 'tier-3 needs approval every time',
      };
    case 4:
      if (ctx.config.break_glass?.enabled === true) {
        return {
          outcome: 'ask',
          tier,
          cacheKey: null,
          reason: 'tier-4 — break_glass enabled, prompting',
        };
      }
      return {
        outcome: 'block',
        tier,
        reason: 'tier-4 blocked (set break_glass.enabled=true to override)',
      };
  }
}

/** Caller invokes this after a Tier-2 prompt resolves. */
export function recordTier2Approval(
  cache: SessionApprovalCache,
  key: string,
  approved: boolean,
): void {
  if (approved) cache.set(key, true);
  // explicit deny is not cached: user sees the prompt again next time
}
