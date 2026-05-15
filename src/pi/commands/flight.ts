import { runTrace } from '../../ccp/commands/trace';
import type { PiSession } from '../pi-session';

export function register(pi: any, _session: PiSession): void {
  pi.registerCommand('flight', {
    description: 'Show Black Box flight recorder timeline. Usage: /flight [session-id] [--tail N]',
    handler: async (args: string, ctx: any) => {
      const sessionIdArg = args.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      )?.[0];
      const tailMatch = args.match(/--tail\s+(\d+)/);
      const tail = tailMatch?.[1] !== undefined ? Number.parseInt(tailMatch[1], 10) : undefined;
      try {
        await runTrace({ repoRoot: ctx.cwd, sessionId: sessionIdArg, tail });
      } catch (e) {
        ctx.ui.notify(`/flight failed: ${(e as Error).message}`, 'error');
      }
    },
  });
}
