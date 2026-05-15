# Prescriptions API (Backend)

API del sistema de prescripciones para roles **admin**, **doctor** y **patient**.

## Stack

- NestJS
- Prisma ORM
- PostgreSQL
- JWT (access + refresh, rotación de refresh por `jti`)
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
# TTL del access token en segundos (p. ej. 900 = 15 min)
JWT_ACCESS_EXPIRES_IN_SECONDS=900
# TTL del refresh en segundos (p. ej. 604800 = 7 días)
JWT_REFRESH_EXPIRES_IN_SECONDS=604800
APP_ORIGIN=http://localhost:3000
PORT=4000
```

`APP_ORIGIN` debe coincidir con el origen del frontend (CORS). En desarrollo suele ser `http://localhost:3000`.

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
npm run test:cov
```

## Migraciones y seed

```bash
npx prisma migrate deploy
npx prisma db seed
```

Credenciales de seed:

- `admin@test.com` / `admin123`
- `dr@test.com` / `dr123`
- `patient@test.com` / `patient123`

> En local sin DB compartida: las migraciones van en `prisma/migrations/`. Con `DATABASE_URL` configurada: `npm run prisma:migrate:deploy && npm run prisma:seed`.

## Endpoints (resumen)

### Auth

- `POST /auth/register` — solo roles `patient` o `doctor` (crea perfil asociado).
- `POST /auth/login` → `{ user, accessToken, refreshToken }`
- `POST /auth/refresh` → `{ user, accessToken, refreshToken }`
- `GET /auth/profile` — Bearer access.

### Admin (`Authorization: Bearer`, rol admin)

- `GET /users?role=&query=&page=&pageSize=&limit=`
- `POST /users` — cuerpo: `email`, `password`, `name`, `role` (`admin`|`doctor`|`patient`), opcional `specialty` (doctor), `birthDate` (patient).
- `GET /admin/prescriptions?status=&patientId=&doctorId=&from=&to=&page=&pageSize=&limit=&order=`
- `GET /admin/metrics?from=&to=`
- `GET /patients?query=&page=&pageSize=&limit=` — listado de pacientes (admin: todos; doctor: solo con prescripciones emitidas por él).
- `GET /doctors?query=&page=&pageSize=&limit=` — listado de médicos (solo admin).

### Médico

- `POST /prescriptions` — exactamente uno de `patientId` o `patientEmail`; `code` opcional (único; si se omite se genera); `notes`, `items[]`.
- `GET /prescriptions?status=&from=&to=&patientId=&page=&pageSize=&limit=&order=`
- `GET /prescriptions/:id`
- `GET /prescriptions/:id/pdf`

### Paciente

- `GET /me/prescriptions?status=&from=&to=&page=&pageSize=&limit=&order=`
- `GET /me/prescriptions/:id`
- `PUT /prescriptions/:id/consume`
- `GET /prescriptions/:id/pdf`

## Errores

Respuesta JSON: `{ message, code, details? }` con códigos HTTP apropiados (400, 401, 403, 404, 409, 429, 500).

## Despliegue

Si la API está publicada, documenta aquí la URL base, por ejemplo:

- API: *(añadir tras despliegue)*
- Front: *(en el README del repo `prescriptions-web`)*

## Criterios funcionales

- Ownership por rol en prescripciones y PDF.
- Paginación, filtros por estado/fecha, `patientId`/`doctorId` en listados admin, alias `limit` para tamaño de página.
- Orden por `createdAt` (`order=asc|desc`, por defecto `desc`).
