/**
 * ============================================================
 * ReviewFlow AI — Pool de PostgreSQL directo (v3.8.0)
 * ============================================================
 * La app usa Supabase (PostgREST) para todo el CRUD normal: ya gestiona su
 * propio pool del lado del servidor y respeta RLS. Este módulo añade un
 * **pool `pg` explícito** para lo que PostgREST no cubre bien y para casos de
 * pico de tráfico:
 *
 *   · Consultas analíticas/agregadas (consumo de tokens, MRR, topes de tabla).
 *   · Mantenimiento (`purge_tenant`, purgas programadas, `VACUUM ANALYZE`).
 *   · Diagnóstico de salud real de la BD (latencia, conexiones activas).
 *
 * ⚠️ CONEXIÓN: usa SIEMPRE la cadena del **Connection Pooler de Supabase**
 * (Supavisor), no la conexión directa. En el dashboard:
 *   Project Settings → Database → Connection string → **Connection pooling**
 *     · Transaction mode (puerto 6543) → ideal para serverless/Vercel.
 *     · Session mode (puerto 5432 en el host del pooler) → VPS/Docker.
 *   `DATABASE_URL=postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres`
 *
 * Reglas de oro del pooling (evitan saturar Supabase en picos comerciales):
 *   · Un único `Pool` por proceso, creado de forma perezosa y reutilizado.
 *   · `max` pequeño (5 por defecto): en Vercel cada instancia tiene su pool.
 *   · `idleTimeoutMillis` bajo para devolver conexiones al pooler.
 *   · `statement_timeout` por consulta para que una query lenta no bloquee.
 *   · `application_name` para identificar a la app en `pg_stat_activity`.
 *   · Cierre limpio con `SIGTERM`/`SIGINT` (contenedores que se reinician).
 */

import type { Pool as PgPool } from 'pg';

/** Configuración efectiva del pool (visible en /api/health). */
export type DbPoolConfig = {
  configured: boolean;
  /** Host del pooler (sin credenciales). */
  host: string | null;
  port: number | null;
  database: string;
  /** Modo del pooler según el puerto: 6543 = transaction, otro = session/directo. */
  mode: 'transaction' | 'session' | 'desconocido';
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statementTimeoutMs: number;
  ssl: 'require' | 'disable' | 'prefer';
};

