'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  FileWarning,
  Mail,
  Phone,
  ScanSearch,
  ShieldAlert,
  StickyNote,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Skeleton';
import { Stars } from '@/components/dashboard/Stars';
import { EASE } from '@/components/Motion';
import { describeApiError } from '@/components/dashboard/types';
import type { DemoReview } from '@/lib/demo';
import { cn } from '@/lib/utils';

type Inspection = {
  severity: 'baja' | 'media' | 'alta' | 'critica';
  category: string;
  legalRisk: boolean;
  suggestedChannel: 'privado' | 'telefono' | 'publico';
  summary: string;
  actionPlan: string[];
  provider: 'openai' | 'local-heuristic';
};

const SEVERITY_STYLE: Record<Inspection['severity'], string> = {
  baja: 'badge',
  media: 'badge-warn',
  alta: 'badge-warn',
  critica: 'badge-danger',
};

/**
 * Cola de gestión privada (quejas ≤3★): inspección IA de la reclamación,
 * mensaje conciliador interno y nota de seguimiento del equipo.
 * Nada de esto se publica en la plataforma.
 */
export function TriageCard({
  review: r,
  demo,
  tone,
  businessName,
}: {
  review: DemoReview;
  demo: boolean;
  tone: 'profesional' | 'cercano' | 'formal';
  businessName: string;
}) {
  const toast = useToast();
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [loadingScan, setLoadingScan] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [privateMsg, setPrivateMsg] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [note, setNote] = useState(r.private_note ?? '');

  async function genPrivate() {
    setLoadingMsg(true);
    try {
      const res = await fetch('/api/reviews/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: r.id,
          businessName,
          authorName: r.author,
          rating: r.rating,
          reviewText: r.text,
          tone,
          private: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body, action: described.action });
        return;
      }
      setPrivateMsg(data.reply ?? '');
      toast({
        kind: 'success',
        title: 'Mensaje privado listo',
        body: `Generado con ${data.provider === 'openai' ? 'OpenAI' : 'plantilla local'} · 1 evento consumido`,
      });
      window.dispatchEvent(new Event('rf:quota-refresh'));
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo generar', body: e?.message });
    } finally {
      setLoadingMsg(false);
    }
  }

  async function inspect() {
    setLoadingScan(true);
    try {
      const res = await fetch('/api/reviews/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: r.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body, action: described.action });
        return;
      }
      setInspection(data.inspection as Inspection);
      toast({
        kind: 'success',
        title: 'Queja inspeccionada',
        body: `Severidad ${data.inspection?.severity} · ${data.inspection?.category}`,
      });
      window.dispatchEvent(new Event('rf:quota-refresh'));
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo inspeccionar', body: e?.message });
    } finally {
      setLoadingScan(false);
    }
  }

  async function saveNote() {
    setSavingNote(true);
    try {
      const res = await fetch('/api/reviews/private-note', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: r.id, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body });
        return;
      }
      toast({ kind: 'success', title: 'Nota guardada', body: 'Solo tu equipo puede verla.' });
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo guardar', body: e?.message });
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <article className="card card-hover border-amber-400/25">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold tracking-tightish text-white">
            <ShieldAlert size={15} className="shrink-0 text-amber-300" />
            {r.author}
            <span className="font-normal text-ink-500">· {r.tenant}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
            <Stars n={r.rating} />
            <span className="badge-warn">gestión privada</span>
            <span>{new Date(r.created_at).toLocaleDateString('es-ES')}</span>
            <span className="badge capitalize">{r.source}</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-200">{r.text}</p>

      {!demo && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={inspect} disabled={loadingScan} className="btn-secondary btn-sm">
            {loadingScan ? <Spinner label="Inspeccionando…" size={13} /> : (<><ScanSearch size={13} /> Inspeccionar queja con IA</>)}
          </button>
          <button onClick={genPrivate} disabled={loadingMsg} className="btn-secondary btn-sm">
            {loadingMsg ? <Spinner label="Redactando…" size={13} /> : (<><Mail size={13} /> Mensaje privado conciliador</>)}
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {inspection && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5">
              <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-400">
                <FileWarning size={13} className="text-amber-300" /> Inspección de la queja
                <span className={cn(SEVERITY_STYLE[inspection.severity], 'ml-auto normal-case tracking-normal')}>
                  severidad {inspection.severity}
                </span>
              </p>
              <div className="mt-2.5 grid gap-2 text-xs sm:grid-cols-3">
                <p className="rounded-lg bg-white/[0.03] px-2.5 py-2 text-ink-300">
                  Categoría <span className="block font-semibold text-white">{inspection.category}</span>
                </p>
                <p className="rounded-lg bg-white/[0.03] px-2.5 py-2 text-ink-300">
                  Canal sugerido{' '}
                  <span className="flex items-center gap-1 font-semibold text-white">
                    {inspection.suggestedChannel === 'telefono' ? <Phone size={11} /> : <Mail size={11} />}
                    {inspection.suggestedChannel}
                  </span>
                </p>
                <p
                  className={cn(
                    'rounded-lg px-2.5 py-2',
                    inspection.legalRisk
                      ? 'bg-rose-500/12 text-rose-100'
                      : 'bg-white/[0.03] text-ink-300',
                  )}
                >
                  Riesgo de reclamación{' '}
                  <span className="block font-semibold">
                    {inspection.legalRisk ? 'Sí — escalar a dirección' : 'No detectado'}
                  </span>
                </p>
              </div>
              <ul className="mt-2.5 space-y-1.5 text-xs text-ink-300">
                {inspection.actionPlan.map((step) => (
                  <li key={step} className="flex gap-2">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300/80" />
                    {step}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-ink-500">
                Análisis: {inspection.provider === 'openai' ? 'OpenAI' : 'heurística local (sin clave OpenAI)'} · 1 evento de IA consumido
              </p>
            </div>
          </motion.div>
        )}

        {privateMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3.5 text-sm">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-200">
                <Mail size={13} /> Mensaje conciliador (interno, NO se publica)
              </p>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-amber-50">{privateMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!demo && (
        <div className="mt-3">
          <label className="label flex items-center gap-1.5 text-xs" htmlFor={`note-${r.id}`}>
            <StickyNote size={12} /> Nota de seguimiento (solo tu equipo la ve)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`note-${r.id}`}
              className="input flex-1"
              placeholder="Ej.: llamado el 18/09, le regalamos el postre. Volver a contactar en 7 días."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button onClick={saveNote} disabled={savingNote} className="btn-secondary btn-sm sm:h-[42px]">
              {savingNote ? <Spinner label="Guardando…" size={13} /> : 'Guardar nota'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
