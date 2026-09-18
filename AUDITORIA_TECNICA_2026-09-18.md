# Auditoría técnica integral — ReviewFlow AI

**Fecha:** 2026-09-18  
**Versión auditada:** 3.10.0  
**Commit base de la revisión:** `596b433`  
**Alcance:** seguridad, funcionamiento, arquitectura, datos, integraciones, dependencias, despliegue, calidad, rendimiento, privacidad y documentación.

## 1. Alcance y metodología

Se leyeron los **159 archivos versionados completos** (1.341.996 bytes), incluyendo:

- 72 puntos de entrada/pantallas bajo `app/` y las **42 rutas API**;
- 31 componentes, 26 módulos de `lib/` y `middleware.ts`;
- 10 archivos SQL (`schema.sql` y 9 migraciones);
- configuración de Next.js, TypeScript, ESLint, Tailwind, Docker, Compose y Vercel;
- 8 documentos/guías, changelog, variables de entorno y script de verificación;
- lockfile completo y recursos públicos.

Comprobaciones ejecutadas:

- `npm run typecheck`: correcto.
- `npm run lint`: correcto con las reglas actuales.
- `npm run build`: correcto; 38 rutas/páginas generadas.
- Arranque y smoke test HTTP de páginas públicas, auth, middleware, health, API protegida y panel demo.
- `npm run verify` contra el servidor local: 7 checks correctos, 13 avisos y 2 fallos esperables por falta de credenciales reales.
- `npm audit --omit=dev`, `npm outdated`, análisis de dependencias usadas, secretos, variables, enlaces, imports, validación de cuerpos, RLS, webhooks y flujos de autorización.
- Todos los archivos son UTF-8, sin NUL; no hay enlaces Markdown locales rotos ni secretos reales detectados.

> No se han aplicado correcciones funcionales en esta auditoría. Este documento es el diagnóstico y plan recomendado.

## 2. Resumen ejecutivo

El proyecto tiene una base razonable: TypeScript estricto, App Router, validación Zod en casi todas las entradas JSON, separación de clientes Supabase, RLS, controles de membresía en los flujos principales, firma Stripe/QStash/tiendas, cuotas y build reproducible. Sin embargo, **no está listo para producción comercial segura** en su estado actual.

### Recuento

| Severidad | Hallazgos | Significado |
|---|---:|---|
| P0 — Bloqueante | 5 | Seguridad crítica, instalación o despliegue roto, o riesgo comercial inmediato. |
| P1 — Alta | 10 | Debe corregirse antes de producción. |
| P2 — Media | 12 | Siguiente ciclo de endurecimiento/calidad. |
| P3 — Baja | 5 | Mantenibilidad y coherencia. |

## 3. Hallazgos P0 — bloqueantes

### P0-01 — La instalación nueva de la base de datos falla por orden incorrecto

**Evidencia:** `supabase/schema.sql:75-76` ejecuta `ALTER TABLE public.usage_counters` antes de crear esa tabla en `supabase/schema.sql:168`.

**Impacto:** al pegar `schema.sql` en un proyecto Supabase vacío, PostgreSQL abortará con `relation public.usage_counters does not exist`. Contradice todas las guías de alta nueva.

**Corrección:** mover esos dos `ALTER` después del `CREATE TABLE` o eliminarlos porque las columnas ya están incluidas en la creación. Validar el esquema en PostgreSQL/Supabase vacío dentro de CI.

### P0-02 — El esquema nuevo rechaza estados que la aplicación escribe

**Evidencia:** `supabase/schema.sql:29-30` permite `trialing|active|past_due|canceled|none`, pero `app/api/stripe/webhook/route.ts` escribe `inactive` y `paused`. La migración `migration_3_9_0.sql` sí corrige el constraint, pero una instalación nueva ejecuta solo `schema.sql` según la documentación.

**Impacto:** cancelaciones y pausas de Stripe fallan en una base creada desde el esquema actual; puede quedar acceso habilitado cuando debería cortarse.

**Corrección:** sincronizar el constraint del esquema con v3.9/v3.10 y añadir un test SQL que pruebe todos los estados usados por `mapStripeStatus()`.

