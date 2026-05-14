import { Injectable } from '@nestjs/common';
import { CreatePrescriptionDto } from '../prescriptions/dto/create-prescription.dto';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';

@Injectable()
export class DoctorsService {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  createPrescription(userId: string, input: CreatePrescriptionDto) {
    return this.prescriptionsService.createForDoctor(userId, input);
  }

  listPrescriptions(userId: string, query: PrescriptionQueryDto) {
    return this.prescriptionsService.listForDoctor(userId, query);
  }

  getPrescription(userId: string, prescriptionId: string) {
    return this.prescriptionsService.getForDoctor(userId, prescriptionId);
  }
}
