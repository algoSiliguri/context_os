import { isAbsolute as isAbsolutePosix, normalize as normalizePosix } from 'node:path/posix';
import type { ProjectConfig } from '../../core/manifest';
import type { ToolMetadata } from './tool-registry';

export type Tier = 1 | 2 | 3 | 4;

const TIER_4_PATTERNS: Array<RegExp> = [
  /^\s*sudo\b/i,
  /\brm\s+-rf\s+\/(?!\w)/,
  /^\s*chmod\s+/i,
  /\.bashrc|\.zshrc|\.profile/,
  /\.ssh\//,
  /\.gnupg\//,
];

const ENV_PATH_PATTERN = /(^|\/)\.env($|[^\w])/;

/** Normalise a file-system path using POSIX rules so tests using Unix paths
 *  pass on all platforms (including Windows). */
function normPath(p: string): string {
  // Convert Windows backslashes to forward slashes, then posix-normalise.
  return normalizePosix(p.replace(/\\/g, '/'));
}

function isWithin(path: string, root: string): boolean {
  const p = normPath(path);
  const r = normPath(root);
  if (!isAbsolutePosix(p)) return true;
  return p.startsWith(`${r}/`) || p === r;
}

export function resolveEffectiveTier(
  tool: ToolMetadata,
  input: Record<string, unknown>,
  config: ProjectConfig,
): Tier {
  // 1) Hard Tier-4 patterns (fastest deny)
  const command = typeof input.command === 'string' ? input.command : '';
  const path = typeof input.path === 'string' ? input.path : '';
  if (command && TIER_4_PATTERNS.some((re) => re.test(command))) return 4;
  if (path && ENV_PATH_PATTERN.test(path)) return 4;

  // 2) Project overrides
  for (const ov of config.overrides ?? []) {
    if (ov.tool !== tool.tool_id) continue;
    if (matchesWhen(ov.when, { path, command }, config.workspace.root)) {
      return ov.tier;
    }
  }

  // 3) Workspace bounds escalation
  if (path && config.workspace?.root && !isWithin(path, config.workspace.root)) {
    return Math.max(tool.approval_tier, 3) as Tier;
  }

  // 4) Base tier
  return tool.approval_tier;
}

function matchesWhen(
  when: string,
  ctx: { path: string; command: string },
  workspaceRoot: string,
): boolean {
  if (when === 'path within workspace.root') {
    return ctx.path !== '' && isWithin(ctx.path, workspaceRoot);
  }
  // Form: matches "<regex>"
  const m = when.match(/^matches\s+"(.+)"$/);
  if (m) {
    try {
      const re = new RegExp(m[1]!);
      return re.test(ctx.command) || re.test(ctx.path);
    } catch {
      return false;
    }
  }
  return false;
}
