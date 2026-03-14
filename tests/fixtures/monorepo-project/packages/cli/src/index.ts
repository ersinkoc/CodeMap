import { createCore, CoreConfig } from '@test/core';

export interface CliOptions {
  command: string;
  args: string[];
  verbose: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const verbose = argv.includes('--verbose') || argv.includes('-v');
  const filtered = argv.filter((arg) => !arg.startsWith('-'));
  return {
    command: filtered[0] ?? 'help',
    args: filtered.slice(1),
    verbose,
  };
}

export async function run(options: CliOptions): Promise<void> {
  const config: CoreConfig = {
    name: 'cli',
    version: '1.0.0',
    debug: options.verbose,
  };

  const core = createCore(config);
  console.log(`Running ${options.command} with ${core.getName()}`);
}