### P0-03 — Dependencia Next.js con avisos críticos conocidos

**Evidencia:** `npm audit --omit=dev` informa 1 vulnerabilidad crítica directa en `next@14.2.35` y vulnerabilidades transitivas de PostCSS. La versión estable instalada está fuera de la línea corregida actual; `npm outdated` propone Next 16.3.5.

**Impacto:** la línea 14 acumula problemas conocidos de DoS, caché, RSC, middleware, SSRF y optimización de imágenes. El alcance concreto depende del despliegue, pero mantener una dependencia crítica reportada no es aceptable para producción.

**Corrección:** migración controlada Next 14 → 16.3.5 (o versión estable parcheada posterior), junto con React 19, ESLint/config y pruebas E2E. No usar `npm audit fix --force` sin migración. Referencias: [advisory RSC de Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-q4gf-8mx6-v5v3) y [contexto de la corrección 16.3.5](https://github.com/jankln/KassenKnoten/issues/14).

### P0-04 — El despliegue Docker no inyecta las variables públicas en build

**Evidencia:** `docker-compose.yml` pasa `.env` solo al contenedor en runtime. `Dockerfile:18-26` compila sin `ARG`/`ENV` para `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, datos legales o Plausible. Next.js sustituye `NEXT_PUBLIC_*` durante build.

**Impacto:** la imagen construida con el procedimiento documentado puede llevar placeholders en el JavaScript del navegador aunque el `.env` exista en runtime; auth/Supabase y branding pueden quedar rotos en Docker.

**Corrección:** usar build args/secrets explícitos para variables públicas, o runtime config servido por el backend. Añadir un smoke test del artefacto Docker real. Actualizar las guías para diferenciar secretos runtime y valores públicos build-time.

### P0-05 — “Embudo privado” implementa review gating

**Evidencia:** `app/api/feedback/respond/route.ts` entrega enlaces públicos únicamente para 4–5 estrellas y convierte 1–3 estrellas en tickets privados. `lib/store.ts:132` documenta el mismo filtrado.

**Impacto:** es exactamente el patrón conocido como *review gating*: selección de usuarios satisfechos para reseña pública y desvío privado de negativos. Puede infringir políticas de Google y otras plataformas, provocar retirada de reseñas o sanciones, y crear riesgo de prácticas comerciales engañosas.

**Corrección:** mostrar las opciones de reseña pública a todos los usuarios independientemente de la puntuación; el ticket privado puede ofrecerse además, nunca como sustitución selectiva. Someter el flujo a revisión legal/compliance antes de venderlo. Google prohíbe “discouraging or prohibiting negative reviews, or selectively soliciting positive reviews” según los resúmenes de política consultados: [ReviewTrackers](https://www.reviewtrackers.com/blog/google-review-policy/) y [SOCi](https://www.soci.ai/knowledge-articles/review-gating/).

## 4. Hallazgos P1 — alta prioridad

### P1-01 — Webhook POST de WhatsApp sin autenticidad

`app/api/integrations/whatsapp/webhook/route.ts:40-64` procesa cualquier JSON sin verificar `X-Hub-Signature-256`. El token de `GET` solo verifica el alta del endpoint; no autentica eventos posteriores.

Un atacante puede falsificar `STOP`, revocar opt-ins conocidos o abrir artificialmente ventanas de 24 horas. Debe añadirse `WHATSAPP_APP_SECRET`, leer el cuerpo crudo y verificar HMAC-SHA256 en tiempo constante antes de parsear; también validar `phone_number_id`/WABA y deduplicar `message.id`. Meta firma estos POST con `X-Hub-Signature-256`: [referencia técnica](https://docs.webhook.co/providers/meta).

### P1-02 — Redirección post-login no validada

`components/AuthForm.tsx:24,70` pasa directamente `?redirect=` a `router.push()`. Next advierte que no se deben enviar URLs no confiables a `router.push`; esquemas como `javascript:` pueden suponer XSS y URLs externas permiten open redirect/phishing.

Aceptar solo rutas internas de una allowlist (`/dashboard`, `/bienvenido`, `/admin`) o validar con `new URL` que el origen sea el actual y que el path empiece por `/` pero no `//`.

### P1-03 — OAuth Google sin state seguro ni PKCE

`lib/google.ts:24-34` usa el `tenantId` sin protección como `state`; el callback (`app/api/integrations/google/callback/route.ts`) no valida nonce, expiración ni vinculación al usuario que inició el flujo.

Riesgo de login/account-linking CSRF. Generar un `state` aleatorio o firmado con usuario, tenant, expiración y nonce almacenado en cookie HttpOnly/SameSite; consumirlo una sola vez. Añadir PKCE si el proveedor/flujo lo permite.

### P1-04 — Formulario público de contacto explotable y HTML no escapado

`app/api/contact/route.ts` no tiene rate limit, CAPTCHA/honeypot ni control de origen. Inserta `name` y `message` sin escape en el HTML del correo (`línea 26`). Puede utilizarse para spam/coste SMTP y contenido HTML malicioso en el cliente de correo.

Aplicar rate limit distribuido, honeypot/CAPTCHA, escape HTML, cabecera `replyTo` validada, límites por IP/email y respuesta genérica. No registrar el email completo indefinidamente.

### P1-05 — Health público filtra configuración y ejecuta diagnóstico caro

`app/api/health/route.ts` publica integraciones presentes, modelo, concurrencia y rate limit. `?verbose=1` revela estado de variables; `?db=1` abre consultas de diagnóstico y devuelve métricas/errores de PostgreSQL sin autenticación. Además siempre responde `ok: true`, por lo que Docker considera saludable un despliegue sin Supabase/Stripe.

Separar `/health/live` mínimo y público de `/health/ready` autenticado/interno. El readiness debe devolver 503 cuando falten dependencias obligatorias. Proteger métricas DB y aplicar cache/rate limit.

### P1-06 — Credenciales de integraciones almacenadas en JSON plano

Tokens OAuth, refresh tokens, API keys y secretos de webhooks se guardan en `integrations.credentials` (`jsonb`). RLS impide lectura normal, pero un volcado de BD, un error de service role o acceso de soporte expone todas las credenciales.

Cifrar por campo con una clave KMS/secret manager, rotación y versionado; nunca registrar valores. Separar metadatos no sensibles de secretos.

### P1-07 — Idempotencia de pedidos global y con carrera

`lib/store.ts:118-127` deduplica por `system_logs.source + message`, sin `tenant_id`. El mismo `provider/orderId` de dos empresas colisiona. Además el patrón “SELECT y luego enviar/INSERT” no es atómico: dos entregas concurrentes pueden enviar dos WhatsApp.

Crear tabla `processed_events` con `tenant_id`, proveedor, external_id y constraint único; reclamar el evento mediante `INSERT ... ON CONFLICT` antes de enviar.

### P1-08 — Ledger de recargas incompatible con compras multipack

`app/api/stripe/addon/route.ts` permite hasta cuatro packs en una sesión. `grantAddon()` intenta una fila de ledger por pack con el mismo `stripe_payment_id`/`stripe_invoice_id`, mientras `schema.sql:305-313` impone unicidad solo por pago/factura. Solo la primera línea puede insertarse; las siguientes generan errores aunque el cache del tenant sume el total.

Usar unicidad compuesta `(stripe_payment_id, pack)` o un modelo cabecera/líneas. Aplicar concesión y ledger en una única transacción/RPC idempotente.

### P1-09 — Sin suite de tests ni pipeline CI

No existe ningún `*.test.*`, `*.spec.*`, Playwright/Cypress/Vitest/Jest ni workflow CI. Typecheck/build no detectan regresiones de auth, Stripe, RLS, cuotas o SQL; varios fallos P0 compilan correctamente.

Mínimo recomendado: tests unitarios de planes/cuotas/firmas; integración de rutas con Supabase local; tests SQL en base vacía y cadena de migraciones; webhooks Stripe/Meta/QStash; E2E de signup→checkout→dashboard; CI con lint/typecheck/test/build/audit.

### P1-10 — Peticiones externas sin timeout uniforme

Google, Places, Trustpilot, TripAdvisor, Meta y token OAuth usan `fetch` sin `AbortSignal.timeout`. Un proveedor lento puede ocupar workers, conexiones y límites serverless. Outscraper añade hasta 20 segundos de polling sin contar latencia HTTP.

Crear un cliente HTTP común con timeout, tamaño máximo de respuesta, retries solo idempotentes, backoff+jitter, códigos tipados, circuit breaker y observabilidad. OpenAI ya implementa parte de este patrón y puede servir de referencia.

## 5. Hallazgos P2 — prioridad media

1. **Headers de seguridad ausentes.** No hay CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ni `frame-ancestors`; añadirlos en `next.config`/proxy con CSP compatible con Next y Plausible.
2. **API keys en query string.** Shopify/Woo usan `?key=...`; puede aparecer en logs, historial y herramientas. Preferir identificador público en URL + HMAC como única credencial, o header; rotación de `api_key` desde panel.
3. **Rate limits en memoria.** Feedback y OpenAI usan `Map` por proceso: no coordinan instancias, se pierden al reiniciar y aceptan `x-forwarded-for` sin política de proxy. Mover a Redis/Upstash o PostgreSQL con claves tenant/IP.
4. **Fallback de contadores no atómico.** Cuando falta la RPC, `lib/usage.ts` hace read+upsert; bajo concurrencia pierde incrementos. En producción debe fallar cerrado si falta la migración, no degradar a contabilidad no atómica.
5. **`is_member` incompletamente endurecida.** Es `SECURITY DEFINER` sin `SET search_path` explícito ni `REVOKE/GRANT` documentado. Aplicar `set search_path = public, pg_temp`, propietario controlado y permisos mínimos.
6. **Policy de INSERT directo innecesaria.** `tenants_insert_auth` permite insertar tenants desde cualquier cliente autenticado con campos arbitrarios; la app crea tenants con service role. Eliminar policy o restringir owner/id y usar RPC transaccional.
7. **Errores de operaciones BD ignorados.** Hay múltiples `update`, `insert` y `upsert` cuyos errores no cambian la respuesta; por ejemplo configuración de tienda, membresía posterior a crear tenant y persistencias IA. Revisar cada resultado y compensar/transactionalizar.
8. **Variables de producción no validadas al arrancar.** Los placeholders permiten iniciar en “demo” silenciosamente. En `NODE_ENV=production`, fallar rápido si faltan Supabase/Stripe/app URL o si `NEXT_PUBLIC_APP_URL` sigue en localhost.
9. **Runtime obsoleto.** Docker usa Node 20 y `engines` permite Node 18; deben alinearse con una versión LTS soportada y con Next actualizado. Fijar digest de imagen y ejecutar como ya se hace con usuario no root.
10. **Flujo de impersonación muy sensible.** Genera y devuelve magic links con una sola comprobación por lista de emails. Exigir MFA/reautenticación, razón/ticket, caducidad corta, auditoría inmutable y no exponer el link a logs/telemetría.
11. **Privacidad y retención.** Se guardan email de contacto, teléfonos, mensajes, IP hash y user agent. Definir base legal, sal/pepper para hash IP, plazos específicos, exportación/borrado y minimización en logs.
12. **Health/verify da falsos positivos.** `verify-launch` considera “validación de entrada activa” una respuesta 503 por Supabase ausente; debe exigir un 400 real de Zod. Health debe distinguir liveness/readiness.

## 6. Hallazgos P3 — calidad y mantenibilidad

1. **Archivos monolíticos:** `lib/usage.ts` (1.211 líneas), webhook Stripe (753), admin client (724), dashboard client (622) y schema (827). Separar por dominio/casos de uso.
2. **Tipado debilitado:** se desactivó globalmente `no-explicit-any` y hay numerosos `any` en payloads externos. Generar tipos Supabase y esquemas Zod para respuestas de proveedores.
3. **Guardias duplicadas:** sesión+membresía se repite en muchas rutas pese a existir `requireOwner()`. Centralizar `withTenantAuth`, errores y trazabilidad.
4. **Versiones/documentación desalineadas:** Dockerfile y Compose todavía dicen/etiquetan 3.4.0, mientras la app es 3.10.0. El script verify se identifica como 3.8.0 y varios comentarios siguen versiones antiguas.
5. **Defectos menores:** el email de recarga repite dos veces “Hola…Hemos recibido tu pago” en `app/api/stripe/webhook/route.ts:610-611`; `npm start` muestra que no es la forma compatible con `output: standalone`; para standalone local debe ejecutarse `node .next/standalone/server.js` o ajustarse configuración/script.

## 7. Arquitectura objetivo recomendada

```text
src/
  app/                         # Entradas Next delgadas
  modules/
    auth/                      # sesión, tenant guard, OAuth state
    billing/                   # Stripe checkout/webhook + RPC idempotentes
    reviews/                   # ingest, reply, publish, triage
    feedback/                  # feedback neutral, no review gating
    integrations/              # Google, Meta, tiendas, TripAdvisor
    usage/                     # cuotas y almacenamiento
  infrastructure/
    db/                        # tipos Supabase generados + repositorios
    http/                      # timeout/retry/circuit breaker
    queue/                     # QStash e idempotencia
    observability/             # logs estructurados, métricas, redacción PII
  shared/                      # schemas, errores, componentes
supabase/
  migrations/                 # herramienta/versionado formal
  tests/                      # pgTAP o SQL reproducible
```

Principios:

- rutas API como adaptadores delgados; lógica en casos de uso testeables;
- autorización de tenant obligatoria en un wrapper único;
- operaciones de cuotas, pagos e idempotencia dentro de transacciones/RPC;
- secretos cifrados y logs sin PII;
- liveness/readiness/metrics separados;
- contratos Zod tanto de entrada como de proveedores externos.

## 8. Plan de acción propuesto

### Fase 0 — 1–2 días: cortar riesgos inmediatos

1. Corregir y probar `schema.sql` vacío y constraint de estados.
2. Firmar webhook WhatsApp y asegurar OAuth state.
3. Sanitizar `redirect` y HTML del contacto; rate limit del contacto.
4. Desactivar/rediseñar review gating.
5. Corregir build args/runtime config de Docker.
6. Restringir health detallado.

### Fase 1 — 2–4 días: plataforma y pagos

1. Migrar Next/React/Node/dependencias con rama y pruebas.
2. Corregir ledger multipack mediante transacción/RPC.
3. Crear idempotencia atómica de eventos de tienda/Meta/Stripe.
4. Añadir timeouts y cliente HTTP compartido.
5. Cifrar credenciales y preparar rotación.

### Fase 2 — 3–5 días: pruebas y observabilidad

1. Supabase local + tests SQL/RLS.
2. Unit/integration/E2E y CI obligatorio.
3. Logs estructurados con request ID, tenant ID y redacción de PII.
4. Readiness real, métricas internas y alertas de webhooks/colas.

### Fase 3 — refactor incremental

1. Dividir `usage.ts`, webhook Stripe y clientes UI monolíticos.
2. Tipos Supabase/proveedores; reactivar reglas ESLint estrictas.
3. Unificar guardias, respuestas de error y documentación/versionado.

## 9. Fortalezas que deben conservarse

- TypeScript `strict`, build y lint actualmente verdes.
- Uso extendido de Zod para inputs.
- Verificación correcta de firma Stripe, QStash y HMAC Shopify/Woo.
- Controles explícitos de sesión/membresía en la mayoría de flujos sensibles.
- Service role aislado en servidor y RLS habilitado en todas las tablas.
- Límites por plan, presupuesto de tokens, almacenamiento y retención.
- Usuario no root y build multi-stage en Docker.
- Consentimiento previo a scripts analíticos.
- Sin secretos reales versionados y sin enlaces internos rotos.

## 10. Criterio de salida a producción

No desplegar comercialmente hasta cerrar todos los P0 y P1, obtener `npm audit --omit=dev` sin vulnerabilidades altas/críticas aceptadas, ejecutar el esquema desde cero y todas las migraciones en CI, verificar webhooks con fixtures firmadas y superar E2E de pago, cancelación, cuota, OAuth, opt-out y aislamiento entre dos tenants.
