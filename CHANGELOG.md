# Changelog — ReviewFlow AI



## v3.12.0 (2026-09-18) — Robustez y nuevos servicios

- Idempotencia observable de todos los eventos Stripe, con estado, intentos y reintento seguro.
- Límite real de bytes en formularios y webhooks públicos; replay de tickets cerrado con estado y TTL.
- Exportación CSV segura de reseñas/feedback e informe de reputación de 30 días.
- Recifrado administrado y auditable de credenciales, con soporte temporal de clave anterior.
- Request ID para APIs, limpieza automática en cron y validación SQL real con PostgreSQL en CI.
## v3.11.0 (2026-09-18) — Endurecimiento integral de producción

- Next.js 16.3.5, React 19.3, Supabase SSR actual, Node 24 en Docker y dependencias sin vulnerabilidades conocidas.
- Esquema limpio corregido y migración `migration_3_11_0.sql`: estados Stripe, RLS, idempotencia, rate limiting y ledger multipack.
- Flujo de valoración neutral: todas las puntuaciones reciben las mismas plataformas; soporte privado adicional.
- OAuth Google con state firmado, TTL y PKCE; webhook Meta con HMAC, identidad y deduplicación.
- Credenciales cifradas AES-256-GCM, redirects/HTML seguros, health mínimo/readiness privado y timeouts HTTP.
- Security headers, Docker build args, ESLint flat config, tests y CI.
## v3.10.0 (2026-09-18) — TripAdvisor, automatización y Embudo Privado

### 🗺️ 1. Módulo de TripAdvisor (`lib/tripadvisor.ts`)
- Integración vía intermediario (**SerpAPI** por defecto, **Outscraper** alternativo):
  `TRIPADVISOR_PROVIDER` + `SERPAPI_API_KEY` / `OUTSCRAPER_API_KEY`.
- Misma estructura que `lib/google.ts`/`lib/trustpilot.ts`: tipo `TripadvisorReview`,
  fetch puro y capa de negocio `syncTripadvisorForTenant()` con cuota (syncs + reviews).
- Feature `tripadvisor` en planes (Pro y Business), fuente `tripadvisor` en ingesta,
  rutas `/api/integrations/tripadvisor/connect|sync` y tarjeta en el panel (Location ID).

### ⏰ 2. Sincronización automática (Cron Jobs)
- `vercel.json` (cada hora, minuto 7) + `GET|POST /api/cron/sync-reviews` protegido con
  `CRON_SECRET` (Vercel lo envía solo; alternativa `?secret=` para pg_cron/externos).
- El cron NO sincroniza: decide qué toca (cadencia **Business 1 h / Pro 6 h** sobre
  `last_sync_at`, cuota `syncs` con headroom) y publica un trabajo `sync.provider`
  por (empresa, proveedor) en la cola, escalonados. Google usa OAuth→Business o
  `place_id`→Places, más Trustpilot y TripAdvisor.
- Snippet pg_cron + pg_net en `supabase/migration_3_10_0.sql` §8 (alternativa a Vercel).

### 📲 3. Plantillas de WhatsApp / Meta Cloud API (HSM)
- `sendWhatsappTemplate()` + registro por entorno (`WHATSAPP_TEMPLATE_REVIEW_REQUEST`,
  `WHATSAPP_TEMPLATE_ALERT`, `WHATSAPP_TEMPLATE_LANG`).
- Ventana conversacional de 24 h (`whatsapp_contacts`): dentro → texto libre; fuera →
  plantilla HSM aprobada automáticamente. Pedidos con variables {{1..4}} (nombre,
  pedido, negocio, URL). Webhook entrante `/api/integrations/whatsapp/webhook`
  (verificación + registro de ventana + bajas STOP).

### 📥 4. Gestor de colas en segundo plano (Upstash QStash)
- `lib/queue.ts` + `POST /api/queue/worker` (firma QStash o `CRON_SECRET`): trabajos
  `store.delivered`, `whatsapp.send`, `sync.provider`, `ai.generate`, `notify.owner`.
- **Sin QStash funciona igual** (fallback inline por el mismo despachador).
- Reintentos con backoff (5xx) y control de caudal (IA ≤30/min por empresa, syncs de
  3 en 3). Webhooks de tienda responden 202 al instante; `/api/ai` acepta
  `"async": true` → 202 + `GET /api/ai/result?jobId=` (nueva columna `job_id`).

### ✅ 5. Cumplimiento RGPD (opt-in de WhatsApp)
- Tabla `whatsapp_optins` + `lib/optin.ts`: sin consentimiento vigente no sale ningún
  WhatsApp al cliente (`WHATSAPP_REQUIRE_OPTIN`, por defecto true).
- El checkout envía `whatsapp_optin` (Shopify note_attributes / Woo meta_data / API
  genérica `whatsapp_optin` + `optin_text` con prueba); revocación por STOP/BAJA o
  panel; gestión manual en `GET|POST /api/integrations/whatsapp/optin`.

