import type { Coordinate, SimulatedDriver } from '@thirrem/types';

export interface Sandbox {
  centre: Coordinate;
  drivers: SimulatedDriver[];
}

export abstract class SandboxRepository {
  abstract findByAccount(accountId: string): Promise<Sandbox | null>;
  abstract save(accountId: string, sandbox: Sandbox): Promise<void>;
}
