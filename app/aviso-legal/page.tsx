import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { address, brand, cif, companyName, domain, legalEmail } from '@/lib/site';

export const metadata: Metadata = { title: `Aviso legal — ${brand}` };

export default function AvisoLegalPage() {
  return (
    <LegalLayout title="Aviso legal" updated="17 de septiembre de 2026">
      <h2>1. Datos identificativos (art. 10 LSSI-CE)</h2>
      <ul>
        <li><strong>Titular:</strong> {companyName}</li>
        <li><strong>CIF/NIF:</strong> {cif}</li>
        <li><strong>Domicilio:</strong> {address}</li>
        <li><strong>Email de contacto:</strong> {legalEmail}</li>
        <li><strong>Nombre comercial:</strong> {brand} ({domain})</li>
      </ul>
      <p>
        <em>Este documento es una plantilla informativa y no constituye asesoramiento jurídico.</em>
      </p>
      <h2>2. Objeto</h2>
      <p>
        {brand} es una plataforma SaaS que permite a empresas centralizar las reseñas
        publicadas sobre sus negocios en plataformas de terceros (Google, Trustpilot, Facebook) y
        gestionar respuestas, con ayuda de inteligencia artificial.
      </p>
      <h2>3. Condiciones de uso</h2>
      <p>
        El acceso a este sitio implica la aceptación del presente aviso, la{' '}
        <a href="/privacidad">Política de Privacidad</a>, los{' '}
        <a href="/terminos">Términos del Servicio</a> y la{' '}
        <a href="/cookies">Política de Cookies</a>. Queda prohibido el uso con fines ilícitos,
        el intento de acceso no autorizado y la extracción masiva automatizada de contenidos.
      </p>
      <h2>4. Propiedad intelectual</h2>
      <p>
        Todos los contenidos propios (código, diseño, textos y marcas) pertenecen al titular o a
        sus licenciantes. Las reseñas mostradas pertenecen a sus autores y a las plataformas de
        origen, y se reproducen únicamente como herramienta de gestión para el negocio aludido.
      </p>
      <h2>5. Responsabilidad</h2>
      <p>
        El titular no garantiza la disponibilidad ininterrumpida del servicio ni responde de los
        contenidos publicados por terceros (reseñas, respuestas generadas por usuarios). Las
        respuestas redactadas con IA son borradores bajo responsabilidad del negocio que los publica.
      </p>
      <h2>6. Legislación y jurisdicción</h2>
      <p>
        Este sitio se rige por la legislación española y europea. Para consumidores residentes en
        la UE existe la plataforma de resolución de litigios en línea de la Comisión Europea:{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">
          ec.europa.eu/consumers/odr
        </a>.
      </p>
    </LegalLayout>
  );
}
