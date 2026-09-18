import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { brand, supportEmail } from '@/lib/site';
import { PLANS, TRIAL_DAYS } from '@/lib/plans';

export const metadata: Metadata = { title: `Términos del servicio — ${brand}` };

export default function TerminosPage() {
  const pro = PLANS.pro;
  const business = PLANS.business;
  return (
    <LegalLayout title="Términos del servicio" updated="17 de septiembre de 2026">
      <h2>1. El servicio</h2>
      <p>
        {brand} ofrece, mediante suscripción de pago, herramientas para centralizar reseñas de
        plataformas de terceros, generar borradores de respuesta con IA, recibir alertas,
        gestionar quejas en privado y (plan Business) pedir valoraciones por WhatsApp al entregar
        un pedido. Hay dos planes de pago — <strong>Pro</strong> ({pro.price}/mes) y{' '}
        <strong>Business</strong> ({business.price}/mes) —, cada uno para{' '}
        <strong>1 empresa</strong>, con cuotas mensuales independientes (peticiones de opiniones,
        opiniones importadas, respuestas IA y sincronizaciones) y un tope de almacenamiento por
        empresa. No existe plan gratuito: todos los planes requieren suscripción activa. Los precios
        y límites vigentes se publican en la página de precios.
      </p>
      <h2>2. Cuenta y uso aceptable</h2>
      <ul>
        <li>Debes ser mayor de 18 años y actuar en nombre de un negocio o como profesional.</li>
        <li>Eres responsable de tu cuenta, de tus miembros y de las respuestas que publiques.</li>
        <li>Prohibido: publicar o encargar <strong>reseñas falsas</strong>, manipular valoraciones,
          suplantar identidades, extraer datos masivamente o usar el servicio para spam.</li>
        <li>Podemos suspender cuentas que incumplan estos términos o la ley.</li>
      </ul>
      <h2>3. Transparencia de reseñas (Directiva UE 2019/2161 «Ómnibus»)</h2>
      <ul>
        <li><strong>Procedencia:</strong> cada reseña muestra siempre su plataforma de origen (Google, Trustpilot, Facebook…).</li>
        <li><strong>Verificación:</strong> la insignia «Compra verificada» indica que la plataforma
          de origen confirma que el autor consumió el bien o servicio; si no consta, no se muestra.</li>
        <li><strong>Sin falsificaciones:</strong> no publicamos, compramos ni encargamos reseñas; los
          testimonios de nuestra web proceden de clientes reales y se retiran si dejan de serlo.</li>
        <li><strong>Ordenación:</strong> por defecto cronológica; los filtros disponibles se indican en el panel.</li>
        <li><strong>Derecho de réplica:</strong> todo negocio puede responder públicamente a cualquier reseña.</li>
      </ul>
      <h2>4. IA y responsabilidad sobre respuestas</h2>
      <p>
        La IA genera <strong>borradores</strong>: debes revisarlos antes de publicar. El negocio
        es el único responsable del contenido publicado en plataformas de terceros, que se rigen
        además por sus propias condiciones.
      </p>
      <h2>5. Precios, prueba gratis, facturación y cancelación</h2>
      <ul>
        <li><strong>Planes de pago:</strong> Pro ({pro.price}/mes, {pro.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones
          de opiniones al mes) y Business ({business.price}/mes, {business.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones
          de opiniones al mes). Sin suscripción activa no hay acceso a la plataforma.</li>
        <li><strong>Prueba de {TRIAL_DAYS} días (Pro y Business):</strong> requiere tarjeta vía Stripe pero no se
          realiza ningún cargo durante la prueba. Si cancelas antes de que termine, no pagas nada. Si
          el primer cobro no se completa, el acceso al panel se corta automáticamente el día {TRIAL_DAYS + 1} y tus
          datos se conservan 30 días.</li>
        <li><strong>Cuotas mensuales:</strong> cada ciclo incluye peticiones de opiniones ({pro.limits.requestsPerMonth} Pro /{' '}
          {business.limits.requestsPerMonth.toLocaleString('es-ES')} Business), opiniones guardadas, respuestas de IA y sincronizaciones
          automáticas. Al llegar al 100&nbsp;% de una cuota, las peticiones de esa función se bloquean
          con código <code>429</code> (cuota agotada) o <code>402</code> (falta plan o suscripción
          activa) hasta el siguiente ciclo o hasta comprar una recarga.</li>
        <li><strong>Límites de base de datos:</strong> cada plan fija un máximo de opiniones retenidas
          ({pro.limits.reviewsStored.toLocaleString('es-ES')} Pro / {business.limits.reviewsStored.toLocaleString('es-ES')} Business), de registros de auditoría y de conexiones
          simultáneas. Al superar el máximo, las filas más antiguas se <strong>purgan o archivan
          automáticamente</strong>; si necesitas conservar más histórico, puedes ampliar el
          almacenamiento o subir de plan.</li>
        <li><strong>Recargas puntuales:</strong> pago único, se aplican en el momento en que Stripe
          confirma el cobro y caducan al cierre del ciclo en curso. Paquetes disponibles: +1.000
          peticiones (9&nbsp;€), +2.000 opiniones (12&nbsp;€), +500 respuestas IA (15&nbsp;€) y +500
          sincronizaciones (6&nbsp;€). No son reembolsables una vez consumidas.</li>
        <li><strong>WhatsApp y email (planes Pro y Business):</strong> solo se escribe al contacto que el
          cliente facilitó; debes informar en tu checkout de que podrá recibir una solicitud de
          valoración. Respetamos las políticas de WhatsApp Business y las bajas («STOP»).</li>
        <li>Precios con impuestos indicados en el checkout; pago por adelantado vía Stripe.</li>
        <li>Sin permanencia: cancela cuando quieras; mantienes el acceso hasta el fin del periodo pagado.</li>
        <li>Consumidores UE: derecho de desistimiento de 14 días salvo que la ejecución haya comenzado con tu consentimiento.</li>
        <li>Impagos: el acceso se suspende automáticamente al caducar la prueba, fallar el pago o
          cancelar; los datos se conservan 30 días.</li>
      </ul>
      <h2>6. Disponibilidad y soporte</h2>
      <p>
        Objetivo de disponibilidad razonable sin garantía de servicio ininterrumpido. Soporte según
        plan (email o prioritario). Copias de seguridad a nivel de infraestructura;
        recomendamos exportar periódicamente tus datos.
      </p>
      <h2>7. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, nuestra responsabilidad se limita a las cuotas pagadas
        en los 12 meses anteriores. No respondemos de decisiones basadas en la IA, de cambios en
        las APIs de terceros ni del lucro cesante.
      </p>
      <h2>8. Cambios y contacto</h2>
      <p>
        Avisaremos cambios sustanciales con 15 días de antelación por email. Contacto:{' '}
        {supportEmail}. Legislación española; consumidores UE pueden acudir a la plataforma{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">ODR europea</a>.
      </p>
    </LegalLayout>
  );
}
