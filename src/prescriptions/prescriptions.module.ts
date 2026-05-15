import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrescriptionsController } from './prescriptions.controller';
import { PublicPrescriptionsController } from './public-prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  imports: [PrismaModule],
  controllers: [PrescriptionsController, PublicPrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
