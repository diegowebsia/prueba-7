# ⚙️ GUIA_AUTOMATIZACION — Cron, colas, plantillas WhatsApp, opt-in y Embudo (v3.10.0)

Todo lo automático de ReviewFlow AI: qué hace solo el código y qué debes configurar tú
(claves, plantillas, checkbox del checkout). Sin estos pasos, la plataforma funciona igual
pero en modo manual/en línea.

> Variables: copia los bloques de abajo a tu `.env` (ver `.env.example` §8–8c).
> Ejecuta `supabase/migration_3_10_0.sql` en una BD existente (proyecto nuevo: `schema.sql`).

---

## 1. TripAdvisor (SerpAPI u Outscraper)

TripAdvisor no tiene API pública: se lee a través de un intermediario.

1. Elige proveedor y crea cuenta:
   - **SerpAPI** (recomendado): [serpapi.com](https://serpapi.com) → API Key (plan con
     engine `tripadvisor_review`; ~50–150 $/mes según volumen).
   - **Outscraper**: [outscraper.com](https://outscraper.com) → API Key (pago por tarea).
2. En tu `.env`:
   ```bash
   TRIPADVISOR_PROVIDER=serpapi      # u 'outscraper'
   SERPAPI_API_KEY=...
   # OUTSCRAPER_API_KEY=...
   ```
3. Cada empresa pega su **Location ID** en el panel → Empresa → TripAdvisor (el código
   `dXXXXXX` de la URL de su ficha, p. ej. `...-d1234567-...`).
4. Comprueba en `/api/health`: `"tripadvisor": true`.

## 2. Sincronización automática (Cron)

El cron decide **qué** sincronizar y encola un trabajo por (empresa, proveedor);
el worker los ejecuta con reintentos. Cadencia: **Business cada hora, Pro cada 6 h**.

**Opción A · Vercel Cron (recomendado si despliegas en Vercel)**

1. Crea `CRON_SECRET` en Vercel → Settings → Environment Variables (genera con
   `openssl rand -hex 32`). Vercel lo envía solo como `Authorization: Bearer …`.
2. El `vercel.json` del repo ya programa `/api/cron/sync-reviews` cada hora (minuto 7).
   No toca nada más.
3. Prueba manual: `curl -H "Authorization: Bearer TU_CRON_SECRET" https://tudominio.com/api/cron/sync-reviews`
   → `{ ok, tenants, enqueued, skipped }`.

**Opción B · Supabase Cron (cualquier hosting)**

Ejecuta el bloque §8 de `supabase/migration_3_10_0.sql` (pg_cron + pg_net) cambiando
tu dominio y tu `CRON_SECRET`. Vigílalo con `select * from cron.job_run_details`.

**Sin cron**: el botón «Sincronizar» del panel sigue funcionando (manual).

## 3. Plantillas de WhatsApp (HSM, obligatorias fuera de 24 h)

Meta solo permite texto libre dentro de las **24 h** tras el último mensaje del cliente.
Fuera de la ventana, el código cambia solo a plantilla aprobada.

1. En [developers.facebook.com](https://developers.facebook.com) → tu app → WhatsApp →
   **Message Templates** → crea (categoría `UTILITY`, idioma `Español`):
   - `solicitud_valoracion` — cuerpo:
     > Hola {{1}} 🎉, tu pedido {{2}} de {{3}} ha sido entregado. ¿Nos ayudas con tu
     > valoración (30 segundos)? {{4}}
   - `alerta_resena` — cuerpo (aviso interno al dueño):
     > 🎫 Ticket {{1}} en {{2}}: {{3}}
2. Espera la aprobación de Meta (minutos/horas) y configura:
   ```bash
   WHATSAPP_TEMPLATE_REVIEW_REQUEST=solicitud_valoracion
   WHATSAPP_TEMPLATE_ALERT=alerta_resena
   WHATSAPP_TEMPLATE_LANG=es
   ```
3. Webhook entrante (abre la ventana de 24 h y procesa bajas STOP): en tu app →
   WhatsApp → Configuration → Webhook → URL `https://tudominio.com/api/integrations/whatsapp/webhook`,
   Verify Token = tu `WHATSAPP_VERIFY_TOKEN`, campo `messages`.

## 4. Cola en segundo plano (Upstash QStash)

1. Crea cuenta en [console.upstash.com](https://console.upstash.com) → **QStash** →
   copia `QSTASH_TOKEN` y las dos signing keys:
   ```bash
   QSTASH_TOKEN=...
   QSTASH_CURRENT_SIGNING_KEY=sig_...
   QSTASH_NEXT_SIGNING_KEY=sig_...
   ```
2. Sin más pasos: entregas, alertas, syncs del cron, IAs async y avisos al dueño se
   procesan en el worker (`/api/queue/worker`) con reintentos y caudal limitado
   (IA ≤30/min por empresa; syncs de 3 en 3).
3. **Sin QStash no pasa nada**: todo se ejecuta en línea con el mismo resultado
   (`/api/health` → `queue.provider: 'inline'`).

## 5. Opt-in RGPD del checkout (obligatorio para escribir al cliente)

Con `WHATSAPP_REQUIRE_OPTIN=true` (por defecto) **no sale ningún WhatsApp al cliente**
sin consentimiento registrado. Añade este checkbox al checkout:

> ☐ Acepto recibir por WhatsApp el seguimiento de mi pedido y una solicitud de
> valoración (podré darme de baja respondiendo STOP).

- **Shopify**: guarda el checkbox en `note_attributes` con nombre `whatsapp_optin`
  (Settings → Checkout → Additional scripts o app de atributos). El webhook lo lee solo.
- **WooCommerce**: guarda `whatsapp_optin` en los `meta_data` del pedido (snippet o
  plugin de checkout fields). El webhook lo lee solo.
- **API genérica**: envía `whatsapp_optin: true` + `optin_text: "…texto aceptado…"`
  a `/api/integrations/store/order-delivered`.
- El cliente se da de baja respondiendo **STOP**/**BAJA** (revoca solo) o desde tu
  panel (`/api/integrations/whatsapp/optin`, action `revoke`).

## 6. Embudo Privado de Satisfacción (`/valorar/[slug]`)

1. Activo por defecto. Tu enlace: `https://tudominio.com/valorar/TU-SLUG` (pestaña
   **Embudo** → copiar). Compártelo en QR de mostrador, ticket o web.
2. En la pestaña **Embudo** pega tus URLs públicas de **TripAdvisor** y **Trustpilot**
   (Google sale de tu Place ID). Sin URL, ese botón no se muestra.
3. Flujo: el cliente vota 1-5★ → **4-5★** ve los botones públicos (mides cada clic) →
   **1-3★** deja un mensaje privado y te llega email + WhatsApp al instante.
4. El enlace solo funciona con suscripción usable (sin free-riding tras una baja) y
   lleva rate-limit anti-spam (10 votos/min por IP).

## 7. Verificación rápida

```bash
curl -s https://tudominio.com/api/health | python3 -m json.tool
# version 3.10.0 · tripadvisor/queue/cron en true

# Cron manual (sustituye el secreto):
curl -s -H "Authorization: Bearer TU_CRON_SECRET" \
  https://tudominio.com/api/cron/sync-reviews
```

¿Dudas? Orden de lectura: esta guía (automatización) → `GUIA_COMERCIALIZACION.md`
(venta al público) → `docs/GUIA_PASOS_MANUALES.md` (credenciales una a una).
