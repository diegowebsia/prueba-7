# ⭐ ReviewFlow AI v3.12.0

**Plataforma SaaS multi-tenant para centralizar opiniones reales (Google · Trustpilot · Tiendas),
responderlas con IA, pedirlas por email/WhatsApp y cobrar por uso medible.**

- ✅ **IA medida de verdad**: todas las llamadas pasan por `lib/openai.ts` con **`gpt-4o-mini`**,
  timeout, reintentos con backoff exponencial, rate limit por empresa, semáforo de concurrencia,
  fallback local y **contabilidad de tokens y coste** por empresa (`ai_interactions` + `usage_counters`).
  Cada plan tiene su **presupuesto de tokens** (250.000 / 1.200.000 al mes): la IA nunca
  puede generar una factura sorpresa.
- ✅ **2 planes 100 % de pago y nada más**: **Pro (29 €)** y **Business (79 €)**, ambos con **7 días de prueba gratis** con tarjeta. Sin suscripción activa (o con la prueba caducada), panel y APIs responden **402**.
- ✅ **Automatización total**: cron horario + cola QStash (entregas, IAs, WhatsApps y syncs en segundo plano), plantillas WhatsApp HSM, opt-in RGPD y Flujo Neutral `/valorar/[slug]` (plataformas para todos + ticket privado opcional).
  Cada plan define 4 cuotas mensuales claras (peticiones, opiniones, IA, sincronizaciones) y
  **topes de base de datos** por empresa (opiniones guardadas, auditoría, conexiones, MB).
- ✅ **Cuotas reales aplicadas en servidor**: cada petición enviada, opinión importada, respuesta
  de IA y sincronización consume de su cuota; al llegar al 100 % las APIs responden **`429`**
  (cuota agotada), **`402`** (sin suscripción), **`403`** (feature de otro plan) o **`507`**
  (tope de filas/almacenamiento), siempre con `Retry-After` y `X-RateLimit-*`.
- ✅ **PostgreSQL blindado**: **pool de conexiones** dedicado (`lib/db.ts`) para diagnóstico y
  mantenimiento, **índices** en las tablas clave, **RLS** para aislar a cada cliente, purga
  automática de lo más antiguo (`reviews`, `quota_events`, `ai_interactions`), poda global de
  `system_logs` y rechazo de conexiones por encima del plan.
  Las mismas reglas existen en SQL (`purge_tenant()` / `purge_all_tenants()`), por si quieres
  programarlas con `pg_cron`.
- ✅ **Recargas puntuales** (pago único, válidas el ciclo en curso): +1.000 peticiones 9 €,
  +2.000 opiniones 12 €, +500 respuestas IA 15 €, +500 sincronizaciones 6 €.
- ✅ **`/admin` 100 % privado**: el panel interno ya **no se menciona en ninguna página pública**
  (login, registro, landing, ayuda o dashboard). Sigue protegido por `middleware.ts` +
  `lib/authz.ts` y solo entra quien tiene su email en `SUPERADMIN_EMAILS`.
- ✅ **UX clara**: landing en 3 pasos, comparativa de los 2 planes, medidores de cuota
  (verde <70 %, ámbar 70–90 %, rojo >90 %), panel de uso con recargas sugeridas y paywall amable.
- ✅ **Funciona en CUALQUIER hosting**: Docker, VPS, Coolify, Vercel, Render, Railway, Fly.io o Node.js puro.
- ✅ **Integraciones reales**: Google Business Profile (OAuth + publicación), Google Places,
  Trustpilot API, WhatsApp Cloud API, Maps, Shopify/WooCommerce/TPV + API pública de ingesta.
- ✅ **Blindaje legal UE**: aviso legal, privacidad (RGPD), términos, cookies + banner con
  consentimiento granular (Dir. (UE) 2019/2161).
- ✅ **Supabase** (Postgres + Auth + RLS) como única dependencia de datos.

## 🧱 Stack y arquitectura

