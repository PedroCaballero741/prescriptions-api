# Sistema de Prescripciones — API Backend

> **English summary** at the [bottom of this file](#english-summary).

API REST para la gestión de prescripciones médicas con tres roles: **Médico**, **Paciente** y **Admin**. Construida con NestJS, Prisma y PostgreSQL.

---

## Índice

1. [Stack tecnológico](#stack-tecnológico)
2. [Características implementadas](#características-implementadas)
3. [Requisitos previos](#requisitos-previos)
4. [Configuración local](#configuración-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Migraciones y seed](#migraciones-y-seed)
7. [Cuentas de prueba](#cuentas-de-prueba)
8. [Ejecución de pruebas](#ejecución-de-pruebas)
9. [Endpoints principales](#endpoints-principales)
10. [Decisiones técnicas](#decisiones-técnicas)
11. [Despliegue](#despliegue)
12. [English Summary](#english-summary)

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | NestJS 10 |
| ORM | Prisma 7 |
| Base de datos | PostgreSQL 15 |
| Autenticación | JWT (access + refresh con rotación por `jti`) |
| Autorización | RBAC con Guards y Decorators |
| Generación de PDF | PDFKit |
| Códigos QR | `qrcode` |
| Validación | `class-validator` + `class-transformer` |
| Seguridad | Helmet, CORS, rate limiting (`@nestjs/throttler`) |
| Testing | Jest + Supertest |

---

## Características implementadas

### Core (requerimientos obligatorios)
- Autenticación por email/contraseña con JWT de acceso (15 min) y refresh token (7 días) con rotación automática
- RBAC completo: guardas y decoradores `@Roles()` para admin, doctor y paciente
- Médico: crea prescripciones con ítems manuales, lista y consulta las propias
- Paciente: lista sus prescripciones, las marca como consumidas y descarga PDF
- Admin: visualiza métricas globales (totales, por estado, por día, top médicos) con filtros de fecha
- Paginación, filtros por estado/fecha/actor y ordenamiento configurable en todos los listados
- Generación de PDF desde el backend con PDFKit (diseño de fórmula médica colombiana)
- Validación de DTOs, serialización y filtro global de excepciones con códigos HTTP estándar
- Migraciones Prisma e índices en campos de búsqueda frecuente

### Plus (opcionales implementados)
- PDF con código QR enlazado a página pública de verificación (`/rx/:code`)
- Firma del médico en el PDF (imagen o texto en cursiva, configurable desde el perfil)
- Imagen de cédula profesional del médico en el PDF
- Subida de imágenes (firma y licencia) con Multer y almacenamiento local organizado por doctor
- Página pública `/rx/:code` para verificación de prescripciones sin autenticación
- Soft delete para usuarios (campo `deletedAt`)
- Tabla de auditoría (`AuditLog`) para registro de acciones
- Exportación CSV de todos los datos (usuarios + prescripciones) desde el panel de admin
- Panel de administración de usuarios con creación por rol y eliminación suave
- Configuración de la plataforma (nombre, email de soporte, prefijo de código, límite de ítems)

---

## Requisitos previos

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (local o en la nube)

---

## Configuración local

```bash
# 1. Clonar el repositorio
git clone https://github.com/PedroCaballero741/prescriptions-api.git
cd prescriptions-api

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de variables de entorno (ver sección siguiente)
cp .env.example .env   # o crear el archivo manualmente

# 4. Aplicar el esquema a la base de datos
npx prisma db push

# 5. Cargar datos de prueba
npx prisma db seed

# 6. Iniciar en modo desarrollo
npm run start:dev
```

La API quedará disponible en `http://localhost:4000`.

---

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto con los siguientes valores:

```env
# Base de datos
DATABASE_URL="postgresql://usuario:contraseña@host:5432/prescriptions?schema=public"

# JWT — cambiar por valores seguros en producción
JWT_ACCESS_SECRET=cambia_esto_en_produccion
JWT_REFRESH_SECRET=cambia_esto_en_produccion_refresh

# TTL de tokens (en segundos)
JWT_ACCESS_EXPIRES_IN_SECONDS=900       # 15 minutos
JWT_REFRESH_EXPIRES_IN_SECONDS=604800   # 7 días

# Origen(es) del frontend para CORS (separa múltiples valores con coma)
APP_ORIGIN=http://localhost:3000,https://*.vercel.app

# URL pública del frontend para enlaces/QR en PDFs
APP_PUBLIC_URL=http://localhost:3000

# Puerto del servidor
PORT=4000
```

> **Nota:** `APP_ORIGIN` acepta múltiples orígenes y wildcard (ej. `https://*.vercel.app`) para soportar previews de Vercel. Usa `APP_PUBLIC_URL` para definir el dominio canónico del frontend en los QR.

---

## Migraciones y seed

```bash
# Aplicar esquema a la base de datos (desarrollo)
npx prisma db push

# Generar el cliente de Prisma (necesario tras cambios en schema.prisma)
npx prisma generate

# Cargar datos semilla (crea usuarios y prescripciones de ejemplo)
npx prisma db seed

# Para producción (usando migraciones versionadas)
npx prisma migrate deploy
```

---

## Cuentas de prueba

El seed crea las siguientes cuentas listas para usar:

| Rol | Email | Contraseña |
|---|---|---|
| Admin | `admin@test.com` | `admin123` |
| Médico | `dr@test.com` | `dr123` |
| Paciente | `patient@test.com` | `patient123` |

El seed también genera **7 prescripciones de ejemplo** con mezcla de estados `pending` y `consumed`, distribuidas en los últimos 7 días.

---

## Ejecución de pruebas

```bash
# Tests unitarios
npm run test

# Tests unitarios con cobertura
npm run test:cov

# Tests e2e
npm run test:e2e

# Modo watch
npm run test:watch
```

Los tests unitarios cubren `PrescriptionsService` (creación, acceso por rol, consumo, validaciones). Los tests e2e validan el flujo de autenticación y la API de salud.

---

## Endpoints principales

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/register` | Registrar usuario (patient o doctor) |
| `POST` | `/auth/login` | Iniciar sesión → `{ user, accessToken, refreshToken }` |
| `POST` | `/auth/refresh` | Renovar tokens → `{ user, accessToken, refreshToken }` |
| `GET` | `/auth/profile` | Perfil del usuario autenticado |

### Médico (requiere rol `doctor`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/prescriptions` | Crear prescripción con ítems |
| `GET` | `/prescriptions` | Listar propias (`status`, `from`, `to`, `patientId`, `page`, `order`) |
| `GET` | `/prescriptions/:id` | Detalle de prescripción |
| `GET` | `/prescriptions/:id/pdf` | Descargar PDF |
| `GET` | `/doctor/profile` | Ver perfil profesional |
| `PATCH` | `/doctor/profile` | Actualizar especialidad y firma de texto |
| `POST` | `/doctor/profile/signature` | Subir imagen de firma |
| `DELETE` | `/doctor/profile/signature` | Eliminar imagen de firma |
| `POST` | `/doctor/profile/license` | Subir imagen de cédula profesional |
| `DELETE` | `/doctor/profile/license` | Eliminar imagen de cédula |

### Paciente (requiere rol `patient`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/me/prescriptions` | Listar prescripciones propias |
| `GET` | `/me/prescriptions/:id` | Detalle de prescripción |
| `PUT` | `/prescriptions/:id/consume` | Marcar como consumida |
| `GET` | `/prescriptions/:id/pdf` | Descargar PDF |

### Admin (requiere rol `admin`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin/prescriptions` | Todas las prescripciones con filtros |
| `GET` | `/admin/metrics` | Métricas globales con filtros de fecha |
| `GET` | `/admin/settings` | Configuración de la plataforma |
| `PATCH` | `/admin/settings/system` | Actualizar configuración del sistema |
| `PATCH` | `/admin/settings/notifications` | Actualizar preferencias de notificación |
| `GET` | `/admin/export` | Exportar todos los datos en CSV |
| `DELETE` | `/admin/audit-log` | Limpiar entradas de auditoría > 1 año |
| `GET` | `/users` | Listar usuarios (paginado, filtros) |
| `POST` | `/users` | Crear usuario con rol |
| `DELETE` | `/users/:id` | Soft delete de usuario |

### Público (sin autenticación)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/rx/:code` | Verificar prescripción por código (para farmacéuticos) |
| `GET` | `/health` | Estado de la API |

---

## Decisiones técnicas

**Autenticación:** Se optó por JWT stateless para el access token (15 min) combinado con refresh tokens de larga duración (7 días). Los refresh tokens se rotan en cada uso mediante un `jti` único hasheado con bcrypt, invalidando tokens anteriores ante uso indebido.

**Autorización:** RBAC implementado con NestJS Guards y el decorador `@Roles()`. Cada endpoint verifica tanto la autenticación como el rol requerido antes de ejecutar la lógica de negocio.

**Generación de PDF:** Se eligió PDFKit por su control preciso del layout. El diseño replica el formato de fórmula médica colombiana con tablas dibujadas manualmente usando primitivas rect/stroke. Incluye QR, firma del médico y cédula profesional.

**Soft delete:** El campo `deletedAt` en el modelo `User` permite desactivar cuentas sin perder datos históricos. Todos los queries filtran `deletedAt: null` automáticamente.

**Auditoría:** El modelo `AuditLog` registra acciones clave con actor, entidad y metadatos. El admin puede limpiar entradas antiguas desde el panel.

**Archivos subidos:** Multer con `diskStorage` organiza las imágenes por `doctorId` en la carpeta `uploads/`. En producción se recomienda migrar a un bucket (S3, Cloudflare R2).

---

## Despliegue

| Servicio | URL |
|---|---|
| API | `https://prescriptions-api-production-7f18.up.railway.app` |
| Frontend | `https://prescriptions-web-seven.vercel.app` |

Plataformas recomendadas: **Render** o **Railway** para la API, **Neon** para PostgreSQL, **Vercel** para el frontend.

---

## English Summary

### Prescriptions System — Backend API

REST API for managing medical prescriptions with three roles: **Doctor**, **Patient**, and **Admin**. Built with NestJS, Prisma, and PostgreSQL.

**Quick start:**

```bash
git clone https://github.com/PedroCaballero741/prescriptions-api.git
cd prescriptions-api
npm install
# Create .env file (see Variables de entorno section above)
npx prisma db push
npx prisma db seed
npm run start:dev
# API available at http://localhost:4000
```

**Test accounts (created by seed):**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@test.com` | `admin123` |
| Doctor | `dr@test.com` | `dr123` |
| Patient | `patient@test.com` | `patient123` |

**Key environment variables:**

```env
DATABASE_URL="postgresql://user:pass@host:5432/prescriptions"
JWT_ACCESS_SECRET=your_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES_IN_SECONDS=900
JWT_REFRESH_EXPIRES_IN_SECONDS=604800
APP_ORIGIN=http://localhost:3000
PORT=4000
```

**Run tests:** `npm run test` · `npm run test:e2e` · `npm run test:cov`
