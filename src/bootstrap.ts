// src/bootstrap.ts — invoked by `npm run bootstrap`
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runDoctor } from './core/doctor';
import { runtimeRepoRoot } from './core/authority';

async function main(): Promise<void> {
  const repoRoot = runtimeRepoRoot();
  console.log(`agent-os bootstrap — repo: ${repoRoot}`);

  if (!existsSync(join(repoRoot, 'node_modules'))) {
    console.error('node_modules not found. Run `npm install` first.');
    process.exit(1);
  }

  const report = runDoctor(repoRoot);
  for (const check of report.checks) {
    const mark = check.status === 'pass' ? '✓' : check.status === 'soft_fail' ? '~' : '✗';
    console.log(`  ${mark} ${check.description}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  console.log(`status: ${report.status}`);
  if (report.status === 'hard_fail') process.exit(1);
}

main().catch((e) => {
  console.error('bootstrap failed:', (e as Error).message);
  process.exit(1);
});
