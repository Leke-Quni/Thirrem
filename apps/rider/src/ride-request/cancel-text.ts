import type { RideRequest } from '@thirrem/types';
import { formatDuration } from '../map/format';

/** Said wherever the next step would pause Ride Requests. The 15 minutes are those the API enforces. */
export const LOCK_TEXT = 'Cancelling locks you for 15 minutes.';

/** The one line asked before a cancel that is not simply made, short enough to read at a glance. */
export function cancelQuestion({ driver, approach }: RideRequest, pauses: boolean): string {
  if (pauses) return LOCK_TEXT;
  if (!driver) return 'Cancel your Ride Request?';
  if (approach?.status === 'arrived') return `${driver.name} is waiting for you. Cancel anyway?`;
  const where = approach?.status === 'driving' ? `${formatDuration(approach.etaS)} away` : 'on the way';
  return `${driver.name} is ${where}. Cancel anyway?`;
}
