import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  NearestPlaceRequest,
  type NearestPlaceResponse,
  PlaceSearchRequest,
  type PlaceSearchResponse,
} from '@fi-thnitek/contracts';
import type { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PlacesService } from './places.service.js';

/** Coordinates travel in POST bodies only (CLAUDE.md rule 8); nothing here is stored. */
@ApiTags('places')
@ApiBearerAuth()
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Body(new ZodValidationPipe(PlaceSearchRequest)) body: z.output<typeof PlaceSearchRequest>,
  ): Promise<PlaceSearchResponse> {
    return { places: await this.places.search(body.q, body) };
  }

  @Post('nearest')
  @HttpCode(HttpStatus.OK)
  nearest(
    @Body(new ZodValidationPipe(NearestPlaceRequest)) body: z.output<typeof NearestPlaceRequest>,
  ): Promise<NearestPlaceResponse> {
    return this.places.nearest(body.point, body.maxDistanceM);
  }
}
