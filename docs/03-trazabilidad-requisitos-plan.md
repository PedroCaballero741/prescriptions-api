# Trazabilidad multirepo: `requisitos.md` -> planes backend/frontend

| Requisito (fuente) | Backend (`prescriptions-api`) | Frontend (`prescriptions-web`) | Resultado esperado |
|---|---|---|---|
| 1) Roles + flujo mínimo + estados | Fase B3 (reglas y ownership) | Fase F2-F3 (pantallas y acciones por rol) | Flujo completo doctor/patient/admin |
| 2) JWT, RBAC, validación y seguridad | Fase B2 | Fase F1 (guards de navegación + manejo 401/403) | Acceso seguro de punta a punta |
| 3) Modelado Prisma | Fase B1 | N/A (consume API) | Modelo consistente y migrado |
| 4) Contratos API mínimos | Fase B2-B4 | Fase F1-F3 (integración por endpoint) | Contrato implementado y consumido |
| 5) Páginas mínimas frontend | Soporte de endpoints en B3-B4 | Fase F1-F3 | UI funcional por rol |
| 6) PDF de prescripción | Fase B4 | Fase F3 (descarga desde patient) | PDF descargable con datos completos |
| 7) Seed y credenciales | Fase B1 | Fase F1 (uso en login demo) | Demo reproducible |
| 8) Variables de entorno | Fase 0 + Fase 8 (API) | Fase 0 + Fase 8 (WEB) | Configuración local/deploy estable |
| 9) Estructura sugerida | Fase 0 (módulos Nest) | Fase 0 (estructura Next) | Arquitectura ordenada por repo |
| 10) Entregables | Fase B5 + Fase 8 | Fase F3 + Fase 8 | 2 repos con README y URLs |
| 11) Criterios de evaluación | Fases B1-B5 | Fases F1-F3 | Cobertura funcional y técnica |
| 12) Plus opcionales | B4/B5 (Swagger, QR, auditoría) | F3 (tema, UX extra) | Valor agregado no bloqueante |
| 13) Checklist de aceptación | B3-B4-B5 | F2-F3 | Criterios del revisor cubiertos |
| 14) DTOs guía | B2-B3 | N/A | Entradas validadas y consistentes |
| 15) Consideraciones de alcance MVP | B3 (sin desbordar dominio) | F2-F3 (sin sobrecarga UI) | Alcance controlado |

## Orden recomendado de lectura
1. `../requisitos.md`
2. `./01-requisitos-divididos.md`
3. `../plan.md`
4. `./02-plan-por-fases.md`
5. `./04-plan-multirepo-frontend-backend.md`
6. `./03-trazabilidad-requisitos-plan.md`
