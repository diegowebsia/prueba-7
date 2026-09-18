# 🚀 GUIA_DESPLIEGUE.md — ReviewFlow AI v3.10.0

Despliegue en **producción comercial desde cero**, paso a paso, en el host que elijas.
Al final tendrás `https://tudominio.com` cobrando con Stripe en modo live.
Tiempo estimado: **~40 minutos**.

> ¿Solo quieres probar gratis antes? Empieza por **[GUIA_GRATIS.md](./GUIA_GRATIS.md)** (0 €)
> y vuelve aquí cuando vayas a comercializar. Los pasos manuales a tu cargo están en
> **[docs/GUIA_PASOS_MANUALES.md](./docs/GUIA_PASOS_MANUALES.md)**, todo lo que debes aportar
> para vender al público en **[GUIA_COMERCIALIZACION.md](./GUIA_COMERCIALIZACION.md)** y la
> automatización (cron, cola, plantillas, embudo) en **[GUIA_AUTOMATIZACION.md](./GUIA_AUTOMATIZACION.md)**.

---

## 0. Lo que necesitas (checklist)

| # | Qué | Dónde | Coste aprox. |
|---|---|---|---|
| 1 | Dominio (`.com`/`.es`) | DonDominio, Cloudflare, Ionos… | ~12 €/año |
| 2 | Cuenta Supabase | supabase.com | Gratis (Pro ~25 $/mes recomendado) |
| 3 | Cuenta Stripe (+ empresa/autónomo) | stripe.com | Gratis + comisión por cobro |
| 4 | Hosting (VPS o PaaS) | Hetzner, Vercel Pro, Coolify, Render, Railway… | 5–25 €/mes |
| 5 | SMTP para emails | Brevo (gratis 300/día), Postmark, SES | 0 € para empezar |
| 6 | OpenAI (opcional, recomendado) | platform.openai.com | Céntimos/mes (`gpt-4o-mini`) |
| 7 | WhatsApp Business (opcional) | Meta for Developers | Gratis (conversaciones según país) |
| 8 | Google Cloud (opcional) | console.cloud.google.com | Gratis (OAuth) · Places por uso |
| 9 | TripAdvisor (opcional) | serpapi.com u outscraper.com | Según plan del proveedor |

---

## 1. Dominio + DNS (15 min)

1. Compra el dominio en cualquier registrador.
2. Apunta el dominio a tu hosting:
   - **Vercel/Render/Railway/Coolify/Fly:** sigue su pantalla «Add domain» y pega los registros que te den (normalmente `A` o `CNAME`).
   - **VPS:** crea un registro `A` → IP del servidor, para `@` y para `www`.
3. Espera a que resuelva (`nslookup tudominio.com`) y activa el SSL:
   - PaaS: automático. VPS: Caddy o Nginx + Certbot (el `docker-compose` expone el puerto 3000; pon un reverse-proxy delante con HTTPS).

> ⚠️ Sin HTTPS no funcionarán bien los webhooks de Stripe/Shopify ni el OAuth de Google.

---

## 2. Supabase: base de datos + auth (20 min)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región **West EU / Frankfurt** si tus clientes son españoles).
2. **SQL Editor** → pega el contenido de `supabase/schema.sql` → **Run**. (Si ya tenías datos de una versión anterior, ejecuta en orden `migration_3_4_0.sql` → `migration_3_5_0.sql` → `migration_3_6_0.sql` → `migration_3_7_0.sql` → `migration_3_8_0.sql` → `migration_3_9_0.sql` → **`migration_3_10_0.sql`** — la última añade TripAdvisor, opt-ins, embudo y `job_id` de IA async.)
3. **Authentication → Providers → Email**: activado (magic link desactivado, contraseña activada).
4. **Authentication → URL Configuration** → Site URL = `https://tudominio.com` (+ añade la URL a Redirect URLs).
5. **Project Settings → API**: copia `URL`, `anon public` y `service_role` → irán al `.env` del paso 6.
6. **Connection Pooler (recomendado)**: **Settings → Database → Connection string → Connection pooling** → copia la cadena del **puerto 6543** (Supavisor, modo *transaction*) como `DATABASE_URL`. Es la conexión que aguanta los picos de tráfico comercial (diagnóstico, mantenimiento y analítica; el CRUD sigue por PostgREST con RLS). Compruébalo en `GET /api/health?db=1` (`mode: "transaction"`, latencia en ms).

