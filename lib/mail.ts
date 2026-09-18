import nodemailer from 'nodemailer';
import { env, isSmtpConfigured } from '@/lib/env';

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

/**
 * Envío SMTP genérico (agnóstico: Brevo, Postmark, SES, Gmail, tu VPS...).
 * Si no hay SMTP configurado, registra en consola y devuelve { sent: false }.
 */
export async function sendMail(input: SendMailInput): Promise<{ sent: boolean; message: string }> {
  if (!isSmtpConfigured) {
    console.log('[mail:demo] SMTP no configurado. Email omitido:', {
      to: input.to,
      subject: input.subject,
    });
    return { sent: false, message: 'SMTP no configurado (modo demo): email registrado en logs.' };
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });

  await transporter.sendMail({
    from: env.smtpFrom,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });

  return { sent: true, message: 'Email enviado.' };
}