### 🎯 6. Embudo Privado de Satisfacción (Feedback Gateway)
- Página pública `/valorar/[slug]` con micro-encuesta 1-5★: **4-5★** → botones a
  Google Maps/TripAdvisor/Trustpilot (clic medido); **1-3★** → ticket privado con
  aviso inmediato al dueño (email + WhatsApp), nunca público.
- Tabla `feedback_responses` + APIs públicas con rate-limit (`respond`, `click`) y de
  panel (`stats`, `tickets`); nueva pestaña **Embudo** con KPIs, reparto de estrellas,
  canales, tickets y ajustes de URLs; solo funciona con suscripción usable.

### 🖥️ 7. UI: tabla de límites en desplegable
- La comparativa de límites deja de ocupar el centro de Precios: ahora es un
  desplegable colapsado al final de la sección (mismo componente que el detalle).

## v3.9.0 (2026-09-17) — Modelo 100 % de pago, 402 estricto y comercialización

### 💳 1. Eliminación del plan gratuito
- **`lib/plans.ts`**: eliminado el plan `free` (0 €). Solo `pro` (29 €) y `business` (79 €);
  `PLAN_CATALOG` y `PAID_PLAN_IDS` solo de pago; `resolvePlan()` mapea cualquier valor legacy
  o gratuito al plan de pago más barato; `isPaidPlan()` siempre `true` (compatibilidad).
- **Alta sin tarjeta desactivada**: `POST /api/tenants/start` responde 402 con `checkoutUrl`.
- **UI**: `Landing`, `BillingPanel`, `/bienvenido`, `AuthForm`, contacto, dashboard, admin y ayuda
  muestran solo planes de pago con «7 días de prueba gratis».
- **Checkout** (`/api/stripe/checkout`): solo `pro|business`, `trial_period_days: 7` con tarjeta
  obligatoria y pausa si falla el cobro del día 8.

### 🔒 2. Restricción de acceso por suscripción (402)
- **`lib/usage.ts`**: regla estricta — sin suscripción `active` o con prueba `trialing` caducada
  (día 8 sin pago), `enforce()` y `enforceAi()` responden **402** (`trial_expired`/`no_subscription`).
  Nuevo helper `requirePaidAccess()` para rutas sin consumo de cuota.
- **`middleware.ts`**: `/api/ai/*`, `/api/reviews/*` y `/api/integrations/*` exigen sesión (401) y
  suscripción (402). Excluidos flujos máquina-a-máquina (webhooks Shopify/Woo, ingesta y
  pedido-entregado por `api_key`, callback OAuth de Google), con gates internos por tenant.
- Guards por tenant añadidos en `reviews/private-note`, `reviews/publish`, `reviews/respond`
  (con caducidad de trial) y conexiones de Google/Trustpilot/Tienda.

### ⚖️ 3. Datos legales centralizados (SL y marca)
- **`lib/site.ts`**: exportaciones `companyName`, `cif`, `address`, `supportEmail`, `domain`
  (+ `brand`, `legalEmail`) configurables por entorno (`NEXT_PUBLIC_*`), con `.env.example` ampliado.
- **`/aviso-legal`, `/privacidad`, `/terminos` y `Footer`**: consumen los valores dinámicamente;
  `/terminos` reescrito sin plan gratuito y con precios/límites leídos de `lib/plans.ts`.

### 🪝 4. Webhooks de Stripe con corte inmediato
- Impago → `subscription_status = 'past_due'` **al instante** (búsqueda por suscripción + customer).
- Cancelación/baja → `'inactive'` **al instante**; se conserva el último plan de pago (sin
  downgrade a gratuito) y se limpia `stripe_subscription_id`; `paused` mapeado como estado propio.
- **SQL**: `supabase/migration_3_9_0.sql` (planes solo `pro|business`, estados `inactive`/`paused`,
  migración automática de filas legacy) + `supabase/schema.sql` actualizado (vistas y purgas con
  topes Pro por defecto).

### 📘 5. Guías de comercialización
- **Nueva `GUIA_COMERCIALIZACION.md`**: todo lo que el dueño debe aportar para vender al público
  (decisiones, empresa, dominio, Supabase, Stripe live, SMTP, marca, OpenAI, Google, WhatsApp,
  legal RGPD/consumo, seguridad, soporte, checklist go-live, lanzamiento + anexos de costes).
- Guías existentes actualizadas a v3.9.0 y al modelo de pago (`README`, `GUIA_ADMIN`,
  `GUIA_GRATIS`, `GUIA_DESPLIEGUE`, `docs/GUIA_GENERAL`, `docs/GUIA_PASOS_MANUALES`).

## v3.8.0 (2026-09-17) — IA medida en tokens, PostgreSQL blindado y cobros verificables

