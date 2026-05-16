import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesOriginRule(origin: string, rule: string): boolean {
  if (rule === '*') {
    return true;
  }

  if (rule === origin) {
    return true;
  }

  if (!rule.includes('*')) {
    return false;
  }

  const regexPattern = `^${escapeRegex(rule).replace(/\\\*/g, '.*')}$`;
  return new RegExp(regexPattern).test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  const configService = app.get(ConfigService);
  const appOrigin = configService.get<string>('APP_ORIGIN') ?? '*';
  const allowedOrigins = appOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const port = Number(configService.get<string>('PORT') ?? 3000);

  app.use(helmet());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.some((rule) => matchesOriginRule(origin, rule))) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(port);
}

void bootstrap();