**Stack:** Next.js 14 (App Router, RSC) · React 18 · TypeScript 5 · Tailwind CSS 3 ·
Framer Motion · Zod · Supabase (PostgreSQL 15 + Auth + RLS) · `pg` (pool directo) ·
Stripe 16 (suscripciones + pagos únicos) · OpenAI SDK 4 (**gpt-4o-mini**) · Nodemailer (SMTP) ·
Docker / cualquier hosting Node.

```
┌──────────────────────────── CLIENTE (React 18 + Tailwind) ────────────────────────────┐
│  Landing · /bienvenido · /dashboard (Bandeja · Empresa · Facturación) · legales        │
└───────────────────────────────────┬──────────────────────────────────────────────────┘
                                    │ fetch (siempre JSON + códigos 4xx claros)
┌───────────────────────────────────▼──────────────────────────────────────────────────┐
│                        NEXT.JS SERVER (App Router · API Routes)                       │
│  middleware.ts: /admin solo SUPERADMIN · /dashboard y /api/ai|reviews|integrations    │
│  exigen suscripción (panel → /bienvenido · APIs → 402 Payment Required)            │
│  lib/usage.ts  → PUERTA ÚNICA: suscripción 402 · feature 403 · cuota 429 · BD 507     │
│  lib/ai.ts     → IA de negocio (respuestas y triaje) + contabilidad por empresa       │
│  lib/openai.ts → cliente centralizado: gpt-4o-mini, timeout, reintentos, rate limit   │
│  lib/stripe.ts + /api/stripe/* → checkout, recargas, portal, webhook (idempotente)    │
└───────┬───────────────────────────┬───────────────────────────────┬───────────────────┘
        │ PostgREST (CRUD + RLS)    │ pg Pool (analítica/purga)     │ HTTPS
┌───────▼───────────────────────────▼───────────────┐   ┌───────────▼───────────────────┐
│  SUPABASE: Postgres + Auth + RLS + pg_cron(purga) │   │  Stripe · OpenAI · Google ·   │
│  tenants · reviews · usage_counters · ai_interactions · addons · integrations       │
└───────────────────────────────────────────────────┘   └───────────────────────────────┘
```

**Flujo de una llamada de IA (todas las puertas, en orden):**

```
POST /api/ai
  → middleware.ts ......... ¿sesión? (401) · ¿suscripción? (402 si no hay plan de pago o caducó el trial)
  → membresía de empresa .. ¿es tu empresa?          (si no → 403)
  → lib/usage.enforceAi ... ¿suscripción? (402) · ¿feature? (403)
                            · ¿créditos de IA? (429) · ¿tokens? (429) · ¿tope de filas? (507)
  → lib/openai.chatComplete  ¿rate limit de la empresa? (429) · semáforo de concurrencia
                            · timeout 20 s · reintentos 3× con backoff + jitter
                            · si falla → plantilla local (fallback) y se registra ok=false
  → consume('ai') + recordAiUsage()  → crédito, tokens, coste y latencia por empresa
```

## 📘 Guías (elige según tu momento)

| Guía | Para qué | Coste |
|---|---|---|
| **[GUIA_GRATIS.md](./GUIA_GRATIS.md)** 🆓 | Explicación comercial de los 2 planes + montar el proyecto gratis (Vercel + Supabase + Stripe **test** + Brevo) | **0 €** |
| **[GUIA_DESPLIEGUE.md](./GUIA_DESPLIEGUE.md)** 🚀 | Desplegar desde cero (dominio, DNS, SSL, Docker) | Según host |
| **[GUIA_ADMIN.md](./GUIA_ADMIN.md)** 🛡️ | Manual del dueño: planes, cuotas, **topes de BD por plan**, purga, cobros y operación diaria | — |
| **[docs/GUIA_PASOS_MANUALES.md](./docs/GUIA_PASOS_MANUALES.md)** 🧑‍💻 | **Lista exacta de credenciales**, formato del `.env`, productos de Stripe, Supabase, OpenAI, Meta WhatsApp, Google y troubleshooting | — |
| **[GUIA_COMERCIALIZACION.md](./GUIA_COMERCIALIZACION.md)** 💰 | **Todo lo que TÚ debes aportar para vender al público**: empresa, dominio, Stripe live, SMTP, marca, integraciones en producción, legal RGPD/consumo, seguridad, soporte y checklist go-live | — |
| **[GUIA_AUTOMATIZACION.md](./GUIA_AUTOMATIZACION.md)** ⚙️ | Cron + QStash + plantillas HSM + opt-in RGPD + Flujo Neutral: qué configurar y dónde | — |

