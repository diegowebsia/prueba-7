import type { Metadata } from 'next';
import { Landing } from '@/components/Landing';

export const metadata: Metadata = {
  title: 'ReviewFlow AI — Todas tus reseñas, respondidas con IA',
  description:
    'Centraliza Google, Trustpilot y tus tiendas en una sola bandeja y responde en segundos con IA. Prueba 7 días gratis. Cumple RGPD.',
};

export default function HomePage() {
  return <Landing />;
}
