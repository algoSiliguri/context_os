import { renderDoctorReport, runDoctorCommand } from '../../ccp/commands/doctor';
import { narrate } from '../../core/narrator';
import type { PiSession } from '../pi-session';

export function register(pi: any, session: PiSession): void {
  pi.registerCommand('doctor', {
    description: 'Check Agent OS health for this project',
    handler: async (_args: string, ctx: any) => {
      session.ensurePacksLoaded(ctx.cwd, ctx);
      if (ctx.hasUI) ctx.ui.notify(narrate('doctor', 'running checks'), 'info');
      const report = await runDoctorCommand({ repoRoot: ctx.cwd });
      const type = report.status === 'ok' ? 'info' : 'error';
      for (const check of report.checks) {
        if (ctx.hasUI) {
          const checkLine = narrate('doctor', `${check.label ?? check.id ?? check.description}: ${check.status}${check.detail ? ` — ${check.detail}` : ''}`);
          const checkLevel = check.status === 'fail' ? 'error' : 'info';
          ctx.ui.notify(checkLine, checkLevel);
        } else {
          const mark = check.status === 'pass' ? '✓' : check.status === 'soft_fail' ? '~' : '✗';
          const line = `${mark} ${check.description}${check.detail ? ` — ${check.detail}` : ''}`;
          ctx.ui.notify(line, check.status === 'fail' ? 'error' : 'info');
        }
      }
      if (ctx.hasUI) {
        ctx.ui.notify(
          narrate('doctor', `overall status: ${report.status}`),
          report.status === 'ok' || report.status === 'soft_fail' ? 'info' : 'error',
        );
      } else {
        ctx.ui.notify(`status: ${report.status}`, type);
      }
    },
  });
}
