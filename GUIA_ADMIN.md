# 🛡️ GUIA_ADMIN.md — Manual del dueño (ReviewFlow AI v3.10.0)

Todo lo que necesitas para **operar tu SaaS día a día**: planes, cobros, cuotas,
protección de la base de datos, soporte y mantenimiento. Cero código.

> Pre-requisito: app desplegada ([GUIA_DESPLIEGUE.md](./GUIA_DESPLIEGUE.md)) y tu email
> en `SUPERADMIN_EMAILS`. El panel interno vive en `https://tudominio.com/admin`.
>
> 🔒 **El panel es 100 % privado**: no aparece enlazado en ninguna página pública
> (login, registro, landing, ayuda o dashboard). Solo entra quien teclea la URL y
> tiene su email en `SUPERADMIN_EMAILS`; el resto recibe `forbidden` desde
> `middleware.ts` + `lib/authz.ts`.

---

## 1. Los 2 planes (qué estás vendiendo)

| | **Pro — 29 €/mes** | **Business — 79 €/mes** |
|---|---|---|
| Para quién | Negocios con reseñas cada semana | Tiendas/cadenas con pedidos y varias sedes |
| Peticiones de opiniones/mes | 500 | 2.000 |
| Opiniones importadas/mes | 1.000 | 5.000 |
| Respuestas con IA/mes | 300 | 1.500 |
| Presupuesto de IA/mes | 250.000 tokens | 1.200.000 tokens |
| Sincronizaciones automáticas/mes | 120 | 720 |
| Sedes incluidas | 3 | 10 |
| Email · Google Business/Places · IA | ✅ | ✅ |
| WhatsApp (peticiones y alertas) | ✅ | ✅ |
| Trustpilot · publicar en Google | ✅ | ✅ |
| TripAdvisor (vía SerpAPI/Outscraper) | ✅ | ✅ |
| Embudo privado `/valorar` (4-5★ públicos, 1-3★ a ticket) | ✅ | ✅ |
| Shopify / Woo / TPV + WhatsApp al entregar | ❌ | ✅ |
| Soporte | Email | Prioritario |
| Opiniones guardadas (tope BD) | 5.000 | 25.000 |
| Retención de historial | 180 días | 365 días |
| Almacenamiento asignado | 2 GB | 10 GB |

**«Petición» =** 1 email o WhatsApp de solicitud de opinión. Las otras tres cuotas
(opiniones, IA, sincronizaciones) son independientes: agotar una **no** bloquea las demás.

**Prueba:** los 2 planes dan **7 días gratis** con tarjeta obligatoria. Sin suscripción
activa (o con la prueba caducada) no hay acceso: el panel redirige a `/bienvenido` y las
APIs responden **402**. No existe plan gratuito ni alta sin tarjeta.

**Recargas puntuales** (pago único, válidas solo el ciclo en curso):

| Recarga | Añade | Precio | Variable |
|---|---|---|---|
| `extra_requests_1000` | +1.000 peticiones | 9 € | `STRIPE_PRICE_ADDON_REQUESTS` |
| `extra_reviews_2000` | +2.000 opiniones (+2.000 plazas de almacenamiento) | 12 € | `STRIPE_PRICE_ADDON_REVIEWS` |
| `extra_ai_500` | +500 respuestas IA | 15 € | `STRIPE_PRICE_ADDON_AI` |
| `extra_syncs_500` | +500 sincronizaciones | 6 € | `STRIPE_PRICE_ADDON_SYNCS` |

Los importes también se pueden fijar en céntimos con
`STRIPE_ADDON_{REQUESTS,REVIEWS,AI,SYNCS}_PRICE_CENTS`; si no defines Price ID,
el checkout crea la línea con `price_data` inline (`lib/plans.ts` → `ADDON_PACKS`).

---

## 2. El panel `/admin` (tu centro de mando)

