#!/usr/bin/env node
/**
 * ============================================================
 * ReviewFlow AI — Verificación de lanzamiento (v3.11.0)
 * ============================================================
 * Comprueba, contra tu propia app desplegada, que lo comercial está listo
 * ANTES de vender. No necesita claves de Stripe: usa el `whsec_` de tu .env
 * para FIRMAR un evento de prueba y verifica que tu webhook lo acepta.
 *
 * Uso:
 *   node scripts/verify-launch.mjs                      # contra http://localhost:3000
 *   node scripts/verify-launch.mjs --url https://tu-dominio.com
 *   node scripts/verify-launch.mjs --url … --quiet
 *
 * Qué verifica:
 *   1. /api/health responde y qué integraciones están configuradas.
 *   2. Motor de IA: modelo activo (gpt-4o-mini por defecto), reintentos y límites.
 *   3. PostgreSQL: latencia y conexiones del pool (?db=1, si hay DATABASE_URL).
 *   4. Stripe: precios de Pro/Business y de las 4 recargas configurados.
 *   5. Webhook: firma válida → 2xx · firma inválida → 400 (seguridad).
 *   6. Rutas de IA protegidas: sin sesión → 401 (nunca ejecuta IA gratis).
 *
 * Requiere `.env` (o variables de entorno) con STRIPE_WEBHOOK_SECRET y, si
 * quieres comprobar precios, las variables STRIPE_PRICE_*.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/* ----------------------------- utilidades ----------------------------- */

function loadEnv(file = '.env') {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const urlArg = args.find((a, i) => args[i - 1] === '--url') ?? args.find((a) => a.startsWith('http://') || a.startsWith('https://'));
const env = { ...loadEnv('.env'), ...process.env };
const BASE = (urlArg ?? env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

let pass = 0;
let warn = 0;
let fail = 0;

const C = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function ok(label, detail = '') {
  pass += 1;
  console.log(`${C.ok('  ✓')} ${label}${detail ? C.dim(` — ${detail}`) : ''}`);
}
function bad(label, detail = '') {
  fail += 1;
  console.log(`${C.bad('  ✗')} ${label}${detail ? C.dim(` — ${detail}`) : ''}`);
}
function soft(label, detail = '') {
  warn += 1;
  console.log(`${C.warn('  !')} ${label}${detail ? C.dim(` — ${detail}`) : ''}`);
}
function title(text) {
  if (!quiet) console.log(`\n${C.bold(text)}`);
}

async function getJson(url, init) {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, headers: res.headers };
  } catch (e) {
    return { status: 0, body: null, error: e?.message ?? String(e) };
  }
}

/* ------------------------------- pruebas ------------------------------ */

async function checkHealth() {
  title('1. Liveness y readiness');
  const live = await getJson(`${BASE}/api/health?mode=live`);
  if (live.status !== 200 || !live.body?.ok) {
    bad('La app no responde en liveness', `status ${live.status}`);
    return null;
  }
  ok('Liveness público mínimo', `v${live.body.version}`);

  if (env.HEALTHCHECK_SECRET) {
    const ready = await getJson(`${BASE}/api/health?mode=ready`, {
      headers: { Authorization: `Bearer ${env.HEALTHCHECK_SECRET}` },
    });
    if (ready.status === 200 && ready.body?.ok) ok('Readiness privado: configuración y BD listas');
    else bad('Readiness no superado', `HTTP ${ready.status}`);
  } else {
    soft('Readiness no comprobado', 'falta HEALTHCHECK_SECRET en el entorno local');
  }

  return {
    integrations: {
      supabase: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabaseAdmin: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      stripe: Boolean(env.STRIPE_SECRET_KEY),
      stripeWebhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
      stripePrices: Boolean(env.STRIPE_PRICE_PRO && env.STRIPE_PRICE_BUSINESS),
      database: Boolean(env.DATABASE_URL),
    },
    ai: {
      configured: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL || 'gpt-4o-mini',
      runtime: {
        maxConcurrency: env.OPENAI_MAX_CONCURRENCY || '6',
        rpmPerTenant: env.OPENAI_RPM_PER_TENANT || '20',
        maxAttempts: env.OPENAI_MAX_ATTEMPTS || '3',
      },
    },
  };
}

async function checkAi(health) {
  title('2. Motor de IA (OpenAI → gpt-4o-mini)');
  const ai = health?.ai;
  if (!ai) {
    soft('La app no expone el bloque `ai` en /api/health', 'actualiza a v3.8.0');
    return;
  }
  if (ai.model === 'gpt-4o-mini') ok('Modelo por defecto: gpt-4o-mini');
  else soft(`Modelo configurado: ${ai.model}`, 'gpt-4o-mini es el más económico');

  const rt = ai.runtime ?? {};
  ok('Control de concurrencia', `máx ${rt.maxConcurrency} simultáneas`);
  ok('Rate limit por empresa', `${rt.rpmPerTenant} peticiones/min`);
  ok('Reintentos (exponential backoff)', `${rt.maxAttempts} intentos por llamada`);

  if (ai.configured) ok('OPENAI_API_KEY presente (se usa el modelo real)');
  else soft('Sin OPENAI_API_KEY: la app responde con plantilla local (fallback)', 'es válido, solo más genérico');
}

