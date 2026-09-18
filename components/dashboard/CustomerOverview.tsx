'use client';

import { ArrowRight, Building2, Filter, Inbox, Sparkles } from 'lucide-react';
import type { TenantInfo } from '@/components/dashboard/types';
import { planOf } from '@/lib/plans';

type Destination = 'bandeja' | 'empresa' | 'embudo' | 'facturacion';

export function CustomerOverview({
  tenant,
  pending,
  demo,
  onNavigate,
}: {
  tenant: TenantInfo;
  pending: number;
  demo: boolean;
  onNavigate: (tab: Destination) => void;
}) {
  const plan = planOf(tenant.plan);
  const business = plan.id === 'business';
  const steps = [
    {
      title: pending ? `Responder ${pending} ${pending === 1 ? 'opinión pendiente' : 'opiniones pendientes'}` : 'Revisar tu bandeja',
      detail: 'Genera un borrador, edítalo y publícalo cuando esté listo.',
      action: 'Abrir bandeja',
      tab: 'bandeja' as const,
      icon: Inbox,
    },
    {
      title: tenant.integrations.length ? `${tenant.integrations.length} conexiones preparadas` : 'Conectar tus canales',
      detail: business ? 'Añade reseñas, tienda y automatizaciones postventa.' : 'Importa reseñas y adapta el tono de tus respuestas.',
      action: 'Ver conexiones',
      tab: 'empresa' as const,
      icon: Building2,
    },
    {
      title: 'Conseguir nuevas opiniones',
      detail: 'Crea enlaces y códigos QR, y mide cada campaña desde un solo lugar.',
      action: 'Abrir captación',
      tab: 'embudo' as const,
      icon: Filter,
    },
  ];

  return (
    <section className="card overflow-hidden p-0" aria-labelledby="customer-overview-title">
      <div className="border-b border-white/[0.07] bg-[linear-gradient(120deg,rgba(37,99,235,0.13),rgba(139,92,246,0.08))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Tu espacio de trabajo</p>
            <h1 id="customer-overview-title" className="mt-1 text-xl font-extrabold tracking-tight text-white">
              Hola, {tenant.name}
            </h1>
            <p className="mt-1 text-sm text-ink-300">
              Plan {plan.tier} {demo ? 'de ejemplo' : 'activo'} ·{' '}
              {business
                ? 'automatización para tiendas, sedes y equipos con mayor volumen.'
                : 'todo lo necesario para gestionar y conseguir opiniones cada semana.'}
            </p>
          </div>
          <button onClick={() => onNavigate('facturacion')} className="btn-secondary btn-sm">
            <Sparkles size={13} /> Ver mi plan
          </button>
        </div>
      </div>
      <div className="grid gap-px bg-white/[0.07] md:grid-cols-3">
        {steps.map(({ title, detail, action, tab, icon: Icon }) => (
          <div key={tab} className="bg-ink-950/95 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-white"><Icon size={15} className="text-brand-300" /> {title}</p>
            <p className="mt-1.5 min-h-10 text-xs leading-relaxed text-ink-400">{detail}</p>
            <button onClick={() => onNavigate(tab)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-200 hover:text-white">
              {action} <ArrowRight size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
