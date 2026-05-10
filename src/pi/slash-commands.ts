export const ALL_COMMANDS = ['grill', 'plan', 'run', 'verify', 'remember', 'status', 'flight'] as const;
export type CommandName = (typeof ALL_COMMANDS)[number];

export interface StubLogger {
  log(message: string): void;
}

export type SlashHandler = (rest: string) => Promise<void>;

export function makeStubHandler(name: CommandName, logger: StubLogger): SlashHandler {
  return async (rest: string) => {
    logger.log(`/${name}: not implemented yet (Plan 2b will wire this). args="${rest}"`);
  };
}

/** Convenience: build all stub handlers at once. */
export function makeAllStubs(logger: StubLogger): Record<CommandName, SlashHandler> {
  return {
    grill: makeStubHandler('grill', logger),
    plan: makeStubHandler('plan', logger),
    run: makeStubHandler('run', logger),
    verify: makeStubHandler('verify', logger),
    remember: makeStubHandler('remember', logger),
    status: makeStubHandler('status', logger),
    flight: makeStubHandler('flight', logger),
  };
}