### 🧠 1. Integración de IA finalizada con `gpt-4o-mini`
- **`lib/openai.ts` (nuevo, cliente centralizado)**: único punto de salida hacia OpenAI.
  - Modelo por defecto **`gpt-4o-mini`** (`DEFAULT_OPENAI_MODEL`), configurable con `OPENAI_MODEL`.
  - **Timeout** por petición (20 s), **reintentos con backoff exponencial + jitter** (3 intentos)
    que respetan `Retry-After`, **rate limit por empresa** (20 rpm) y **semáforo de concurrencia**
    global (6 llamadas) para sobrevivir a picos de tráfico.
  - `chatComplete()` (con reintentos) y `chatOnce()` (una pasada, sin reintentos) + estimación de
    coste por tokens. El SDK de OpenAI se usa con `maxRetries: 0` (los reintentos son nuestros).
- **`lib/ai.ts` (refactor)**: respuestas públicas, mensajes privados y triaje de reseñas 1–3★
  pasan por `chatComplete()` y **nunca lanzan error al cliente**: si el proveedor falla se usa la
  **plantilla/heurística local** y se registra `ok = false` con el motivo.
- **Contabilidad por empresa (`lib/usage.ts`)**: `enforceAi()` comprueba **antes** de llamar a
  OpenAI (402 sin suscripción · 403 sin la feature · 429 créditos agotados · 429 **presupuesto de
  tokens agotado** · 507 tope de filas) y `recordAiUsage()` guarda cada llamada en
  `ai_interactions` (modelo, tokens de entrada/salida, coste, latencia, fallback) y suma
  `usage_counters.ai_tokens_in/out` + `tenants.ai_tokens_in/out/ai_requests/ai_cost_usd` vía RPC
  `consume_ai_tokens`.
- **Presupuestos por plan (`lib/plans.ts`)**: `aiTokensPerMonth` 30.000 / 250.000 / 1.200.000,
  topes de `ai_interactions` 2.000 / 20.000 / 100.000 filas, `ROW_KB.aiInteraction = 1.2` y tabla
  de precios `AI_MODEL_PRICING` (gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-4.1) client-safe.
- **`app/api/ai/route.ts` (nueva API pública)**: `POST` protegido por sesión + membresía + cuotas
  para generar respuestas (`task: reply|triage`), con respuesta enriquecida (`usage.tokens`,
  `usage.costUsd`, `usage.fallback`, `quota`); `GET` expone el estado del motor (detalle completo
  solo para super-admin).
- **`middleware.ts`**: `/api/ai*` responde **401 JSON** sin sesión y **503 JSON** en modo demo
  (nunca deja pasar una llamada de IA sin autenticar).

### 🗄️ 2. PostgreSQL / Supabase blindado para tráfico comercial
- **`lib/db.ts` (nuevo)**: pool `pg` contra el **Connection Pooler** de Supabase (Supavisor,
  puerto 6543 en modo transaction), con `DATABASE_POOL_MAX`, timeouts de conexión/statement,
  `maxUses` para reciclar conexiones, detección de modo (transaction vs session), aviso si se
  configura el host directo `db.<ref>.supabase.co` y cierre limpio en SIGTERM/SIGINT.
  Sin `DATABASE_URL` la app funciona igual (pool desactivado, nunca lanza).
- **Diagnóstico**: `GET /api/health?db=1` (latencia, modo, conexiones activas, tamaño de la BD) y
  `GET /api/admin/db` (pool, conexiones, tamaño real por tabla, top de consumo de IA del ciclo y
  coste máximo teórico por plan) — siempre sin secretos y solo para super-admin.
- **`supabase/migration_3_8_0.sql`**: `usage_counters.ai_tokens_in/out`, `tenants.ai_*`,
  tabla **`ai_interactions`** con ledger y RLS (`is_member`), RPC `consume_ai_tokens`,
  `purge_ai_interactions`, `purge_tenant` actualizado, vista `v_ai_usage` y **6 índices de
  rendimiento** en las tablas calientes. `schema.sql` sincronizado a v3.8.0.

### 💳 3. Pasarela de pagos verificable
- **`GET /api/stripe/webhook`** (super-admin): modo (test/live), eventos esperados, precios
  detectados y pistas de resolución de fallos sin exponer secretos.
- **`scripts/verify-launch.mjs` + `npm run verify`**: comprobación previa al lanzamiento contra
  local o producción → health, motor de IA, pool de PostgreSQL, precios de Stripe, **firma válida
  del webhook (2xx) y firma falsa (400)** y rutas de IA sin sesión (401/503). Salida con
  semáforos y `exit 1` si algo falla.
- El filtro de acceso del backend sigue siendo `enforceAi()` + `middleware.ts`: **sin suscripción
  activa o sin cuota/presupuesto no se ejecuta ni una llamada de IA**.

### 📊 4. Paneles de control de coste
- **Dashboard y facturación**: nueva tarjeta **Presupuesto de IA** (tokens del ciclo, borradores,
  tokens restantes y coste estimado en €), incluida en el aviso crítico al 80 %.
- **`/admin`**: tarjeta *Tokens de IA (ciclo)* (tokens + coste + fallbacks), línea de IA por
  empresa en *Cuotas y extras*, y `aiUsage` expuesto en `/api/tenants/usage`.