| Pestaña | Qué ves | Para qué la usas |
|---|---|---|
| **Empresas** | Empresa, plan, estado, reseñas, alta, buscador | Ver clientes, suspender a un moroso, entrar como ellos (*Acceder*) |
| **Suscripciones** | Estado Stripe por cliente y cambio de plan manual | Detectar pruebas por caducar, impagos (`past_due`), cancelaciones |
| **Cuotas y extras** ⭐ | Peticiones consumidas/ciclo, recargas concedidas y quién está al 100 % | Anticiparte a un cliente bloqueado y ofrecerle la recarga correcta |
| **Logs** | Eventos del sistema (pagos, cortes de cuota, IA, webhooks) | Diagnosticar «no me llega X» |
| **Sistema** | Estado de integraciones, Price ID de planes y recargas, reglas de negocio | Comprobar que Google/WhatsApp/SMTP/Stripe están activos |

Extra de v3.8.0: en *Empresas* y *Cuotas y extras* cada cliente muestra su
consumo de **tokens de IA** y el coste estimado del ciclo, y en el diagnóstico
interno tienes `GET /api/admin/db` (latencia, conexiones, tamaño por tabla) y
`GET /api/ai` (estado del motor de IA).

Extra de v3.10.0: sincronizaciones **automáticas por cron** (Business cada hora, Pro cada
6 h; de noche no tocas nada), trabajos en **cola QStash** con reintentos (o en línea si no
la configuras), **opt-ins de WhatsApp** por cliente (RGPD), pestaña **Embudo** con tickets
1-3★ y avisos al dueño, e IA **asíncrona** (`GET /api/ai/result?jobId=`). Todo deja rastro
en *Logs* (`cron.sync`, `queue.*`, `feedback.ticket`, `whatsapp.optin`).

Acciones por cliente (··· en su fila): **cambiar plan** (Pro/Business),
**suspender/reactivar** (el suspendido pierde el acceso al instante), **ver email del dueño**.

---

## 3. Impacto en la base de datos (Supabase / PostgreSQL) ⭐

El esquema guarda **una fila por opinión, por evento de auditoría y por conexión**.
Para que un cliente con mucho volumen no dispare el coste de Supabase ni degrade
PostgreSQL, cada plan define **topes duros por empresa** que el código aplica en
`lib/usage.ts` (y que la migración `supabase/migration_3_7_0.sql` replica a nivel
SQL con `purge_tenant()` / `purge_all_tenants()` como segunda red de seguridad).

### 3.1 Topes por tabla y plan

| Tabla | Qué guarda | Pro | Business |
|---|---|---|---|
| `reviews` | Opiniones importadas/creadas (texto + respuesta + estado) | **5.000 filas** | **25.000 filas** |
| `quota_events` | Historial/auditoría de consumo (1 fila por operación) | **10.000 filas · 180 días** | **50.000 filas · 365 días** |
| `integrations` | Conexiones activas (Google, Trustpilot, TripAdvisor, WhatsApp, tienda) | **6** | **20** |
| `ai_interactions` | Contabilidad de cada llamada de IA (tokens, coste, latencia) | **20.000 filas · 180 días** | **100.000 filas · 365 días** |
| `system_logs` | Logs técnicos de la instancia (tabla compartida) | 365 días (purga global) | 365 días |
| Almacenamiento activo estimado | `reviews` + `quota_events` + `integrations` | **2 GB (2.048 MB)** | **10 GB (10.240 MB)** |

> Las cifras de MB son la **cuota asignada**; el peso real de cada plan si se llena
> es mucho menor (5.000 opiniones ≈ 30 MB, 25.000 ≈ 150 MB). Es margen de seguridad
> para índices, bloat y picos, no una promesa de uso.

**Estimación por fila** (`ROW_KB` en `lib/plans.ts`): opinión ≈ 6 KB (texto +
respuesta + índices), evento de auditoría ≈ 0,4 KB, conexión ≈ 2 KB (credenciales jsonb),
llamada de IA ≈ 1,2 KB (tokens, coste, latencia).

**Pool de conexiones:** en producción, `DATABASE_URL` debe apuntar al **Connection
Pooler** de Supabase (Supavisor, puerto 6543 en modo transaction). Así los picos de
tráfico no agotan las conexiones de Postgres. Comprueba el estado real en
`/api/health?db=1` o en `GET /api/admin/db` (latencia, conexiones activas, tamaño por tabla).

### 3.2 Qué pasa cuando un cliente llega al tope (estrategia de purga/archivado)

