export interface CoreConfig {
  name: string;
  version: string;
  debug: boolean;
}

export function createCore(config: CoreConfig): Core {
  return new Core(config);
}

export class Core {
  private config: CoreConfig;

  constructor(config: CoreConfig) {
    this.config = config;
  }

  getName(): string {
    return this.config.name;
  }

  getVersion(): string {
    return this.config.version;
  }
}

export default Core;
