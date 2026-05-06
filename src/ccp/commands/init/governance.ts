import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const GOVERNANCE_FILES = [
  'AGENT_OS_CONSTITUTION.md',
  '.agent-os/schemas/constitution-binding.schema.json',
  '.agent-os/schemas/telemetry-event.schema.json',
  '.agent-os/schemas/permission-manifest.schema.json',
  '.agent-os/contracts/index.json',
] as const;

export interface CopyGovernanceOptions {
  sourceRoot: string;
  targetRoot: string;
}

export function copyGovernance({ sourceRoot, targetRoot }: CopyGovernanceOptions): void {
  for (const rel of GOVERNANCE_FILES) {
    const src = join(sourceRoot, rel);
    if (!existsSync(src)) {
      throw new Error(`bundled governance file missing: ${rel} (looked in ${sourceRoot})`);
    }
    const dst = join(targetRoot, rel);
    const dstTmp = `${dst}.tmp`;
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dstTmp);
    try {
      renameSync(dstTmp, dst);
    } catch (e) {
      try {
        unlinkSync(dstTmp);
      } catch {}
      throw e;
    }
  }
}

export function bundledGovernanceRoot(): string {
  // From src/ccp/commands/init/governance.ts -> ../../../.. = extension repo root.
  return join(__dirname, '..', '..', '..', '..');
}
