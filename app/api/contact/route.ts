import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendMail } from '@/lib/mail';
import { env } from '@/lib/env';
import { systemLog } from '@/lib/logger';

const Body = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  message: z.string().min(10).max(3000),
});

/** Formulario de contacto real: email al soporte + log. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Revisa los campos (nombre, email válido, mensaje 10+ caracteres).' }, { status: 400 });
  }
  const { name, email, message } = parsed.data;

  const to = env.smtpFrom.includes('@') ? env.smtpFrom : 'soporte@example.com';
  const result = await sendMail({
    to,
    subject: `📩 Contacto web: ${name}`,
    text: `De: ${name} <${email}>\n\n${message}`,
    html: `<p><strong>De:</strong> ${name} &lt;${email}&gt;</p><p>${message.replace(/\n/g, '<br>')}</p>`,
  });

  await systemLog('info', 'contact', `Mensaje de ${email}`, { sent: result.sent });
  return NextResponse.json({ ok: true, message: result.sent ? 'Mensaje enviado. Te respondemos en 24h laborables.' : result.message });
}
