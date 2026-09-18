'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/Motion';

/**
 * Acordeón accesible con animación de altura real (no `hidden/block`).
 * Se usa en: FAQ de la landing, desglose de planes, secciones del panel
 * (conexiones, facturación, integraciones).
 */

export type AccordionEntry = {
  id?: string;
  title: React.ReactNode;
  content: React.ReactNode;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
};

export function AccordionItem({
  title,
  children,
  open,
  onToggle,
  icon,
  meta,
  className,
  panelClassName,
  id,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  panelClassName?: string;
  id?: string;
}) {
  const autoId = useId();
  const key = id ?? autoId;

  return (
    <div data-open={open} className={cn('accordion-item', className)}>
      <h3 className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${key}-panel`}
          id={`${key}-trigger`}
          className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.03]"
        >
          {icon && (
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-300',
                open
                  ? 'border-brand-400/40 bg-brand-500/15 text-brand-200 shadow-[0_0_20px_-8px_rgba(59,118,240,0.9)]'
                  : 'border-white/10 bg-white/[0.04] text-ink-300',
              )}
            >
              {icon}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold tracking-tightish text-white">{title}</span>
            {meta && <span className="mt-0.5 block text-xs text-ink-400">{meta}</span>}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
              open ? 'border-brand-400/40 bg-brand-500/15 text-brand-200' : 'border-white/10 text-ink-300',
            )}
          >
            <ChevronDown size={15} />
          </motion.span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={`${key}-panel`}
            id={`${key}-panel`}
            role="region"
            aria-labelledby={`${key}-trigger`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="overflow-hidden"
          >
            <div className={cn('px-5 pb-5 pt-0.5', panelClassName)}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Grupo de acordeones con apertura exclusiva (uno a la vez) o múltiple.
 * `defaultOpen` admite índice (exclusivo) o array (múltiple).
 */
export function Accordion({
  items,
  exclusive = true,
  defaultOpen = null,
  className,
  itemClassName,
  renderContent,
}: {
  items: AccordionEntry[];
  exclusive?: boolean;
  defaultOpen?: number | number[] | null;
  className?: string;
  itemClassName?: string;
  renderContent?: (item: AccordionEntry, index: number) => React.ReactNode;
}) {
  const initial = Array.isArray(defaultOpen)
    ? defaultOpen
    : defaultOpen === null || defaultOpen === undefined
      ? []
      : [defaultOpen];
  const [open, setOpen] = useState<number[]>(initial);

  function toggle(i: number) {
    setOpen((prev) => {
      const isOpen = prev.includes(i);
      if (exclusive) return isOpen ? [] : [i];
      return isOpen ? prev.filter((x) => x !== i) : [...prev, i];
    });
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, i) => (
        <AccordionItem
          key={item.id ?? `${i}`}
          id={item.id ?? `acc-${i}`}
          open={open.includes(i)}
          onToggle={() => toggle(i)}
          title={item.title}
          icon={item.icon}
          meta={item.meta}
          className={itemClassName}
        >
          {renderContent ? renderContent(item, i) : item.content}
        </AccordionItem>
      ))}
    </div>
  );
}
