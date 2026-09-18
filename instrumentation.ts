import { productionEnvErrors } from '@/lib/env-validation';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  // Next ejecuta instrumentation también durante ciertas fases del build.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const errors = productionEnvErrors();
  if (errors.length > 0) throw new Error(`Configuración de producción inválida: ${errors.join('; ')}`);
}
