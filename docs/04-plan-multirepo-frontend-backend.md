# Plan ordenado multirepo (frontend + backend separados)

Este documento propone un orden de trabajo en **dos repositorios**:
- `prescriptions-api` (NestJS + Prisma + PostgreSQL)
- `prescriptions-web` (Next.js + TypeScript + Tailwind)

Basado en `../requisitos.md`, prioriza dependencias reales entre API y Front para reducir retrabajo.

## 1) Repositorio Backend (`prescriptions-api`)

### Fase B0 — Bootstrap técnico
- Crear proyecto NestJS con estructura modular (`auth`, `users`, `patients`, `doctors`, `prescriptions`, `admin`, `common`, `prisma`).
- Configurar variables `.env`, scripts y base de seguridad (`Helmet`, `CORS`, rate limit).
- Activar validación global y formato de errores consistente `{ message, code, details? }`.

### Fase B1 — Datos (Prisma + DB)
- Implementar `schema.prisma` con modelos: `User`, `Doctor`, `Patient`, `Prescription`, `PrescriptionItem`.
- Crear índices sugeridos:
  - `Prescription(status, createdAt)`
  - `Prescription(patientId)`
  - `Prescription(authorId)`
- Ejecutar migración inicial y `seed.ts` con credenciales de prueba.

### Fase B2 — Auth y RBAC
- Implementar `POST /auth/login`, `POST /auth/refresh`, `GET /auth/profile`.
- Incluir `POST /auth/register` como opcional.
- JWT access + refresh token (rotación recomendada).
- Guards/decorators por rol: `admin`, `doctor`, `patient`.

### Fase B3 — Dominio de prescripciones y métricas
- Endpoints doctor:
  - `POST /prescriptions`
  - `GET /prescriptions?mine=true...`
  - `GET /prescriptions/:id`
- Endpoints patient:
  - `GET /me/prescriptions...`
  - `PUT /prescriptions/:id/consume`
- Endpoints admin:
  - `GET /admin/prescriptions...`
  - `GET /admin/metrics?from=&to=`
- Endpoints de soporte admin (opcionales según alcance):
  - `GET /users...`, `POST /users`
  - `GET /patients`, `GET /doctors`
- Incluir paginación, filtros, orden por `createdAt DESC` y reglas de ownership.
- Soft delete opcional para usuarios/prescripciones.

### Fase B4 — PDF
- Implementar `GET /prescriptions/:id/pdf` protegido por ownership/rol.
- Incluir paciente, médico, fecha, código, items y estado.

### Fase B5 — Documentación y calidad
- Swagger/OpenAPI en `/docs` (preferible).
- Tests mínimos backend (unitarios o e2e de flujos críticos).
- README: setup, envs, migraciones, seed, credenciales y URL deploy.

## 2) Repositorio Frontend (`prescriptions-web`)

### Fase F0 — Bootstrap técnico
- Crear proyecto Next.js con App Router (o Pages), TypeScript y Tailwind.
- Definir estructura base: `app/`, `components/`, `lib/`, `store/`.
- Configurar `NEXT_PUBLIC_API_BASE_URL`.

### Fase F1 — Base de autenticación
- Implementar `/login`.
- Guardar sesión/tokens y perfil de usuario.
- Cliente HTTP con refresh de token y manejo estándar de errores API.
- Protección de rutas por rol.

### Fase F2 — Vistas Doctor
- `/doctor/prescriptions` (listado con filtros, paginación, orden).
- `/doctor/prescriptions/new` (form dinámico de ítems add/remove).
- `/doctor/prescriptions/[id]` (detalle).

### Fase F3 — Vistas Patient
- `/patient/prescriptions` (listar + acción consumir + descargar PDF).
- `/patient/prescriptions/[id]` (detalle).

### Fase F4 — Vistas Admin
- `/admin` con métricas:
  - Totales
  - Por estado
  - Serie por día (últimos 30)
  - Top médicos (opcional)

### Fase F5 — UX y calidad
- Estados de carga, error y vacío.
- Toasts de acciones críticas.
- Filtros persistidos en querystring.
- Test mínimo de componente/hook crítico.
- README: setup, envs y scripts.

## 3) Orden de ejecución entre repos

1. **Backend B0-B2 primero** (deja lista la base de auth y contratos mínimos).
2. **Frontend F0-F1 después** (conecta login real contra API).
3. **Backend B3** y en paralelo **Frontend F2-F3** (flujos doctor/patient).
4. **Backend B4** y ajuste **Frontend F3** para descarga PDF.
5. **Frontend F4** tras estabilizar `/admin/metrics`.
6. **B5 + F5** para cierre: pruebas, documentación y deploy.

## 4) Definición de terminado (DoD) por repo

### Backend DoD
- Endpoints mínimos implementados y protegidos por RBAC.
- Ownership aplicado correctamente en doctor/patient.
- Migraciones + seed ejecutables sin errores.
- PDF funcional.

### Frontend DoD
- Login funcional por rol.
- Flujos doctor/patient/admin completos según requisitos mínimos.
- UX base (loading/error/empty, toasts, responsive) implementada.
- Integración estable con API desplegable.
