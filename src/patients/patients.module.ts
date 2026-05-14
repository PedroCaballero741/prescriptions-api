import { Module } from '@nestjs/common';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [PrescriptionsModule],
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
