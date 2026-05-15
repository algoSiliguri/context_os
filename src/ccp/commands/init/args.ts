export interface InitArgs {
  positional: string | undefined;
  flags: {
    upgrade?: boolean;
    force?: boolean;
    'no-prompt'?: boolean;
    domain?: string;
    profile?: string;
    namespace?: string;
    'critical-actions'?: string;
    pack?: string;
  };
}

const VALUE_FLAGS = new Set(['domain', 'profile', 'namespace', 'critical-actions', 'pack']);
const BOOL_FLAGS = new Set(['upgrade', 'force', 'no-prompt']);

export function parseInitArgs(rest: string): InitArgs {
  const tokens = rest.trim().split(/\s+/).filter(Boolean) as string[];
  const flags: InitArgs['flags'] = {};
  let positional: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok?.startsWith('--')) {
      const name = tok.slice(2);
      if (BOOL_FLAGS.has(name)) {
        (flags as Record<string, boolean>)[name] = true;
      } else if (VALUE_FLAGS.has(name)) {
        const val = tokens[i + 1];
        if (!val || val.startsWith('--')) {
          throw new Error(`--${name} requires a value`);
        }
        (flags as Record<string, string>)[name] = val;
        i++;
      } else {
        throw new Error(`unknown flag: --${name}`);
      }
    } else if (tok && positional === undefined) {
      positional = tok;
    } else if (tok) {
      throw new Error(`unexpected positional argument: ${tok}`);
    }
  }

  return { positional, flags };
}