> 💡 Para el cliente: la ayuda de día a día está **dentro del panel** (botón «Ayuda»): FAQs
> desplegables condensadas. Las guías extensas viven en `docs/`, fuera de la vista principal.

### ⚡ Puesta en marcha rápida (5 pasos)

```bash
# 1) Clona y prepara el entorno
git clone https://github.com/diegowebsia/prueba-6.git && cd prueba-6
cp .env.example .env                       # pega tus claves (tabla completa: docs/GUIA_PASOS_MANUALES.md)

# 2) Crea la base de datos: Supabase → SQL Editor → pega supabase/schema.sql → Run
#    (proyecto existente: migration_3_7_0.sql → migration_3_8_0.sql → migration_3_9_0.sql)

# 3) Arranca
npm install
npm run typecheck && npm run build && npm run start
# → http://localhost:3000     ·     /api/health = estado del sistema

# 4) Verifica que todo está listo para cobrar (health, IA, BD, firma del webhook)
npm run verify
```

### ☁️ Despliegue en Vercel + Supabase (10 min)

| Paso | Qué hacer |
|---|---|
| 1 | **Supabase** → *New project* (región UE) → SQL Editor → `supabase/schema.sql` → Run |
| 2 | Supabase → *Project Settings → API* → copia `URL`, `anon`, `service_role` |
| 3 | Supabase → *Project Settings → Database → Connection pooling* → copia la cadena del **puerto 6543** → `DATABASE_URL` |
| 4 | **Vercel** → *Add New → Project → Import* el repo → *Environment Variables*: las de `.env.example` |
| 5 | **Stripe** → *Product catalog*: Pro 29 € y Business 79 € (+ recargas opcionales) → `STRIPE_PRICE_PRO/BUSINESS` |
| 6 | **Stripe** → *Developers → Webhooks → Add endpoint* → `https://tu-dominio.com/api/stripe/webhook` (eventos de la lista) → `STRIPE_WEBHOOK_SECRET` |
| 7 | *Redeploy* y ejecuta `npm run verify -- --url https://tu-dominio.com` |

