# Requisitos divididos (en orden de construcción, enfoque multirepo)

## Mapa rápido por repositorio

| Bloque | Repo principal |
|---|---|
| Bloque 1, 2, 5 | Compartido (backend + frontend) |
| Bloque 3, 4, 7, 8 (seed/migraciones) | Backend (`prescriptions-api`) |
| Bloque 6 | Frontend (`prescriptions-web`) |
| Bloque 9, 10 | Compartido (entrega y proceso) |

## Bloque 1 — Alcance funcional base
- Roles: `admin`, `doctor`, `patient`.
- Flujo mínimo:
  1. Login por email/password.
  2. Doctor crea prescripción con ítems manuales.
  3. Patient lista, consume y descarga PDF.
  4. Admin visualiza métricas.
- Estado de prescripción: `pending | consumed`.

## Bloque 2 — Base técnica obligatoria
- Backend: NestJS + Prisma + PostgreSQL.
- Frontend: Next.js + React + TypeScript + Tailwind.
- Auth: JWT access + refresh token.
- Autorización: RBAC con guards/decorators por rol.
- Seguridad/validación: DTO validation, errores HTTP consistentes, Helmet, CORS, rate limit.

## Bloque 3 — Datos y persistencia
- Modelo Prisma: `User`, `Doctor`, `Patient`, `Prescription`, `PrescriptionItem`.
- Índices sugeridos:
  - `Prescription(status, createdAt)`
  - `Prescription(patientId)`
  - `Prescription(authorId)`
- Migraciones + seed.

## Bloque 4 — API mínima
- Auth:
  - `POST /auth/register` (opcional)
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `GET /auth/profile`
- Usuarios (mínimo admin; puede omitirse si usas seed):
  - `GET /users?role=doctor|patient&query=...`
  - `POST /users`
- Perfiles (si separas perfiles):
  - `GET /patients`
  - `GET /doctors`
- Prescripciones doctor:
  - `POST /prescriptions`
  - `GET /prescriptions?mine=true...`
  - `GET /prescriptions/:id`
- Prescripciones patient:
  - `GET /me/prescriptions...`
  - `PUT /prescriptions/:id/consume`
  - `GET /prescriptions/:id/pdf`
- Admin:
  - `GET /admin/prescriptions...`
  - `GET /admin/metrics?from=&to=`

## Bloque 5 — Reglas transversales
- Paginación, filtros y ordenamiento.
- Restricción por ownership y rol.
- Contrato de error: `{ message, code, details? }`.
- Soft delete (opcional) para usuarios/prescripciones.

## Bloque 6 — Frontend mínimo
- `/login`
- Doctor:
  - `/doctor/prescriptions`
  - `/doctor/prescriptions/new`
  - `/doctor/prescriptions/[id]`
- Patient:
  - `/patient/prescriptions`
  - `/patient/prescriptions/[id]`
- Admin:
  - `/admin` con tarjetas y gráficas.
- UX:
  - loading/error/empty
  - toasts
  - protección de rutas por rol
  - filtros en querystring

## Bloque 7 — PDF
- `GET /prescriptions/:id/pdf` desde backend.
- Contenido: paciente, médico, fecha, código, ítems y estado.

## Bloque 8 — Seed y entorno
- Seed mínimo:
  - `admin@test.com / admin123`
  - `dr@test.com / dr123`
  - `patient@test.com / patient123`
  - 5–10 prescripciones de ejemplo.
- Variables de entorno backend/frontend.

## Bloque 9 — Entrega y evaluación
- README con setup, env vars, migraciones, seed, cuentas, URLs deploy.
- Criterios de aceptación y checklist del revisor.
- Plus opcionales: Swagger, QR, auditoría, etc.

## Bloque 10 — Indicaciones de repositorio (commits/PR/branch)
- Historial limpio y real:
  - Commits pequeños por feature/fix.
  - Mensajes claros explicando qué y por qué.
- Ramas por alcance:
  - `feat/auth-rbac`
  - `feat/prescriptions-api`
  - `feat/patient-ui`
  - `feat/admin-metrics`
- PRs documentados:
  - Objetivo.
  - Cambios realizados.
  - Evidencia (capturas, requests/responses, pruebas relevantes).
  - Riesgos y mitigaciones.
  - Checklist de requisitos cubiertos.
- CI obligatorio por PR:
  - lint + test + build en verde.
- Trazabilidad:
  - Cada PR debe referenciar bloques de `requisitos.md` y fases de `plan.md`.
- Transparencia de autoría:
  - Si se solicita, declarar uso de IA como apoyo técnico.

## Bloque 11 — Separación multirepo (obligatoria para este plan)
- Repos sugeridos:
  - `prescriptions-api` (NestJS + Prisma + PostgreSQL)
  - `prescriptions-web` (Next.js + React + TypeScript + Tailwind)
- Contrato entre repos:
  - Frontend consume únicamente endpoints versionados del backend.
  - Cambios de API deben actualizar documentación de contrato (Swagger/README).
- Integración:
  - Variables separadas por repo (`.env` backend, `.env.local` frontend).
  - Flujo recomendado: cerrar Auth/API base antes de arrancar pantallas por rol en frontend.
