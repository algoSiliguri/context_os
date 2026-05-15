import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInit } from '../../ccp/commands/init';
import { dirToProjectId, makePiUiAdapter } from '../extension-helpers';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('init', {
    description: 'Initialize Agent OS governance in this project. Usage: /init [project-id]',
    handler: async (args: string, ctx: any) => {
      const alreadyInit = existsSync(join(ctx.cwd, '.agent-os', 'project.yaml'));
      let safeArgs = args.trim();

      if (alreadyInit && !safeArgs.includes('--force') && !safeArgs.includes('--upgrade')) {
        safeArgs = safeArgs.includes('--no-prompt')
          ? `${safeArgs} --upgrade`
          : `${safeArgs} --upgrade --no-prompt`;
        ctx.ui.notify(
          'Project already initialized — upgrading governance files (project.yaml preserved).',
          'info',
        );
      } else if (!safeArgs.includes('--no-prompt')) {
        safeArgs = `${safeArgs} --no-prompt`.trim();
      }

      const hasPositional = safeArgs.split(/\s+/).some((t) => t && !t.startsWith('--'));
      if (!hasPositional) {
        const derivedId = dirToProjectId(ctx.cwd);
        safeArgs = `${derivedId} ${safeArgs}`.trim();
        ctx.ui.notify(`No project ID given — using folder name: "${derivedId}"`, 'info');
      }

      ctx.ui.setStatus('agent-os', 'initializing…');
      const steps: string[] = [];
      const result = await runInit({
        rest: safeArgs,
        targetRoot: ctx.cwd,
        ui: makePiUiAdapter(ctx.ui),
        log: (msg: string) => {
          steps.push(msg);
          ctx.ui.setStatus('agent-os', msg.trim());
        },
      });
      ctx.ui.setStatus('agent-os', undefined);

      if (result.ok) {
        session.packLoadedForCwd = null;
        session.grillConfig = undefined;
        session.planConfig = undefined;
        ctx.ui.notify(
          'Agent OS initialized ✓  Run /doctor to verify. Run /grill <idea> to start a task.',
          'info',
        );
      } else {
        const lastStep = steps.at(-1) ?? '';
        ctx.ui.notify(lastStep || '/init failed — check the project ID and try again.', 'error');
      }
    },
  });
}
