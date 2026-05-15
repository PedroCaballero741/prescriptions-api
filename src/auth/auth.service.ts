import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly refreshTokenStore = new Map<string, string>();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.usersService.createWithRoleProfile({
      email,
      password: passwordHash,
      name: input.name.trim(),
      role: input.role === Role.doctor ? 'doctor' : 'patient',
    });

    return this.sanitizeUser(user);
  }

  async login(input: LoginDto) {
    const user = await this.validateCredentials(input.email, input.password);
    const tokens = await this.issueTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'refresh-secret';

    let payload: RefreshPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(
        refreshToken,
        {
          secret: refreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const savedRefreshJtiHash = this.refreshTokenStore.get(payload.sub);
    if (!savedRefreshJtiHash) {
      throw new UnauthorizedException('Refresh session not found');
    }

    const matches = await bcrypt.compare(payload.jti, savedRefreshJtiHash);
    if (!matches) {
      throw new UnauthorizedException('Refresh token already rotated');
    }

    const userRecord = await this.usersService.findById(payload.sub);
    if (!userRecord) {
      throw new UnauthorizedException('User not found');
    }

    const user = this.sanitizeUser(userRecord);
    const tokens = await this.issueTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  async profile(userId: string) {
    const userRecord = await this.usersService.findById(userId);

    if (!userRecord) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(userRecord);
  }

  private sanitizeUser(user: AuthUser & { password: string }): AuthUser {
    const { password, ...safeUser } = user;
    void password;
    return safeUser;
  }

  private async validateCredentials(email: string, password: string) {
    const user = await this.usersService.findByEmail(email.trim().toLowerCase());

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.sanitizeUser(user);
  }

  private async issueTokens(user: AuthUser) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'refresh-secret';
    const refreshExpiresIn = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS') ??
        60 * 60 * 24 * 7,
    );

    const refreshJti = randomUUID();
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        jti: refreshJti,
        type: 'refresh' as const,
      },
      {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      },
    );

    const refreshJtiHash = await bcrypt.hash(refreshJti, 10);
    this.refreshTokenStore.set(user.id, refreshJtiHash);

    return {
      accessToken,
      refreshToken,
    };
  }
}
