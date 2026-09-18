'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShoppingBag, TriangleAlert } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Skeleton';
import { describeApiError, type TenantInfo } from '@/components/dashboard/types';
import { planHasFeature } from '@/lib/plans';

const PROVIDERS = [
  {
    id: 'shopify',
    name: 'Shopify',
    hint: 'tu-tienda.myshopify.com',
    token: 'Token de la Admin API (custom app)',
    webhook: 'Secreto del webhook (HMAC)',
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    hint: 'https://tu-tienda.com',
    token: 'Consumer Key o token REST',
    webhook: 'Consumer Secret (firma HMAC)',
  },
] as const;

/**
 * Conexión con la tienda (plan Business). Al entregarse un pedido, el webhook
 * de la plataforma dispara un WhatsApp al cliente pidiendo su valoración.
 */
export function StoreConnect({ tenant: t, demo }: { tenant: TenantInfo; demo: boolean }) {
  const toast = useToast();
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]['id']>('shopify');
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const storeInteg = t.integrations.find((i) => ['shopify', 'woocommerce', 'store'].includes(i.provider));
  const canUseStore = planHasFeature(t.plan, 'storeIntegration');
  const active = PROVIDERS.find((p) => p.id === provider)!;

  if (!canUseStore) {
    return (
      <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3.5 text-sm text-amber-100">
        <p className="flex items-start gap-2">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            La conexión con tu tienda (Shopify, WooCommerce o TPV) y el WhatsApp al entregar están
            incluidos en el plan <strong className="text-white">Business</strong>.{' '}
            <Link href="/bienvenido?plan=business" className="font-semibold underline underline-offset-2">
              Cambiar de plan
            </Link>
            .
          </span>
        </p>
      </div>
    );
  }

  async function connect() {
    if (!shop || !token) {
      toast({ kind: 'warning', title: 'Faltan datos', body: 'Indica la tienda y el token de acceso.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/store/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: t.id,
          provider,
          shop,
          accessToken: token,
          webhookSecret: secret || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body });
        return;
      }
      toast({
        kind: 'success',
        title: 'Tienda conectada',
        body: data.webhookUrl ? `Pega este webhook en tu tienda: ${data.webhookUrl}` : data.message,
        duration: 9000,
      });
      setToken('');
      setSecret('');
      setTimeout(() => window.location.reload(), 1000);
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo conectar', body: e?.message });
    } finally {
      setSaving(false);
    }
  }

  if (storeInteg) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-white">
          <CheckCircle2 size={15} className="text-emerald-400" />
          <strong className="font-semibold capitalize">{storeInteg.provider}</strong> conectada · WhatsApp
          al entregar activo
          {storeInteg.last_sync_at && (
            <span className="text-xs text-ink-400">
              último evento {new Date(storeInteg.last_sync_at).toLocaleString('es-ES')}
            </span>
          )}
        </p>
        <p className="text-xs leading-relaxed text-ink-400">
          Cuando un pedido pasa a «Entregado» (Shopify <code>fulfillments/create</code>) o
          «Completado» (WooCommerce), el cliente recibe un WhatsApp con tu enlace de valoración.
          Cada envío consume 1 evento de WhatsApp de tu cuota.
        </p>
      </div>
    );
  }

  if (demo) {
    return <p className="text-sm text-ink-400">Vista de ejemplo: aquí conectarías tu tienda mediante un asistente seguro. No se enviará ni guardará ningún dato.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={`${t.id}-store-provider`}>Plataforma</label>
        <select
          id={`${t.id}-store-provider`}
          className="select"
          value={provider}
          onChange={(e) => setProvider(e.target.value as any)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="woocommerce">Otro TPV / tienda a medida (API)</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${t.id}-store-shop`}>Dirección de la tienda</label>
        <input
          id={`${t.id}-store-shop`}
          className="input"
          placeholder={active.hint}
          value={shop}
          onChange={(e) => setShop(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${t.id}-store-token`}>Token de acceso</label>
        <input
          id={`${t.id}-store-token`}
          className="input"
          placeholder={active.token}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          type="password"
        />
      </div>
      <div>
        <label className="label" htmlFor={`${t.id}-store-secret`}>Secreto del webhook (opcional)</label>
        <input
          id={`${t.id}-store-secret`}
          className="input"
          placeholder={active.webhook}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          type="password"
        />
      </div>
      <div className="sm:col-span-2">
        <button onClick={connect} disabled={saving} className="btn-primary w-full sm:w-auto">
          {saving ? <Spinner label="Conectando…" /> : (<><ShoppingBag size={15} /> Conectar tienda</>)}
        </button>
        <p className="hint">
          Al conectar se genera la URL de webhook que debes pegar en tu tienda. Los payloads se
          verifican con HMAC-SHA256 antes de enviar nada.
        </p>
      </div>
    </div>
  );
}
