export function normalizeCampaign(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  // Las campañas son etiquetas operativas: rechaza emails, URLs y posibles teléfonos/IDs largos.
  if (/@|https?:\/\/|\d{7,}/i.test(raw)) return null;
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return normalized || null;
}
