import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { DoctorsDirectoryController } from './doctors-directory.controller';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  imports: [PrescriptionsModule, AuthModule],
  controllers: [DoctorsController, DoctorsDirectoryController],
  providers: [DoctorsService],
})
export class DoctorsModule {}