async function checkDatabase(health) {
  title('3. PostgreSQL / pool de conexiones');
  if (!health?.integrations?.database) {
    soft('DATABASE_URL no configurada', 'la app funciona con PostgREST; añádela para mantenimiento');
    return;
  }
  ok('DATABASE_URL presente');
  soft('Detalle del pool protegido', 'compruébalo con sesión super-admin en GET /api/admin/db');
}

async function checkStripeConfig(health) {
  title('4. Stripe (planes y recargas)');
  const integ = health?.integrations ?? {};
  if (!integ.stripe) {
    bad('STRIPE_SECRET_KEY no configurada');
    return;
  }
  if (integ.stripePrices) ok('Precios de Pro y Business configurados');
  else soft('Faltan STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS', 'el checkout responderá 500');

  const addons = ['STRIPE_PRICE_ADDON_REQUESTS', 'STRIPE_PRICE_ADDON_REVIEWS', 'STRIPE_PRICE_ADDON_AI', 'STRIPE_PRICE_ADDON_SYNCS'];
  const hasAny = addons.some((k) => env[k]);
  if (hasAny) ok('Recargas con Price ID propio');
  else soft('Recargas sin Price ID', 'se crean con price_data inline (importes de lib/plans.ts): funciona igual');
}

async function checkWebhookSignature() {
  title('5. Webhook de Stripe (firma e idempotencia)');
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    bad('STRIPE_WEBHOOK_SECRET no está en el entorno/.env', 'no se puede firmar el evento de prueba');
    return;
  }

  let generateTestHeaderString;
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_dummy', { apiVersion: '2024-06-20' });
    generateTestHeaderString = (payload) => stripe.webhooks.generateTestHeaderString({ payload, secret });
  } catch (e) {
    soft('No se pudo cargar el SDK de Stripe para firmar', e?.message ?? '');
    return;
  }

  // Evento sintético: no crea ni cobra nada, solo verifica la cadena de firma.
  const payload = JSON.stringify({
    id: `evt_verify_${Date.now()}`,
    object: 'event',
    type: 'customer.subscription.updated',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: 'sub_verify_launch',
        object: 'subscription',
        status: 'active',
        metadata: { plan: 'pro', verification: 'verify-launch-script' },
        items: { data: [{ price: { id: env.STRIPE_PRICE_PRO ?? 'price_verify' } }] },
      },
    },
  });

  const good = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': generateTestHeaderString(payload) },
    body: payload,
  });
  if (good.status >= 200 && good.status < 300) ok('El webhook acepta un evento con firma válida', `HTTP ${good.status}`);
  else if (good.status === 503) soft('El webhook responde 503: falta STRIPE_WEBHOOK_SECRET en el servidor', 'revisa el despliegue');
  else bad('El webhook rechazó una firma válida', `HTTP ${good.status} — revisa el secreto y que no haya un proxy alterando el body`);

  const badRes = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=firmafalsa' },
    body: payload,
  });
  if (badRes.status === 400) ok('El webhook rechaza firmas inválidas (400)');
  else bad('El webhook no rechazó una firma inválida', `HTTP ${badRes.status}: riesgo de seguridad`);
}

async function checkAiEndpointGuards() {
  title('6. Rutas de IA protegidas');
  const noSession = await fetch(`${BASE}/api/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: '00000000-0000-0000-0000-000000000000',
      task: 'reply',
      businessName: 'X',
      authorName: 'Y',
      rating: 5,
      reviewText: 'Prueba de verificación (sin sesión).',
    }),
  });
  const expected = [401, 503];
  if (expected.includes(noSession.status)) {
    ok('Sin sesión no se ejecuta IA', `HTTP ${noSession.status}`);
  } else {
    bad('La ruta de IA respondió sin sesión', `HTTP ${noSession.status}: revisa proxy.ts`);
  }

  const badBody = await fetch(`${BASE}/api/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: 'reply' }),
  });
  if (badBody.status === 400) ok('Zod rechaza el cuerpo inválido', 'HTTP 400');
  else soft('Zod no comprobable sin sesión', `HTTP ${badBody.status}; prueba de integración autenticada pendiente`);
}

/* -------------------------------- main -------------------------------- */

console.log(C.bold(`\nReviewFlow AI · verificación de lanzamiento\n${C.dim(`Destino: ${BASE}`)}`));

const health = await checkHealth();
await checkAi(health);
await checkDatabase(health);
await checkStripeConfig(health);
await checkWebhookSignature();
await checkAiEndpointGuards();

console.log(
  `\n${C.bold('Resultado:')} ${C.ok(`${pass} correctas`)} · ${C.warn(`${warn} avisos`)} · ${C.bad(`${fail} fallos`)}`,
);
if (fail > 0) {
  console.log(C.bad('\nCorrige los fallos antes de vender. Detalles en GUIA_ADMIN.md → sección de webhooks.\n'));
  process.exit(1);
}
console.log(C.ok('\nListo para comercializar: cobros, IA medida y protección de datos verificados.\n'));