---

## 3. Stripe: productos, precios y webhook (25 min)

1. Activa tu cuenta (empresa/autónomo + IBAN) y pasa a **Live mode**.
2. **Product catalog** → crea dos productos mensuales (**sin plan gratuito**):
   - `Solo Reseñas` → 29 €/mes → copia su **Price ID** (`price_…`) → `STRIPE_PRICE_PRO`.
   - `Completo E-commerce` → 79 €/mes → copia su **Price ID** → `STRIPE_PRICE_BUSINESS`.
   - Activa **Smart Retries + email de impago** (Settings → Billing → Revenue recovery) y los
     **emails de prueba que termina** para el trial de 7 días (lo aplica el código).
3. **Recargas de pago único** (opcional pero recomendado): +1.000 peticiones 9 €,
   +2.000 opiniones 12 €, +500 respuestas IA 15 €, +500 sincronizaciones 6 € →
   `STRIPE_PRICE_ADDON_{REQUESTS,REVIEWS,AI,SYNCS}`. Si las dejas vacías, el checkout
   usa los importes de `lib/plans.ts` (`price_data` inline).
4. **Developers → API keys** → copia la `Secret key` **live** (`sk_live_…`). La `Publishable key` no se usa (el checkout es server-side).
5. **Developers → Webhooks** → **Add endpoint**:
   - URL: `https://tudominio.com/api/stripe/webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_succeeded`.
   - Copia el **Signing secret** (`whsec_…`).
6. Prueba con una tarjeta live real pequeña o con un cupón del 100 % el primer mes; verifica en `/admin` que el tenant pasa a `trialing` y luego a `active`.

