import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AdminPlace, type AdminPlaceList, AdminPlaceQuery, PlaceInput } from '@fi-thnitek/contracts';
import type { z } from 'zod';
import { AdminOnly, type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PlacesService } from './places.service.js';

/** "Content → Places". Every write is audited; edited rows are locked against dataset re-imports. */
@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin/places')
export class AdminPlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AdminPlaceQuery)) query: z.output<typeof AdminPlaceQuery>,
  ): Promise<AdminPlaceList> {
    return this.places.adminList(query.q, query.page, query.pageSize);
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(PlaceInput)) body: z.output<typeof PlaceInput>,
  ): Promise<AdminPlace> {
    return this.places.create(body, auth.userId);
  }

  @Put(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PlaceInput)) body: z.output<typeof PlaceInput>,
  ): Promise<AdminPlace> {
    return this.places.update(id, body, auth.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.places.remove(id, auth.userId);
  }
}
