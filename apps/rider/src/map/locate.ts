import type { Coordinate } from '@thirrem/types';

export class LocateError extends Error {}

const MESSAGES: Record<number, string> = {
  1: 'Location access is blocked. Allow it in your browser settings, or click the map to place a pin.',
  2: 'Your location could not be found. Click the map to place a pin instead.',
  3: 'Finding your location took too long. Try again, or click the map to place a pin.',
};

type Geo = {
  getCurrentPosition(
    success: (position: { coords: { latitude: number; longitude: number } }) => void,
    failure: (error: { code: number }) => void,
    options?: PositionOptions,
  ): void;
};

export function locate(geolocation: Geo | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<Coordinate> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new LocateError('This browser cannot share your location. Click the map to place a pin instead.'));
      return;
    }
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      (error) => reject(new LocateError(MESSAGES[error.code] ?? MESSAGES[2])),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