Variables resultantes: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` (+ `STRIPE_PRICE_ADDON_{REQUESTS,REVIEWS,AI,SYNCS}` si usas Price IDs para las recargas).

---

## 4. Emails SMTP (10 min)

1. Crea cuenta en [Brevo](https://www.brevo.com) (gratis, 300 emails/día) → **SMTP & API** → crea una clave SMTP.
2. Añade y verifica tu dominio (registros SPF/DKIM que te indican) para no caer en spam.
3. Variables: `SMTP_HOST` (`smtp-relay.brevo.com`), `SMTP_PORT` (`587`), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (`ReviewFlow AI <no-reply@tudominio.com>`).

## 4b. IA con `gpt-4o-mini` (4 min, opcional pero recomendado)

1. [platform.openai.com](https://platform.openai.com) → **API keys → Create new secret key** → `OPENAI_API_KEY`.
2. **Settings → Limits → Monthly budget**: pon un tope (p. ej. 10 $). Es tu red de seguridad externa.
3. `OPENAI_MODEL=gpt-4o-mini` (por defecto). Ajustes finos opcionales en `.env.example`:
   `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_ATTEMPTS`, `OPENAI_RPM_PER_TENANT`, `OPENAI_MAX_CONCURRENCY`.
4. **El coste ya está acotado por diseño**: cada plan tiene un presupuesto de tokens
   (Pro 250.000 · Business 1.200.000 al mes). Al agotarlo, la API responde
   `429 token_budget_exhausted` hasta el día 1 o hasta que el cliente compre la recarga de IA.
   A 0,15 $/1M de entrada y 0,60 $/1M de salida, un borrador cuesta ~0,0001 $.
5. ¿Sin clave? La app funciona igual: usa plantilla local y heurísticas (fallback). Nunca se cae.

---

## 5. Google + WhatsApp + TripAdvisor (opcional, 30 min)

- **Google Business Profile:** en [Google Cloud Console](https://console.cloud.google.com) crea un proyecto → habilita *Business Profile APIs* → credenciales OAuth (tipo Web) con redirect `https://tudominio.com/api/integrations/google/callback` → `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Publica el consent screen en **Production**.
- **WhatsApp Cloud API:** en [Meta for Developers](https://developers.facebook.com) crea una app → añade producto WhatsApp → número de teléfono + token permanente (System User) → `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`. Crea las **plantillas HSM** («solicitud de valoración») y el webhook entrante (ventana 24 h + bajas STOP): detalle en [GUIA_AUTOMATIZACION.md](./GUIA_AUTOMATIZACION.md) §3.
- **TripAdvisor:** elige SerpAPI u Outscraper → `TRIPADVISOR_PROVIDER` + `SERPAPI_API_KEY` / `OUTSCRAPER_API_KEY`. Cada empresa pega su Location ID en el panel.
- **Trustpilot / Place ID de Maps / tienda:** no van en el `.env`; cada cliente los conecta desde su panel.

---

## 6. Variables de entorno (10 min)

1. Copia la plantilla: `cp .env.example .env` (o pega cada variable en el panel de tu hosting: Vercel → Settings → Environment Variables, etc.).
2. Rellena **todas**: `NEXT_PUBLIC_APP_URL=https://tudominio.com`, `SUPERADMIN_EMAILS=tu@email.com`, las **6 legales/empresa** (`NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_CIF`, `NEXT_PUBLIC_ADDRESS`, `NEXT_PUBLIC_LEGAL_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_DOMAIN` — salen en el footer y en las páginas legales), las 3 de Supabase (+ `DATABASE_URL` del pooler), las de Stripe (precios **live** + secretos **live**), las 5 de SMTP y las opcionales que uses (OpenAI, Google, WhatsApp, TripAdvisor).
3. Automatización (opcional pero recomendada): `CRON_SECRET` (cron horario de syncs) + `QSTASH_TOKEN` y signing keys (cola en segundo plano). Sin ellas, todo funciona en línea/manual. Detalle en [GUIA_AUTOMATIZACION.md](./GUIA_AUTOMATIZACION.md).
4. ⚠️ Nunca subas el `.env` a Git ni lo pegues en chats. Rota cualquier clave que se exponga.

---

## 7. Despliegue según hosting

### Opción A · Vercel (el más fácil, ~10 min)

1. Sube el repo a GitHub → **vercel.com → Add New → Project** → Import.
2. Pega las variables del paso 6 → **Deploy** → env vars → **Redeploy**.
3. **Settings → Domains** → añade `tudominio.com` (+ `www`) y sigue su DNS.
4. El `vercel.json` del repo ya programa el **cron horario** de sincronizaciones; crea `CRON_SECRET` en Environment Variables para activarlo.
5. ⚠️ **Uso comercial = plan Pro de Vercel** (~20 $/mes): el plan Hobby prohíbe vender. Si prefieres no pagar a Vercel, usa la opción B.

### Opción B · VPS con Docker (Hetzner/Contabo ~5 €/mes, 30 min)

```bash
# En el servidor (Ubuntu 22.04+)
apt update && apt install -y docker.io docker-compose-plugin git
git clone https://github.com/TU-USUARIO/TU-REPO.git reviewflow && cd reviewflow
cp .env.example .env && nano .env   # pega tus claves
docker compose up -d --build
curl http://localhost:3000/api/health  # → {"ok":true,...}
# → delante, Caddy/Nginx con HTTPS a tudominio.com
```

Ejemplo mínimo de Caddy (`/etc/caddy/Caddyfile`):

```
tudominio.com {
    reverse_proxy 127.0.0.1:3000
}
```

### Opción C · Coolify

[coolify.io](https://coolify.io) → **New Resource → From GitHub** → env vars → **Deploy** → dominio (HTTPS auto).

### Opción D · Render / Railway / Fly.io

- [render.com](https://render.com): **New → Web Service** (usa el `Dockerfile`) → env vars → Deploy.
- [railway.com](https://railway.com): **New Project → Deploy from Repo** → env vars → Deploy.
- [fly.io](https://fly.io): `fly launch` → `fly secrets set …` → `fly deploy`.

### Opción E · Node.js puro

```bash
npm install && npm run build && npm run start   # $PORT, ideal con pm2
```

---

## 8. Verificación post-despliegue (15 min) ✅

Marca cada punto antes de vender:

- [ ] Comprobación automática: `npm run verify -- --url https://tudominio.com` (health · IA · pool Postgres · precios Stripe · firma del webhook · rutas de IA sin sesión → 401).
- [ ] `https://tudominio.com` carga y `/api/health?verbose=1` responde `{"ok":true,"version":"3.10.0",...}`.
- [ ] `/registro` crea una cuenta y `/bienvenido` muestra los dos planes.
- [ ] Checkout Stripe live abre el trial de 7 días (tarjeta).
- [ ] Tras pagar, el webhook crea el tenant: visible en `/admin` (entra con tu email de `SUPERADMIN_EMAILS`).
- [ ] `/dashboard` muestra la empresa, el consumo del ciclo, los topes de BD del plan y el selector de recargas (`?tab=facturacion`).
- [ ] Conexión Google (OAuth) importa reseñas; WhatsApp de prueba llega al móvil.
- [ ] Email de contacto (`/contacto`) llega a tu bandeja (revisa spam la primera vez).
- [ ] Embudo: `/valorar/TU-SLUG` muestra la encuesta; 4-5★ redirige a plataformas, 1-3★ crea ticket + aviso.
- [ ] Cancelar la suscripción en Stripe → el acceso al dashboard se corta (paywall en `/bienvenido`).

---

## 9. Problemas típicos

| Síntoma | Causa probable | Solución |
|---|---|---|
| `/dashboard` redirige siempre a `/bienvenido` | Webhook no llega / `STRIPE_WEBHOOK_SECRET` mal | Revisa el endpoint en Stripe → Recent events; compara el `whsec_…` |
| `forbidden` en `/admin` | Email fuera de `SUPERADMIN_EMAILS` | Añade tu email exacto y vuelve a entrar |
| Empresa no se crea tras pagar | Webhook mal configurado | Revisa el endpoint + firma; mira Logs en `/admin` |
| OAuth Google: `redirect_uri_mismatch` | Falta la URI exacta | Añade `https://tudominio.com/api/integrations/google/callback` tal cual en Google Cloud |
| No llegan emails | SMTP o SPF/DKIM | Prueba `/contacto`; revisa logs del hosting y la verificación del dominio en Brevo |
| Supabase «pausado» | Plan gratis inactivo 1 semana | Dashboard → Resume (en producción usa Pro) |
| Webhook tienda 401 | Secreto distinto | El `webhookSecret` guardado en el panel debe ser el mismo que configuraste en Shopify/Woo |
| Error `507` al importar opiniones | Tope de filas/almacenamiento del plan | Recarga de opiniones o plan superior |
| `429 token_budget_exhausted` | Cliente agotó el presupuesto de IA | Recarga `+500 respuestas IA` o plan superior |
| Respuestas de IA «genéricas» | Sin `OPENAI_API_KEY` o sin saldo | La app usó el fallback local; revisa `ai_interactions` (`ok = false`) |
| Conexiones agotadas en Postgres | Sin pooler | Usa el Connection Pooler (puerto 6543) en `DATABASE_URL` y ajusta `DATABASE_POOL_MAX` |
| Cron `/api/cron/sync-reviews` → 401/503 | Falta `CRON_SECRET` | Créalo en el hosting (Vercel lo envía solo); prueba con `curl -H "Authorization: Bearer …"` |
| Actualizar versión | — | `git pull` + migraciones SQL nuevas + `docker compose up -d --build` (o Redeploy) |

¿Todo verde? Pasa a **[GUIA_ADMIN.md](./GUIA_ADMIN.md)** para operar tu negocio día a día y a **[GUIA_AUTOMATIZACION.md](./GUIA_AUTOMATIZACION.md)** para activar cron, cola, plantillas y embudo. 🎉
