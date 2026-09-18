# Informe de actualización — ReviewFlow AI 3.13.0

**Fecha:** 18 de septiembre de 2026  
**Benchmark previo:** [`BENCHMARK_INTERNET_2026-09-18.md`](./BENCHMARK_INTERNET_2026-09-18.md)

## Resultado

La versión 3.13.0 mejora la captación y la analítica del flujo neutral de valoración sin condicionar las opciones públicas a la puntuación. Todas las personas siguen viendo las mismas plataformas y el formulario privado continúa siendo opcional.

## Mejoras aplicadas

- QR SVG descargable por empresa y campaña, generado dentro de la aplicación y sin trackers externos.
- Etiquetas de campaña propagadas de extremo a extremo: enlace público, voto, clic, ticket, estadísticas y CSV.
- Tabla de rendimiento por campaña en el dashboard, con votos, clics públicos y tickets.
- Informe de reputación con tiempo medio de respuesta y porcentaje respondido en 24 horas.
- Validación de campañas compartida entre servidor y cliente, rechazo de URLs, emails y posibles teléfonos/identificadores largos.
- Restricción equivalente en PostgreSQL e índice por tenant, campaña y fecha.
- Endpoint QR protegido por sesión, rol owner, aislamiento por tenant, rate limit y respuesta `private, no-store`.

## Privacidad y seguridad

- No se ha incorporado review gating, incentivos ni tratamiento selectivo por puntuación.
- Las campañas solo admiten etiquetas operativas normalizadas de hasta 48 caracteres.
- El QR no usa proveedores externos y por tanto no comparte destinos o identificadores con terceros para generarlo.
- Se mantiene autorización owner y filtrado explícito por tenant en consultas privadas.
- La migración es aditiva e idempotente.

## Base de datos

Para una instalación nueva se aplica `supabase/schema.sql`. Para una instalación 3.12.0 existente se ejecuta:

```sql
-- Supabase SQL Editor
-- contenido de supabase/migration_3_13_0.sql
```

La migración añade `feedback_responses.campaign`, la restricción `feedback_campaign_format` y el índice `feedback_tenant_campaign_created_idx`.

## Validación local

- TypeScript: correcto.
- ESLint: correcto.
- Tests: 19/19 correctos.
- Build de producción Next.js: correcto, 38 páginas generadas.
- `npm audit`: 0 vulnerabilidades.
- `git diff --check`: correcto.
- SQL PostgreSQL real: cubierto por el job `sql-and-build` de GitHub Actions tras publicar la rama.

## Operación

Endpoint QR:

```text
GET /api/tenants/qr?tenantId=<UUID>&campaign=mostrador
```

Enlace atribuible:

```text
/valorar/<slug>?campaign=mostrador
```
