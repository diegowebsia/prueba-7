import type { Metadata } from 'next';
import { AboutClient } from './about-client';

export const metadata: Metadata = {
  title: 'Sobre nosotros — ReviewFlow AI',
  description: 'Misión, valores y cómo funciona ReviewFlow AI por dentro.',
};

export default function SobreNosotrosPage() {
  return <AboutClient />;
}
