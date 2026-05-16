import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { CreatePrescriptionDto } from '../prescriptions/dto/create-prescription.dto';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { DoctorsService } from './doctors.service';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { join } from 'path';

function imageStorage(subfolder: (req: Express.Request) => string) {
  return diskStorage({
    destination(req, _file, cb) {
      const dir = join(process.cwd(), 'uploads', 'doctors', subfolder(req));
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      cb(null, `${unique}${extname(file.originalname)}`);
    },
  });
}

const imageFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, accept: boolean) => void,
) => {
  if (/image\/(jpeg|png|webp)/.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG or WebP images are allowed'), false);
  }
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.doctor)
@Controller()
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  // ── Prescriptions ──────────────────────────────────────────────────────────

  @Post('prescriptions')
  createPrescription(
    @Req() req: Request & { user: JwtUser },
    @Body() input: CreatePrescriptionDto,
  ) {
    return this.doctorsService.createPrescription(req.user.userId, input);
  }

  @Get('prescriptions')
  listPrescriptions(
    @Req() req: Request & { user: JwtUser },
    @Query() query: PrescriptionQueryDto,
  ) {
    return this.doctorsService.listPrescriptions(req.user.userId, query);
  }

  @Get('prescriptions/:id')
  getPrescription(
    @Req() req: Request & { user: JwtUser },
    @Param('id') prescriptionId: string,
  ) {
    return this.doctorsService.getPrescription(req.user.userId, prescriptionId);
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  @Get('doctor/profile')
  getProfile(@Req() req: Request & { user: JwtUser }) {
    return this.doctorsService.getProfile(req.user.userId);
  }

  @Patch('doctor/profile')
  updateProfile(
    @Req() req: Request & { user: JwtUser },
    @Body() dto: UpdateDoctorProfileDto,
  ) {
    return this.doctorsService.updateProfile(req.user.userId, dto);
  }

  @Post('doctor/profile/signature')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: imageStorage(
        (req) => (req as Request & { user: JwtUser }).user.userId,
      ),
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadSignature(
    @Req() req: Request & { user: JwtUser },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.doctorsService.saveSignatureImage(
      req.user.userId,
      file.filename,
    );
  }

  @Delete('doctor/profile/signature')
  @HttpCode(204)
  removeSignature(@Req() req: Request & { user: JwtUser }) {
    return this.doctorsService.removeSignatureImage(req.user.userId);
  }

  @Post('doctor/profile/license')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: imageStorage(
        (req) => (req as Request & { user: JwtUser }).user.userId,
      ),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadLicense(
    @Req() req: Request & { user: JwtUser },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.doctorsService.saveLicenseImage(req.user.userId, file.filename);
  }

  @Delete('doctor/profile/license')
  @HttpCode(204)
  removeLicense(@Req() req: Request & { user: JwtUser }) {
    return this.doctorsService.removeLicenseImage(req.user.userId);
  }
}
