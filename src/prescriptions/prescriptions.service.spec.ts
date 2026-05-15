/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionsService } from './prescriptions.service';

const mockPrisma = {
  doctor: {
    findUnique: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  patient: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  prescription: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
};

const DOCTOR_ID = 'doctor-1';
const PATIENT_ID = 'patient-1';
const USER_DOCTOR_ID = 'user-doctor-1';
const USER_PATIENT_ID = 'user-patient-1';
const PRESCRIPTION_ID = 'rx-1';

const makePrescription = (overrides = {}) => ({
  id: PRESCRIPTION_ID,
  code: 'RX-001',
  status: PrescriptionStatus.pending,
  notes: null,
  createdAt: new Date('2025-01-01'),
  consumedAt: null,
  authorId: DOCTOR_ID,
  patientId: PATIENT_ID,
  items: [],
  patient: {
    id: PATIENT_ID,
    user: { id: USER_PATIENT_ID, email: 'p@test.com', name: 'Patient' },
  },
  author: {
    id: DOCTOR_ID,
    user: { id: USER_DOCTOR_ID, email: 'dr@test.com', name: 'Doctor' },
    specialty: null,
  },
  ...overrides,
});

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
    jest.clearAllMocks();
  });

  // ── createForDoctor ──────────────────────────────────────────────────────────

  describe('createForDoctor', () => {
    it('throws ForbiddenException when doctor profile not found', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createForDoctor(USER_DOCTOR_ID, {
          patientId: PATIENT_ID,
          code: 'RX-001',
          items: [{ name: 'Amox' }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when patient not found', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: DOCTOR_ID });
      mockPrisma.patient.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createForDoctor(USER_DOCTOR_ID, {
          patientId: 'nonexistent',
          code: 'RX-001',
          items: [{ name: 'Amox' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when patient email not found', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: DOCTOR_ID });
      mockPrisma.patient.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.createForDoctor(USER_DOCTOR_ID, {
          patientEmail: 'missing@test.com',
          code: 'RX-001',
          items: [{ name: 'Amox' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates prescription successfully', async () => {
      const rx = makePrescription();
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: DOCTOR_ID });
      mockPrisma.patient.findUnique.mockResolvedValueOnce({ id: PATIENT_ID });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(null);
      mockPrisma.prescription.create.mockResolvedValueOnce(rx);

      const result = await service.createForDoctor(USER_DOCTOR_ID, {
        patientId: PATIENT_ID,
        code: 'RX-001',
        items: [
          {
            name: 'Amox',
            dosage: '500mg',
            quantity: 10,
            instructions: 'After meals',
          },
        ],
      });

      expect(result).toEqual(rx);
      expect(mockPrisma.prescription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'RX-001',
            authorId: DOCTOR_ID,
            patientId: PATIENT_ID,
          }),
        }),
      );
    });

    it('creates prescription using patient email and generated code', async () => {
      const rx = makePrescription({ code: 'RX-GEN' });
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: DOCTOR_ID });
      mockPrisma.patient.findFirst.mockResolvedValueOnce({ id: PATIENT_ID });
      mockPrisma.prescription.findUnique.mockResolvedValue(null);
      mockPrisma.prescription.create.mockResolvedValueOnce(rx);

      const result = await service.createForDoctor(USER_DOCTOR_ID, {
        patientEmail: 'p@test.com',
        items: [{ name: 'Amox' }],
      });

      expect(result).toEqual(rx);
      expect(mockPrisma.patient.findFirst).toHaveBeenCalled();
      expect(mockPrisma.prescription.create).toHaveBeenCalled();
    });
  });

  // ── getForDoctor ─────────────────────────────────────────────────────────────

  describe('getForDoctor', () => {
    it('throws ForbiddenException when prescription belongs to another doctor', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({
        id: 'other-doctor',
      });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(
        makePrescription({ authorId: DOCTOR_ID }),
      );
      await expect(
        service.getForDoctor(USER_DOCTOR_ID, PRESCRIPTION_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns prescription when it belongs to the doctor', async () => {
      const rx = makePrescription();
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: DOCTOR_ID });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(rx);
      await expect(
        service.getForDoctor(USER_DOCTOR_ID, PRESCRIPTION_ID),
      ).resolves.toEqual(rx);
    });

    it('throws NotFoundException when prescription does not exist', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: DOCTOR_ID });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.getForDoctor(USER_DOCTOR_ID, 'bad-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getForPatient ────────────────────────────────────────────────────────────

  describe('getForPatient', () => {
    it('throws ForbiddenException when prescription belongs to another patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValueOnce({
        id: 'other-patient',
      });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(
        makePrescription({ patientId: PATIENT_ID }),
      );
      await expect(
        service.getForPatient(USER_PATIENT_ID, PRESCRIPTION_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns prescription when it belongs to the patient', async () => {
      const rx = makePrescription();
      mockPrisma.patient.findUnique.mockResolvedValueOnce({ id: PATIENT_ID });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(rx);
      await expect(
        service.getForPatient(USER_PATIENT_ID, PRESCRIPTION_ID),
      ).resolves.toEqual(rx);
    });
  });

  // ── consumeForPatient ────────────────────────────────────────────────────────

  describe('consumeForPatient', () => {
    it('throws BadRequestException when prescription already consumed', async () => {
      mockPrisma.patient.findUnique.mockResolvedValueOnce({ id: PATIENT_ID });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(
        makePrescription({ status: PrescriptionStatus.consumed }),
      );
      await expect(
        service.consumeForPatient(USER_PATIENT_ID, PRESCRIPTION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when prescription belongs to another patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValueOnce({
        id: 'other-patient',
      });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(
        makePrescription({ patientId: PATIENT_ID }),
      );
      await expect(
        service.consumeForPatient(USER_PATIENT_ID, PRESCRIPTION_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('marks prescription as consumed', async () => {
      const rx = makePrescription();
      const consumed = makePrescription({
        status: PrescriptionStatus.consumed,
        consumedAt: new Date(),
      });
      mockPrisma.patient.findUnique.mockResolvedValueOnce({ id: PATIENT_ID });
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(rx);
      mockPrisma.prescription.update.mockResolvedValueOnce(consumed);

      const result = await service.consumeForPatient(
        USER_PATIENT_ID,
        PRESCRIPTION_ID,
      );
      expect(result.status).toBe(PrescriptionStatus.consumed);
      expect(mockPrisma.prescription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PrescriptionStatus.consumed,
          }),
        }),
      );
    });
  });

  // ── getMetrics ───────────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('returns zero consumptionRate when there are no prescriptions', async () => {
      mockPrisma.prescription.count.mockResolvedValue(0);
      mockPrisma.doctor.count.mockResolvedValue(0);
      mockPrisma.patient.count.mockResolvedValue(0);
      mockPrisma.prescription.findMany.mockResolvedValue([]);
      mockPrisma.prescription.groupBy.mockResolvedValue([]);
      mockPrisma.doctor.findMany.mockResolvedValue([]);

      const result = await service.getMetrics();
      expect(result.consumptionRate).toBe(0);
      expect(result.total).toBe(0);
    });

    it('calculates consumptionRate correctly', async () => {
      mockPrisma.prescription.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(4) // consumed
        .mockResolvedValueOnce(6); // pending
      mockPrisma.doctor.count.mockResolvedValue(2);
      mockPrisma.patient.count.mockResolvedValue(5);
      mockPrisma.prescription.findMany.mockResolvedValue([]);
      mockPrisma.prescription.groupBy.mockResolvedValue([]);
      mockPrisma.doctor.findMany.mockResolvedValue([]);

      const result = await service.getMetrics();
      expect(result.consumptionRate).toBe(0.4);
      expect(result.totals?.prescriptions).toBe(10);
      expect(result.totals?.doctors).toBe(2);
      expect(result.totals?.patients).toBe(5);
    });

    it('throws BadRequestException when from is after to', async () => {
      await expect(
        service.getMetrics('2025-12-01', '2025-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('builds byDay series correctly', async () => {
      mockPrisma.prescription.count.mockResolvedValue(2);
      mockPrisma.doctor.count.mockResolvedValue(1);
      mockPrisma.patient.count.mockResolvedValue(1);
      mockPrisma.prescription.findMany.mockResolvedValue([
        { createdAt: new Date('2025-03-01T10:00:00Z') },
        { createdAt: new Date('2025-03-01T15:00:00Z') },
        { createdAt: new Date('2025-03-02T09:00:00Z') },
      ]);
      mockPrisma.prescription.groupBy.mockResolvedValue([]);
      mockPrisma.doctor.findMany.mockResolvedValue([]);

      const result = await service.getMetrics();
      expect(result.byDay).toEqual([
        { date: '2025-03-01', count: 2 },
        { date: '2025-03-02', count: 1 },
      ]);
    });

    it('includes topDoctors with names', async () => {
      mockPrisma.prescription.count.mockResolvedValue(5);
      mockPrisma.doctor.count.mockResolvedValue(1);
      mockPrisma.patient.count.mockResolvedValue(1);
      mockPrisma.prescription.findMany.mockResolvedValue([]);
      mockPrisma.prescription.groupBy.mockResolvedValue([
        { authorId: DOCTOR_ID, _count: { id: 5 } },
      ]);
      mockPrisma.doctor.findMany.mockResolvedValue([
        { id: DOCTOR_ID, user: { name: 'Dr. House' } },
      ]);

      const result = await service.getMetrics();
      expect(result.topDoctors).toEqual([
        { doctorId: DOCTOR_ID, name: 'Dr. House', count: 5 },
      ]);
    });
  });

  // ── getPdfForUser — access control ───────────────────────────────────────────

  describe('getPdfForUser — access control', () => {
    const adminUser = { userId: 'admin-1', role: Role.admin };
    const patientUser = { userId: USER_PATIENT_ID, role: Role.patient };

    it('allows admin to access any prescription PDF', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(
        makePrescription(),
      );
      await expect(
        service.getPdfForUser(adminUser, PRESCRIPTION_ID),
      ).resolves.toMatchObject({
        filename: expect.stringContaining('prescription-'),
        content: expect.any(Buffer),
      });
    });

    it('denies patient access to a prescription that is not theirs', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValueOnce(
        makePrescription({ patientId: 'some-other-patient' }),
      );
      mockPrisma.patient.findUnique.mockResolvedValueOnce({ id: PATIENT_ID });
      await expect(
        service.getPdfForUser(patientUser, PRESCRIPTION_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
