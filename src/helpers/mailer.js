// src/lib/mailer.js
// Tiny, resilient mailer with HTML+text templates for inventory transfers.
// Uses Nodemailer (SMTP). Falls back to console logging if disabled.
//
// Env vars (examples):
// - MAIL_ENABLED=true
// - MAIL_FROM="DIGECUR Inventario <no-reply@digecur.gob.gt>"
// - SMTP_HOST=smtp.sendgrid.net
// - SMTP_PORT=587
// - SMTP_SECURE=false              // true for 465
// - SMTP_USER=apikey
// - SMTP_PASS=xxxxxxxxxxxxxxxx
// - APP_PUBLIC_URL=https://inventario.digecur.gob.gt
//
// Usage:
//   import mailer from '../lib/mailer.js';
//   await mailer.sendInviteCode({
//     to: 'destinatario@ejemplo.com',
//     code: '123456',
//     item: { noBien, nombreBien },
//     fromUser: { nombre, email },
//     motivo,
//     expiresAt: new Date()
//   });
//
import nodemailer from 'nodemailer';

const {
  MAIL_ENABLED = 'false',
  MAIL_FROM = 'Inventario <no-reply@example.com>',
  SMTP_HOST = '',
  SMTP_PORT = '587',
  SMTP_SECURE = 'false',
  SMTP_USER = '',
  SMTP_PASS = '',
  APP_PUBLIC_URL = '',
  NODE_ENV = 'development',
} = process.env;

const isEnabled = String(MAIL_ENABLED).toLowerCase() === 'true';
const isSecure = String(SMTP_SECURE).toLowerCase() === 'true';
const fromAddress = MAIL_FROM;

// Reusable transporter (lazy)
let _transporter = null;
async function getTransporter() {
  if (!isEnabled) return null;
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: isSecure, // true for 465, false for 587
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  // Silent verify (don't crash app if SMTP is temporarily down)
  try {
    await _transporter.verify();
    if (NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[mailer] SMTP connection verified');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[mailer] SMTP verify failed:', err?.message || err);
  }
  return _transporter;
}

/* ============ Base renderer (very simple, mobile friendly) ============ */
const styles = {
  container:
    'max-width:640px;margin:0 auto;padding:24px;background:#f7fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,"Noto Sans",sans-serif;color:#0f172a;',
  card:
    'background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 24px rgba(25,40,84,.08);overflow:hidden;',
  header:
    'background:linear-gradient(135deg,#192854 0%,#4993cc 60%,#24b2e3 100%);color:#fff;padding:18px 20px;',
  h1: 'margin:0;font-size:18px;line-height:1.3;font-weight:600;',
  body: 'padding:20px;color:#0f172a;font-size:14px;line-height:1.6;',
  btn: 'display:inline-block;background:#192854;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600;',
  meta: 'margin-top:10px;color:#475569;font-size:12px;',
  code: 'display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;font-size:16px;letter-spacing:2px;',
  footer: 'margin-top:16px;color:#64748b;font-size:12px;',
};

