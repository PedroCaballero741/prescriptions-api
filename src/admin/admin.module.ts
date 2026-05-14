import { Module } from '@nestjs/common';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PrescriptionsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
