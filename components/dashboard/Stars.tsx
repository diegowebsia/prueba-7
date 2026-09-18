import { Star } from 'lucide-react';

/** Estrellas de valoración (1-5) con estados llenos/vacíos. */
export function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={
            i <= n
              ? 'fill-amber-400 text-amber-400'
              : 'text-ink-600'
          }
        />
      ))}
    </span>
  );
}
