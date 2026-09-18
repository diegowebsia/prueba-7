# 🧑‍💻 GUIA_PASOS_MANUALES — Solo lo que tienes que hacer tú (v3.13.0)

Todo el código está programado, probado y con `npm run build` en verde. Esta guía lista
**únicamente** lo que requiere tus cuentas, tus claves o tus decisiones: rellenar, pegar y clicar.
Nada de programar.

| Bloque | Tiempo | ¿Obligatorio? |
|---|---|---|
| [1. Credenciales y formato del `.env`](#1-credenciales-lista-exacta-y-formato-del-env) | 10 min | ✅ Sí |
| [2. Supabase (BD + Auth)](#2-supabase-base-de-datos-y-auth) | 10 min | ✅ Sí |
| [3. Stripe: planes base + webhook](#3-stripe-planes-base-y-webhook) | 15 min | ✅ Sí |
| [4. OpenAI (respuestas con IA)](#4-openai-respuestas-con-ia--opcional) | 3 min | ⭕ Opcional |
| [5. Stripe: productos Add-on (ampliadores de cuota)](#5-stripe-productos-add-on-ampliadores-de-cuota) | 15 min | ⭕ Recomendado |
| [6. Meta WhatsApp Cloud API](#6-meta-whatsapp-cloud-api-alertas-3-y-post-venta) | 20 min | ⭕ Opcional |
| [7. Google Cloud: Business Profile + Places](#7-google-cloud-business-profile-oauth--places-api) | 20 min | ⭕ Opcional |
| [8. SMTP + DNS del correo](#8-smtp--dns-para-no-caer-en-spam) | 15 min | ⭕ Recomendado |
| [9. Datos fiscales, logo y textos](#9-datos-fiscales-logo-y-textos) | 20 min | ✅ Sí |
| [10. Verificación final y prueba E2E](#10-verificación-final-prueba-e2e) | 15 min | ✅ Sí |
| [11. Troubleshooting de cuotas y cobros](#11-troubleshooting-cuotas-402429-y-cobros) | — | Consulta |
| [12. Automatización v3.13.0 (cron, cola, TripAdvisor, embudo)](#12-automatización-v3130-cron-cola-tripadvisor-y-embudo) | 30 min | ⭕ Recomendado |

> Despliegue (hosting, dominio, Docker, Vercel): [GUIA_GRATIS.md](../GUIA_GRATIS.md) para probar a 0 €
> y [GUIA_DESPLIEGUE.md](../GUIA_DESPLIEGUE.md) para producción.
> Automatización (cron, cola QStash, plantillas HSM, opt-in, embudo): [GUIA_AUTOMATIZACION.md](../GUIA_AUTOMATIZACION.md).
> Operación diaria del dueño: [GUIA_ADMIN.md](../GUIA_ADMIN.md).
> Puesta en venta al público (todo lo que debes aportar tú): [GUIA_COMERCIALIZACION.md](../GUIA_COMERCIALIZACION.md).

---

## 1. Credenciales: lista exacta y formato del `.env`

Copia la plantilla y edita:

```bash
cp .env.example .env
```

### 1.1 Tabla de credenciales (qué es, dónde se consigue, si es obligatoria)

| # | Variable del `.env` | Qué es exactamente | Dónde se consigue | Obligatoria |
|---|---|---|---|---|
| 1 | `NEXT_PUBLIC_APP_URL` | URL pública final **sin** barra al final | Tu dominio / Vercel / `http://localhost:3000` | ✅ |
| 2 | `PORT` | Puerto del servidor Node | — (por defecto `3000`) | ⭕ |
| 2b | `NEXT_PUBLIC_COMPANY_NAME` | Razón social de tu S.L. (sale en footer y legales) | Tu escritura/alta de autónomo | ✅ |
| 2c | `NEXT_PUBLIC_CIF` | CIF/NIF | Tu documentación fiscal | ✅ |
| 2d | `NEXT_PUBLIC_ADDRESS` | Domicilio social completo | Tu domicilio fiscal | ✅ |
| 2e | `NEXT_PUBLIC_LEGAL_EMAIL` | Email legal/RGPD (derechos ARCO, 1 mes) | Buzón que creas en tu dominio (ver §8) | ✅ |
| 2f | `NEXT_PUBLIC_SUPPORT_EMAIL` | Email de soporte visible para clientes | Buzón que creas en tu dominio (ver §8) | ✅ |
| 2g | `NEXT_PUBLIC_DOMAIN` | Tu dominio sin `https://` (sale en footer y legales) | Tu registrador | ✅ |
| 3 | `SUPERADMIN_EMAILS` | Emails con acceso al panel interno (privado, nunca enlazado en la web), separados por comas | Tu email real | ✅ |
| 4 | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Supabase → Project Settings → **API** → Project URL | ✅ |
| 5 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública `anon` (respeta RLS) | Supabase → Project Settings → **API** → `anon` `public` | ✅ |
| 6 | `SUPABASE_SERVICE_ROLE_KEY` | Clave **Service Role** (solo servidor; salta RLS) | Supabase → Project Settings → **API** → `service_role` `secret` | ✅ |
| 7 | `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_test_…` / `sk_live_…`) | Stripe → **Developers → API keys** → Secret key | ✅ |
| 8 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clave publicable (`pk_test_…` / `pk_live_…`) | Stripe → **Developers → API keys** → Publishable key | ⭕ |
| 9 | `STRIPE_WEBHOOK_SECRET` | Secreto del endpoint de webhook (`whsec_…`) | Stripe → **Developers → Webhooks** → tu endpoint → Signing secret | ✅ |
| 10 | `STRIPE_PRICE_PRO` | Price ID del plan **Pro** 29 €/mes | Stripe → **Product catalog** → producto → precio mensual → `price_…` | ✅ |
| 11 | `STRIPE_PRICE_BUSINESS` | Price ID del plan **Business** 79 €/mes | Idem | ✅ |
| 12 | `STRIPE_PRICE_ADDON_REQUESTS` | Price ID de la recarga **+1.000 peticiones** (9 €) | Idem (ver [sección 5](#5-stripe-productos-add-on-ampliadores-de-cuota)) | ⭕ |
| 13 | `STRIPE_PRICE_ADDON_REVIEWS` | Price ID de la recarga **+2.000 opiniones** (12 €) | Idem | ⭕ |
| 14 | `STRIPE_PRICE_ADDON_AI` | Price ID de la recarga **+500 respuestas IA** (15 €) | Idem | ⭕ |
| 15 | `STRIPE_PRICE_ADDON_SYNCS` | Price ID de la recarga **+500 sincronizaciones** (6 €) | Idem | ⭕ |
| 16 | `STRIPE_ADDON_*_PRICE_CENTS` | Importe alternativo en **céntimos** si no defines los Price ID de add-on | Lo decides tú | ⭕ |
| 17 | `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | Credenciales de tu proveedor de correo | Brevo / Postmark / SES / Mailgun / Gmail App Password | ⭕ |
| 18 | `OPENAI_API_KEY` | Clave secreta de OpenAI (`sk-…` o `sk-proj-…`) | [platform.openai.com](https://platform.openai.com/api-keys) → **Create new secret key** | ⭕ |
| 19 | `OPENAI_MODEL` | Modelo de los borradores | — (por defecto `gpt-4o-mini`) | ⭕ |
| 19b | `DATABASE_URL` | Cadena **directa** de PostgreSQL contra el **Connection Pooler** de Supabase (puerto 6543, modo transaction). Da diagnóstico (`/api/admin/db`) y mantenimiento (purga). Sin ella la app funciona igual. | Supabase → Project Settings → **Database** → Connection string → *Connection pooling* | ⭕ |
| 19c | `DATABASE_POOL_MAX` · `DATABASE_IDLE_TIMEOUT_MS` · `DATABASE_CONNECT_TIMEOUT_MS` · `DATABASE_STATEMENT_TIMEOUT_MS` · `DATABASE_SSL` | Ajustes del pool (por defecto `5` · `10000` · `8000` · `8000` · `require`) | En Vercel/serverless: `DATABASE_POOL_MAX=3`; en VPS: `10-20` | ⭕ |
| 19d | `OPENAI_TIMEOUT_MS` · `OPENAI_MAX_ATTEMPTS` · `OPENAI_RPM_PER_TENANT` · `OPENAI_MAX_CONCURRENCY` · `OPENAI_BASE_URL` | Blindaje del cliente de IA (por defecto `20000` · `3` · `20` · `6` · sin proxy) | Ajústalos solo si tu proveedor o tu plan lo exige | ⭕ |
| 20 | `GOOGLE_CLIENT_ID` | Client ID OAuth 2.0 (tipo **Web**) | Google Cloud → APIs & Services → **Credentials** | ⭕ |
| 21 | `GOOGLE_CLIENT_SECRET` | Client secret OAuth 2.0 | Idem | ⭕ |
| 22 | `GOOGLE_PLACES_API_KEY` | Clave de servidor para **Places API (New)** | Google Cloud → Credentials → **Create credentials → API key** | ⭕ |
| 23 | `WHATSAPP_TOKEN` | Token de acceso de la **WhatsApp Cloud API** | Meta for Developers → tu app → WhatsApp → **API Setup** | ⭕ |
| 24 | `WHATSAPP_PHONE_NUMBER_ID` | **Phone Number ID** del número emisor (no es el teléfono) | Idem, apartado «API Setup» | ⭕ |
| 25 | `WHATSAPP_BUSINESS_ACCOUNT_ID` | **WhatsApp Business Account ID** | Meta → Business Settings → Accounts → WhatsApp Accounts | ⭕ |
| 26 | `WHATSAPP_API_VERSION` | Versión de la Graph API | — (por defecto `v21.0`) | ⭕ |
| 27 | `WHATSAPP_VERIFY_TOKEN` | Cadena aleatoria que **tú inventas** para verificar el webhook entrante de Meta (ventana 24 h + bajas STOP) | La inventas tú; la pegas en Meta → WhatsApp → Configuration → Webhook | ⭕ |
| 27b | `WHATSAPP_TEMPLATE_REVIEW_REQUEST` · `WHATSAPP_TEMPLATE_ALERT` · `WHATSAPP_TEMPLATE_LANG` | Nombres EXACTOS de tus plantillas HSM aprobadas + idioma (`es`) | Meta → tu app → WhatsApp → Message Templates (categoría UTILITY) | ⭕ |
| 27c | `WHATSAPP_REQUIRE_OPTIN` | `true` = sin consentimiento registrado no sale WhatsApp al cliente (RGPD) | — (por defecto `true`; `false` solo en migración) | ⭕ |
| 27d | `TRIPADVISOR_PROVIDER` | `serpapi` (defecto) u `outscraper` | Lo eliges tú | ⭕ |
| 27e | `SERPAPI_API_KEY` | Clave de SerpAPI (engine `tripadvisor_review`) | [serpapi.com](https://serpapi.com) → API Key | ⭕ |
| 27f | `OUTSCRAPER_API_KEY` | Clave de Outscraper (task `tripadvisor-reviews`), si lo eliges | [outscraper.com](https://outscraper.com) → API Key | ⭕ |
| 27g | `CRON_SECRET` | Secreto que protege `/api/cron/sync-reviews` (Vercel Cron lo envía solo) | Lo generas tú: `openssl rand -hex 32` | ⭕ |
| 27h | `QSTASH_TOKEN` · `QSTASH_CURRENT_SIGNING_KEY` · `QSTASH_NEXT_SIGNING_KEY` | Cola en segundo plano (entregas, IAs, WhatsApps, syncs). Sin esto, todo funciona en línea | [console.upstash.com](https://console.upstash.com) → QStash | ⭕ |
| 28 | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Dominio de Plausible (analítica sin cookies) | [plausible.io](https://plausible.io) | ⭕ |

> 🔐 Reglas de oro: las claves con `NEXT_PUBLIC_` viajan al navegador (solo URL, `anon` y
> `publishable`); **`SUPABASE_SERVICE_ROLE_KEY` y `STRIPE_SECRET_KEY` jamás** deben exponerse.
> Si sospechas una fuga: Supabase → API → **Reset/rotate** y Stripe → **Roll key**.

### 1.2 Formato exacto del `.env`

```ini
# ---------- App ----------
NEXT_PUBLIC_APP_URL=https://tudominio.com
PORT=3000

# ---------- Datos legales / empresa (salen en footer y legales) ----------
NEXT_PUBLIC_COMPANY_NAME=Mi Empresa S.L.
NEXT_PUBLIC_CIF=B12345678
NEXT_PUBLIC_ADDRESS=Calle Mayor 1, 28001 Madrid, España
NEXT_PUBLIC_LEGAL_EMAIL=legal@tudominio.com
NEXT_PUBLIC_SUPPORT_EMAIL=soporte@tudominio.com
NEXT_PUBLIC_DOMAIN=tudominio.com

# ---------- Super-Admin ----------
SUPERADMIN_EMAILS=tu@email.com,otro@socio.com

# ---------- Supabase ----------
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
# Pooler de Supabase (puerto 6543, modo transaction) — opcional pero recomendado
DATABASE_URL=postgresql://postgres.xyzcompany:TU_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
DATABASE_POOL_MAX=5

# ---------- Stripe ----------
STRIPE_SECRET_KEY=sk_live_51Nx...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51Nx...
STRIPE_WEBHOOK_SECRET=whsec_8f3a...
STRIPE_PRICE_PRO=price_1NxAbC...
STRIPE_PRICE_BUSINESS=price_1NxDeF...
STRIPE_PRICE_ADDON_REQUESTS=price_1NxGhI...
STRIPE_PRICE_ADDON_REVIEWS=price_1NxJkL...
STRIPE_PRICE_ADDON_AI=price_1NxMnO...
STRIPE_PRICE_ADDON_SYNCS=price_1NxPqR...

# ---------- SMTP ----------
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=tu-login-smtp@tudominio.com
SMTP_PASS=xsmtps-...
SMTP_FROM=ReviewFlow AI <no-reply@tudominio.com>

# ---------- OpenAI (opcional) ----------
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_ATTEMPTS=3
OPENAI_RPM_PER_TENANT=20
OPENAI_MAX_CONCURRENCY=6

# ---------- Google (opcional) ----------
GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...
GOOGLE_PLACES_API_KEY=AIzaSy...

# ---------- Meta WhatsApp (opcional) ----------
WHATSAPP_TOKEN=EAAGm0PX4ZCps...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321098765
WHATSAPP_API_VERSION=v21.0
WHATSAPP_VERIFY_TOKEN=una-cadena-aleatoria-larga
# Plantillas HSM aprobadas (obligatorias fuera de la ventana de 24 h)
WHATSAPP_TEMPLATE_REVIEW_REQUEST=solicitud_valoracion
WHATSAPP_TEMPLATE_ALERT=alerta_resena
WHATSAPP_TEMPLATE_LANG=es
# RGPD: sin opt-in registrado no se escribe al cliente
WHATSAPP_REQUIRE_OPTIN=true

# ---------- TripAdvisor (opcional) ----------
TRIPADVISOR_PROVIDER=serpapi
SERPAPI_API_KEY=...
# OUTSCRAPER_API_KEY=...

# ---------- Cron + Cola (opcional, recomendado) ----------
CRON_SECRET=cadena-larga-aleatoria-openssl-rand-hex-32
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=sig_...
QSTASH_NEXT_SIGNING_KEY=sig_...

# ---------- Analítica (opcional) ----------
# NEXT_PUBLIC_PLAUSIBLE_DOMAIN=tudominio.com
```

Reglas de formato: **sin comillas**, **sin espacios** alrededor del `=`, una variable por línea,
`#` para comentarios. Tras cambiar el `.env`, **reinicia** el servidor (en Vercel: redeploy).

### 1.3 Lo que NO va en el `.env`

Se configura **por empresa** desde el panel (`/dashboard` → pestaña *Empresa*), cifrado y aislado
por tenant: API key de **Trustpilot** + Business Unit ID, **Location ID** de TripAdvisor,
**Place ID** de Google Maps, móvil de alertas, tono de la IA, credenciales de
**Shopify / WooCommerce / TPV** y la `api_key` de la API pública de ingesta.
Las URLs públicas del embudo (TripAdvisor/Trustpilot) van en la pestaña *Embudo*.

---

## 2. Supabase (base de datos y Auth)

1. [supabase.com](https://supabase.com) → **New project** (región **UE**, p. ej. `eu-central-1` o
   `eu-west-1`, por RGPD) → guarda la contraseña de la BD.
2. Copia las 3 claves a tu `.env` (sección 1.1, filas 4–6).
3. Ejecuta el esquema:
   - **Proyecto nuevo** → SQL Editor → pega todo `supabase/schema.sql` → **Run**.
   - **Proyecto existente** (vienes de v3.4.0 o anterior) → ejecuta en orden
     `supabase/migration_3_2_0.sql` → `migration_3_3_0.sql` → `migration_3_4_0.sql` →
     `migration_3_5_0.sql` → `migration_3_6_0.sql` → `migration_3_7_0.sql` → `migration_3_8_0.sql` →
     `migration_3_9_0.sql` (modelo 100 % de pago) → `migration_3_10_0.sql` → `migration_3_11_0.sql` → `migration_3_12_0.sql` → **`migration_3_13_0.sql`**
     (3.11: seguridad/rate limits/multipack; 3.12: webhooks observables; puedes re-ejecutar la cadena sin romper datos).
4. **Pool de conexiones (recomendado)**: Project Settings → **Database → Connection string →
   Connection pooling** → copia la URI del **puerto 6543** (Supavisor, modo *transaction*) a
   `DATABASE_URL`. Es lo que permite aguantar picos de tráfico comercial sin agotar las conexiones
   de Postgres; el CRUD sigue yendo por PostgREST. Verifícalo en `GET /api/admin/db`.
5. Auth → **Providers → Email** → activado (confirmación de email a tu gusto: si la desactivas,
   el usuario entra directamente tras registrarse).
5. Auth → **URL Configuration**: `Site URL` = tu `NEXT_PUBLIC_APP_URL` y añade
   `https://tudominio.com/**` a *Redirect URLs*.
6. Verifica que las migraciones 3.9.0 y 3.13.0 dejaron:
   - `tenants.plan` aceptando **solo `pro | business`** (las filas legacy o gratuitas migran
     solas al plan de pago equivalente; sin plan gratuito).
   - `reviews.source` aceptando `tripadvisor` (+ `places`), `integrations.provider` aceptando
     `tripadvisor`, y tablas nuevas `whatsapp_optins`, `whatsapp_contacts`,
     `feedback_responses` (+ columna `job_id` en `ai_interactions`).
   - `tenants.subscription_status` aceptando `trialing | active | past_due | canceled | inactive | paused | none`
     (`inactive` = baja inmediata por webhook; `paused` = Stripe pausó el cobro del día 8).
   - Columnas de recargas: `extra_requests`, `extra_reviews`, `extra_ai`, `extra_syncs`,
     `extra_stored`, `extra_quota_cycle`.
   - Columnas `google_calls` en `usage_counters` y tabla `quota_events` (auditoría de cada consumo).
   - Funciones `public.current_cycle()`, `public.consume_quota(...)`,
     `public.reset_expired_extras()`, **`purge_tenant()`**, **`purge_all_tenants()`** y la vista
     `public.v_quota_overview` (con los topes de BD por plan).
7. **Opcional pero recomendado** — reset mensual automático de los extras caducados y purga
   periódica de la base de datos:
   Database → **Extensions** → activa `pg_cron` → SQL Editor:

   ```sql
   select cron.schedule(
     'reviewflow-reset-extras',
     '5 0 1 * *',
     $$select public.reset_expired_extras()$$
   );
   -- Red de seguridad de la BD (topes de opiniones/auditoría/logs):
   select cron.schedule(
     'reviewflow-purge',
     '15 * * * *',
     $$select public.purge_all_tenants()$$
   );
   ```

   Sin `pg_cron` no pasa nada: la app detecta los extras caducados y purga lo que exceda los
   topes de cada plan en cada lectura de cuota (`checkQuota`).
   (El cron de *sincronizaciones* es aparte: Vercel Cron o pg_cron contra
   `/api/cron/sync-reviews`; ver §12.)

---

## 3. Stripe: planes base y webhook

### 3.1 Crear los dos planes de pago

Stripe Dashboard → **Product catalog → + Add product** (repite para cada plan):

| Plan | Nombre del producto | Precio | Recurrencia | Trial |
|---|---|---|---|---|
| Pro | `ReviewFlow · Pro` | `29` EUR | Mensual (every 1 month) | 7 días |
| Business | `ReviewFlow · Business` | `79` EUR | Mensual (every 1 month) | 7 días |

- **No hay plan gratuito**: los 2 planes pasan por Stripe con prueba de 7 días.
- El **trial de 7 días lo aplica el código** (`trial_period_days: 7` en `/api/stripe/checkout`, con tarjeta obligatoria y pausa si falla el cobro del día 8);
  no hace falta configurarlo en el producto, aunque puedes definirlo también en Stripe.
- Copia el **API ID** de cada precio (`price_…`) → `STRIPE_PRICE_PRO` y `STRIPE_PRICE_BUSINESS`.
- Los Price ID de **test no valen en live**: al pasar a producción, recrea productos y precios y
  actualiza las variables.

### 3.2 Crear el endpoint de webhook

**Developers → Webhooks → + Add endpoint**:

- **URL**: `https://tudominio.com/api/stripe/webhook`
- **Eventos a escuchar** (selecciona exactamente estos):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`
- Copia el **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

En local, para recibir webhooks en tu máquina:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# la CLI imprime el whsec_… temporal: pégalo en tu .env local
```

### 3.3 De test a live (cuando vayas a vender)

1. Completa la activación de la cuenta: empresa, IBAN, identidad (Stripe → **Activate account**).
2. Cambia el interruptor a **Live mode** y repite 3.1 y 3.2 con claves y precios `live`.
3. Facturación: Settings → **Business details / Billing / Tax** (logo, datos fiscales, IVA).

---

## 4. OpenAI (respuestas con IA) · opcional

1. [platform.openai.com](https://platform.openai.com) → crea cuenta → **Billing** (añade saldo:
   cada borrador cuesta fracciones de céntimo con `gpt-4o-mini`).
2. **API keys → Create new secret key** → copia la clave → `OPENAI_API_KEY`.
   · En **Settings → Limits → Monthly budget** pon un tope (p. ej. 10 $): segunda red de seguridad,
     además del presupuesto de tokens que ya aplica cada plan.
   · Deja `OPENAI_MODEL=gpt-4o-mini` (el más económico) y, si quieres afinar, usa
     `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_ATTEMPTS`, `OPENAI_RPM_PER_TENANT` y `OPENAI_MAX_CONCURRENCY`.
3. Restringe el gasto en **Settings → Limits** (budget mensual + alertas por email).
4. **Sin esta clave la app funciona igual**: usa plantillas locales profesionales y el panel lo
   indica. Cada borrador generado (público o mensaje privado conciliador) consume **1 evento**
   del contador `ai` de la cuota.

---

## 5. Stripe: recargas de cuota (pago único)

v3.7.0 simplifica las ampliaciones: **solo hay 4 recargas de pago único** que suman capacidad al
**ciclo en curso**. Se aplican en el instante en que el webhook confirma el cobro.

El cliente puede **marcar varias a la vez** y pagarlas en un solo checkout. El código ya las
gestiona; tú solo creas los productos en Stripe y pegas sus Price ID (opcional).

### 5.1 Catálogo que espera la app

| ID interno | Producto a crear en Stripe | Añade | Importe | Variable del `.env` |
|---|---|---|---|---|
| `extra_requests_1000` | `ReviewFlow · +1.000 peticiones` | 1.000 peticiones (email/WhatsApp) | 9 € | `STRIPE_PRICE_ADDON_REQUESTS` |
| `extra_reviews_2000` | `ReviewFlow · +2.000 opiniones` | 2.000 opiniones + 2.000 plazas de almacenamiento | 12 € | `STRIPE_PRICE_ADDON_REVIEWS` |
| `extra_ai_500` | `ReviewFlow · +500 respuestas IA` | 500 borradores de IA | 15 € | `STRIPE_PRICE_ADDON_AI` |
| `extra_syncs_500` | `ReviewFlow · +500 sincronizaciones` | 500 sincronizaciones automáticas | 6 € | `STRIPE_PRICE_ADDON_SYNCS` |

**Todas son One-off** (pago único). No crees productos recurrentes: el modelo ya no tiene
suscripciones paralelas (menos casos límite y menos sobrecostes).

### 5.2 Paso a paso (repite por producto, ≈3 min cada uno)

1. Stripe Dashboard → **Product catalog → + Add product**.
2. **Name**: el de la tabla 5.1 (p. ej. `ReviewFlow · +1.000 peticiones`).
3. **Description** (opcional, aparece en el Checkout):
   `Amplía la cuota del ciclo actual. Pago único, no renovable; caduca al empezar el mes siguiente.`
4. **Pricing model**: *One-off* (⚠️ NO «Recurring»: se cobraría cada mes).
5. **Price**: el importe de la tabla · **Currency**: `EUR`.
6. **Save product** → copia el **API ID** del precio (`price_1…`). Si no lo ves, activa
   **Developers → Settings → Show test data / API IDs**.
7. Pégalo en la variable correspondiente del `.env` → **reinicia o redespliega**.
8. Comprueba en la pestaña *Sistema* del panel interno: cada recarga debe salir como **listo**.
   Si sale *falta en .env*, la app cobrará igualmente creando la línea con `price_data` inline
   (importe de `lib/plans.ts` o `STRIPE_ADDON_*_PRICE_CENTS`).

### 5.3 Cómo se compran y cómo se aplican

- **Dónde aparece el selector**:
  - Web pública: tabla de precios de la landing (`/#planes`).
  - Panel: `/dashboard?tab=facturacion` → *Ampliar cuota*, con la recarga sugerida según la
    métrica que te bloqueó (`blockedBy`).
- **Endpoints**:
  - `GET /api/stripe/addon?packs=1` → catálogo de recargas + cuota actual.
  - `POST /api/stripe/addon` con selección múltiple:
    `{ tenantId, addons: [ { key: "extra_requests_1000", quantity: 2 } ] }`
    → devuelve la URL de una única sesión `mode: 'payment'` con todos los `line_items`.
  - Legacy de un solo pack: `POST { tenantId, pack, quantity }` o
    `GET /api/stripe/addon?type=extra_requests_1000&tenantId=…` → redirección directa.
- **Al confirmar el pago**, el webhook (`checkout.session.completed`) inserta cada línea en el
  ledger `addons` (idempotente por `stripe_payment_id`) y suma la capacidad a
  `tenants.extra_requests / extra_reviews / extra_ai / extra_syncs`, más
  `extra_stored` (plazas de almacenamiento) en el caso de las opiniones.
  Esas columnas se leen desde `lib/usage.ts` y **caducan solas al cambiar de ciclo**.
- El panel refleja la nueva cuota **inmediatamente** (evento `rf:quota-refresh`, sin recargar).

### 5.4 Prueba rápida de la recarga (modo test)

1. `/dashboard?tab=facturacion` → elige *+1.000 peticiones* → **Comprar**.
2. En el Checkout de test usa la tarjeta `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
3. Al volver a la app, el medidor muestra el extra del ciclo y la barra baja de porcentaje.
   En la pestaña *Cuotas y extras* del panel interno verás la recarga concedida.
4. Si no se aplica: revisa `stripe listen` / el endpoint del webhook y la sección
   [11. Troubleshooting](#11-troubleshooting-cuotas-402429-y-cobros).

---

## 6. Meta WhatsApp Cloud API (alertas ≤3★ y post-venta)

Cada mensaje enviado consume **1 evento** del contador `whatsapp`.

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App** →
   tipo **Business**.
2. Añade el producto **WhatsApp** → **API Setup**.
3. Anota los tres identificadores que ves ahí:
   - **Temporary access token** (dura 24 h; suficiente para probar).
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
   - **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`.
4. Verifica tu número y añade el móvil del negocio como **destinatario de prueba** (en test solo
   puedes escribir a números verificados).
5. **Token permanente para producción** (imprescindible antes de vender):
   Business Settings → **Users → System Users** → crea un usuario *Admin* → **Add assets**
   (tu app de WhatsApp) → **Generate token** con los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management` → cópialo a `WHATSAPP_TOKEN`
   (ese token no caduca).
6. **Destino de las alertas**: en el panel → *Empresa* → pega el móvil del negocio **con prefijo
   internacional y sin `+`** (ej. `34612345678`) → **Guardar** → **Probar envío real**.
7. **Webhook entrante de Meta** (ventana de 24 h + bajas STOP): App Dashboard → WhatsApp →
   **Configuration** → Callback URL `https://tudominio.com/api/integrations/whatsapp/webhook`,
   Verify Token = tu `WHATSAPP_VERIFY_TOKEN`, campo `messages` suscrito. Cada mensaje entrante
   del cliente abre 24 h de texto libre; si escribe STOP/BAJA, su opt-in se revoca solo.
8. **Plantillas HSM** (obligatorias fuera de la ventana de 24 h): crea y envía a aprobación
   `solicitud_valoracion` ({{1}} nombre · {{2}} pedido · {{3}} negocio · {{4}} URL) y
   `alerta_resena` (aviso interno), categoría UTILITY, idioma `es` → variables
   `WHATSAPP_TEMPLATE_*` (textos exactos en [GUIA_AUTOMATIZACION §3](../GUIA_AUTOMATIZACION.md)).
9. **Opt-in RGPD del checkout**: añade el checkbox «Acepto recibir por WhatsApp…» y guarda
   `whatsapp_optin` en el pedido (Shopify note_attributes / Woo meta_data / API `whatsapp_optin`).
   Sin consentimiento registrado (`WHATSAPP_REQUIRE_OPTIN=true`), el WhatsApp post-venta no sale.

---

## 7. Google Cloud: Business Profile (OAuth) + Places API

### 7.1 OAuth de Google Business Profile (importar **y publicar** respuestas)

1. [console.cloud.google.com](https://console.cloud.google.com) → crea un proyecto.
2. **APIs & Services → Library** → habilita **Google My Business API** (si no aparece, solicita
   acceso con la cuenta de Google del negocio) y, opcionalmente, **Places API (New)**.
3. **APIs & Services → OAuth consent screen**: tipo **External**, nombre de la app, tu email,
   scopes básicos (`openid`, `email`, `profile`) → publica en **Production** (o añade tu cuenta
   como *Test user* mientras tanto).
4. **Credentials → Create credentials → OAuth client ID** → tipo **Web application**.
5. **Authorized redirect URI** (debe ser EXACTA, con tu dominio real):

   ```
   https://tudominio.com/api/integrations/google/callback
   ```

6. Copia **Client ID** y **Client Secret** → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` →
   redespliega.
7. En el panel → *Empresa* → **Conectar con Google** → autoriza con la cuenta propietaria de la
   ficha → **Sincronizar reseñas**.
8. Cada sincronización consume 1 unidad de `syncs` (límite por plan: 120 / 720 al mes)
   y cada reseña importada consume **1 evento** de la cuota `reviews`.

### 7.2 Places API (New) — clave de servidor, opcional

Útil cuando no puedes hacer OAuth con la cuenta propietaria de la ficha: lee reseñas públicas por
**Place ID**.

1. **APIs & Services → Library → Places API (New) → Enable**.
2. **Credentials → Create credentials → API key** → copia → `GOOGLE_PLACES_API_KEY`.
3. **Restringe la clave**: *Edit API key* → Application restrictions = **IP addresses** (IP de tu
   servidor) → API restrictions = solo **Places API (New)**.
4. Activa la facturación de Google Cloud y ponte una **alerta de presupuesto** (el uso de esta app
   es bajo: solo se llama al sincronizar).

### 7.3 Place ID para los enlaces «déjanos una reseña» (gratis, sin API)

1. Busca tu negocio en [Google Maps](https://www.google.com/maps) → **Compartir** → el código
   largo tras `/place/`, o usa el [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id) oficial.
2. Panel → *Empresa* → pega el **Place ID** → **Guardar** → aparece el enlace corto para pedir
   reseñas (WhatsApp, tickets, firma de email…).

---

## 8. SMTP + DNS para no caer en spam

1. Crea cuenta en tu proveedor (Brevo, Postmark, SES, Mailgun…) → obtén `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS` → pégalos en el `.env`.
2. Define el remitente `SMTP_FROM=Tu Marca <no-reply@tudominio.com>` (debe ser un dominio tuyo).
3. En el DNS de tu dominio añade los registros del proveedor (en Brevo: **Settings → Senders &
   domains → Domains → Add domain** te da los valores exactos):

   | Tipo | Host | Valor (ejemplo Brevo) | Para qué |
   |---|---|---|---|
   | `TXT` | `@` | `v=spf1 include:spf.sendinblue.com mx ~all` | SPF |
   | `TXT` | `mail._domainkey` | valor DKIM que te da Brevo | Firma DKIM |
   | `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:legal@tudominio.com` | DMARC |
   | `TXT` | `@` | código de verificación del proveedor | Propiedad del dominio |

4. Pulsa **Authenticate** y espera a que los 3 checks estén en verde (minutos u horas).
5. Sin SMTP la app funciona igual: los avisos se registran en `system_logs` y se muestran en
   `/admin → Logs`.

---

## 9. Datos fiscales, logo y textos

### 9.1 Datos fiscales por variables de entorno (única fuente de verdad)

Desde v3.9.0 los datos fiscales **no se editan en código**: se configuran con las 6 variables
`NEXT_PUBLIC_*` (ver §1.1, filas 2b–2g) y `lib/site.ts` las sirve al footer y a las páginas
legales (`/aviso-legal`, `/privacidad`, `/terminos`, `/cookies`).

| Variable | Qué poner | Ejemplo |
|---|---|---|
| `NEXT_PUBLIC_COMPANY_NAME` | Razón social | `Mi Empresa S.L.` |
| `NEXT_PUBLIC_CIF` | CIF/NIF | `B12345678` |
| `NEXT_PUBLIC_ADDRESS` | Domicilio social completo | `Calle Mayor 1, 28001 Madrid, España` |
| `NEXT_PUBLIC_LEGAL_EMAIL` | Email legal/RGPD | `legal@tudominio.com` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Email de soporte (visible para clientes) | `soporte@tudominio.com` |
| `NEXT_PUBLIC_DOMAIN` | Tu dominio | `tudominio.com` |

> El formulario `/contacto` envía a tu `SMTP_FROM` (ver §8): usa una dirección que leas.
> Solo si cambias el **nombre comercial** (`ReviewFlow AI`) edita `brand` en `lib/site.ts`.

- [ ] Sin `[corchetes]` pendientes en footer ni legales → redespliega y comprueba en el navegador.
- [ ] Textos legales revisados por tu asesoría si lo necesitas (son plantillas, no asesoramiento jurídico).
- [ ] Email legal operativo: los derechos RGPD se responden en **1 mes**.

### 9.2 Marca

- [ ] Sustituye `public/logo.svg` y `public/favicon.svg` (mismo nombre = cero código).
- [ ] Opcional: `public/apple-touch-icon.png` (180×180) y `public/og-image.png` (1200×630).

### 9.3 Contenido comercial honesto

La web **no** incluye testimonios inventados (prohibido por la Dir. (UE) 2019/2161 «Ómnibus»).

- [ ] Cuando tengas clientes reales: pide permiso escrito para nombre/logo y añádelos.
- [ ] Si cambias los 29 €/79 € o los importes de las recargas (9/12/15/6 €), actualízalos **a la vez** en
      Stripe y en `lib/plans.ts` (`/terminos` ya lee precios y límites del código automáticamente).

---

## 10. Verificación final (prueba E2E)

1. **Build limpio**:

   ```bash
   npm install
   npm run typecheck   # 0 errores
   npm run build       # ✓ Compiled successfully
   npm run start       # o `npm run dev`
   ```

2. `GET /api/health?mode=ready` con Bearer `HEALTHCHECK_SECRET` → configuración y base de datos en `true`.
   Con sesión super-admin, consulta el detalle del pool en `GET /api/admin/db`.
   Atajo: `npm run verify` lo revisa todo, incluida la firma del webhook de Stripe.
3. Panel interno (`/admin`, privado) → **sin** banner de modo demo; pestaña *Sistema* con todas
   las integraciones en «listo», incluidos los Price ID de Pro/Business y las 4 recargas.
4. **Flujo de alta (Pro/Business, único que existe)**: registro → `/bienvenido` → solo 2 planes,
   ambos con 7 días de prueba → elige Pro → Checkout con `4242 4242 4242 4242` → vuelta a
   la app → empresa **auto-creada** y estado `trialing`. El alta sin tarjeta ya no existe
   (`POST /api/tenants/start` responde 402).
5. **Flujo de reseñas**: conecta Google o pega un Place ID → **Sincronizar** → reseñas reales en
   la bandeja → *Generar respuesta con IA* → editar → **Publicar**.
6. **Flujo de triaje**: fuerza una reseña de ≤3★ → aparece en la cola privada con análisis de la
   reclamación, mensaje conciliador privado y nota interna; si configuraste WhatsApp, llega la
   alerta al móvil.
7. **Flujo de embudo**: abre `/valorar/TU-SLUG` → vota 5★ (botones públicos + clic medido) y
   2★ con mensaje (ticket privado en pestaña *Embudo* + email/WhatsApp al dueño).
8. **Flujo de cuota**: observa el medidor de `/dashboard` (y la pestaña *Cuotas y extras* del
   panel interno). Al llegar al 100 % las APIs responden `429` con cabecera `Retry-After` y el
   panel ofrece la recarga sugerida; al comprarla, la capacidad sube al instante.
8. **Corte del día 8**: cancela la suscripción en Stripe (o deja fallar el cobro) → el webhook la
   marca `inactive` / `past_due` **al instante** → el middleware redirige a
   `/bienvenido?reason=trial-ended` (o `past-due`), el panel queda inaccesible y las APIs
   `/api/ai`, `/api/reviews` y `/api/integrations` responden **402**, sin perder datos.
9. Seguridad: dominio + HTTPS, `NEXT_PUBLIC_APP_URL` final, contraseñas robustas y **2FA** en
   GitHub, Supabase, Stripe, Google Cloud, Meta y tu host.

---

## 11. Troubleshooting (cuotas, 402/429 y cobros)

| Síntoma | Causa habitual | Solución |
|---|---|---|
| `429 Too Many Requests` al sincronizar o generar IA | Cuota del ciclo agotada | Compra un add-on (`/dashboard?tab=facturacion`) o espera al siguiente ciclo. La respuesta incluye `Retry-After` y `X-RateLimit-*`. |
| `402 Payment Required` | Sin suscripción activa o prueba de 7 días caducada | Contrata/reactiva un plan de pago en `/bienvenido` (Pro o Business, ambos con 7 días de prueba). |
| `403 Forbidden` en una integración | La integración no pertenece a tu plan (p. ej. la tienda requiere Business) | Revisa el plan en *Facturación* y la tabla de features de `lib/plans.ts`; si aplica, sube de plan. |
| `507 Insufficient Storage` | La empresa alcanzó el tope de opiniones, conexiones o almacenamiento de su plan | Es la protección de la BD: compra la recarga de opiniones, desconecta una integración o sube de plan. La purga de lo más antiguo es automática. |
| La recarga se cobra pero no sube la cuota | Webhook no llega o `STRIPE_WEBHOOK_SECRET` incorrecto | Revisa Stripe → Webhooks → intentos (error de firma = 400). En local usa `stripe listen --forward-to`. |
| «Se han archivado opiniones» | El plan llegó a su tope de filas (`reviewsStored`) y la purga borró las más antiguas | Es el comportamiento documentado en `GUIA_ADMIN.md` §3: ofrece recarga de opiniones o plan superior. |
| La capacidad sube el doble tras reintentar | — (no debería ocurrir) | Idempotencia por `stripe_payment_id`; si ves duplicados, revisa que ejecutaste `migration_3_7_0.sql`. |
| Los extras desaparecen el día 1 | Comportamiento correcto: las recargas valen solo para el ciclo en curso | `reset_expired_extras()` (pg_cron) o `checkQuota()` los pone a 0 al cambiar de ciclo. |
| `/dashboard` redirige a `/bienvenido?reason=trial-ended` el día 8 | Primer cobro fallido o trial terminado | Stripe → suscripción → *Retry payment* o el cliente contrata de nuevo. Los datos se conservan 30 días. |
| El panel interno muestra «Modo demo» | `SUPERADMIN_EMAILS` vacío o sin la Service Role key | Añade tu email exacto (minúsculas) + `SUPABASE_SERVICE_ROLE_KEY` y vuelve a entrar con esa cuenta. |
| Google OAuth devuelve `redirect_uri_mismatch` | URI autorizada distinta de la real | Pon EXACTAMENTE `https://tudominio.com/api/integrations/google/callback` y redespliega. |
| WhatsApp no envía en pruebas | Número destino no verificado o token caducado (24 h) | Verifica el móvil destinatario en Meta y genera un token permanente de System User. |
| La IA responde con plantilla en vez de OpenAI | `OPENAI_API_KEY` ausente/inválida o sin saldo | `/api/health` te lo dice; añade saldo y la clave. Comprueba `ai_interactions.ok = false`. |
| El cliente ve `429 token_budget_exhausted` | Agotó el presupuesto de tokens de su plan | Ofrécele la recarga `+500 respuestas IA` (15 €) o sube de plan; se reinicia el día 1. |
| Se agotan las conexiones de Postgres | `DATABASE_URL` apunta al host directo, no al pooler | Usa la cadena del puerto **6543** (Supavisor, transaction) y ajusta `DATABASE_POOL_MAX`. |
| Webhook con `400 Firma inválida` | `whsec_…` de otro endpoint o de otro modo | `GET /api/stripe/webhook` muestra el modo y las pistas, y `npm run verify` valida la firma. |
| Cron `/api/cron/sync-reviews` → 401/503 | Falta `CRON_SECRET` en el hosting | Créalo (Vercel lo envía solo); prueba con `curl -H "Authorization: Bearer …"`. |
| WhatsApp: plantilla error `131047/132000` | Plantilla no aprobada o nombre distinto al `.env` | Revisa el nombre EXACTO e idioma en Meta → Message Templates y espera la aprobación. |
| Pedido entregado `skipped: 'no-optin'` | El checkout no envió `whatsapp_optin: true` | Añade el checkbox al checkout (§6.9) o registra el opt-in manual desde el panel. |
| `/valorar/slug` → 404 | Embudo desactivado o suscripción sin acceso | Actívalo en pestaña *Embudo*; el enlace exige suscripción usable (sin free-riding). |
| IA async siempre `pending` | Worker/cola sin firmar o BD sin `job_id` | Ejecuta `migration_3_10_0.sql`; revisa signing keys de QStash y `/admin → Logs`. |

---

## 12. Automatización v3.13.0 (cron, cola, TripAdvisor y embudo)

Todo funciona sin esto (en línea/manual), pero para vender con volumen configúralo.
Detalle completo en [GUIA_AUTOMATIZACION.md](../GUIA_AUTOMATIZACION.md); aquí solo tu checklist:

- [ ] **TripAdvisor**: cuenta SerpAPI u Outscraper → `TRIPADVISOR_PROVIDER` + API key → cada
  empresa pega su Location ID (`dXXXXXX`) en el panel → *Empresa* → Sincronizar.
- [ ] **Cron de syncs**: genera `CRON_SECRET` (`openssl rand -hex 32`) → pégalo en el hosting
  (Vercel Cron lo envía solo gracias a `vercel.json`; fuera de Vercel usa pg_cron, snippet en
  `migration_3_10_0.sql` §8) → prueba con `curl -H "Authorization: Bearer …"` → `enqueued > 0`.
- [ ] **Cola QStash**: cuenta en Upstash → `QSTASH_TOKEN` + 2 signing keys → a partir de ahí,
  entregas, IAs async, WhatsApps y syncs van en segundo plano con reintentos.
- [ ] **Plantillas HSM + webhook entrante + opt-in**: §6 pasos 7–9 de esta guía.
- [ ] **Embudo**: pestaña *Embudo* → copia `/valorar/TU-SLUG` (QR, ticket, web) → pega tus URLs
  públicas de TripAdvisor/Trustpilot (Google sale del Place ID) → prueba 5★ y 2★.

🎉 Hecho: altas de pago con trial, cobros, cuotas, recargas, empresas e integraciones funcionan solos; el panel interno sirve para supervisarlos. Para vender al público, completa [GUIA_COMERCIALIZACION.md](../GUIA_COMERCIALIZACION.md).
