import { Module } from '@nestjs/common';
import { AdminPlacesController } from './admin-places.controller.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';

@Module({
  controllers: [PlacesController, AdminPlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