> Variables clave: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
> `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
> `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`,
> `SMTP_*`, `OPENAI_API_KEY` (opcional), `SUPERADMIN_EMAILS`.
> Detalle de cada una: [`.env.example`](./.env.example) y
> [docs/GUIA_PASOS_MANUALES.md](./docs/GUIA_PASOS_MANUALES.md).

**Docker / VPS:** `docker compose up -d --build` (usa el `Dockerfile` incluido).

---

## 💶 Planes y cuotas (fuente de verdad: `lib/plans.ts`)

| | 🔵 **Pro** | 🟣 **Business** |
|---|---|---|
| Precio | **29 €/mes** (7 días de prueba gratis con tarjeta) | **79 €/mes** (7 días de prueba gratis con tarjeta) |
| Peticiones de opiniones / mes | **500** | **2.000** |
| Opiniones importadas / mes | **1.000** | **5.000** |
| Respuestas con IA / mes | **300** | **1.500** |
| Presupuesto de IA / mes | 250.000 tokens | 1.200.000 tokens |
| Sincronizaciones automáticas / mes | **120** | **720** |
| Sedes incluidas | 3 | 10 |
| Opiniones guardadas (tope BD) | 5.000 | 25.000 |
| Auditoría · conexiones · retención | 10.000 · 6 · 180 d | 50.000 · 20 · 365 d |
| Almacenamiento asignado | 2 GB | 10 GB |
| Email · Google Business/Places · IA · filtro privado | ✅ | ✅ |
| WhatsApp (peticiones y alertas) · Trustpilot · publicar en Google | ✅ | ✅ |
| Tienda (Shopify/Woo/TPV) + WhatsApp al entregar | — | ✅ |
| Soporte | Email | Prioritario |

> Sin plan gratuito: los 2 planes exigen suscripción activa. Sin ella (o con la prueba
> caducada), el panel redirige a `/bienvenido` y las APIs responden **402**.

**Métrica =** 1 petición enviada · 1 opinión importada · 1 respuesta de IA · 1 sincronización
automática. Son **cuatro cuotas independientes**: agotar una no bloquea las otras.

### Recargas puntuales (un solo pago, válidas el ciclo en curso)

| Pack | ID interno | Añade | Importe | Variable opcional |
|---|---|---|---|---|
| `extra_requests_1000` | +1.000 peticiones | email/WhatsApp | 9 € | `STRIPE_PRICE_ADDON_REQUESTS` |
| `extra_reviews_2000` | +2.000 opiniones | +2.000 plazas de almacenamiento | 12 € | `STRIPE_PRICE_ADDON_REVIEWS` |
| `extra_ai_500` | +500 respuestas IA | — | 15 € | `STRIPE_PRICE_ADDON_AI` |
| `extra_syncs_500` | +500 sincronizaciones | — | 6 € | `STRIPE_PRICE_ADDON_SYNCS` |

Sin Price ID configurado, el Checkout se crea con `price_data` inline usando los importes de
`lib/plans.ts` (ajustables con `STRIPE_ADDON_*_PRICE_CENTS`). El selector está en la landing, en
`/dashboard?tab=facturacion` (sugiere la recarga que te bloqueó) y como modal desde el aviso del 80 %.

---

## 🔄 Flujo end-to-end (cero mocks)

```
Registro → /bienvenido (2 planes de pago)
  · Pro/Business → Stripe Checkout con prueba de 7 días (tarjeta obligatoria)
  → webhook crea/activa tenant + membresía owner en Supabase
  → /dashboard: conecta Google/Trustpilot/tienda/WhatsApp → opiniones reales
  → triaje privado ≤3★ (análisis IA + mensaje conciliador + nota interna)
  → borrador IA → publicar en Google / responder en privado
  → cada acción consume su cuota → 429/402/403/507 al agotar → recarga o siguiente ciclo
  → día 8 sin pago: el middleware corta /dashboard → /bienvenido?reason=trial-ended
