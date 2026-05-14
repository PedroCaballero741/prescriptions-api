import { Injectable } from '@nestjs/common';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';

@Injectable()
export class PatientsService {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  listMyPrescriptions(userId: string, query: PrescriptionQueryDto) {
    return this.prescriptionsService.listForPatient(userId, query);
  }

  getMyPrescription(userId: string, prescriptionId: string) {
    return this.prescriptionsService.getForPatient(userId, prescriptionId);
  }

  consumePrescription(userId: string, prescriptionId: string) {
    return this.prescriptionsService.consumeForPatient(userId, prescriptionId);
  }
}
