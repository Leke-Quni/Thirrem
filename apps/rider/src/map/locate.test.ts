import { describe, expect, it } from 'vitest';
import { locate, LocateError } from './locate';

type Success = (position: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (error: { code: number }) => void;

const geolocation = (behave: (success: Success, failure: Failure) => void) => ({
  getCurrentPosition: (success: Success, failure: Failure) => behave(success, failure),
});

describe('locate', () => {
  it('resolves with the Rider’s position as a latitude and longitude', async () => {
    const geo = geolocation((success) => success({ coords: { latitude: 51.5, longitude: -0.12 } }));

    expect(await locate(geo)).toEqual({ lat: 51.5, lon: -0.12 });
  });

  it('says so when the browser cannot share a location', async () => {
    await expect(locate(undefined)).rejects.toThrow(LocateError);
    await expect(locate(undefined)).rejects.toThrow(/cannot share your location/i);
  });

  it('tells the Rider how to recover when permission is denied', async () => {
    const geo = geolocation((_, failure) => failure({ code: 1 }));

    await expect(locate(geo)).rejects.toThrow(/blocked.*click the map/i);
  });

  it('explains when the position cannot be found', async () => {
    const geo = geolocation((_, failure) => failure({ code: 2 }));

    await expect(locate(geo)).rejects.toThrow(/could not be found/i);
  });

  it('offers a retry when finding the position takes too long', async () => {
    const geo = geolocation((_, failure) => failure({ code: 3 }));

    await expect(locate(geo)).rejects.toThrow(/too long.*try again/i);
  });
});