| Situación | Comportamiento automático | Qué ve el cliente |
|---|---|---|
| Supera `reviewsStored` | Se **borran las opiniones más antiguas** hasta volver al tope (lo agregado queda en `usage_counters`) | Aviso «se archivaron las más antiguas» + sugerencia de recarga |
| Supera `auditRows` o `logRetentionDays` | Se poda `quota_events` por antigüedad y luego por volumen (nunca el ciclo en curso) | Nada: es auditoría operativa |
| Supera las conexiones del plan | La nueva conexión se **rechaza** con `507` (no se purga nada: las credenciales son del cliente) | Mensaje «desconecta una o pasa de plan» |
| Supera la cuota mensual de una métrica | La API responde `429` con `Retry-After` hasta el ciclo siguiente o hasta comprar una recarga | Panel con el aviso y la recarga sugerida |
| Falta plan/feature | `403` (feature de otro plan) o `402` (suscripción suspendida/cancelada) | Paywall + botón «Cambiar de plan» |
| Se llena el almacenamiento global | `507` + purga de lo más antiguo | Aviso de ampliación |

**Nunca se pierden datos en silencio**: toda purga deja un registro en `system_logs`
(`storage.purge`) con el número de filas afectadas, visible en `/admin → Logs`.

### 3.3 Cómo forzar la purga a mano (opcional)

```sql
-- Una empresa concreta (aplica los topes de SU plan):
select * from public.purge_tenant('uuid-de-la-empresa');

-- Toda la instancia + poda de system_logs (recomendado 1 vez al día):
select public.purge_all_tenants();
```

Con `pg_cron` habilitado en Supabase puedes programarlo:

```sql
select cron.schedule('reviewflow-purge', '15 * * * *', $$select public.purge_all_tenants()$$);
```

La app ya purga en cada lectura de cuota (con throttle de 10 minutos), así que esto
solo es una red de seguridad si tu volumen crece mucho.

### 3.4 Cuándo subir de plan de Supabase

| Señal | Acción |
|---|---|
| BD total > 400 MB en plan Free | Pasar a Supabase **Pro** (~25 $/mes) |
| Muchos clientes Business activos (> 25) | Revisar índices y considerar réplica de lectura |
| `system_logs` crece rápido | `select public.purge_system_logs(90);` + bajar `logRetentionDays` si procede |

---

## 4. IA con `gpt-4o-mini`: monitorización y control de costes ⭐

Todas las llamadas de IA pasan por **`lib/openai.ts`**: un único cliente con
timeout, reintentos, rate limit y contabilidad. Nada sale hacia OpenAI sin
registrarse.

### 4.1 Dónde se ve el consumo

| Dónde | Qué muestra |
|---|---|
| Panel del cliente → *Facturación y cuota* → **Presupuesto de IA** | Tokens usados/límite del ciclo, borradores generados, tokens restantes y coste estimado |
| `/admin` → tarjeta **Tokens de IA (ciclo)** | Tokens y coste estimado de TODAS las empresas + nº de fallbacks |
| `/admin` → *Cuotas y extras* → línea de cada empresa | `IA: X / Y tokens · ≈ Z USD` y avisos de fallback |
| `GET /api/ai` (super-admin) | Modelo activo, timeout, reintentos, rpm por empresa, concurrencia y presupuesto por plan |
| SQL: `select * from v_ai_usage order by pct_used desc;` | Ranking de consumo por empresa |
| SQL: `select * from ai_interactions order by created_at desc limit 50;` | Últimas llamadas: modelo, tokens, coste, latencia, si hubo fallback |

### 4.2 Presupuesto de tokens por plan (freno de coste)

| Plan | Créditos de IA/mes | Presupuesto de tokens/mes | Filas de histórico (`ai_interactions`) |
|---|---|---|---|
| Pro | 300 | 250.000 | 20.000 |
| Business | 1.500 | 1.200.000 | 100.000 |

Con `gpt-4o-mini` (0,15 $/1M entrada · 0,60 $/1M salida), una respuesta típica
(~470 tokens entre prompt y respuesta) cuesta **≈ 0,0001 $**. El coste máximo
teórico del plan Business, incluso agotando todo el presupuesto, es de céntimos:
el margen del plan nunca se pone en riesgo. Si un cliente agota su presupuesto,
recibe **`429 token_budget_exhausted`** con `Retry-After` hasta el día 1 o hasta
comprar la recarga de IA.

