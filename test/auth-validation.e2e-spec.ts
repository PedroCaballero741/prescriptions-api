import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createConfiguredApp } from './create-app';

describe('Auth validation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createConfiguredApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/register rejects invalid payload with 400', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: 'x' })
      .expect(400)
      .expect((res) => {
        expect(res.body).toMatchObject({
          message: expect.any(String),
          code: 'BAD_REQUEST',
        });
      });
  });

  it('POST /auth/login rejects invalid payload with 400', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'bad', password: '' })
      .expect(400);
  });
});
