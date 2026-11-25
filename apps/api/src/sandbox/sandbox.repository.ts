import type { Coordinate } from '@thirrem/types';
import type { Area } from './area.js';
import type { SandboxDriver } from './sandbox-driver.js';

export interface Sandbox {
  centre: Coordinate;
  area: Area;
  drivers: SandboxDriver[];
}

export abstract class SandboxRepository {
  abstract findByAccount(accountId: string): Promise<Sandbox | null>;
  abstract save(accountId: string, sandbox: Sandbox): Promise<void>;
}