### 4.3 Cómo se comporta la IA cuando algo falla

| Situación | Comportamiento automático | Qué ve el cliente |
|---|---|---|
| OpenAI devuelve 429 (límite del proveedor) | Reintenta con backoff exponencial + jitter (hasta 3 intentos) y respeta `Retry-After` | Nada, solo tarda algo más |
| OpenAI cae (5xx) o hay timeout (20 s) | Tras los reintentos usa la **plantilla local** (`fallback`), registra `ok: false` en `ai_interactions` | Borrador genérico, sin error |
| Un cliente hace un bucle de peticiones | **Rate limit 20 rpm por empresa** (`OPENAI_RPM_PER_TENANT`) → 429 inmediato | Mensaje «reintenta en N s» |
| Pico de tráfico de muchas empresas | Semáforo global de **6 llamadas simultáneas** (`OPENAI_MAX_CONCURRENCY`) | Cola breve, sin errores |
| Clave ausente o inválida | 100 % plantilla local (la plataforma nunca se cae) | Aviso de que la IA está en modo básico |

### 4.4 Control de costes en OpenAI y Supabase

| Señal | Acción |
|---|---|
| Coste diario de OpenAI ↑ sin subir clientes | `select purpose, count(*), sum(total_tokens) from ai_interactions where created_at > now() - interval '1 day' group by 1 order by 3 desc;` |
| Un cliente con `pct_used` ≈ 100 % | Ofrécele la recarga `extra_ai_500` (15 €) o el plan superior |
| Muchos `ok = false` en `ai_interactions` | Revisa saldo/límites de OpenAI en su panel (Settings → Limits) |
| BD > 400 MB (Supabase Free) | Pasa a Supabase Pro **o** baja `limits.reviewsStored`/`aiRows` en `lib/plans.ts` y ejecuta `select public.purge_all_tenants();` |
| `pg_stat_activity` con muchas conexiones | Usa el **Connection Pooler** (puerto 6543) en `DATABASE_URL` y ajusta `DATABASE_POOL_MAX` |
| Consultas lentas en el panel | `GET /api/admin/db` muestra latencia, conexiones y tamaño real por tabla |

**Ponle presupuesto a la clave de OpenAI** (Settings → Limits → *Monthly budget*):
es tu segunda red de seguridad, después del presupuesto por plan.

---

## 5. Verificación de cobros y webhooks (antes de vender) 🔐

### 5.1 Comprobación automática

```bash
npm run verify                       # contra http://localhost:3000
npm run verify -- --url https://tudominio.com
```

Verifica: health general, motor de IA (modelo y límites), pool de PostgreSQL,
precios de Stripe, **webhook (firma válida → 2xx, firma falsa → 400)** y que las
rutas de IA devuelven 401/503 sin sesión. Si algo falla, no lo lances a producción.

### 5.2 Matriz de pruebas del ciclo comercial (Stripe test)

| Escenario | Cómo provocarlo | Resultado esperado |
|---|---|---|
| Alta con prueba de 7 días | Checkout con `4242 4242 4242 4242` y plan Pro | Empresa creada, `trialing`, cuota Pro activa |
| Cambio de plan (upgrade) | Portal de Stripe → cambiar a Business | `customer.subscription.updated` → `plan = business` y cuotas nuevas al instante |
| Compra de recarga | *Facturación y cuota* → +1.000 peticiones | `checkout.session.completed` → `extra_requests` +1000 y fila en `addons` |
| Impago | En Stripe, añade una tarjeta `4000 0000 0000 0341` | `invoice.payment_failed` → `past_due` → el middleware corta el panel |
| Cancelación | Portal → cancelar | `customer.subscription.deleted` → `inactive` al instante, se conserva el último plan de pago, datos intactos 30 días |
| Webhook repetido | Stripe → Webhooks → *Resend* un evento ya procesado | No duplica capacidad (idempotencia por `stripe_payment_id`) |
| Webhook caído | Desactiva el endpoint y compra | El cobro ocurre igual; al reactivar y reenviar, la capacidad se aplica |

```bash
# Probar en local sin tocar Stripe:
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
```