function wrapHtml({ title, content }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title || 'Notificación')}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
  </head>
  <body style="${styles.container}">
    <div style="${styles.card}">
      <div style="${styles.header}">
        <h1 style="${styles.h1}">${escapeHtml(title || 'Notificación')}</h1>
      </div>
      <div style="${styles.body}">
        ${content}
        <div style="${styles.footer}">
          Este es un mensaje automático del sistema de inventario. No respondas a este correo.
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/* =================== Templates (HTML + text) =================== */
function tplInviteCode({ code, item = {}, fromUser = {}, motivo, expiresAt }) {
  const title = 'Código de confirmación de traslado';
  const itemTitulo = [item.noBien, item.nombreBien].filter(Boolean).join(' · ');
  const appUrl = APP_PUBLIC_URL ? `${APP_PUBLIC_URL}` : '';

  const html = wrapHtml({
    title,
    content: `
      <p>Has recibido un código para confirmar el traslado de responsable del siguiente bien:</p>

      <ul>
        <li><b>Bien:</b> ${escapeHtml(itemTitulo || '—')}</li>
        <li><b>Solicitud creada por:</b> ${escapeHtml(fromUser?.nombre || fromUser?.email || '—')}</li>
        ${motivo ? `<li><b>Motivo:</b> ${escapeHtml(motivo)}</li>` : ''}
        ${expiresAt ? `<li><b>Vence:</b> ${new Date(expiresAt).toLocaleString('es-GT')}</li>` : ''}
      </ul>

      <p>Introduce este código en la pantalla de confirmación:</p>

      <div style="${styles.code}">${escapeHtml(code || '')}</div>

      ${
        appUrl
          ? `<p style="${styles.meta}">Accede al sistema: <a href="${appUrl}">${appUrl}</a></p>`
          : ''
      }
    `,
  });

  const text =
    `${title}\n\n` +
    `Bien: ${itemTitulo || '—'}\n` +
    `Solicitante: ${fromUser?.nombre || fromUser?.email || '—'}\n` +
    (motivo ? `Motivo: ${motivo}\n` : '') +
    (expiresAt ? `Vence: ${new Date(expiresAt).toLocaleString('es-GT')}\n` : '') +
    `\nCódigo: ${code || ''}\n` +
    (APP_PUBLIC_URL ? `\nSistema: ${APP_PUBLIC_URL}\n` : '');

  return { subject: 'Código de confirmación de traslado', html, text };
}

function tplTransferApproved({ item = {}, toUser = {} }) {
  const title = 'Traslado aprobado';
  const itemTitulo = [item.noBien, item.nombreBien].filter(Boolean).join(' · ');

  const html = wrapHtml({
    title,
    content: `
      <p>El traslado de responsable ha sido <b>aprobado</b>.</p>
      <ul>
        <li><b>Bien:</b> ${escapeHtml(itemTitulo || '—')}</li>
        <li><b>Nuevo responsable:</b> ${escapeHtml(toUser?.nombre || toUser?.email || '—')}</li>
      </ul>
    `,
  });

  const text =
    `${title}\n\n` +
    `Bien: ${itemTitulo || '—'}\n` +
    `Nuevo responsable: ${toUser?.nombre || toUser?.email || '—'}\n`;

  return { subject: 'Traslado aprobado', html, text };
}

function tplGeneric({ title = 'Notificación', message = '' }) {
  const html = wrapHtml({
    title,
    content: `<p>${escapeHtml(message || '')}</p>`,
  });
  const text = `${title}\n\n${message || ''}`;
  return { subject: title, html, text };
}

/* ========================= Sender helpers ========================= */
async function sendMail({ to, subject, html, text, attachments } = {}) {
  // Soft-disable in dev/test or when MAIL_ENABLED=false
  if (!isEnabled) {
    // eslint-disable-next-line no-console
    console.log('[mailer:disabled] Would send mail:', {
      to,
      subject,
      preview: (text || html || '').slice(0, 260),
    });
    return { success: true, disabled: true };
  }

  const transporter = await getTransporter();
  if (!transporter) {
    return { success: false, error: 'No SMTP transporter available' };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html,
      attachments,
    });
    if (NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[mailer] sent:', info.messageId);
    }
    return { success: true, messageId: info.messageId };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mailer] send error:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/* ===================== Specialized functions ===================== */
async function sendInviteCode({ to, code, item, fromUser, motivo, expiresAt }) {
  if (!to || !code) {
    return { success: false, error: 'Missing "to" or "code"' };
  }
  const { subject, html, text } = tplInviteCode({ code, item, fromUser, motivo, expiresAt });
  return await sendMail({ to, subject, html, text });
}

async function sendTransferApproved({ to, item, toUser }) {
  if (!to) {
    return { success: false, error: 'Missing "to"' };
  }
  const { subject, html, text } = tplTransferApproved({ item, toUser });
  return await sendMail({ to, subject, html, text });
}

async function sendGeneric({ to, title, message }) {
  if (!to) return { success: false, error: 'Missing "to"' };
  const { subject, html, text } = tplGeneric({ title, message });
  return await sendMail({ to, subject, html, text });
}

export { sendMail, sendInviteCode, sendTransferApproved, sendGeneric };

/* ✅ Export default (para `import mailer from ...`) */
export default {
  sendMail,
  sendInviteCode,
  sendTransferApproved,
  sendGeneric,
};