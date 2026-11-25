import type { Coordinate } from '@thirrem/types';
import type { Area } from './area.js';
import type { SandboxDriver } from './sandbox-driver.js';

export interface Sandbox {
  centre: Coordinate;
  area: Area;
  drivers: SandboxDriver[];
  /** When the Rider last did something, which keeps the Sandbox running. */
  lastActiveMs: number;
  /** When it last started running: as it was opened, or as it came back from being stopped. */
  resumedAtMs: number;
}

export abstract class SandboxRepository {
  abstract findByAccount(accountId: string): Promise<Sandbox | null>;
  abstract save(accountId: string, sandbox: Sandbox): Promise<void>;
  /** Removes every Sandbox whose Rider was last active at or before `lastActiveMs`. */
  abstract deleteIdleSince(lastActiveMs: number): Promise<void>;
}
