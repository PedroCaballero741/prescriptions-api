import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { PatientsDirectoryController } from './patients-directory.controller';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [PrescriptionsModule, AuthModule],
  controllers: [PatientsController, PatientsDirectoryController],
  providers: [PatientsService],
})
export class PatientsModule {}
