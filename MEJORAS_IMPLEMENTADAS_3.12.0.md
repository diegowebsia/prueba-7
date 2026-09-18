# Mejoras implementadas — ReviewFlow AI 3.12.0

**Fecha:** 2026-09-18  
**Análisis previo:** `ANALISIS_EVOLUTIVO_2026-09-18.md`

## Seguridad y robustez

- **Stripe idempotente en todos los eventos:** nueva tabla `webhook_events` con estado, intentos, error sanitizado y fechas; RPC atómica de claim/finalización/fallo; lease de cinco minutos para recuperar workers interrumpidos.
- **Protección de cuerpos:** lectura por stream con límite real en contacto, feedback, Stripe, Meta, Shopify y WooCommerce. Los excesos devuelven HTTP 413 antes del parseo.
- **Feedback no reutilizable:** un voto solo puede transformarse una vez en ticket, mientras siga en estado `redirect` y durante la primera hora.
- **Rotación de credenciales:** soporte para `INTEGRATION_ENCRYPTION_KEY_PREVIOUS` y endpoint super-admin por lotes, con MFA AAL2, confirmación, motivo, ticket y auditoría inmutable.
- **Trazabilidad:** todas las rutas API pasan por Proxy y reciben `x-request-id` generado por el servidor.
- **Mantenimiento:** el cron ejecuta `cleanup_security_data()` y registra un aviso si falta la migración.

## Nuevos servicios para clientes

### Exportación portable

`GET /api/tenants/export?tenantId=UUID&dataset=reviews|feedback`

- exige sesión y membresía;
- rate limit de 10 exportaciones/hora por usuario;
- hasta 10.000 filas paginadas;
- CSV UTF-8 compatible con Excel/Sheets;
- neutraliza inyección de fórmulas y no exporta IP/user-agent;
- botones de descarga añadidos al panel.

### Informe de reputación

`GET /api/reports/reputation?tenantId=UUID`

Devuelve un contrato JSON privado con:

- volumen y media de los últimos 30 días;
- comparación con los 30 días anteriores;
- distribución 1–5 estrellas;
- tasa de respuesta y reseñas pendientes;
- feedback y tickets abiertos;
- estado, última sincronización e indicador de error de integraciones, sin credenciales ni mensajes internos.

El panel incluye acceso directo al informe.

## Datos y despliegue

- `supabase/schema.sql` incluye las estructuras 3.12.
- `supabase/migration_3_12_0.sql` actualiza instalaciones existentes.
- GitHub Actions levanta PostgreSQL 17, crea stubs mínimos de Supabase Auth y ejecuta esquema limpio + migraciones con `ON_ERROR_STOP=1`.
- Documentación, changelog, `.env.example`, Docker y versión npm se sincronizan en 3.12.0.

## Medidas deliberadamente reservadas para staging

- Retirar `unsafe-inline` de CSP requiere validar nonces con scripts de Next, Stripe y analítica en un dominio real.
- Las pruebas E2E de Google/Meta/Stripe requieren credenciales sandbox del propietario.
- El digest OCI debe mantenerse automáticamente con Renovate/Dependabot; el Dockerfile ya fija una versión exacta de Node.

## Verificación ejecutada

- `npm run lint`: correcto.
- `npm run typecheck`: correcto.
- `npm test`: 14/14 tests correctos.
- `npm audit --audit-level=high`: 0 vulnerabilidades.
- `npm run build`: correcto; 37 rutas y Proxy compilados.
- Smoke standalone: liveness 200 con `x-request-id`, cuerpo Meta de 1,1 MB rechazado con 413 e informe privado sin sesión rechazado con 401.