```

---

## 🧱 Arquitectura del motor de cuotas y protección de datos

| Módulo | Responsabilidad |
|---|---|
| `lib/plans.ts` | Catálogo comercial (client-safe): **2 planes de pago** (Pro/Business, 7 días de prueba), features, cuotas mensuales (incl. **presupuesto de tokens de IA**), **topes de BD**, `ROW_KB`, `AI_MODEL_PRICING`, `PURGE_STRATEGY`, recargas, `resolvePlan`, `hasAccess`. |
| `lib/openai.ts` | **Cliente centralizado de IA**: `gpt-4o-mini` por defecto, timeout, reintentos con backoff exponencial + jitter, rate limit por empresa, semáforo de concurrencia, `chatComplete`/`chatOnce` y estimación de coste por tokens. |
| `lib/usage.ts` | Motor de cuota y **guardia de la base de datos**: `checkQuota`, `consume`, `enforce()` (402/403/429), `enforceTableCap()`/`enforceStorage()` (507), purga de `reviews`/`quota_events`/`system_logs`, `publicQuota`, `upgradeHints`. |
| `lib/ingest.ts` | Importación con corte por cuota: calcula el hueco real (cuota mensual + plazas de tabla) e importa solo hasta ahí (`quotaCut`/`skipped`). |
| `lib/ai.ts` | IA de negocio (respuesta pública, mensaje privado, triaje ≤3★): usa `lib/openai.ts`, cae a plantilla/heurística local si el proveedor falla y registra tokens y coste por empresa (`recordAiUsage`). |
| `lib/db.ts` | **Pool de PostgreSQL directo** (`pg`) contra el Connection Pooler de Supabase: consultas agregadas, mantenimiento, `checkDbHealth()` y cierre limpio en contenedores. |
| `lib/whatsapp.ts` · `lib/google.ts` · `lib/store.ts` | Ejecutores reales; **cada llamada pasa por `enforce()` antes de consumir créditos externos**. |
| `lib/stripe.ts` | Checkout con prueba de 7 días, Price ID de Pro/Business y recargas (`addonLineItem`, `priceIdFor`, `planFromPriceId`), portal de facturación. |
| `app/api/stripe/webhook` | Suscripciones (alta/cambio/impago/cancelación) y recargas idempotentes → `tenants.extra_*` + ledger `addons`. |
| `supabase/migration_3_7_0.sql` | 3 planes, columnas `extra_requests/extra_syncs/extra_stored`, vista recalculada y funciones `purge_reviews`, `purge_quota_events`, `purge_system_logs`, `purge_tenant`, `purge_all_tenants`. |
| `supabase/migration_3_8_0.sql` | Contabilidad de IA (`usage_counters.ai_tokens_*`, `tenants.ai_*`, tabla `ai_interactions`, RPC `consume_ai_tokens`, vista `v_ai_usage`, purga de IA), índices de rendimiento y RLS. |
| `supabase/migration_3_9_0.sql` | Modelo 100 % de pago: planes solo `pro|business`, estados `inactive`/`paused`, migración automática de filas legacy, vistas y purgas con topes Pro por defecto. |
| `lib/tripadvisor.ts` | TripAdvisor vía SerpAPI/Outscraper: `fetchTripadvisorReviews()` + `syncTripadvisorForTenant()` con cuota (misma estructura que Google/Trustpilot). |
| `lib/queue.ts` + `/api/queue/worker` | Cola QStash (fallback inline): `store.delivered`, `whatsapp.send`, `sync.provider`, `ai.generate`, `notify.owner`, con reintentos y control de caudal. |
| `/api/cron/sync-reviews` + `vercel.json` | Cron horario (Business 1 h / Pro 6 h) que encola syncs de Google/Places/Trustpilot/TripAdvisor. Alternativa pg_cron documentada. |
| `lib/optin.ts` + `whatsapp_optins` | Opt-in RGPD: sin consentimiento vigente no sale WhatsApp al cliente (registro en checkout, baja por STOP). |
| `/valorar/[slug]` + `/api/feedback/*` | Flujo Neutral 1-5★: plataformas públicas para todas las puntuaciones (clic medido) y soporte privado opcional. |
| `supabase/migration_3_10_0.sql` | Fuente `tripadvisor` (+fix `places`), proveedor `tripadvisor`, `ai_interactions.job_id`, tablas `whatsapp_optins`, `whatsapp_contacts`, `feedback_responses` + RLS. |
| `supabase/migration_3_11_0.sql` | Estados Stripe, idempotencia, rate limits, ledger multipack, auditoría inmutable y hardening RLS. |
| `supabase/migration_3_12_0.sql` | Idempotencia observable de webhooks Stripe y soporte de reintentos seguros. |
| `proxy.ts` | Añade trazabilidad, corta `/dashboard` sin acceso, `/admin` sin `SUPERADMIN_EMAILS` y las APIs `/api/ai|reviews|integrations` sin suscripción (**402**). |

### Endpoints con control de cuota

| Ruta | Consume | Bloqueo |
|---|---|---|
| `POST /api/reviews/respond` | 1 credito `ai` | 402/403/429 |
| `POST /api/reviews/publish` | suscripción + guardado (subida a Google best-effort) | 402 sin suscripción · 403 sin `publishToGoogle` en la subida |
| `POST /api/reviews/triage` · `/private-note` | suscripción + feature `privateFilter` | 402 sin suscripción · 403 sin la feature |
| `POST /api/integrations/google/sync` | `syncs` + 1 crédito `reviews` por opinión | 429 · 507 |
| `POST /api/integrations/trustpilot/sync` | 1 crédito `reviews` por opinión | 429 · 507 |
| `POST /api/integrations/ingest` | feature `publicApi` + 1 crédito `reviews` por opinión | 403 · 429 · 507 (parcial: importa hasta el hueco) |
| `POST /api/integrations/whatsapp/test` | 1 crédito `requests` | 429 |
| `POST /api/integrations/store/*` | feature `storeIntegration` / `whatsappOrders` | 403 (Business) |
| `POST /api/ai` | 1 crédito `ai` + tokens (task `reply` \| `triage`) | 401/402/403/429/507 |
| `GET /api/ai` | — | Estado del motor de IA (super-admin) |
| `GET /api/tenants/usage` | — | Snapshot de cuota + tokens de IA + topes para el panel |
| `GET /api/health?mode=live` | — | Liveness público mínimo |
| `GET /api/health?mode=ready` | Bearer `HEALTHCHECK_SECRET` | Readiness privado de configuración y BD |
| `GET /api/tenants/export` | Sesión + membresía | Exportación CSV segura de reseñas o feedback |
| `GET /api/reports/reputation` | Sesión + membresía | Informe de reputación de 30 días |
| `GET /api/admin/db` | — | Diagnóstico de BD: pool, latencia, conexiones, tamaño por tabla (super-admin) |
| `GET /api/stripe/webhook` | — | Diagnóstico del webhook: modo, eventos, precios (super-admin) |

---

## 🎨 Sistema de diseño v3.12.0

- **Fondo** `#090D16` (`ink-950`) con escala propia `ink-50…950`, acento `brand` (azul #2563eb →
  #5f92fb) y violeta de apoyo; nunca negro puro ni blanco puro.
- **Superficies**: `glass`, `card`, `panel`, `ring-gradient`, `glow-border`, sombras `glow`.
- **Tipografía**: pila Inter / Geist Sans + Geist Mono con fallbacks del sistema (sin
  `next/font/google`, para que el build no dependa de red externa).
- **Componentes**: `Motion`, `Accordion`, `Toast`, `Skeleton`, `Quota` (medidores + topes de BD),
  `AddonPicker`, `HelpCenter`, `CookieBanner`.
- **Páginas**: `/`, `/login`, `/registro`, `/bienvenido`, `/dashboard` (Bandeja · Empresa ·
  Facturación), `/contacto`, `/sobre-nosotros` y las 4 legales — **sin ninguna mención pública
  al panel interno**.

---

## 🤖 Todo lo que ya está programado al 100 %

| Área | Estado | Detalle |
|---|---|---|
| 🖥️ Web comercial multipágina | ✅ | Landing + `/sobre-nosotros` + `/contacto` + 4 legales, estética dark premium |
| 💳 2 planes de pago + Stripe | ✅ | Pro/Business con prueba de 7 días y tarjeta obligatoria, portal de facturación, 402 estricto |
| 📊 Precios interactivos | ✅ | Comparativa de los 2 planes + tabla de límites + recargas con precio real |
| 🧮 Motor de cuotas | ✅ | 4 contadores por ciclo, RPC `consume_quota`, auditoría en `quota_events` |
| 🧠 IA medida por tokens | ✅ | `lib/openai.ts` (gpt-4o-mini + reintentos + rate limit), `ai_interactions`, presupuesto por plan y fallbacks locales |
| 🔌 Pool de PostgreSQL | ✅ | `lib/db.ts` contra el Connection Pooler, diagnóstico `?db=1` y mantenimiento |
| 🗄️ Protección de la BD | ✅ | Topes por tabla y plan, purga de lo más antiguo, poda de logs, `507` informativo |
| 🧩 Recargas puntuales | ✅ | 4 packs, pago único, idempotentes, capacidad inmediata y sugerencia contextual |
| 📊 Panel privado | ✅ | Pestañas, medidor de cuota, cola de triaje, wizard, toasts, skeletons, paywall |
| 🔌 Google Business real | ✅ | OAuth + importar opiniones + **publicar respuestas en Google** |
| 🔌 Google Places / Trustpilot / Maps | ✅ | Opiniones por Place ID, API de Trustpilot, enlaces «déjanos una opinión» |
| 📲 WhatsApp real | ✅ | Cloud API: alertas ≤3★ al móvil + petición de valoración al entregar |
| 🏪 Tiendas | ✅ | Shopify/WooCommerce (HMAC) + TPV genérico + API de ingesta con `api_key` |
| 🛡️ Filtro privado IA | ✅ | Quejas ≤3★ a gestión privada: análisis, mensaje conciliador y nota interna |
| 🛡️ Panel interno `/admin` | ✅ | Empresas, MRR, suscripciones, cuotas y recargas, logs, estado de integraciones · **privado** |
| 🧱 Middleware de seguridad | ✅ | `/admin` solo `SUPERADMIN_EMAILS`; `/dashboard` con suscripción/plan activo |
| 🗄️ Esquema BD + RLS + índices | ✅ | `supabase/schema.sql` + migraciones 3.2 → **3.9** (RLS en todas las tablas de cliente, índices en las clave) |
| 🤖 Respuestas IA | ✅ | `gpt-4o-mini` si hay clave, plantilla local/heurística si no (nunca falla) |
| ✅ Verificación previa | ✅ | `npm run verify`: health, IA, BD, firma del webhook y rutas protegidas |
| 📧 SMTP + contacto | ✅ | Proveedor agnóstico + formulario `/contacto` funcional |
| ⚖️ Legal UE/RGPD | ✅ | 4 páginas + banner granular + términos con cuotas, recargas y cortes |
| 🌍 Multi-host | ✅ | Auto-detecta Vercel; `Dockerfile` + `docker-compose` para el resto |
| ❤️ Health-check | ✅ | liveness mínimo y readiness privado autenticado |
| 🧪 Modo demo sin claves | ✅ | La app **arranca aunque falten claves** y explica qué configurar |

---

## 🗂️ Estructura del proyecto

```
├── app/
│   ├── page.tsx · sobre-nosotros/ · contacto/ · bienvenido/   # Web + onboarding
│   ├── login/ · registro/ · dashboard/                        # Auth + panel privado
│   ├── admin/                                                 # Panel interno (privado)
│   ├── aviso-legal/ · privacidad/ · terminos/ · cookies/
│   └── api/
│       ├── stripe/     checkout · addon · webhook · portal
│       ├── reviews/    respond · publish · triage · private-note
│       ├── integrations/ google (connect·callback·sync) · trustpilot · whatsapp ·
│       │                 ingest · store (connect·order-delivered) · shopify · woocommerce
│       ├── tenants/    start · usage · settings · route        · admin/ (impersonate·tenants)
│       └── health · contact · auth/signout
├── components/          Landing · Footer · LegalLayout · AuthForm · Wizard · Accordion ·
│   │                    Motion · Toast · Skeleton · Quota · AddonPicker · HelpCenter · CookieBanner
│   └── dashboard/       dashboard-client · BillingPanel · TenantCard · StoreConnect ·
│                        TriageCard · ReviewCard · UsagePanel · Stars · types
├── lib/                 plans · usage · openai · db · ingest · stripe · ai · google ·
│                        trustpilot · whatsapp · store · maps · mail · auth · env · logger ·
│                        demo · site
├── supabase/            schema.sql + migration_3_2_0 … migration_3_12_0.sql
├── scripts/             verify-launch.mjs (npm run verify)
├── docs/                GUIA_PASOS_MANUALES.md (manual de credenciales, fuera del cliente)
├── public/              logo.svg · favicon.svg
├── middleware.ts        corte de acceso por plan/suscripción y rol
└── GUIA_GRATIS / GUIA_DESPLIEGUE / GUIA_ADMIN / GUIA_COMERCIALIZACION / GUIA_AUTOMATIZACION · README.md · CHANGELOG.md
```

## 🔒 Seguridad y privacidad del panel

- `/admin` y `/api/admin/*`: **doble verificación** (middleware + guard de servidor) y **sin
  ningún enlace ni mención en la UI pública**.
- **RLS**: cada empresa solo ve sus datos; credenciales OAuth y API keys solo vía `service_role`
  en servidor (nunca llegan al navegador).
- Webhook de Stripe con **firma verificada** e **idempotencia** por `stripe_payment_id` /
  `stripe_invoice_id`; webhooks de tienda con verificación **HMAC**.
- Funciones SQL de cuota y purga (`consume_quota`, `reset_expired_extras`, `purge_*`)
  ejecutables solo por `service_role`.
- `.env` real **nunca** se sube a Git; rota las claves si sospechas una fuga.

## 📄 Licencia

Código privado — todos los derechos reservados. Prohibida su redistribución sin autorización.
