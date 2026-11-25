import type { PathPosition } from '../sandbox/road-path.js';
import type { DriveRoute } from './drive.js';

/** The matched Driver's drive to the Pickup Point, as a Sandbox keeps it. */
export interface StoredApproach {
  /** Where the Driver is as it is matched, which is where its route starts. */
  from: PathPosition;
  matchedAtMs: number;
  route: DriveRoute;
}
