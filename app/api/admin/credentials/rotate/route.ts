import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminMfa } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptCredentials, encryptCredentials, isEncryptedCredentials } from '@/lib/credentials';
import { payloadErrorResponse, readJsonLimited } from '@/lib/request';

const Body = z.object({
  confirm: z.literal('ROTATE_CREDENTIALS'),
  reason: z.string().min(10).max(500),
  ticket: z.string().min(3).max(100),
  batchSize: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

/** Recifra filas legacy o cifradas con INTEGRATION_ENCRYPTION_KEY_PREVIOUS. */
export async function POST(req: Request) {
  const guard = await requireSuperAdminMfa();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  let input: unknown;
  try { input = await readJsonLimited(req, 4096); } catch (error) {
    return payloadErrorResponse(error) ?? NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const parsed = Body.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'Confirmación, motivo o ticket inválidos.' }, { status: 400 });
  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'Falta INTEGRATION_ENCRYPTION_KEY.' }, { status: 503 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });
  const { data: rows, error } = await admin.from('integrations').select('id, credentials')
    .order('created_at', { ascending: true })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.batchSize - 1);
  if (error) return NextResponse.json({ error: 'No se pudieron leer las integraciones.' }, { status: 500 });

  let rotated = 0;
  let legacy = 0;
  const failures: string[] = [];
  for (const row of rows ?? []) {
    try {
      if (!isEncryptedCredentials(row.credentials)) legacy += 1;
      const clear = decryptCredentials<Record<string, unknown>>(row.credentials);
      const { error: updateError } = await admin.from('integrations')
        .update({ credentials: encryptCredentials(clear) }).eq('id', row.id);
      if (updateError) throw updateError;
      rotated += 1;
    } catch {
      failures.push(String(row.id));
    }
  }

  const { error: auditError } = await admin.from('admin_audit_events').insert({
    actor_email: guard.email,
    action: 'integration_credentials_rotated',
    reason: parsed.data.reason,
    ticket: parsed.data.ticket,
  });
  if (auditError) return NextResponse.json({ error: 'Rotación realizada, pero falló la auditoría.' }, { status: 500 });
  return NextResponse.json({
    ok: failures.length === 0,
    scanned: rows?.length ?? 0,
    rotated,
    legacy,
    failed: failures.length,
    nextOffset: (rows?.length ?? 0) === parsed.data.batchSize ? parsed.data.offset + parsed.data.batchSize : null,
  });
}