### 📚 5. Documentación y entrega
- **`README.md`** reescrito para v3.8.0: novedades, **stack y arquitectura** (diagrama ASCII del
  flujo de una llamada de IA con todas sus puertas), **puesta en marcha en 5 pasos**, **despliegue
  Vercel + Supabase en 10 pasos**, tabla de variables clave, tabla de APIs y roadmap de estado.
- **`.env.example`**: `DATABASE_URL` con la configuración del pooler y knobs del pool, bloque de
  OpenAI (clave, modelo, base URL, timeout, reintentos, rpm, concurrencia) y sección de
  verificación previa.
- **`GUIA_ADMIN.md`**: nuevas secciones §4 (IA con `gpt-4o-mini`: dónde se ve el consumo, tabla de
  presupuestos, matriz de comportamiento ante fallos, control de costes OpenAI/Supabase) y §5
  (verificación de cobros, matriz de pruebas del ciclo comercial con Stripe test y resolución de
  fallos de webhook), más `ai_interactions` en la tabla de impacto en BD y el pool de conexiones.
- **`docs/GUIA_GENERAL.md`**: paso 3b de IA (`gpt-4o-mini`, presupuesto y coste por borrador),
  pooler en el paso 2, `npm run verify` en la verificación E2E, matriz de pruebas comerciales y
  nuevas filas de problemas típicos.
- **`GUIA_GRATIS.md`**: presupuesto de IA por plan, 4 preguntas nuevas de cliente (cómo funciona la
  IA, qué pasa si se cae, si puede dispararse el gasto), paso 3 de IA gratis, pooler opcional y
  resumen de lo montado a 0 €.
- **`package.json`** → `3.8.0` + script `npm run verify`.

## v3.7.0 (2026-09-17) — 3 planes, topes de base de datos y panel interno invisible

### 💶 1. Modelo comercial simplificado a 3 planes
- **`lib/plans.ts` (reescrito)**: `free` (Gratuito · 0 €), `pro` (29 €) y `business` (79 €).
  Desaparecen `trial`, `resenas` y `completo` como planes vendibles (`resolvePlan` los sigue
  traduciendo para no romper filas antiguas).
- **4 cuotas mensuales fáciles de explicar**: peticiones de opiniones (email+WhatsApp),
  opiniones importadas, respuestas con IA y sincronizaciones automáticas. Gratuito 50/100/30/30 ·
  Pro 500/1.000/300/120 · Business 2.000/5.000/1.500/720.
- **Sedes**: 1 / 3 / 10 por plan (`limits.locations`).
- **Catálogo de recargas reducido a 4 packs de pago único**: +1.000 peticiones 9 €,
  +2.000 opiniones 12 €, +500 respuestas IA 15 €, +500 sincronizaciones 6 €.
  Se eliminan los add-ons recurrentes (ilimitados, sedes extra y bonus duplicados): menos casos
  límite y menos sobrecostes.

### 🗄️ 2. Protección de la base de datos (Supabase/PostgreSQL)
- **`lib/plans.ts`**: `limits.reviewsStored`, `limits.auditRows`, `limits.integrations`,
  `limits.logRetentionDays` y `limits.storageMb` (500 filas/2.000/2/30 d/250 MB en Gratuito ·
  5.000/10.000/6/180 d/2 GB en Pro · 25.000/50.000/20/365 d/10 GB en Business) + `ROW_KB`,
  `estimateStorageMb` y `PURGE_STRATEGY`.
- **`lib/usage.ts`**: nuevas puertas `enforceStorage()` y `enforceTableCap()` (`507`),
  purga «lo más antiguo primero» de `reviews` y `quota_events`, poda global de `system_logs`
  (con throttle) y contadores reales por tabla en `checkQuota()`/`publicQuota()`.
- **`supabase/migration_3_7_0.sql`**: columnas `extra_requests`, `extra_syncs`, `extra_stored`,
  migración de los extras legacy, `reset_expired_extras()` actualizado, `v_quota_overview`
  recalculada y funciones SQL `purge_reviews`, `purge_quota_events`, `purge_system_logs`,
  `purge_tenant` y `purge_all_tenants` (programables con `pg_cron`).
- **`lib/ingest.ts` + `/api/integrations/ingest`**: la importación respeta el hueco real
  (cuota mensual **y** plazas de tabla) y responde `507` cuando el plan no admite más filas.

### 🔒 3. El panel `/admin` desaparece de la vista del cliente
- **`components/AuthForm.tsx`**: fuera el pie «¿Eres el dueño? Usa /admin» y cualquier mención a
  `SUPERADMIN_EMAILS`; los avisos ahora remiten a soporte/contacto.
- **`components/HelpCenter.tsx`**: la configuración paso a paso ya no muestra variables de
  super-admin (se sustituyen por SMTP) y se documentan los códigos 402/403/429/507.
