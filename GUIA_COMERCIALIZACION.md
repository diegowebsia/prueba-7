# 💰 GUIA_COMERCIALIZACION — Todo lo que TIENES QUE PONER TÚ para vender al público (v3.12.0)

El código está 100 % programado: planes de pago con prueba de 7 días, cobros, cuotas,
panel, integraciones y textos legales base. **Esta guía lista, bloque por bloque, todo lo
que solo tú puedes aportar**: tus datos, tus cuentas, tus claves, tus decisiones y tus
contratos. Nada de programar: rellenar, pegar, clicar y firmar.

> Cómo usarla: avanza por bloques en orden, marca cada casilla y no abras el registro
> público hasta completar el [Bloque 13 (checklist go-live)](#13-checklist-final-antes-de-abrir-el-registro).
> Tiempo total estimado: **1–2 tardes** (+ plazos de terceros: Stripe, Google, Meta).

| Bloque | Qué pones tú | Tiempo | ¿Obligatorio? |
|---|---|---|---|
| [0. Decisiones comerciales](#0-decisiones-comerciales-antes-de-tocar-nada) | Precios, marca, forma jurídica | 30 min | ✅ Sí |
| [1. Datos de tu empresa (S.L.)](#1-datos-de-tu-empresa-sl--autónomo) | Razón social, CIF, domicilio, emails, dominio | 10 min | ✅ Sí |
| [2. Dominio + DNS + HTTPS](#2-dominio--dns--https) | Dominio propio y registros DNS | 30 min | ✅ Sí |
| [3. Supabase en producción](#3-supabase-en-producción-base-de-datos-y-auth) | Proyecto UE, SQL, backups, Auth | 20 min | ✅ Sí |
| [4. Stripe en LIVE](#4-stripe-en-live-cobrar-de-verdad) | Cuenta activada, productos, webhook, fiscalidad | 45 min | ✅ Sí |
| [5. Emails (SMTP + buzones)](#5-emails-smtp--buzones-que-debes-crear) | Proveedor SMTP + 3 buzones + SPF/DKIM/DMARC | 30 min | ✅ Sí |
| [6. Marca y contenidos](#6-marca-y-contenidos) | Logo, favicon, textos, testimonios reales | 30 min | ✅ Sí |
| [7. OpenAI en producción](#7-openai-en-producción-ia-real) | Clave, facturación y topes de gasto | 10 min | ⭕ Recomendado |
| [8. Google en producción](#8-google-en-producción-oauth--places) | OAuth verificado + Places con facturación | 30 min | ⭕ Recomendado |
| [9. WhatsApp en producción](#9-whatsapp-en-producción-meta) | Empresa verificada, token permanente, plantillas | 45 min | ⭕ Recomendado |
| [10. Legal RGPD + consumo](#10-legal-rgpd--consumo-revisión-con-asesoría) | Abogado, RAT, contratos con encargados, facturas | 1–2 h | ✅ Sí |
| [11. Seguridad](#11-seguridad-de-tus-cuentas-y-claves) | 2FA, superadmin, rotación, backups | 20 min | ✅ Sí |
| [12. Soporte y operación](#12-soporte-y-operación-del-día-a-día) | Canal de soporte, SLA, plantillas, monitorización | 30 min | ✅ Sí |
| [13. Checklist go-live](#13-checklist-final-antes-de-abrir-el-registro) | Verificación E2E en test + humo en live | 45 min | ✅ Sí |
| [14. Día del lanzamiento](#14-día-del-lanzamiento-y-primera-semana) | Apertura, anuncio, guardia | — | ✅ Sí |
| [Anexo A](#anexo-a-tabla-maestra-qué-pongo-y-dónde-exactamente) | Tabla maestra: cada dato → dónde va exactamente | — | Consulta |
| [Anexo B](#anexo-b-costes-reales-estimados) | Costes mensuales estimados | — | Consulta |

Guías relacionadas: credenciales paso a paso en
[docs/GUIA_PASOS_MANUALES.md](./docs/GUIA_PASOS_MANUALES.md), despliegue técnico en
[GUIA_DESPLIEGUE.md](./GUIA_DESPLIEGUE.md), automatización en
[GUIA_AUTOMATIZACION.md](./GUIA_AUTOMATIZACION.md), operación diaria en
[GUIA_ADMIN.md](./GUIA_ADMIN.md) y prueba a 0 € en [GUIA_GRATIS.md](./GUIA_GRATIS.md).

---

## 0. Decisiones comerciales (antes de tocar nada)

Decide y anota. Todo lo demás cuelga de aquí.

- [ ] **Precios finales**: Pro **29 €/mes** y Business **79 €/mes** (los que trae el código), ¿los mantienes o los cambias?
  Si los cambias, actualízalos **a la vez** en 3 sitios: productos de Stripe, `lib/plans.ts`
  (`price` + `priceCents`) y textos comerciales. Recargas: 9 / 12 / 15 / 6 € (mismo criterio).
- [ ] **Prueba gratis**: 7 días con tarjeta (la aplica el código con `trial_period_days: 7`).
  ¿La mantienes? Es tu principal argumento de venta.
- [ ] **Nombre comercial**: ¿`ReviewFlow AI` u otro? Si lo cambias, afecta a `lib/site.ts`
  (`brand`), `SMTP_FROM`, productos de Stripe, OAuth de Google y textos legales.
- [ ] **Forma jurídica**: ¿S.L. o autónomo? La necesitas para activar Stripe, emitir facturas y
  rellenar el Bloque 1. Los textos legales hablan de «sociedad»; si eres autónomo, pide a tu
  asesoría que adapte 2–3 frases (ver Bloque 10).
- [ ] **Idioma y mercado inicial**: la app está en español (España/UE). Si vendes fuera de la UE,
  revisa impuestos de Stripe (IVAOSS) y transferencias RGPD con tu asesoría.

---

## 1. Datos de tu empresa (S.L. / autónomo)

**Dónde van**: variables de entorno (lee [lib/site.ts](./lib/site.ts), única fuente de verdad).
Aparecen automáticamente en el footer y en `/aviso-legal`, `/privacidad`, `/terminos` y `/cookies`.
En local van en tu `.env`; en producción, en las *Environment Variables* de tu hosting.

| # | Variable | Qué poner exactamente | Ejemplo |
|---|---|---|---|
| 1 | `NEXT_PUBLIC_COMPANY_NAME` | Razón social completa (o nombre + apellidos + «autónomo») | `Mi Empresa S.L.` |
| 2 | `NEXT_PUBLIC_CIF` | CIF/NIF | `B12345678` |
| 3 | `NEXT_PUBLIC_ADDRESS` | Domicilio social completo (calle, nº, CP, ciudad, país) | `Calle Mayor 1, 28001 Madrid, España` |
| 4 | `NEXT_PUBLIC_LEGAL_EMAIL` | Email legal/RGPD (recibe derechos ARCO; respuesta en **1 mes**) | `legal@tudominio.com` |
| 5 | `NEXT_PUBLIC_SUPPORT_EMAIL` | Email de soporte (lo ven los clientes en footer, ayuda y términos) | `soporte@tudominio.com` |
| 6 | `NEXT_PUBLIC_DOMAIN` | Tu dominio, sin `https://` ni barra final | `tudominio.com` |

- [ ] Las 6 variables rellenas (sin `[corchetes]`) en local **y** en producción → redespliega.
- [ ] Comprueba en el navegador: footer + las 4 páginas legales muestran tus datos reales.
- [ ] Los 2 emails **existen y los lees** (ver Bloque 5: crea los buzones antes de publicar).

---

## 2. Dominio + DNS + HTTPS

- [ ] **Compra tu dominio** (`.com`/`.es`, ~12 €/año): DonDominio, Cloudflare, Ionos…
- [ ] **Apunta el DNS a tu hosting**:
  - Vercel/Render/Railway: sigue su pantalla *Add domain* (`A` o `CNAME` según te pidan).
  - VPS: registro `A` → IP del servidor, para `@` y para `www`.
- [ ] **HTTPS activo**: en PaaS es automático; en VPS pon Caddy/Nginx + Certbot delante del puerto 3000.
  Sin HTTPS **no funcionan** los webhooks de Stripe/tienda ni el OAuth de Google.
- [ ] `NEXT_PUBLIC_APP_URL=https://tudominio.com` (sin barra final) en producción → redespliega.
- [ ] Registros de **email** (SPF/DKIM/DMARC): los detalla el [Bloque 5](#5-emails-smtp--buzones-que-debes-crear).

---

## 3. Supabase en producción (base de datos y Auth)

- [ ] Proyecto en [supabase.com](https://supabase.com), región **UE** (p. ej. Frankfurt `eu-central-1`):
  obligatorio moral con clientes europeos (RGPD).
- [ ] Plan: el Free se **pausa tras 1 semana sin uso**. Para vender, usa **Pro (~25 $/mes)** con
  backups diarios (Settings → Database → Backups). Anota la contraseña de la BD en tu gestor.
- [ ] Ejecuta el SQL: proyecto nuevo → todo `supabase/schema.sql`; proyecto existente → migraciones
  en orden hasta **`supabase/migration_3_9_0.sql`** (incluida: es la que deja solo planes de pago
  y los estados `inactive`/`paused`).
- [ ] Copia las 3 claves a producción: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (esta última **jamás** en el navegador ni en Git).
- [ ] Auth → Providers → **Email activado** (decide: ¿confirmación de email sí o no? Sin ella, el
  usuario entra directo tras registrarse).
- [ ] Auth → URL Configuration: `Site URL = https://tudominio.com` y añade
  `https://tudominio.com/**` a *Redirect URLs*.
- [ ] **Connection Pooler**: Database → Connection pooling → cadena del puerto **6543**
  (Supavisor, modo *transaction*) → `DATABASE_URL`. Aguanta picos sin agotar Postgres.
- [ ] Opcional recomendado: activa `pg_cron` y programa `reset_expired_extras()` (día 1) y
  `purge_all_tenants()` (cada hora). SQL listo en [GUIA_PASOS_MANUALES §2](./docs/GUIA_PASOS_MANUALES.md#2-supabase-base-de-datos-y-auth).

---

## 4. Stripe en LIVE (cobrar de verdad)

Todo el dinero pasa por aquí. Hazlo con calma y en modo **Live**.

### 4.1 Activa la cuenta
- [ ] Stripe → **Activate account**: datos de tu empresa/autónomo, IBAN, documento de identidad.
- [ ] Settings → **Business details**: nombre fiscal, CIF, dirección, email de facturación, logo.
- [ ] Settings → **Billing/Tax**: configura IVA (si vendes en España/UE, activa Stripe Tax o define
  tus tipos; consúltalo con tu asesoría).
- [ ] Interrumptor a **Live mode**. ⚠️ Los productos, precios y webhook de **test no sirven en live**:
  hay que recrearlos.

### 4.2 Crea los productos y precios (mensuales, EUR)
- [ ] Product catalog → **+ Add product** → `ReviewFlow · Pro` → **29 €** → Recurring / every 1 month → copia el `price_…` → `STRIPE_PRICE_PRO`.
- [ ] Idem → `ReviewFlow · Business` → **79 €** → `STRIPE_PRICE_BUSINESS`.
- [ ] Recargas (pago único, opcionales pero recomendadas; si las omites, el checkout usa los
  importes del código automáticamente):

  | Producto | Importe | Variable |
  |---|---|---|
  | `ReviewFlow · +1.000 peticiones` | 9 € | `STRIPE_PRICE_ADDON_REQUESTS` |
  | `ReviewFlow · +2.000 opiniones` | 12 € | `STRIPE_PRICE_ADDON_REVIEWS` |
  | `ReviewFlow · +500 respuestas IA` | 15 € | `STRIPE_PRICE_ADDON_AI` |
  | `ReviewFlow · +500 sincronizaciones` | 6 € | `STRIPE_PRICE_ADDON_SYNCS` |

  ⚠️ Deben ser **One-off** (pago único), NO *Recurring*.
- [ ] Developers → API keys (live) → `Secret key` (`sk_live_…`) → `STRIPE_SECRET_KEY` y
  `Publishable key` (`pk_live_…`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- [ ] La **prueba de 7 días la aplica el código** (`trial_period_days: 7` + tarjeta obligatoria +
  pausa si falla el cobro del día 8). No configures trial en el producto (o déjalo coherente).

### 4.3 Crea el webhook (sin esto nadie recibe lo que paga)
- [ ] Developers → Webhooks → **+ Add endpoint** → URL exacta:
  `https://tudominio.com/api/stripe/webhook`
- [ ] Marca **exactamente** estos eventos (los que procesa `app/api/stripe/webhook/route.ts`):

  | Evento | Qué hace tu app al recibirlo |
  |---|---|
  | `checkout.session.completed` | Crea/activa la empresa (trial 7 días) o aplica la recarga comprada |
  | `customer.subscription.created` / `.updated` | Aplica plan y estado (`trialing`/`active`/`past_due`/`paused`) |
  | `customer.subscription.deleted` | **Corte inmediato**: marca `inactive` |
  | `customer.subscription.trial_will_end` | Email «tu prueba termina en 3 días» |
  | `invoice.payment_succeeded` / `invoice.paid` | Confirma cobro, refresca estado y aplica recargas |
  | `invoice.payment_failed` | **Corte inmediato**: marca `past_due` |

- [ ] Copia el **Signing secret** (`whsec_…`, cada endpoint/modo tiene el suyo) → `STRIPE_WEBHOOK_SECRET`.
- [ ] Guarda y haz *Send test event* → debe responder **200**.

### 4.4 Facturación y disputas (lo que te pedirá un cliente enfadado)
- [ ] Decide tu política de **reembolsos** (p. ej. «prueba gratis + reembolso el primer mes si no
  conectas ninguna fuente») y déjala por escrito en `/terminos` si cambias la plantilla.
- [ ] Facturas: Stripe las emite con tus Business details; verifica que llevan tu CIF y dirección.
- [ ] Disputas: responde en **< 24 h** desde Stripe (evidencia: logs de `/admin`, emails, uso).
  Plantilla de respuesta en [GUIA_ADMIN §9](./GUIA_ADMIN.md).

---

## 5. Emails (SMTP + buzones que debes crear)

El formulario `/contacto` **envía a tu `SMTP_FROM`**, y la app usa SMTP para avisos de prueba,
recargas y alertas. Sin SMTP, los mensajes solo quedan en logs internos (no los ve el cliente).

- [ ] Elige proveedor: **Brevo** (300/día gratis), Postmark, Amazon SES o Mailgun. Crea cuenta.
- [ ] Genera credenciales SMTP → `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- [ ] **Crea estos 3 buzones/alias en tu dominio** (en tu proveedor de correo, no en la app):

  | Buzón | Para qué lo usa la app | Variable relacionada |
  |---|---|---|
  | `no-reply@tudominio.com` | Remitente de todos los emails automáticos | `SMTP_FROM=Tu Marca <no-reply@tudominio.com>` |
  | `soporte@tudominio.com` | Lo ven los clientes (footer, ayuda, términos) | `NEXT_PUBLIC_SUPPORT_EMAIL` |
  | `legal@tudominio.com` | Derechos RGPD (responder en 1 mes) + DMARC | `NEXT_PUBLIC_LEGAL_EMAIL` |

- [ ] **Autentica el dominio** en tu proveedor SMTP (te da los valores exactos) con estos 3 registros
  DNS, o caerás en spam:

  | Tipo | Host | Valor (ejemplo) | Para qué |
  |---|---|---|---|
  | `TXT` | `@` | `v=spf1 include:spf.sendinblue.com mx ~all` | SPF |
  | `TXT` | `mail._domainkey` | valor DKIM de tu proveedor | Firma DKIM |
  | `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:legal@tudominio.com` | DMARC |

- [ ] Pulsa *Authenticate/Verify* hasta los 3 checks en verde, y envíate una prueba desde `/contacto`
  (revisa spam la primera vez).

---

## 6. Marca y contenidos

- [ ] **Logo y favicon**: sustituye `public/logo.svg` y `public/favicon.svg` por los tuyos
  (mismo nombre = cero código). Opcional: `public/apple-touch-icon.png` (180×180) y
  `public/og-image.png` (1200×630) para compartir en redes.
- [ ] **Revisa los textos comerciales** de la landing (`components/Landing.tsx`): promesas,
  cifras de cuotas y precios deben coincidir con `lib/plans.ts` y con Stripe.
- [ ] **Testimonios**: la web no trae ninguno inventado (prohibido por la Dir. (UE) 2019/2161).
  Solo publica opiniones de clientes reales **con permiso escrito** (nombre/logo).
- [ ] **Sobre nosotros** (`/sobre-nosotros`) y **contacto** (`/contacto`): adapta el texto a tu
  historia real y comprueba que el formulario llega a tu buzón.
- [ ] **Materiales del embudo**: genera el QR de tu `/valorar/TU-SLUG` (mostrador, tickets,
  packaging) y pega tus URLs públicas de TripAdvisor/Trustpilot en la pestaña *Embudo*.

---

## 7. OpenAI en producción (IA real)

Sin clave, la app responde con plantillas locales (funciona, pero no es «IA»). Para vender
«Respuestas con IA», configúralo:

- [ ] Cuenta en [platform.openai.com](https://platform.openai.com) → **Billing** → añade método de
  pago y saldo (un borrador con `gpt-4o-mini` cuesta ~0,0001 $).
- [ ] API keys → **Create new secret key** → `OPENAI_API_KEY`. Deja `OPENAI_MODEL=gpt-4o-mini`.
- [ ] **Settings → Limits**: pon **Monthly budget** (p. ej. 10–20 $) + alertas por email.
  Segunda red de seguridad además del presupuesto de tokens de cada plan.
- [ ] Opcional: ajusta `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_ATTEMPTS`, `OPENAI_RPM_PER_TENANT`,
  `OPENAI_MAX_CONCURRENCY` solo si tu plan de OpenAI lo exige.

---

## 8. Google en producción (OAuth + Places)

### 8.1 OAuth Google Business Profile (importar y PUBLICAR respuestas)
- [ ] Proyecto en [console.cloud.google.com](https://console.cloud.google.com) → habilita
  **Google My Business API** (si no aparece, solicítala con la cuenta del negocio).
- [ ] **OAuth consent screen** → tipo **External** → nombre de tu app, tu email, scopes
  `openid/email/profile` → **publícala en Production**. ⚠️ En modo *Testing* solo entran
  100 usuarios de prueba y el token caduca: **para vender debe estar en Production**.
  Si Google exige **verificación de la app**, iníciala cuanto antes (tarda días/semanas).
- [ ] **Credentials → OAuth client ID (Web)** → **Authorized redirect URI** EXACTA:
  `https://tudominio.com/api/integrations/google/callback`
- [ ] Copia Client ID + Secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` → redespliega.
- [ ] Prueba con una cuenta propietaria de una ficha real: conectar → sincronizar → publicar.

### 8.2 Places API (opcional, por Place ID sin OAuth)
- [ ] Habilita **Places API (New)** → crea **API key** → `GOOGLE_PLACES_API_KEY`.
- [ ] **Restringe la clave**: solo tu IP de servidor + solo Places API (New).
- [ ] Activa facturación de Google Cloud y crea una **alerta de presupuesto** (el uso es bajo:
  solo se llama al sincronizar).

---

## 9. WhatsApp en producción (Meta)

En pruebas solo puedes escribir a números verificados y el token dura 24 h. Para vender:

- [ ] App en [developers.facebook.com](https://developers.facebook.com) (tipo Business) +
  producto **WhatsApp** → anota `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_BUSINESS_ACCOUNT_ID`.
- [ ] **Verifica tu empresa** en Meta Business Settings (documentación fiscal) y registra el
  **display name** (el nombre que verán tus clientes).
- [ ] **Token permanente**: Business Settings → Users → **System Users** → usuario Admin →
  Add assets (tu app) → Generate token (`whatsapp_business_messaging` +
  `whatsapp_business_management`) → `WHATSAPP_TOKEN`. Este no caduca.
- [ ] **Plantillas HSM**: crea y envía a aprobación `solicitud_valoracion`
  ({{1}} nombre · {{2}} pedido · {{3}} negocio · {{4}} URL) y `alerta_resena` (aviso interno),
  categoría *Utility*, idioma `es`. Sin plantillas aprobadas no puedes escribir proactivamente
  a clientes en producción (fuera de la ventana de 24 h Meta rechaza el texto libre).
- [ ] **Webhook entrante + opt-in RGPD**: configura el Callback URL
  (`/api/integrations/whatsapp/webhook`, campo `messages`) para abrir ventanas de 24 h y
  procesar bajas STOP, y añade el checkbox «Acepto recibir por WhatsApp…» al checkout de tu
  tienda (guarda `whatsapp_optin`). Sin consentimiento registrado no sale el post-venta.
- [ ] Conecta tu número real (o un número dedicado) y haz un envío de prueba desde el panel
  (*Empresa* → móvil con prefijo internacional sin `+`, p. ej. `34612345678`).
- [ ] Avisa en tu checkout a los clientes finales de que recibirán la solicitud de valoración y
  respeta las bajas («STOP»): viene exigido en tus propios `/terminos`.

---

## 10. Legal RGPD + consumo (revisión con asesoría)

Los textos de `/aviso-legal`, `/privacidad`, `/terminos` y `/cookies` son **plantillas bien
estructuradas, no asesoramiento jurídico**. Antes de vender:

- [ ] **Revisión por abogado/asesoría** (1–2 h): adapta forma jurídica (S.L./autónomo), política
  de reembolsos, desistimiento y soporte real que ofreces.
- [ ] **Registro de Actividades de Tratamiento (RAT)**: documenta qué datos tratas (cuenta,
  empresas, reseñas públicas, facturación vía Stripe, logs) con finalidad y base jurídica.
  El contenido base está en `/privacidad` §2–§3.
- [ ] **Contratos art. 28 RGPD con tus encargados**: Supabase, Stripe, proveedor SMTP, OpenAI,
  hosting. Todos ofrecen DPA estándar: acéptalos/fírmalos en sus paneles y archívalos.
- [ ] **Transferencias fuera del EEE**: si algún encargado trata datos fuera de la UE (p. ej.
  OpenAI/EE. UU.), ampara con cláusulas contractuales tipo (las incluyen sus DPA).
- [ ] **Cookies**: el banner granular ya bloquea analítica sin consentimiento. Si activas
  Plausible u otra analítica, configúrala sin cookies (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`) y
  refleja cualquier cambio en `/cookies`.
- [ ] **Consumo**: verifica desistimiento 14 días, enlace ODR
  (`ec.europa.eu/consumers/odr`, ya incluido en términos) y que los precios muestran impuestos
  en el checkout de Stripe.
- [ ] **Facturas**: Stripe debe emitirlas con tu CIF/dirección (Bloque 4.4). Conserva
  contabilidad 6 años (mercantil/fiscal).
- [ ] **Buzón RGPD operativo**: `legal@tudominio.com` responde derechos en **1 mes** (Bloque 5).

---

## 11. Seguridad de tus cuentas y claves

- [ ] **2FA activado** en: GitHub, Supabase, Stripe, Google Cloud, Meta, OpenAI, hosting,
  registrador del dominio y proveedor SMTP.
- [ ] `SUPERADMIN_EMAILS` con tu email real (minúsculas). El panel `/admin` es privado:
  memorízalo, no lo enlaces en ningún sitio público.
- [ ] `.env` real **nunca** en Git ni en chats (ya está en `.gitignore`). Claves solo en el
  hosting (*Environment Variables* / secrets).
- [ ] Plan de rotación: si una clave se expone → rota en el proveedor (Supabase *Reset*,
  Stripe *Roll key*, Meta/OpenAI *revoke*) → actualiza hosting → redespliega.
- [ ] Backups: Supabase Pro (diarios) + exporta tu código (Git) y anota dónde recuperar cada
  pieza (Anexo A). Prueba restaurar una vez.

---

## 12. Soporte y operación del día a día

- [ ] **Canal de soporte**: email (`soporte@`) como mínimo; decide horario y **SLA público**
  (p. ej. «24 h laborables», que es lo que promete `/contacto`). El plan Business promete
  soporte **prioritario**: define qué significa (p. ej. «mismo día laborable»).
- [ ] **Plantillas de respuesta** (guárdalas en tu gestor): bienvenida, prueba por caducar
  (día 4), impago (día 1 y día 7), disputa Stripe, «he perdido opiniones» (purga del tope),
  baja/cancelación. Base en [GUIA_ADMIN §7–§9](./GUIA_ADMIN.md).
- [ ] **Rutina semanal (30 min)**: `/admin` → Suscripciones (trials por caducar, `past_due`),
  Empresas nuevas (bienvenida personal), Logs (errores/webhooks en rojo). Detalle en
  [GUIA_ADMIN §7](./GUIA_ADMIN.md).
- [ ] **Monitorización**: activa alertas de tu hosting (caídas) + revisa `GET /api/admin/db`
  (latencia BD) y Stripe → Webhooks (entregas en verde). Opcional: UptimeRobot/BetterStack
  gratuitos contra `/api/health`. Si usas cron+cola, vigila `/admin → Logs` (`cron.sync`,
  `queue.*`) y el dashboard de Upstash.
- [ ] **Precios de coste vigilados**: OpenAI (budget), Google Places (alerta), WhatsApp
  (conversaciones por país), Supabase (uso). Los topes por plan ya acotan el riesgo.

---

## 13. Checklist final antes de abrir el registro

Hazlo en este orden. **No abras el registro público con ninguna casilla en rojo.**

### A. Automático (5 min)
- [ ] `npm run typecheck` → 0 errores · `npm run build` → ✓ Compiled successfully.
- [ ] `npm run verify -- --url https://tudominio.com` → todo verde (health, IA, pool PG,
  precios Stripe, firma del webhook válida→2xx / falsa→400, rutas de IA sin sesión→401).
- [ ] `GET /api/health?mode=ready` con Bearer `HEALTHCHECK_SECRET` → `configuration` y `database` en `true`.
- [ ] `GET /api/stripe/webhook` (super-admin) → modo `live`, eventos y precios detectados.
- [ ] `/admin` sin banner de demo; pestaña *Sistema* con planes, recargas e integraciones en «listo».

### B. End-to-end en Stripe TEST (30 min, con `4242…` y `4000 0000 0000 0341`)
- [ ] Registro → `/bienvenido` → **solo 2 planes** (Pro/Business), ambos con 7 días de prueba.
- [ ] Alta Pro con trial → empresa auto-creada, estado `trialing`, acceso al panel.
- [ ] Conectar Google o pegar Place ID → sincronizar → generar borrador IA → publicar.
- [ ] Forzar reseña ≤3★ → cola privada (análisis + mensaje conciliador + nota) y alerta WhatsApp.
- [ ] Agotar una cuota → `429` + `Retry-After` → comprar recarga → capacidad inmediata.
- [ ] Impago (`…0341`) → `past_due` → corte del panel + APIs `402` → reintento OK → acceso de vuelta.
- [ ] Cancelación → `inactive` → corte → datos intactos 30 días → re-alta restaura el plan.
- [ ] Día-8: trial sin pago → `/bienvenido?reason=trial-ended` y `402 trial_expired` en APIs.
- [ ] Portal de Stripe: cambio Pro↔Business, cambio de tarjeta, facturas descargables.

### C. Humo en LIVE (10 min, dinero real mínimo)
- [ ] Repite B.1–B.2 con una tarjeta real (o cupón 100 % un mes): alta → `trialing` → panel.
- [ ] Compra la recarga más barata y verifica que suma capacidad al instante (y su factura).
- [ ] Cancela esa suscripción de prueba y comprueba el corte (`inactive`) y el re-alta.
- [ ] Revisa `/admin → Logs`: sin errores en `stripe.webhook`, `ai.*` ni `reviews.*`.

### D. Contenido y legal visibles
- [ ] Footer + 4 legales con tus datos reales (sin `[corchetes]`), logo/favicon propios.
- [ ] Precios de la landing = precios de Stripe = `lib/plans.ts` (29/79 € y 9/12/15/6 €).
- [ ] `/contacto` envía y llega a tu bandeja (mira spam la primera vez).
- [ ] Textos revisados por asesoría (Bloque 10) y buzones `legal@`/`soporte@` operativos.

---

## 14. Día del lanzamiento y primera semana

- [ ] **Apertura**: anuncia a tus primeros 5–10 clientes (email/WhatsApp personal, no masivo).
- [ ] **Guardia**: revisa `/admin → Logs` y Stripe → Webhooks varias veces al día la primera semana.
- [ ] **Bienvenida personal** a cada alta (convierte muchísimo los primeros 100 clientes).
- [ ] **Día 4 de cada trial**: email «tu prueba termina en 3 días» (además del automático).
- [ ] **Recoge feedback** y pide permiso escrito para tus 2–3 primeros testimonios/logo.
- [ ] **No toques precios ni planes** la primera semana salvo error grave (y si lo haces,
  actualiza Stripe + `lib/plans.ts` + textos a la vez).

---

## Anexo A. Tabla maestra: qué pongo y dónde exactamente

Cada cosa que tienes que aportar, con su destino exacto. Úsala como índice.

| Lo que pones tú | Dónde se consigue | Dónde se pega/configura |
|---|---|---|
| Razón social, CIF, domicilio | Tu escritura/alta de autónomo | `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_CIF`, `NEXT_PUBLIC_ADDRESS` |
| Emails legal y soporte | Tu proveedor de correo (crea los buzones) | `NEXT_PUBLIC_LEGAL_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL` |
| Dominio | Registrador (DonDominio, Cloudflare…) | DNS + `NEXT_PUBLIC_DOMAIN` + `NEXT_PUBLIC_APP_URL` |
| Claves Supabase (URL, anon, service_role) | Supabase → Project Settings → API | Variables homónimas del `.env`/hosting |
| Esquema SQL | Este repo (`supabase/`) | Supabase → SQL Editor → Run |
| `DATABASE_URL` (pooler 6543) | Supabase → Database → Connection pooling | Variable `DATABASE_URL` |
| Email super-admin | El tuyo | `SUPERADMIN_EMAILS` |
| Cuenta Stripe activada + IBAN | stripe.com → Activate account | Panel de Stripe (Live mode) |
| `sk_live_…` + `pk_live_…` | Stripe → Developers → API keys | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Precios Pro 29 € y Business 79 € | Stripe → Product catalog | `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` |
| Precios recargas 9/12/15/6 € (opc.) | Stripe → Product catalog (One-off) | `STRIPE_PRICE_ADDON_{REQUESTS,REVIEWS,AI,SYNCS}` |
| `whsec_…` del webhook | Stripe → Developers → Webhooks | `STRIPE_WEBHOOK_SECRET` |
| Datos fiscales + IVA en Stripe | Tu asesoría | Stripe → Settings → Business/Tax |
| SMTP (host, user, pass) | Brevo/Postmark/SES/Mailgun | `SMTP_HOST/PORT/USER/PASS/FROM` |
| Registros SPF/DKIM/DMARC | Los da tu proveedor SMTP | DNS de tu dominio |
| Logo, favicon, og-image | Tu diseñador/Canva | `public/logo.svg`, `public/favicon.svg`, `public/og-image.png` |
| Textos (landing, nosotros) | Tú | `components/Landing.tsx`, `app/sobre-nosotros/` |
| `OPENAI_API_KEY` + budget | platform.openai.com | `OPENAI_API_KEY` + Limits del panel OpenAI |
| OAuth Google (client + secret) | Google Cloud Console | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Consent screen en Production | Google Cloud Console | Panel de Google (verificación si la exigen) |
| `GOOGLE_PLACES_API_KEY` (opc.) | Google Cloud Console | Variable homónima (+ restricción IP/API) |
| WhatsApp IDs + token permanente | Meta for Developers + Business Settings | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` |
| Plantillas WhatsApp aprobadas | Meta → WhatsApp Manager | Panel de Meta + `WHATSAPP_TEMPLATE_*` |
| Webhook entrante + opt-in checkout | Meta → Configuration + tu tienda | `WHATSAPP_VERIFY_TOKEN` + `whatsapp_optin` en el pedido |
| TripAdvisor (SerpAPI/Outscraper) | serpapi.com / outscraper.com | `TRIPADVISOR_PROVIDER` + API key (+ Location ID por empresa) |
| Cron + cola | Tú (secreto) + console.upstash.com | `CRON_SECRET` + `QSTASH_*` (opcionales; sin ellos, manual/en línea) |
| Verificación empresa Meta | Meta Business Settings | Panel de Meta (documentación fiscal) |
| Revisión legal + RAT + DPAs | Tu abogado/asesoría | Archiva contratos; ajusta `/terminos` si cambia algo |
| 2FA en todas las cuentas | Cada proveedor | Cada proveedor |
| Canal + SLA de soporte | Tu decisión | Web (footer/ayuda) + tu bandeja |
| Plantillas de email | Tú (+ base en GUIA_ADMIN) | Tu gestor de correo/docs |

---

## Anexo B. Costes reales estimados

| Concepto | Coste típico | Notas |
|---|---|---|
| Dominio | ~12 €/año | `.com`/`.es` |
| Hosting | 0–25 €/mes | VPS ~5 € · Vercel Pro ~20 $ (el Hobby **prohíbe** vender) |
| Supabase | 0–25 $/mes | **Pro recomendado** en producción (sin pausas + backups) |
| Stripe | ~1,5 % + 0,25 € por cobro | Sin fijo; Pro 29 € → ~0,69 € comisión |
| SMTP | 0–9 €/mes | Brevo gratis hasta 300/día |
| OpenAI | céntimos–pocos €/mes | ~0,0001 $/borrador + budget que tú topas |
| Google Places | ~0 € | Solo al sincronizar; con alerta de presupuesto |
| WhatsApp | por conversación/país | Consulta precios Meta por tu país |
| SerpAPI (TripAdvisor, opc.) | ~50–150 $/mes | Según volumen; alternativa Outscraper por tarea |
| QStash (cola, opc.) | 0–10 $/mes | Plan gratis generoso; sin ella, todo en línea |
| **Total orientativo** | **~15–60 €/mes** (hasta ~200 € con TripAdvisor) | Con 2–3 clientes Pro ya cubierto |

¡A vender! 🚀 Si algo falla en producción, el orden de diagnóstico es:
`/admin → Logs` → `GET /api/health?mode=ready` → Stripe → Webhooks → esta guía (Bloque 13).
