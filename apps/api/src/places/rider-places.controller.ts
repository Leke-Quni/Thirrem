import { BadRequestException, Controller, Get, Headers, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { PlaceResult, StreetResponse } from '@thirrem/types';
import { AuthService } from '../auth/auth.service.js';
import type { Coordinate } from '../routing/routing.service.js';
import { SearchRateLimitGuard } from '../security/rate-limiter.js';
import { PlaceSearchService } from './place-search.service.js';

const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

function requirePoint(lat: string | undefined, lon: string | undefined): Coordinate {
  const near = parseNear(lat, lon);
  if (!near) throw new BadRequestException('The pin needs a latitude and longitude.');
  return near;
}

function parseNear(lat: string | undefined, lon: string | undefined): Coordinate | undefined {
  if (lat === undefined && lon === undefined) return undefined;
  const near = { lat: Number(lat), lon: Number(lon) };
  const valid = lat?.trim() && lon?.trim() && Math.abs(near.lat) <= 90 && Math.abs(near.lon) <= 180;
  if (!valid || Number.isNaN(near.lat) || Number.isNaN(near.lon)) throw new BadRequestException('The search area needs a latitude and longitude.');
  return near;
}

@Controller('rider')
export class RiderPlacesController {
  constructor(
    private readonly auth: AuthService,
    private readonly places: PlaceSearchService,
  ) {}

  @Get('places')
  @UseGuards(SearchRateLimitGuard)
  async search(
    @Headers('authorization') authorization: string | undefined,
    @Query('q') q?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
  ): Promise<PlaceResult[]> {
    await this.auth.authenticate('rider', bearerToken(authorization));
    const query = typeof q === 'string' ? q.trim() : '';
    if (query.length < 2 || query.length > 100) throw new BadRequestException('Type 2 to 100 characters to search for a street or place.');
    const near = parseNear(lat, lon);
    return this.places.search(query, near).catch(() => {
      throw new ServiceUnavailableException('Search is unavailable right now. Click the map to place a pin instead.');
    });
  }

  @Get('places/reverse')
  @UseGuards(SearchRateLimitGuard)
  async streetAt(@Headers('authorization') authorization: string | undefined, @Query('lat') lat?: string, @Query('lon') lon?: string): Promise<StreetResponse> {
    await this.auth.authenticate('rider', bearerToken(authorization));
    const point = requirePoint(lat, lon);
    const street = await this.places.streetAt(point).catch(() => {
      throw new ServiceUnavailableException('The street name is unavailable right now.');
    });
    return { street };
  }
}
