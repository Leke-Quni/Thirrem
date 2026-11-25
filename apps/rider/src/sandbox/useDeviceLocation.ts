import type { Coordinate } from '@thirrem/types';
import { useCallback, useEffect, useState } from 'react';
import type { DeviceLocation } from './sandbox-centre';

const ANSWER_TIMEOUT_MS = 10_000;

/** What is known of the device location, giving up when the browser's question goes unanswered after `asking` starts. */
export function useDeviceLocation(asking: boolean) {
  const [location, setLocation] = useState<DeviceLocation>({ status: 'finding' });
  const found = useCallback((point: Coordinate) => setLocation({ status: 'found', point }), []);
  const failed = useCallback(() => setLocation((current) => (current.status === 'found' ? current : { status: 'unavailable' })), []);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(failed, ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [asking, failed]);

  return { location, found, failed };
}
