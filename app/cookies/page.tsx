import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { SITE } from '@/lib/site';
import { CookieSettingsButton } from '@/components/CookieSettingsButton';

export const metadata: Metadata = { title: `Política de cookies — ${SITE.brand}` };

export default function CookiesPage() {
  return (
    <LegalLayout title="Política de cookies" updated="17 de septiembre de 2026">
      <h2>1. Qué usamos</h2>
      <p>
        {SITE.brand} funciona con <strong>cookies técnicas necesarias</strong> (sesión y seguridad).
        Las cookies de <strong>analítica</strong> y <strong>marketing</strong> son opcionales y{' '}
        <strong>solo se activan si las aceptas</strong> en el banner o en el panel de preferencias.
        Sin tu aceptación, no se carga ningún script de terceros.
      </p>
      <p><CookieSettingsButton /></p>
      <h2>2. Tabla de cookies</h2>
      <table>
        <thead>
          <tr><th>Nombre</th><th>Tipo</th><th>Finalidad</th><th>Duración</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>sb-*</code></td>
            <td>Técnica (necesaria)</td>
            <td>Sesión de autenticación (Supabase)</td>
            <td>Sesión / 1 año</td>
          </tr>
          <tr>
            <td><code>rf-consent-v1</code></td>
            <td>Técnica (necesaria)</td>
            <td>Recuerda tu decisión de cookies</td>
            <td>12 meses</td>
          </tr>
          <tr>
            <td>Analítica*</td>
            <td>Opcional</td>
            <td>Medición anónima (Plausible, sin cookies) — solo si aceptas y está configurada</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Marketing*</td>
            <td>Opcional</td>
            <td>Publicidad/remarketing — solo si aceptas y se configura</td>
            <td>Según proveedor</td>
          </tr>
        </tbody>
      </table>
      <h2>3. Cómo cambiar tu decisión</h2>
      <p>
        Puedes modificar o retirar tu consentimiento en cualquier momento desde el botón
        «Configurar cookies» del pie de página, desde esta página o borrando las cookies en tu
        navegador. El tratamiento previo a la retirada sigue siendo lícito.
      </p>
      <h2>4. Más información</h2>
      <p>
        Consulta la <a href="/privacidad">Política de Privacidad</a> y la guía de cookies de la{' '}
        <a href="https://www.aepd.es" target="_blank" rel="noreferrer">AEPD</a>. Contacto:{' '}
        {SITE.email}.
      </p>
    </LegalLayout>
  );
}
