import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendMail } from '@/lib/mail';
import { env } from '@/lib/env';
import { systemLog } from '@/lib/logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { escapeHtml, hashPersonalValue, requestIp } from '@/lib/security';

const Body = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  message: z.string().min(10).max(3000),
  website: z.string().max(0).optional(),
});

/** Formulario de contacto real: email al soporte + log. */
export async function POST(req: Request) {
  const rate = await consumeRateLimit('contact', requestIp(req), 5, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Revisa los campos (nombre, email válido, mensaje 10+ caracteres).' }, { status: 400 });
  }
  const { name, email, message } = parsed.data;
  if (parsed.data.website) return NextResponse.json({ ok: true, message: 'Mensaje recibido.' });
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  const to = env.smtpFrom.includes('@') ? env.smtpFrom : 'soporte@example.com';
  const result = await sendMail({
    to,
    subject: `Contacto web: ${name.replace(/[\r\n]/g, ' ')}`,
    text: `De: ${name} <${email}>\n\n${message}`,
    replyTo: email,
    html: `<p><strong>De:</strong> ${safeName} &lt;${safeEmail}&gt;</p><p>${safeMessage}</p>`,
  });

  await systemLog('info', 'contact', 'Mensaje de contacto recibido', { sent: result.sent, emailHash: hashPersonalValue(email).slice(0, 16) });
  return NextResponse.json({ ok: true, message: result.sent ? 'Mensaje enviado. Te respondemos en 24h laborables.' : result.message });
}
