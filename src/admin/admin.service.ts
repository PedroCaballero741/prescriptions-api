import { Injectable } from '@nestjs/common';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { AdminMetricsQueryDto } from './dto/admin-metrics-query.dto';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  listPrescriptions(query: PrescriptionQueryDto) {
    return this.prescriptionsService.listForAdmin(query);
  }

  getMetrics(query: AdminMetricsQueryDto) {
    return this.prescriptionsService.getMetrics(query.from, query.to);
  }
}
