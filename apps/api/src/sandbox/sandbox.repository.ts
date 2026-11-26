import type { Coordinate } from '@thirrem/types';
import type { StoredRideRequest } from '../dispatch/ride-request.js';
import type { Area } from './area.js';
import type { SandboxDriver } from './sandbox-driver.js';
import { SandboxStore } from './sandbox-store.js';

export interface Sandbox {
  centre: Coordinate;
  area: Area;
  drivers: SandboxDriver[];
  /** When the Rider last did something, which keeps the Sandbox running. */
  lastActiveMs: number;
  /** When it last started running: as it was opened, or as it came back from being stopped. */
  resumedAtMs: number;
  rideRequest?: StoredRideRequest;
}

export abstract class SandboxRepository extends SandboxStore<Sandbox> {}
