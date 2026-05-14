# Prescriptions API (Backend)

API del sistema de prescripciones para roles **admin**, **doctor** y **patient**.

## Stack

- NestJS
- Prisma ORM
- PostgreSQL
- JWT (access + refresh)
- RBAC con guards/decorators
- PDFKit para generación de PDF

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL

## Variables de entorno

Crear archivo `.env` en la raíz de este repo (`prescriptions-api/`):

```env
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"
JWT_ACCESS_SECRET=change_me
JWT_REFRESH_SECRET=change_me
JWT_ACCESS_TTL=900s
JWT_REFRESH_TTL=7d
APP_ORIGIN=http://localhost:3000
```

## Instalación

Desde la raíz de `prescriptions-api`:

```bash
npm install
```

## Scripts

```bash
npm run start:dev
npm run build
npm run start:prod
npm run lint
npm run test
npm run test:e2e
```

## Migraciones y seed

Ejecutar desde la raíz de `prescriptions-api`:

```bash
npx prisma migrate dev
npx prisma db seed
```

Credenciales objetivo de seed:

- `admin@test.com / admin123`
- `dr@test.com / dr123`
- `patient@test.com / patient123`


> Nota: en este entorno no hay una base PostgreSQL compartida para ejecutar `migrate dev`; por eso se incluye una migración baseline ya versionada en `prisma/migrations/`.
> En local, con `DATABASE_URL` configurada, ejecutar: `npm run prisma:migrate:deploy && npm run prisma:seed`.

## Endpoints mínimos esperados

- Auth: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/profile` (`POST /auth/register` opcional)
- Doctor: `POST /prescriptions`, `GET /prescriptions?mine=true...`, `GET /prescriptions/:id`
- Patient: `GET /me/prescriptions...`, `PUT /prescriptions/:id/consume`, `GET /prescriptions/:id/pdf`
- Admin: `GET /admin/prescriptions...`, `GET /admin/metrics?from=&to=`

## Criterios funcionales clave

- Ownership por rol aplicado en todas las rutas protegidas.
- Paginación, filtros y orden (`createdAt DESC` por defecto).
- Respuesta de error consistente: `{ message, code, details? }`.