### 5.3 Resolución de fallos de webhook

| Síntoma | Causa | Solución |
|---|---|---|
| `400 Firma inválida` | `STRIPE_WEBHOOK_SECRET` de otro endpoint o de otro modo (test/live) | Copia el `whsec_` del endpoint correcto → redepliega |
| `400` con firma correcta | Un proxy/CDN altera el body (compresión) | Envía el body **raw** (la ruta ya lo lee sin parsear) y excluye la ruta del WAF |
| `500` en el webhook | Error de BD (Supabase pausado, migración pendiente) | Revisa `/admin → Logs` (fuente `stripe.webhook`) y ejecuta las migraciones |
| Cliente pagó y no tiene acceso | Evento perdido | Stripe → Webhooks → *Resend*; si persiste, cambia su estado a `active` en `/admin` |
| Capacidad duplicada | Migración 3.7.0/3.8.0 no aplicada (sin índice único) | Ejecuta las migraciones y revisa `addons_payment_unique_idx` |
| Todo `503 Stripe no configurado` | Faltan `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` | Rellena el `.env` y redespliega (`npm run verify`) |
| El webhook no llega en Vercel | URL http o dominio distinto | Usa `https://tudominio.com/api/stripe/webhook` y verifica con `npm run verify --url …` |

> Diagnóstico rápido del endpoint: `GET /api/stripe/webhook` (super-admin) devuelve
> modo (test/live), eventos configurados, precios detectados y pistas de solución.

---

## 6. El ciclo de vida de un cliente

```
Registro → elige plan en /bienvenido (Pro/Business, prueba de 7 días con tarjeta)
  → Stripe Checkout → empresa auto-creada, estado `trialing`
  → 3 días antes de acabar la prueba: email automático «tu prueba termina»
  → día 7: Stripe cobra → estado `active` ✅ (o cancela/falla → `inactive`/`past_due`, acceso cortado ⛔)
  → cada mes: la cuota se renueva sola (y las recargas caducan con el ciclo)
  → impago: `past_due` → acceso cortado hasta que pague (Stripe reintenta solo)
```

Tú no tienes que hacer nada: `/api/stripe/webhook` actualiza estados, planes y recargas.
Tu trabajo es mirar `/admin → Suscripciones` una vez por semana.

---

## 7. Rutina semanal del dueño (30 min)

1. **Suscripciones:** ¿pruebas que acaban en 3 días? Escríbeles (plantilla abajo). ¿`past_due`? Comprueba si Stripe reintentó; si lleva +7 días, contacta.
2. **Empresas nuevas:** bienvenida personal por email (convierte mucho los primeros 100 clientes).
3. **Logs:** busca `error` o webhooks fallidos. Un webhook de Stripe en rojo = cliente pagando sin acceso (§9). Mira también `cron.sync` (¿encola cada hora?), `queue.*` (¿reintentos?) y `feedback.ticket` (¿tickets sin resolver?).
4. **MRR:** anota tu MRR semanal. Objetivo sano: churn < 5 %/mes.

**Plantilla de prueba por caducar:**

> Hola {nombre}, tu prueba de ReviewFlow AI termina en 3 días. Ya tienes {N} opiniones
> centralizadas y {M} respuestas generadas. Si te falta algo para decidir, te ayudo
> personalmente esta semana. ¡Gracias por probar! — {tu nombre}

---

## 8. Soporte a clientes (lo que te van a pedir)

