import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/authz';
import { consumeRateLimit } from '@/lib/rate-limit';
import { normalizeCampaign } from '@/lib/campaign';
import { env } from '@/lib/env';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantIdResult = z.string().uuid().safeParse(url.searchParams.get('tenantId'));
  if (!tenantIdResult.success) return NextResponse.json({ error: 'tenantId inválido.' }, { status: 400 });
  const tenantId = tenantIdResult.data;
  const campaign = normalizeCampaign(url.searchParams.get('campaign'));
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });
  const auth = await requireOwner(admin, tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rate = await consumeRateLimit('qr-export', auth.userId, 30, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Demasiadas descargas.' }, { status: 429 });
  const { data: tenant } = await admin.from('tenants').select('slug').eq('id', tenantId).single();
  if (!tenant?.slug) return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });

  const target = new URL(`/valorar/${encodeURIComponent(tenant.slug)}`, env.appUrl);
  if (campaign) target.searchParams.set('campaign', campaign);
  const svg = await QRCode.toString(target.toString(), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#111827', light: '#ffffff' },
  });
  const suffix = campaign ? `-${campaign}` : '';
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="reviewflow-qr${suffix}.svg"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
