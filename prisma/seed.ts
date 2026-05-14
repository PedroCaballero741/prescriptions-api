import { PrismaClient, PrescriptionStatus, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function upsertDemoUsers() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  const doctorPassword = await bcrypt.hash('dr123', 10);
  const patientPassword = await bcrypt.hash('patient123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {
      password: adminPassword,
      name: 'Admin Demo',
      role: Role.admin,
    },
    create: {
      email: 'admin@test.com',
      password: adminPassword,
      name: 'Admin Demo',
      role: Role.admin,
    },
  });

  const doctorUser = await prisma.user.upsert({
    where: { email: 'dr@test.com' },
    update: {
      password: doctorPassword,
      name: 'Doctor Demo',
      role: Role.doctor,
    },
    create: {
      email: 'dr@test.com',
      password: doctorPassword,
      name: 'Doctor Demo',
      role: Role.doctor,
    },
  });

  const patientUser = await prisma.user.upsert({
    where: { email: 'patient@test.com' },
    update: {
      password: patientPassword,
      name: 'Patient Demo',
      role: Role.patient,
    },
    create: {
      email: 'patient@test.com',
      password: patientPassword,
      name: 'Patient Demo',
      role: Role.patient,
    },
  });

  const doctor = await prisma.doctor.upsert({
    where: { userId: doctorUser.id },
    update: { specialty: 'General Medicine' },
    create: {
      userId: doctorUser.id,
      specialty: 'General Medicine',
    },
  });

  const patient = await prisma.patient.upsert({
    where: { userId: patientUser.id },
    update: {},
    create: {
      userId: patientUser.id,
    },
  });

  return { doctor, patient };
}

async function seedPrescriptions(doctorId: string, patientId: string) {
  await prisma.prescriptionItem.deleteMany({
    where: {
      prescription: {
        code: {
          startsWith: 'RX-DEMO-',
        },
      },
    },
  });

  await prisma.prescription.deleteMany({
    where: {
      code: {
        startsWith: 'RX-DEMO-',
      },
    },
  });

  const statuses: PrescriptionStatus[] = [
    PrescriptionStatus.pending,
    PrescriptionStatus.consumed,
    PrescriptionStatus.pending,
    PrescriptionStatus.consumed,
    PrescriptionStatus.pending,
    PrescriptionStatus.pending,
    PrescriptionStatus.consumed,
  ];

  for (const [index, status] of statuses.entries()) {
    const code = `RX-DEMO-${String(index + 1).padStart(3, '0')}`;
    const createdAt = new Date(Date.now() - index * 86_400_000);
    await prisma.prescription.create({
      data: {
        code,
        status,
        notes: `Demo prescription ${index + 1}`,
        createdAt,
        consumedAt: status === PrescriptionStatus.consumed ? new Date(createdAt.getTime() + 43_200_000) : null,
        patientId,
        authorId: doctorId,
        items: {
          create: [
            {
              name: `Medication ${index + 1}A`,
              dosage: '1 tablet every 8h',
              quantity: 15,
              instructions: 'After meals',
            },
            {
              name: `Medication ${index + 1}B`,
              dosage: '1 tablet at night',
              quantity: 10,
              instructions: 'Before sleeping',
            },
          ],
        },
      },
    });
  }
}

async function main() {
  const { doctor, patient } = await upsertDemoUsers();
  await seedPrescriptions(doctor.id, patient.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
