/**
 * Google Maps — enlaces reales de «déjanos una reseña» por empresa.
 * La empresa pega su Place ID (se obtiene gratis en 1 min, ver docs/GUIA_PASOS_MANUALES.md)
 * y el panel genera el enlace universal + el de búsqueda.
 */

/** Enlace directo a escribir reseña (requiere Place ID). */
export function googleReviewLink(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

