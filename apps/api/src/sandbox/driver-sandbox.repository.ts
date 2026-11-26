import type { Coordinate, DriverCar } from '@thirrem/types';
import { SandboxStore, type StoredSandbox } from './sandbox-store.js';

export interface DriverSandbox extends StoredSandbox {
  centre: Coordinate;
  car: DriverCar;
}

export abstract class DriverSandboxRepository extends SandboxStore<DriverSandbox> {}
