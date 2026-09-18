# Remediación técnica integral — ReviewFlow AI 3.11.0

**Fecha:** 2026-09-18  
**Auditoría origen:** `AUDITORIA_TECNICA_2026-09-18.md`  
**Objetivo:** cerrar los riesgos P0/P1 y aplicar el endurecimiento P2/P3 razonable antes de producción.

## Resultado ejecutivo

Los **5 hallazgos P0** y los **10 P1** cuentan con corrección en código, esquema o pipeline. La versión pasa a **3.11.0**. La puesta en producción requiere aplicar `supabase/migration_3_11_0.sql` y configurar los nuevos secretos; la aplicación falla cerrada en producción si falta la configuración obligatoria.

## Cierre P0

| Hallazgo | Estado | Corrección |
|---|---|---|
| P0-01 orden de `usage_counters` | Cerrado | Los `ALTER` se ejecutan después de crear la tabla; test de regresión SQL. |
| P0-02 estados Stripe incompatibles | Cerrado | Esquema y migración admiten `inactive`/`paused` y todos los estados escritos. |
| P0-03 Next vulnerable | Cerrado | Next 16.3.5, React 19.3 y dependencias actualizadas; auditoría npm limpia. |
| P0-04 variables públicas Docker | Cerrado | `ARG`/`ENV` explícitos y `build.args` obligatorios en Compose; Node 24 exacto. |
| P0-05 review gating | Cerrado | Todas las puntuaciones reciben idénticas plataformas públicas; soporte privado opcional y adicional. |

## Cierre P1

| Hallazgo | Estado | Corrección |
|---|---|---|
| P1-01 Meta sin autenticidad | Cerrado | Cuerpo crudo, HMAC-SHA256 en tiempo constante, `phone_number_id` y deduplicación por `message.id`. |
| P1-02 redirect inseguro | Cerrado | Solo rutas same-origin internas; se bloquean esquemas, rutas `//` y barras inversas. |
| P1-03 OAuth débil | Cerrado | State firmado con usuario/tenant/nonce/TTL, cookie HttpOnly, PKCE S256 y nonce de un solo uso. |
| P1-04 contacto explotable | Cerrado | Rate limit PostgreSQL, honeypot, escape HTML, `replyTo` validado y email seudonimizado en logs. |
| P1-05 health informativo | Cerrado | Liveness público mínimo y readiness privado con Bearer, 503 si configuración/BD no están listas. |
| P1-06 credenciales en claro | Cerrado | AES-256-GCM versionado; lectores compatibles con filas históricas; clave externa obligatoria. |
| P1-07 idempotencia pedidos | Cerrado | Reclamo atómico `(provider, tenant_scope, event_id)` antes del envío y liberación ante fallo recuperable. |
| P1-08 multipack Stripe | Cerrado | Unicidad por pago/factura+pack y RPC transaccional/idempotente para ledger y cache de extras. |
| P1-09 sin tests/CI | Cerrado | Tests Node/TypeScript y workflow de GitHub para audit, lint, typecheck, tests y build. |
| P1-10 fetch sin timeout | Cerrado | Cliente HTTP común con timeout, cancelación y retries opcionales solo explícitos; proveedores migrados. |

## Endurecimiento P2/P3 aplicado

- Headers CSP, HSTS, nosniff, referrer, permissions y anti-frame.
- Rate limiting distribuido para feedback, contacto y OpenAI.
- Contadores de cuota fallan cerrados en producción si falta la RPC atómica.
- `is_member` usa `SECURITY DEFINER` con `search_path` fijo; se elimina INSERT directo de tenants.
- Las URLs de webhook de tienda ya no incluyen la API key; un ID público identifica el tenant y HMAC autentica el cuerpo.
- Validación obligatoria de entorno de producción mediante `instrumentation.ts`.
- Impersonación deshabilitada por defecto; al habilitarla exige MFA AAL2, motivo, ticket y auditoría inmutable.
- Retención explícita, IP con HMAC+pepper y funciones de limpieza de rate limits/deduplicación.
- Migración Next 16: `cookies()` asíncrono, cookies `getAll/setAll`, `middleware.ts` → `proxy.ts`.
- ESLint flat config, arranque standalone coherente y documentación/versiones sincronizadas.

## Acciones externas obligatorias antes del despliegue

Estas acciones no pueden ejecutarse en el repositorio porque dependen de la infraestructura y credenciales del propietario:

1. Ejecutar **una sola vez** `supabase/migration_3_11_0.sql` en cada base existente. Para una base nueva, ejecutar `supabase/schema.sql`.
2. Definir valores independientes y aleatorios para `APP_SIGNING_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `PRIVACY_HASH_PEPPER`, `HEALTHCHECK_SECRET` y `WHATSAPP_APP_SECRET`.
3. Reconectar o volver a guardar integraciones históricas para cifrarlas; durante la transición siguen siendo legibles por compatibilidad, pero no se vuelven a escribir en claro.
4. Configurar el monitor interno para llamar `GET /api/health?mode=ready` con `Authorization: Bearer $HEALTHCHECK_SECRET`.
5. Someter el texto/flujo neutral final a revisión legal y verificar fixtures reales de Stripe, Meta, Google y dos tenants en el entorno de staging.
6. Si se habilita soporte por impersonación, activar MFA en Supabase y `ADMIN_IMPERSONATION_ENABLED=true` solo para el entorno autorizado.

## Verificación ejecutada

- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilidades**.
- `npm run lint`: correcto, sin errores ni avisos.
- `npm run typecheck`: correcto.
- `npm test`: **9/9 tests correctos**.
- `npm run build`: correcto con Next 16.3.5, 34 páginas estáticas/dinámicas y Proxy compilado.
- Smoke standalone: home 200; liveness 200; readiness 503 con BD ficticia (comportamiento correcto); headers de seguridad presentes.

## Deuda no bloqueante

Los módulos históricos de mayor tamaño (`lib/usage.ts`, webhook Stripe y clientes de dashboard/admin) deben separarse incrementalmente por dominio. Esa refactorización P3 no altera el criterio de seguridad/producción y se evita hacerla de forma masiva en este parche para reducir riesgo funcional. También se recomienda ampliar CI con Supabase local, fixtures reales y E2E de navegador en el entorno de staging.
