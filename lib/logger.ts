import { createAdminClient } from '@/lib/supabase/admin';

export type SystemLogLevel = 'info' | 'warn' | 'error';

export type SystemLog = {
  id: string;
  created_at: string;
  level: SystemLogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown> | null;
};

/**
 * Logger del sistema: escribe en consola + tabla `system_logs` (si existe).
 * Nunca lanza excepciones (el log no puede romper el flujo principal).
 */
export async function systemLog(
  level: SystemLogLevel,
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const line = `[${level.toUpperCase()}][${source}] ${message}`;
  if (level === 'error') console.error(line, meta ?? '');
  else if (level === 'warn') console.warn(line, meta ?? '');
  else console.log(line, meta ?? '');

  try {
    const admin = createAdminClient();
    if (!admin) return;
    await admin.from('system_logs').insert({ level, source, message, meta: meta ?? null });
  } catch {
    /* tabla inexistente o sin conexión: solo consola */
  }
}

/** Logs de demostración para el panel cuando no hay BD conectada. */
export function demoLogs(): SystemLog[] {
  const now = Date.now();
  return [
    {
      id: 'demo-1',
      created_at: new Date(now - 1000 * 60 * 5).toISOString(),
      level: 'info',
      source: 'stripe.webhook',
      message: 'checkout.session.completed → suscripción Pro activada (demo)',
    },
    {
      id: 'demo-2',
      created_at: new Date(now - 1000 * 60 * 42).toISOString(),
      level: 'info',
      source: 'ai.responder',
      message: 'Respuesta IA generada para reseña #1042 (demo)',
    },
    {
      id: 'demo-3',
      created_at: new Date(now - 1000 * 60 * 130).toISOString(),
      level: 'warn',
      source: 'smtp',
      message: 'SMTP no configurado: email de bienvenida en cola (demo)',
    },
  ];
}
