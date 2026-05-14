# Plan por fases (orden de ejecución multirepo)

## Fase 0 — Bootstrap compartido
- Crear ambos repos: `prescriptions-api` y `prescriptions-web`.
- Definir convención de ramas, PRs y versionado de contrato API.
- Configurar variables y scripts base en cada repo.

## Fase B1 — Backend: Prisma y DB
- Schema + relaciones + índices.
- Migración inicial.
- Seed con usuarios y prescripciones.

## Fase B2 — Backend: Auth + RBAC
- Login con access/refresh token.
- Refresh token rotación.
- `/auth/register` (opcional).
- `/auth/profile`.
- Guards/decorators por rol.
- Hardening: validación, filtros, Helmet, CORS, rate limit.

## Fase F1 — Frontend: base de autenticación
- `/login` y estado de sesión.
- Cliente HTTP con refresh.
- Guards de navegación por rol.
- Base de UX: loading/error/empty y toasts.

## Fase B3 — Backend: dominio de prescripciones (API)
- Endpoints de doctor, patient y admin.
- Endpoints de administración de usuarios (si aplica) y listados de pacientes/doctores.
- Filtros, paginación, ordenamiento.
- Reglas de acceso por ownership.
- Error handling consistente.
- Soft delete (opcional) para usuarios/prescripciones.

## Fase F2 — Frontend: vistas doctor + patient
- Doctor: listado, creación y detalle de prescripciones.
- Patient: listado, detalle y acción de consumir.
- Filtros con querystring.

## Fase B4 — Backend: PDF
- Servicio de generación de PDF.
- Endpoint protegido por ownership/rol.
- Descarga con headers correctos.

## Fase F3 — Frontend: descarga PDF + admin dashboard
- Integración de descarga PDF desde patient.
- `/admin` con tarjetas y gráficas de métricas.

## Fase F4 — Frontend: UX transversal
- Responsive (grid/cards).
- Estados de carga, error y vacío.
- Toasts para acciones críticas.
- Persistencia de filtros en querystring.

## Fase B5/F5 — Calidad y documentación por repo
- Backend: Swagger/OpenAPI, testing mínimo, README de API.
- Frontend: testing mínimo (componente/hook), README de web.

## Fase 7 — Testing (por repo)
- Backend: unit/e2e en flujos críticos.
- Frontend: componente/hook crítico.

## Fase 8 — Entrega (coordinada)
- Deploy backend y frontend.
- README final y documentación técnica.

## Dependencias clave entre fases
1. B1 -> B2 -> B3 es secuencial en backend.
2. F1 arranca cuando B2 expone auth estable.
3. F2 depende de B3.
4. F3 (PDF/admin) depende de B4 y de `/admin/metrics`.
5. F4 depende de F2-F3.
