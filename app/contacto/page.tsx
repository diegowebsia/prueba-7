import type { Metadata } from 'next';
import { ContactClient } from './contact-client';

export const metadata: Metadata = {
  title: 'Contacto — ReviewFlow AI',
  description: 'Habla con el equipo de ReviewFlow AI. Respondemos en 24h laborables.',
};

export default function ContactoPage() {
  return <ContactClient />;
}