| Petición típica | Dónde se resuelve | Qué le dices |
|---|---|---|
| «No me llegan las opiniones de Google» | Su panel → empresa → Conexiones → Google | Reconectar OAuth y pulsar Sincronizar; si falla, pide captura y mira Logs |
| «Se me acabó la cuota» | Su panel → *Facturación y cuota* | Comprar la recarga sugerida (9/12/15/6 €) o esperar al ciclo siguiente |
| «Me sale un error 402/403/429/507» | `/admin` → *Cuotas y extras* y *Logs* | `429` cuota agotada · `403` feature de otro plan · `402` sin suscripción · `507` tope de filas/almacenamiento |
| «Quiero cambiar de plan» | `/api/stripe/portal` (botón Suscripción) | Lo hace él solo; el webhook actualiza el plan |
| «He cambiado de tarjeta» | Portal de Stripe | Autoservicio |
| «Quiero darme de baja» | Portal de Stripe → cancelar | Acceso hasta fin de periodo; datos 30 días (avísale) |
| «He superado las opiniones guardadas» | `/admin` → *Cuotas y extras* | Explicar la purga de las más antiguas + ofrecer recarga de opiniones o plan superior |
| «Mi tienda no envía WhatsApps» | Su panel → Tienda | Verificar secreto del webhook, que el pedido esté «Entregado/Completado» **y que haya opt-in** (`skipped: 'no-optin'` en Logs = falta el checkbox del checkout) |
| «No me llegan las opiniones de TripAdvisor» | Su panel → empresa → TripAdvisor | Revisar Location ID (`dXXXXXX`), `SERPAPI_API_KEY`/`OUTSCRAPER_API_KEY` en el servidor y cuota `syncs` |
| «WhatsApp da error de plantilla (131047)» | Meta → Message Templates | El nombre del `.env` debe ser EXACTO al aprobado (idioma `es`); fuera de la ventana de 24 h el texto libre lo rechaza Meta |
| «Mi enlace /valorar no funciona» | Su panel → *Embudo* | El embudo debe estar activo **y** la suscripción usable; sin suscripción el enlace devuelve 404 (sin free-riding) |
| «La IA me da respuestas muy genéricas» | `/admin` → *Logs* (fuente `ai.*`) y `ai_interactions` | Si hay `ok = false`, la clave/saldo de OpenAI está fallando: el sistema usó la plantilla local |
| «¿Por qué me dice que no tengo tokens de IA?» | `/admin` → *Cuotas y extras* (columna de IA) | Ha agotado el presupuesto del plan: ofrécele `+500 respuestas IA` (15 €) o el plan superior |

Regla de oro: **nunca toques Stripe a mano** (los reembolsos sí se hacen en Stripe → Payments).
Cambios de plan/estado, desde `/admin` o deja que el webhook lo haga.

---

## 9. Emergencias (qué hacer si…)

| Situación | Acción inmediata |
|---|---|
| Cliente pagó pero no tiene acceso | Stripe → evento del webhook en rojo → reenviar; si persiste, en `/admin` cámbiale el estado a `active` y avísale |
| Cliente dice que «ha perdido» opiniones | Es la purga del tope del plan: revisa `/admin → Logs` (`storage.purge`), explícalo y ofrécele recarga o plan superior |
| Caída del hosting | Entra al proveedor, reinicia el servicio; avisa por email si dura > 1 h |
| Supabase pausado (plan Free) | Dashboard → Resume. **En producción usa Supabase Pro** |
| Clave expuesta (Git, chat) | Rótala en el proveedor (Stripe/Supabase/Meta) y actualiza el `.env` + redespliega |
| Cliente enfadado / disputa Stripe | Responde en < 24 h, ofrece mes gratis o reembolso parcial; documenta todo por email |

---

## 10. Números que importan (mínimo viable)

- **MRR:** Pro 29 € · Business 79 € por cliente. Resta comisiones Stripe (~1,5 % + 0,25 €).
- **ARPU con recargas:** las recargas de 6–15 € suben el ticket medio sin subir el churn.
- **Churn:** cancelados ÷ clientes a inicio de mes. Sano < 5 %.
- **Costes fijos típicos:** hosting 5–25 € + Supabase 0–25 $ + dominio ~1 €/mes + SMTP 0–9 €.
  Opcionales de automatización: SerpAPI ~50–150 $/mes (TripAdvisor), QStash gratis/hobby,
  WhatsApp por conversación. Con **10 clientes Pro** (~290 €) cubres toda la infraestructura.
- **Conversión trial → pago:** mide cuántos trials llegan a `active` el día 8; si baja, revisa el email de bienvenida, el recordatorio del día 4 y la fricción del onboarding.

¡A vender! 🚀 Para cambios legales/fiscales del negocio, revisa [GUIA_PASOS_MANUALES.md](./docs/GUIA_PASOS_MANUALES.md); para activar cron, cola, plantillas y embudo, [GUIA_AUTOMATIZACION.md](./GUIA_AUTOMATIZACION.md).
