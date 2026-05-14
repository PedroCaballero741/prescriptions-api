import { Role } from '@prisma/client';

export interface JwtUser {
  userId: string;
  email: string;
  role: Role;
}
