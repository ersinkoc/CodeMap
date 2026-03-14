import { processData } from './utils';

export interface AppOptions {
  verbose: boolean;
  outputDir: string;
}

export function initialize(options: AppOptions): void {
  if (options.verbose) {
    console.log('Initializing with options:', options);
  }
}

export function run(data: string[], options: AppOptions): string[] {
  initialize(options);
  return data.map((item) => processData(item));
}

export default run;