- **`components/Skeleton.tsx`, `components/dashboard/BillingPanel.tsx`**: textos internos
  reescritos («panel interno», «cuenta suspendida · contacta con soporte»).
- **`/admin` sigue existiendo y protegido** (`middleware.ts` + `lib/authz.ts`): solo el dueño
  con su email en `SUPERADMIN_EMAILS` puede entrar; nadie más lo ve ni lo intuye.

### 🖥️ 4. Onboarding, marketing y panel alineados con los 3 planes
- **`/bienvenido`**: selector de 3 planes; el Gratuito se activa sin tarjeta vía
  `POST /api/tenants/start`, y Pro/Business van al Checkout con prueba de 7 días.
- **`components/Landing.tsx`**: FAQ nueva, rejilla de 3 precios (Pro destacado) y tabla
  comparativa generada desde `PLAN_CATALOG`.
- **`components/dashboard/BillingPanel.tsx` + `UsagePanel.tsx`**: cuota por métrica, medidor de
  almacenamiento/topes de BD y sugerencia de recarga según la métrica bloqueada.
- **`app/terminos`, `/contacto`, `/sobre-nosotros`, `lib/site.ts`, `lib/demo.ts`**: copy
  actualizado a Gratuito/Pro/Business y a las nuevas cuotas.

### 📘 5. Guías reescritas
- **`GUIA_ADMIN.md`**: sección técnica nueva de impacto en PostgreSQL (topes por tabla y plan,
  estimación KB/fila, estrategia de purga/archivado, SQL de purga manual y cuándo escalar
  Supabase).
- **`GUIA_GRATIS.md`**: explicación comercial amable de los 3 planes (tabla + frases para
  clientes) y guía de despliegue a 0 € actualizada.
- **`docs/GUIA_GENERAL.md`, `README.md`, `.env.example`**: precios, variables
  (`STRIPE_PRICE_PRO/BUSINESS`, `STRIPE_PRICE_ADDON_*`) y migraciones al día.


## v3.6.0 (2026-09-17) — Selección múltiple de add-ons + cuotas ilimitadas + UX simplificada

### 🛒 1. Sistema de Add-ons con Selección Múltiple
- **`components/AddonPicker.tsx` (rediseño)**: de botones únicos a **cards con checkbox** en dos
  familias (Recargas del ciclo · Cuotas ilimitadas y costes extra), **cantidad por extra**,
  **desglose en vivo** (línea a línea + total) antes de pagar. Modo `modal` para el banner de 80 %.
- **`app/api/stripe/addon`**: el endpoint acepta la matriz
  **`addons: Array<{ key, quantity }>`** (GET con JSON/CSV y POST) además del pack único legacy.
  Los pagos únicos salen como **`line_items` en una única sesión `mode: 'payment'`** (un solo cobro);
  los recurrentes, en sesión `mode: 'subscription'` (Stripe no permite mezclar ambos en una sesión),
  encadenando el redirigido cuando el carrito es mixto.
- **`lib/plans.ts`**: nuevo campo `billing: 'one_time' | 'recurring'` + `effect` en el catálogo,
  `ADDON_RECURRING_CATALOG`, `ALL_ADDON_CATALOG`, `addonIsRecurring()`, `addonBillingLabel()`.

### ♾️ 2. Nuevos Add-ons de Cuota Ilimitada y Costes Adicionales
- **`whatsapp_unlimited`** — *WhatsApp Ilimitado*: elimina el tope mensual de mensajes automáticos
  (recurrente mensual · 19 €/mes por defecto).
- **`reviews_unlimited`** — *Reseñas Ilimitadas*: ingesta sin tope mensual (recurrente mensual · 24 €/mes).
- **`location_pack`** — *Pack Localización Extra*: +1 sede Google Maps / tienda (recurrente **por unidad** · 9 €/sede/mes).
- **`whatsapp_bonus_500` / `whatsapp_bonus_2000`** — *Bonus Puntual de Mensajes* +500/+2.000 (pago único).
- **`lib/usage.ts`**: `checkQuota` aplica los flags `tenants.whatsapp_unlimited` / `reviews_unlimited`
  (métrica → «∞», `UNLIMITED_QUOTA`) y expone `locations` (`tenants.extra_locations`) en la cuota y en
  `publicQuota` para la UI.
- **`supabase/schema.sql` + `supabase/migration_3_6_0.sql`** (idempotente): columnas
  `whatsapp_unlimited`, `reviews_unlimited`, `extra_locations` + vista `v_quota_overview` ampliada.
- **`lib/stripe.ts` / `lib/env.ts` / `.env.example`**: Price ID opcionales por add-on nuevo y
  `price_data` inline con `recurring: { interval: 'month' }` cuando no hay catálogo.

### 🎨 3. Simplificación UX/UI y Reducción de Texto
- **`components/Landing.tsx`**: la sección «Cómo funciona» pasa de 4 bloques densos + 3 mini-pasos a un
  **esquema visual de 3 pasos**: **1 Conecta** (Google Maps / Shopify / WooCommerce) · **2 Automatiza**
  (plantillas de WhatsApp + ingesta) · **3 Crece** (filtro privado de negativas + destacar positivas).
