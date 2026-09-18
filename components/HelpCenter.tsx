'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpenText, CircleHelp, CreditCard, KeyRound, MessageCircle, Plug, Rocket, Sparkles, X } from 'lucide-react';
import { Accordion } from '@/components/Accordion';
import { EASE } from '@/components/Motion';
import { useToast } from '@/components/Toast';

/**
 * Centro de ayuda contextual (v3.7.0).
 *
 * Sustituye la necesidad de leer las guías extensas (ahora en `docs/`):
 * condensamos solo lo que el cliente necesita, como FAQs desplegables
 * cortas y accionables. Se abre desde el icono «Ayuda» de la cabecera del
 * panel y desde la pestaña «Facturación y cuota».
 */

export type HelpCenterProps = {
  open: boolean;
  onClose: () => void;
};

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-4 text-sm leading-relaxed text-ink-300">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ol>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-2xs text-ink-200">{children}</code>
);

export function HelpCenter({ open, onClose }: HelpCenterProps) {
  const toast = useToast();

  // Cierra con Escape y bloquea el scroll de fondo.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  function copyApiKey() {
    try {
      const key = localStorage.getItem('rf-api-key');
      if (key) {
        navigator.clipboard?.writeText(key).then(
          () => toast({ kind: 'success', title: 'API key copiada' }),
          () => toast({ kind: 'error', title: 'No se pudo copiar' }),
        );
        return;
      }
    } catch {
      /* sin clipboard */
    }
    toast({
      kind: 'info',
      title: 'Tu API key está en «Empresa y conexiones»',
      body: 'Cópiala desde ahí para usar la API de ingesta o el webhook de tu tienda.',
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/75 p-4 backdrop-blur-sm sm:p-6"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Ayuda"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="card my-4 w-full max-w-2xl overflow-hidden sm:my-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(37,99,235,0.3),rgba(139,92,246,0.25))] text-brand-200">
                  <CircleHelp size={17} />
                </span>
                <div>
                  <h2 className="text-base font-extrabold tracking-tightish text-white">Ayuda</h2>
                  <p className="text-2xs text-ink-400">Lo esencial en minutos · guías completas en el repositorio</p>
                </div>
              </div>
              <button onClick={onClose} className="btn-quiet btn-sm" aria-label="Cerrar ayuda">
                <X size={15} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-2">
              <Accordion
                defaultOpen={0}
                items={[
                  {
                    id: 'help-primeros',
                    title: 'Primeros pasos (5 min)',
                    icon: <Rocket size={16} className="text-brand-300" />,
                    meta: 'Para empezar',
                    content: (
                      <div className="space-y-3">
                        <StepList
                          items={[
                            'Elegir plan y activar la prueba de 7 días con tarjeta (no se cobra durante la prueba).',
                            'Crear la empresa (o déjala que se cree sola al confirmar Stripe).',
                            'Conectar al menos una fuente de reseñas en «Empresa y conexiones».',
                            'Elegir el tono de la IA y probar una respuesta con una reseña real.',
                          ]}
                        />
                        <p className="text-xs text-ink-500">
                          ¿Sin tarjeta? También puedes explorar todo el panel en modo demo desde{' '}
                          <Kbd>/dashboard?demo=1</Kbd>.
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: 'help-stripe',
                    title: 'Planes y recargas (Stripe)',
                    icon: <CreditCard size={16} className="text-emerald-300" />,
                    meta: 'Cobros',
                    content: (
                      <div className="space-y-3">
                        <StepList
                          items={[
                            'Crea 2 productos recurrentes: «Pro» 29 €/mes y «Business» 79 €/mes (la prueba de 7 días la aplica el código con trial_period_days: 7). No hay plan gratuito: todo pasa por Stripe.',
                            'Recargas puntuales opcionales: sin Price ID el checkout se crea en línea con los precios de lib/plans.ts (son siempre de pago único, sin suscripciones paralelas).',
                            'Añade el webhook apuntando a /api/stripe/webhook con los eventos checkout.session.completed, invoice.payment_succeeded, customer.subscription.updated/deleted y invoice.payment_failed.',
                          ]}
                        />
                        <p className="text-xs text-ink-500">
                          Cada línea comprada se aplica al instante: el webhook itera todos los line_items y
                          actualiza la cuota de tu empresa.
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: 'help-cuotas',
                    title: 'Límites: entender 402, 403, 429 y 507',
                    icon: <BookOpenText size={16} className="text-violet-300" />,
                    meta: 'Resolución',
                    content: (
                      <div className="space-y-2 text-sm leading-relaxed text-ink-300">
                        <p>
                          <strong className="text-rose-300">402</strong> — suscripción sin acceso (prueba caducada,
                          impago). Actualiza el pago en el portal de Stripe.
                        </p>
                        <p>
                          <strong className="text-amber-300">403</strong> — la acción no está incluida en tu plan
                          (p. ej. la conexión con tienda requiere Business).
                        </p>
                        <p>
                          <strong className="text-rose-300">429</strong> — cuota del mes agotada. La respuesta indica
                          cuándo se renueva; puedes ampliar al instante desde «Facturación y cuota» con una
                          recarga puntual (pago único).
                        </p>
                        <p>
                          <strong className="text-brand-200">429 (tokens)</strong> — has agotado el presupuesto de
                          IA de tu plan. Se reinicia el día 1; mientras tanto la IA se pausa y tus respuestas
                          siguen funcionando con plantillas. Puedes ampliarlo con la recarga
                          <Kbd>+500 respuestas IA</Kbd> desde «Facturación y cuota».
                        </p>
                        <p>
                          <strong className="text-amber-200">507</strong> — límite de almacenamiento de tu plan
                          (opiniones guardadas o conexiones). Las opiniones más antiguas se purgan solas; si
                          necesitas más histórico, amplía el espacio o pasa a un plan superior.
                        </p>
                        <p className="text-xs text-ink-500">
                          Nada importante se borra: opiniones y respuestas siguen visibles dentro del límite
                          de tu plan y el resto se archiva de forma automática.
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: 'help-ia',
                    title: 'IA: borradores, tono y presupuesto de tokens',
                    icon: <Sparkles size={16} className="text-brand-300" />,
                    meta: 'IA',
                    content: (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-ink-300">
                          La IA lee la reseña, tu tono configurado y los datos de tu negocio, y escribe un
                          borrador listo para publicar (o un aviso privado si la reseña es de 1 a 3★). Tú
                          siempre revisas antes de publicar.
                        </p>
                        <StepList
                          items={[
                            'Elige el tono en «Empresa y conexiones»: cercano, profesional o directo.',
                            'Pulsa «Generar borrador» en cualquier reseña. Tarda unos segundos y puedes editarlo.',
                            'Cada borrador consume 1 crédito de IA y los tokens reales que use (entrada + salida).',
                            'En «Facturación y cuota → Presupuesto de IA» ves los tokens del ciclo, los que te quedan y el coste estimado.',
                          ]}
                        />
                        <p className="text-xs text-ink-500">
                          Si el proveedor de IA no responde, la plataforma reintenta y, como último recurso, usa
                          una plantilla profesional local: nunca te quedas sin poder contestar.
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: 'help-conexiones',
                    title: 'Conexiones: Google, WhatsApp, Trustpilot, tienda',
                    icon: <Plug size={16} className="text-brand-300" />,
                    meta: 'Integraciones',
                    content: (
                      <div className="space-y-3">
                        <StepList
                          items={[
                            'Google Business (OAuth 1 clic) o Google Places pegando tu Place ID.',
                            'Trustpilot: API key + Business Unit ID del plan Business.',
                            'WhatsApp Cloud API: WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID en el servidor, y el móvil destino en «Empresa y conexiones».',
                            'Shopify: webhook «Fulfillment events» a la URL que te da el panel. WooCommerce: webhook «Order updated» (completed) a la misma URL.',
                          ]}
                        />
                        <p className="text-xs text-ink-500">
                          Si una integración no arranca, el panel lo marca en rojo con el motivo exacto.
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: 'help-api',
                    title: 'API y webhook de tu tienda',
                    icon: <MessageCircle size={16} className="text-emerald-300" />,
                    meta: 'Integración',
                    content: (
                      <div className="space-y-3">
                        <StepList
                          items={[
                            'Copia la api_key de tu empresa (pestaña «Empresa y conexiones»).',
                            'Al entregar un pedido, llama a POST /api/integrations/store/order-delivered con api_key, order_id, customer_name y customer_phone.',
                            'Si la cuota está agotada el webhook responde con un estado informativo (no 5xx): no rompe ni reintegra envíos en tu tienda.',
                          ]}
                        />
                        <button type="button" onClick={copyApiKey} className="btn-secondary btn-sm">
                          <KeyRound size={13} /> Copiar mi API key
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-5 py-3">
              <p className="text-2xs text-ink-500">
                ¿Necesitas algo más? Escríbenos y respondemos en 24 h laborables.
              </p>
              <a href="/contacto" className="btn-secondary btn-sm" onClick={onClose}>
                Contactar
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
