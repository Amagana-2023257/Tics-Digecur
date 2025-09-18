// configs/mailer.js
import 'dotenv/config';
import nodemailer from 'nodemailer';

function bool(v, d = false) {
  if (v == null) return d;
  return ['1','true','yes','y','on'].includes(String(v).toLowerCase());
}

const {
  SMTP_HOST = 'smtp.gmail.com',
  SMTP_PORT = '465',
  SMTP_SECURE = 'true',        // true para 465 (SSL), false para 587 (STARTTLS)
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,                   // opcional. Ej: 'Digecur <no-reply@tu-dominio>'
} = process.env;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('[Mail] Faltan SMTP_USER/SMTP_PASS. No se podrán enviar correos.');
}

export function getTransport() {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: bool(SMTP_SECURE, true),
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * Envía correo con adjuntos.
 * @param {Object} opts
 * @param {string|string[]} opts.to   - Destinatarios (coma o array)
 * @param {string} opts.subject       - Asunto
 * @param {string} [opts.text]        - Texto plano
 * @param {string} [opts.html]        - HTML
 * @param {Array}  [opts.attachments] - [{ filename, content (Buffer), contentType }]
 */
export async function sendMail({ to, subject, text, html, attachments = [] }) {
  const transporter = getTransport();
  const from = MAIL_FROM || `Digecur <${SMTP_USER}>`;

  const info = await transporter.sendMail({
    from, to, subject, text, html, attachments,
  });

  console.log('────────────────────────── [Mail]');
  console.log('To:      ', to);
  console.log('Subject: ', subject);
  console.log('MessageID:', info.messageId);
  console.log('──────────────────────────────────');

  return info;
}