- **`components/Wizard.tsx`**: "Paso a Paso" interactivo con **indicador de progreso** (pendiente /
  activo / completado con check), iconos explicativos por paso y textos reducidos a una línea.
- **`components/dashboard/UsagePanel.tsx`**: métricas numéricas planas sustituidas por **barras de
  progreso dinámicas con código de color** (verde < 70 % · amarillo 70–90 % · rojo > 90 %) por métrica
  y agregado (umbral central en `quotaTone` de `components/Quota.tsx`), con «∞» cuando hay ilimitado activo.
- **CTA directa**: al llegar al **80 %** de WhatsApp o Reseñas, banner con **«Ampliar cuotas con 1 Clic»**
  que abre el **modal de selección múltiple** (`AddonPicker` en `modal`).

### 🔧 4. Correcciones Técnicas e Integraciones
- **`app/api/stripe/webhook`**: `applyAddonPurchase` / `applyInvoicePaid` **iteran todos los
  `line_items`** de la sesión/factura (`display_items` + metadata) y registran el incremento
  correspondiente en `tenants` + ledger `addons` (una fila por línea, idempotente). El estado recurrente
  se recalcula a partir de **todas las suscripciones vivas del cliente** (`customer.subscription.*`),
  incluyendo suscripciones puras de add-on (que ya no tocan el plan base) e impagos de add-on (gracia de
  Stripe sin corte del panel).
- **`lib/ingest.ts` / `lib/whatsapp.ts` / webhooks de tienda**: al superar el límite **sin addon activo**,
  los webhooks de **Shopify y WooCommerce** devuelven **200 con estado informativo**
  (`reason: quota_exhausted` + cuota + upgrade) en vez de 429, para no satar las colas de reintentos.
- **Consolidación de documentación**: `GUIA_GENERAL.md` y `GUIA_PASOS_MANUALES.md` movidas a **`docs/`**
  (fuera de la vista principal) y condensadas en el **modal «Ayuda»** del panel
  (`components/HelpCenter.tsx`, FAQs desplegables por tema) accesible desde la cabecera.

## v3.5.0 (2026-09-17) — Cuotas aplicadas en servidor + add-ons de cuota + UI nivel Linear/Vercel

### ⚙️ Motor de límites (bloque 1)
- 🧮 **Auditoría y reescritura del catálogo** (`lib/plans.ts`): 2 planes comerciales
  (Estándar «Solo Reseñas» 29 €/300 eventos · Pro «Completo E-commerce» 79 €/1.000 eventos) +
  prueba 7 días (50 eventos), **techo por tipo** (`perMetric`: reseñas · IA · WhatsApp),
  `googleSyncsPerMonth`, mapa de `features` por plan, ciclos de facturación
  (`currentCycle`, `nextCycleStart`, `renewalLabel`, `secondsUntilRenewal`) y helpers
  `resolvePlan` / `planHasFeature` / `hasAccess` / `isTrialExpired`. Fichero 100 % client-safe.
- 🔌 **`lib/usage.ts` conectado a la ejecución real**: `checkQuota` (cuota agregada + techos +
  extras + packs concedidos), `consume` (RPC `consume_quota` con fallback a upsert),
  `enforce()` como puerta única que devuelve **`402 Payment Required`** (sin plan/suscripción o
  feature fuera de plan), **`403`** (empresa suspendida/sin permiso) o **`429 Too Many Requests`**
  (cuota agotada) con cabeceras `Retry-After` y `X-RateLimit-Limit/Remaining/Reset`, cuerpo
  `quota` + `upgradeHints`.
- 🚦 **Todas las rutas que consumen créditos pasan por el motor**: `reviews/respond` (IA),
  `reviews/publish`, `reviews/triage`, `reviews/private-note`, `integrations/google/sync`
  (+ contador `google_calls`), `integrations/trustpilot/sync`, `integrations/ingest`,
  `integrations/whatsapp/test`, `integrations/store/*` y el flujo de pedido entregado.
- 📥 **`lib/ingest.ts`**: importación con corte por cuota (calcula el hueco real, importa hasta
  ahí y devuelve `quotaCut`/`skipped` en vez de fallar en bloque).
- 🗄️ **`supabase/migration_3_5_0.sql`** (idempotente): `tenants.extra_quota/extra_reviews/extra_ai/
  extra_whatsapp/extra_quota_cycle`, `usage_counters.google_calls`, tabla de auditoría
  `quota_events`, RPC `public.consume_quota()`, `public.current_cycle()`,
  `public.reset_expired_extras()` (con job `pg_cron` opcional el día 1) y vista
  `public.v_quota_overview`. `schema.sql` actualizado para proyectos nuevos.