function envNum(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Lee `DATABASE_URL` y avisa (sin romper) si apunta a la conexión directa. */
export function dbPoolConfig(): DbPoolConfig {
  const url = (process.env.DATABASE_URL ?? '').trim();
  const sslMode = (process.env.DATABASE_SSL ?? 'require').toLowerCase();

  const base: DbPoolConfig = {
    configured: Boolean(url),
    host: null,
    port: null,
    database: 'postgres',
    mode: 'desconocido',
    max: Math.round(envNum(process.env.DATABASE_POOL_MAX, 5)),
    idleTimeoutMillis: Math.round(envNum(process.env.DATABASE_IDLE_TIMEOUT_MS, 10_000)),
    connectionTimeoutMillis: Math.round(envNum(process.env.DATABASE_CONNECT_TIMEOUT_MS, 8_000)),
    statementTimeoutMs: Math.round(envNum(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 8_000)),
    ssl: sslMode === 'disable' ? 'disable' : sslMode === 'prefer' ? 'prefer' : 'require',
  };
  if (!url) return base;

  try {
    const parsed = new URL(url);
    const port = Number(parsed.port || '5432');
    base.host = parsed.hostname;
    base.port = Number.isFinite(port) ? port : null;
    base.database = parsed.pathname.replace(/^\//, '') || 'postgres';
    const isPoolerHost = /pooler\.supabase\.com$/i.test(parsed.hostname);
    base.mode = isPoolerHost ? (port === 6543 ? 'transaction' : 'session') : 'desconocido';
    return base;
  } catch {
    return base;
  }
}

/** Aviso útil en logs si se usa la conexión directa (db.<ref>.supabase.co). */
export function dbPoolWarning(): string | null {
  const cfg = dbPoolConfig();
  if (!cfg.configured) return null;
  if (!cfg.host) return 'DATABASE_URL no es una URL válida; revisa el formato.';
  if (/^db\..*\.supabase\.co$/i.test(cfg.host)) {
    return (
      'DATABASE_URL apunta a la conexión DIRECTA de Supabase (db.<ref>.supabase.co). ' +
      'En producción usa la cadena del Connection Pooler (…pooler.supabase.com:6543) para ' +
      'no agotar las conexiones durante los picos de tráfico.'
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Pool perezoso                                                       */
/* ------------------------------------------------------------------ */

type PgModule = typeof import('pg');

let pgModule: PgModule | null = null;
let pool: PgPool | null = null;
let poolError: string | null = null;
let closing = false;

function loadPg(): PgModule | null {
  if (pgModule) return pgModule;
  try {
    // `require` en runtime evita que el bundle de Next intente empaquetar `pg`
    // cuando la app corre en modo demo (sin DATABASE_URL).

    pgModule = require('pg') as PgModule;
    return pgModule;
  } catch (e: any) {
    poolError = e?.message ?? 'El paquete `pg` no está instalado.';
    return null;
  }
}

/**
 * Devuelve el pool compartido (o `null` si no hay `DATABASE_URL`, que es un
 * caso válido: la app funciona con PostgREST y modos demo). NUNCA lanza.
 */
export function getDbPool(): PgPool | null {
  if (closing) return null;
  const cfg = dbPoolConfig();
  if (!cfg.configured) return null;
  if (pool) return pool;

  const pg = loadPg();
  if (!pg) return null;

  try {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: cfg.max,
      idleTimeoutMillis: cfg.idleTimeoutMillis,
      connectionTimeoutMillis: cfg.connectionTimeoutMillis,
      ssl: cfg.ssl === 'disable' ? undefined : { rejectUnauthorized: false },
      application_name: 'reviewflow-ai',
      statement_timeout: cfg.statementTimeoutMs,
      query_timeout: cfg.statementTimeoutMs,
      // El pooler en modo transaction no admite prepared statements con nombre.
      maxUses: 7_500,
    });
    pool.on('error', (err: Error) => {
      console.error('[db] error en una conexión inactiva del pool:', err.message);
    });
    const warning = dbPoolWarning();
    if (warning) console.warn('[db]', warning);
    return pool;
  } catch (e: any) {
    poolError = e?.message ?? 'No se pudo crear el pool de PostgreSQL.';
    pool = null;
    return null;
  }
}


/* ------------------------------------------------------------------ */
/* Helpers de consulta                                                 */
/* ------------------------------------------------------------------ */

export type QueryResult<T> = { ok: true; rows: T[]; ms: number } | { ok: false; error: string; ms: number };

/**
 * Ejecuta SQL parametrizado con el pool. Devuelve `{ ok }` en vez de lanzar:
 * las rutas de mantenimiento nunca deben tumbar la app.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const started = Date.now();
  const p = getDbPool();
  if (!p) {
    return { ok: false, error: poolError ?? 'DATABASE_URL no configurada.', ms: Date.now() - started };
  }
  try {
    const res = await p.query(sql, params as any[]);
    return { ok: true, rows: res.rows as T[], ms: Date.now() - started };
  } catch (e: any) {
    console.error('[db] consulta fallida:', e?.message ?? e);
    return { ok: false, error: e?.message ?? 'Error de consulta.', ms: Date.now() - started };
  }
}

/* ------------------------------------------------------------------ */
/* Salud y mantenimiento                                               */
/* ------------------------------------------------------------------ */

export type DbHealth = {
  /** `true` solo si el pool respondió a `select 1`. */
  ok: boolean;
  /** `false` si no hay DATABASE_URL o `pg` (la app sigue funcionando). */
  configured: boolean;
  latencyMs: number | null;
  /** Métricas del pool en ESTE proceso. */
  pool: { total: number; idle: number; waiting: number; max: number } | null;
  /** Contadores del servidor (pg_stat_activity). */
  server: {
    activeConnections: number | null;
    maxConnections: number | null;
    databaseSizeMb: number | null;
  };
  mode: DbPoolConfig['mode'];
  warning: string | null;
  error?: string;
};

/** Comprueba la BD y devuelve métricas para `/api/health` y el panel interno. */
export async function checkDbHealth(): Promise<DbHealth> {
  const cfg = dbPoolConfig();
  const p = getDbPool();
  const base: DbHealth = {
    ok: false,
    configured: cfg.configured,
    latencyMs: null,
    pool: p ? { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount, max: cfg.max } : null,
    server: { activeConnections: null, maxConnections: null, databaseSizeMb: null },
    mode: cfg.mode,
    warning: dbPoolWarning(),
  };
  if (!p) return { ...base, error: poolError ?? (cfg.configured ? undefined : 'DATABASE_URL no configurada') };

  const ping = await query<{ ok: number }>('select 1 as ok');
  base.latencyMs = ping.ms;
  if (!ping.ok) return { ...base, error: ping.error };
  base.ok = true;

  const stats = await query<{ active: string; max_conn: string; size_mb: string }>(
    `select
       (select count(*) from pg_stat_activity where datname = current_database())::text as active,
       (select setting from pg_settings where name = 'max_connections')::text as max_conn,
       (select pg_database_size(current_database()) / 1024.0 / 1024.0)::text as size_mb`,
  );
  if (stats.ok && stats.rows[0]) {
    base.server = {
      activeConnections: Number(stats.rows[0].active) || 0,
      maxConnections: Number(stats.rows[0].max_conn) || null,
      databaseSizeMb: Math.round((Number(stats.rows[0].size_mb) || 0) * 10) / 10,
    };
  }
  return base;
}


/** Cierra el pool (SIGTERM del contenedor). Idempotente. */
export async function closeDbPool(): Promise<void> {
  closing = true;
  const p = pool;
  pool = null;
  if (!p) return;
  try {
    await p.end();
  } catch {
    /* ignore */
  }
}

// Cierre limpio en contenedores: evita conexiones huérfanas en Supabase.
if (typeof process !== 'undefined' && !(process as any).__rfDbHooksInstalled) {
  (process as any).__rfDbHooksInstalled = true;
  const bye = () => {
    void closeDbPool();
  };
  process.once('SIGTERM', bye);
  process.once('SIGINT', bye);
}
