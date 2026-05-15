import { Controller, Get, Param } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';

@Controller('rx')
export class PublicPrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get(':code')
  getPublic(@Param('code') code: string) {
    return this.prescriptionsService.getPublicByCode(code);
  }
}