### 💳 Add-ons / ampliadores de cuota (bloque 2)
- 🧩 **4 packs** en el catálogo: `events_500` (9 €), `reviews_500` (12 €), `ai_500` (15 €) y
  `whatsapp_1000` (19 €), con Price ID opcional por variable (`STRIPE_PRICE_ADDON_*`) y fallback a
  `price_data` inline con importes configurables (`STRIPE_ADDON_*_PRICE_CENTS`).
- 🔗 **`/api/stripe/addon`** completo: `GET ?packs=1` (catálogo + cuota actual),
  `GET ?type=…&tenantId=…` (redirección al Checkout) y `POST { tenantId, pack, quantity }`
  (respuesta JSON con la URL), con validación Zod y cantidad 1–20.
- ⚡ **Webhook**: `checkout.session.completed` e `invoice.payment_succeeded` registran la compra en
  `addons` (idempotente por `stripe_payment_id` / `stripe_invoice_id`) **y suman la capacidad a
  `tenants.extra_*` del ciclo actual**, con reset automático si el ciclo cambió, log en
  `system_logs` y email al propietario. Los ítems recurrentes de una suscripción se reflejan vía
  `applySubscriptionChange`.
- 🛒 **Selector «Añadir Extra de Cuota»** en la tabla de precios pública (`/#ampliaciones`) y en
  `/dashboard?tab=facturacion`, que **sugiere el pack** según el tipo de evento que bloqueó la
  última acción (`blockedBy`), con retorno a la app vía `?addon=success|canceled`.
- ⏳ **Prueba de 7 días con tarjeta**: checkout con `trial_period_days`, aviso
  `trial_will_end` por email y **corte real el día 8** desde el middleware
  (`/bienvenido?reason=trial-ended|past-due|no-access|canceled|suspended`), con pausa automática
  de la suscripción si falta el pago aunque el webhook se retrase.

### 🎨 Rediseño de interfaz (bloque 3)
- 🌌 **Sistema de diseño nuevo**: fondo profundo `#090D16` (escala `ink-50…950`), acento `brand`
  completo (antes faltaban 200/300/400/800 y las clases eran silenciosamente ignoradas),
  glassmorphism (`glass`, `card`, `panel`), bordes iluminados (`ring-gradient`, `glow-border` que
  sigue al cursor), sombras `glow`/`glow-lg`/`glow-soft`, escala de opacidad ampliada
  (`/12`, `/18`, `/22`, `/92`…) y utilidades (`kicker`, `meter`, `badge-*`, `skeleton`,
  `accordion-item`, `legal-prose-dark`).
- 🔤 **Tipografía Inter / Geist Sans + Geist Mono** con fallbacks del sistema (sin
  `next/font/google`, para que `next build` no dependa de red externa).
- 🧱 **Componentes nuevos**: `Motion` (Reveal, GlowCard, Aurora, CountUp), `Accordion` (apertura
  fluida con altura animada para FAQ y desglose de planes), `Toast` (proveedor global con cola,
  iconografía por tipo y acciones), `Skeleton` (Spinner, ReviewSkeleton, TableSkeleton,
  AuthSkeleton, QuotaSkeleton), `Quota` (medidores) y `AddonPicker`.
- 📊 **`/dashboard` reconstruido**: pestañas *Bandeja · Empresa · Facturación* con subrayado
  animado, estadísticas con contador, **cola de triaje privado** (análisis IA de la reclamación,
  mensaje conciliador y nota interna), reseñas con borrador IA editable y publicación, panel de
  facturación (estado de plan/suscripción, medidor de cuota, add-ons, portal de Stripe,
  comparativa de planes), tarjeta de empresa con acordeones por integración y skeletons de carga.
- 🧙 **`Wizard.tsx` reescrito**: 4 pasos animados (empresa → plataformas → tono IA → lanzar) con
  barra de progreso, estados de carga, errores explicados y persistencia local.
- 🔐 **`/login` y `/registro`** con `AuthForm` rediseñado (modo demo, errores de Supabase
  traducidos, enlace al panel de admin), **`/bienvenido`** con selección de plan animada y avisos
  según `?reason=`, **`/admin`** con pestañas (incluida la nueva *Cuotas y extras*), toasts y
  medidores por empresa, y `/contacto`, `/sobre-nosotros` + 4 legales en el mismo sistema oscuro.
- 🧹 Eliminados todos los restos del tema claro (`bg-slate-*`) del producto.

### 📘 Documentación (bloque 4)
- 🧑‍💻 **`GUIA_PASOS_MANUALES.md` reescrita**: tabla con las **28 credenciales exactas** (qué es
  cada una, dónde se consigue y si es obligatoria), formato completo del `.env`, Supabase
  (esquema/migraciones + `pg_cron`), Stripe (productos, precios y webhook con los 7 eventos),
  **paso a paso para crear los productos Add-on y enlazar sus Price ID**, OpenAI, Meta WhatsApp
  Cloud API (token permanente de System User, Phone Number ID, Business Account ID), Google Cloud
  (OAuth + Places API restringida), SMTP/DNS, verificación E2E y tabla de troubleshooting
  (402/403/429, add-ons que no se aplican, corte del día 8, `redirect_uri_mismatch`…).
