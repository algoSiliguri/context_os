import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface InstallPacksOptions {
  /** Defaults to bundledPacksSourceRoot() when omitted. */
  sourceRoot?: string;
  targetRoot: string;
  force?: boolean;
  /**
   * When set, install only this pack.
   * When undefined, defaults to 'agent-os-core' (safe baseline).
   */
  packId?: string;
}

export interface PackInstallResult {
  packId: string;
  status: 'installed' | 'skipped' | 'error';
  reason?: string;
}

/** Absolute path to the bundled packs shipped with Agent_OS. */
export function bundledPacksSourceRoot(): string {
  return join(__dirname, 'packs');
}

/**
 * List all bundled pack IDs available for installation.
 * Scans the bundled packs source directory and returns directory names sorted alphabetically.
 */
export function listBundledPackIds(sourceRoot: string = bundledPacksSourceRoot()): string[] {
  if (!existsSync(sourceRoot)) return [];
  try {
    return readdirSync(sourceRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Copy a single bundled pack from sourceRoot into {targetRoot}/.agent-os/packs/<packId>/.
 *
 * Pack selection: uses packId when provided; defaults to 'agent-os-core' (safe baseline).
 *
 * Idempotency: if <packId>/workflow-pack.yaml already exists and force is false,
 * the pack is skipped so user modifications are preserved.
 *
 * Returns [] when sourceRoot does not exist (backward compat — no bundled packs).
 * Never throws — errors are captured per-pack in the result.
 */
export function installBundledPacks(opts: InstallPacksOptions): PackInstallResult[] {
  const { targetRoot, force = false } = opts;
  const sourceRoot = opts.sourceRoot ?? bundledPacksSourceRoot();
  const selected = opts.packId ?? 'agent-os-core';

  if (!existsSync(sourceRoot)) return [];

  const packsDir = join(targetRoot, '.agent-os', 'packs');
  const srcDir = join(sourceRoot, selected);

  // Guard: source pack must exist
  if (!existsSync(srcDir)) {
    return [{ packId: selected, status: 'error', reason: `source pack '${selected}' not found in ${sourceRoot}` }];
  }

  const dstDir = join(packsDir, selected);
  const manifestDst = join(dstDir, 'workflow-pack.yaml');

  if (!force && existsSync(manifestDst)) {
    return [{ packId: selected, status: 'skipped', reason: 'already installed' }];
  }

  try {
    mkdirSync(dstDir, { recursive: true });
    cpSync(srcDir, dstDir, { recursive: true });
    return [{ packId: selected, status: 'installed' }];
  } catch (e) {
    return [{ packId: selected, status: 'error', reason: (e as Error).message }];
  }
}
