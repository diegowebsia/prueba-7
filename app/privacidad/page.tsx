import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { address, brand, cif, companyName, legalEmail } from '@/lib/site';

export const metadata: Metadata = { title: `Política de privacidad — ${brand}` };

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de privacidad (RGPD / LOPDGDD)" updated="17 de septiembre de 2026">
      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>{companyName}</strong> ({cif}), {address}</li>
        <li><strong>Email privacidad:</strong> {legalEmail}</li>
      </ul>
      <h2>2. Datos que tratamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> email y contraseña cifrada (autenticación).</li>
        <li><strong>Empresas:</strong> nombre del negocio, miembros y configuración.</li>
        <li><strong>Reseñas:</strong> datos ya públicos en origen (autor, texto, puntuación) para su gestión.</li>
        <li><strong>Facturación:</strong> gestionada por Stripe; no almacenamos tarjetas.</li>
        <li><strong>Técnicos:</strong> logs de seguridad y cookies necesarias.</li>
      </ul>
      <h2>3. Finalidades y base jurídica (art. 6 RGPD)</h2>
      <ul>
        <li>Prestación del servicio contratado (ejecución del contrato).</li>
        <li>Seguridad, prevención del fraude y cumplimiento legal (interés legítimo / obligación legal).</li>
        <li>Comunicaciones comerciales: solo con tu consentimiento (revocable en cualquier momento).</li>
        <li>Analítica/marketing opcionales: solo con consentimiento previo (ver <a href="/cookies">Cookies</a>).</li>
      </ul>
      <h2>4. Encargados y transferencias</h2>
      <p>
        Tratamos datos con encargados bajo contrato (art. 28 RGPD): alojamiento de base de datos
        y autenticación (Supabase, UE), pagos (Stripe), email (tu proveedor SMTP) e IA opcional
        (OpenAI, solo el texto necesario para generar borradores). No vendemos datos. Las
        transferencias fuera del EEE, en su caso, se amparan en cláusulas contractuales tipo.
      </p>
      <h2>5. Conservación</h2>
      <p>
        Conservamos los datos mientras dure la cuenta y, tras la baja, bloqueados durante los
        plazos legales (p. ej. 6 años mercantil/fiscal). Puedes solicitar la supresión cuando quieras.
      </p>
      <h2>6. Tus derechos</h2>
      <p>
        Acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a{' '}
        {legalEmail} con copia de tu DNI. También puedes reclamar ante la{' '}
        <a href="https://www.aepd.es" target="_blank" rel="noreferrer">AEPD</a>
        (www.aepd.es). Respondemos en el plazo legal de un mes.
      </p>
      <h2>7. Menores</h2>
      <p>El servicio está dirigido a empresas y mayores de 18 años. No recabamos datos de menores deliberadamente.</p>
      <h2>8. Seguridad</h2>
      <p>
        Cifrado TLS, contraseñas con hash, aislamiento de datos por empresa (RLS) y accesos
        administrativos auditados. Notificaremos brechas según los arts. 33-34 RGPD.
      </p>
    </LegalLayout>
  );
}