- 📄 **`.env.example` v3.5.0** con todas las variables comentadas y agrupadas, y **`README.md`**
  actualizado (planes, techos, add-ons, arquitectura del motor de cuotas, endpoints con control de
  cuota, sistema de diseño y estructura del proyecto). `package.json` → `3.5.0`.
- ⚖️ `/terminos` actualizado al modelo real: cuotas con techos por tipo, códigos 402/429, los 4
  packs de ampliación con su precio y el corte de acceso el día 8.

## v3.4.0 (2026-09-17) — Nuevos planes + filtro privado IA + tienda/WhatsApp + cuotas

- 💳 **Planes nuevos**: `Solo Reseñas` (29 €/300 eventos) y `Completo E-commerce`
  (79 €/1000 eventos), **1 empresa cada uno**. Env `STRIPE_PRICE_RESENAS/COMPLETO`
  (fallback a STARTER/PRO) + `migration_3_4_0.sql` (renombra planes legacy).
- 🛡️ **Filtro privado IA**: quejas ≤3★ → `flagged_private` + mensaje conciliador interno
  (nunca público) + nota de seguimiento; cola de triaje en el dashboard + alerta WhatsApp.
- 🏪 **Tienda conectada (plan Completo)**: Shopify/WooCommerce con verificación HMAC;
  pedido Entregado/Completado → WhatsApp pidiendo valoración con enlace de Maps.
- 📊 **Cuotas reales**: `usage_counters` por ciclo (reseñas+IA+WA), 429 al agotar,
  widget de consumo + **add-ons +500 eventos/9 €** (pago único, idempotente).
- ⛔ **Corte automático**: middleware bloquea `/dashboard` sin `trialing/active`;
  `trial_will_end` avisa por email 3 días antes; impago/cancelación → paywall.
- 🎨 **Dark global**: `/login`, `/registro` (nueva, con `AuthForm` unificado), 4 legales,
  toasts y modal de cookies en estética dark premium. Términos con cuotas/add-ons/tienda.
- 📘 Nuevas **GUIA_DESPLIEGUE.md** (producción desde cero) y **GUIA_ADMIN.md** (manual
  del dueño); README y resto de guías actualizados a los planes nuevos.

## v3.3.0 (2026-09-17) — Trial 7 días + integraciones reales E2E + multipágina coherente

- 💳 **Fin del plan gratis**: prueba de 7 días con tarjeta (Stripe `trial_period_days`).
  Nuevo `/bienvenido` (elige Starter/Pro → Stripe) y webhook que **auto-crea tenant + membresía**.
- 🔌 **Integraciones 100% reales**: Google Business OAuth (importar + publicar respuestas),
  Trustpilot API, WhatsApp Cloud API (alertas ≤3★), Maps (Place ID), API de ingesta para tiendas.
- 🖥️ **Multipágina coherente**: nuevas `/sobre-nosotros` y `/contacto` (formulario funcional)
  con la misma estética dark premium; dashboard y `/admin` rediseñados al mismo nivel.
- 🚫 **Cero ficticios**: eliminados todos los testimonios inventados; nueva sección animada
  «Cómo funciona» con el pipeline real del software.
- 💰 **Precios interactivos**: 2 planes con desplegable de detalle y justificación de valor.
- 🧱 **Límites por plan aplicados**: empresas (1/5), reseñas/mes (50 trial, 200, 2000), paywall
  y gating por `trialing`/`active` (tabla `integrations`, `api_key`, `settings`, `trial_ends_at`).
- 📘 Guías actualizadas (trial, flujo E2E, integraciones) + `migration_3_3_0.sql`.

## v3.2.0 (2026-09-17) — Plataforma comercial premium + blindaje legal UE

- 🎨 Landing dark SaaS (Bento, prueba social, precios, FAQ, Framer Motion).
- 🔐 Login rediseñado + toasts + mejor manejo de errores.
- ⚖️ Legal UE: `/aviso-legal`, `/privacidad`, `/terminos`, `/cookies` + banner granular.
- 🍪 `ThirdPartyScripts` + `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` opcional.
- 🧙 `Wizard.tsx` + toasts + skeletons + API `reviews/publish` + `is_verified`.
- 🧑‍💻 `GUIA_PASOS_MANUALES.md` + logo/favicon + `lib/site.ts`.

## v3.1.0 (2026-09-17) — Multi-host + guías duales

- 🌍 `next.config.js` auto-detecta Vercel / standalone en el resto.
- 🆓 `GUIA_GRATIS.md` + 🌍 `GUIA_GENERAL.md` (sustituyen a GUIA_DESPLIEGUE.md).

## v3.0.1 (2026-09-17) — Cierre comercial

- 🛡️ Panel `/admin` + middleware `SUPERADMIN_EMAILS` + impersonate.
- 💳 Stripe checkout/portal/webhook · 📊 Dashboard IA · 🗄️ Supabase RLS · 🐳 Docker.
