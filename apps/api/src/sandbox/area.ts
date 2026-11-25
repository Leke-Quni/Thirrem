import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import type { RoadPath } from './road-path.js';

/** Centres this close share one area, and a Sandbox keeps its Drivers while its centre stays this close. */
export const SAME_PLACE_M = 1_000;

/** Where a Driver is parked until one of the paths starting there is ready. */
export type Station = Omit<SimulatedDriver, 'id' | 'available'>;

export interface AreaPath {
  /** The index of the station the path starts and ends at. */
  station: number;
  ready: { path: RoadPath; atMs: number } | null;
}

/** The parking places and road paths shared by every Sandbox around one centre. */
export interface Area {
  centre: Coordinate;
  stations: Station[];
  paths: AreaPath[];
}
