import { Module } from '@nestjs/common';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  imports: [PrescriptionsModule],
  controllers: [DoctorsController],
  providers: [DoctorsService],
})
export class DoctorsModule {}
