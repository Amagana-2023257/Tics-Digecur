// src/middlewares/upload-cardex.js
import multer from 'multer';
import path from 'path';
import { sendMail } from '../../configs/mailer.js';
import { cloudinary } from '../../configs/cloudinary.js';

/* ===== MIME permitidos ===== */
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

/* ===== Límites correo (adjunto) ===== */
const MAX_MB = Number(process.env.MAX_EMAIL_ATTACHMENT_MB || '20'); // Gmail ≈ 25MB tope
const MAX_BYTES = MAX_MB * 1024 * 1024;

/* ===== Multer (memoria) ===== */
const fileFilter = (_req, file, cb) => {
  if (!ALLOWED.has(file.mimetype)) {
    console.warn('[Upload] MIME no permitido:', file.mimetype);
    return cb(new Error('Tipo de archivo no permitido'), false);
  }
  cb(null, true);
};
const storage = multer.memoryStorage();
const baseUploader = multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES } });

export const uploadCardex = baseUploader.single('file');
export const uploadCardexFlex = baseUploader.fields([
  { name: 'file', maxCount: 1 },
  { name: 'document', maxCount: 1 },
  { name: 'archivo', maxCount: 1 },
]);

/* ===== Helpers ===== */
function buildFilename(originalname = '') {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const rnd = Math.random().toString(36).slice(2, 8);
  const ext = (path.extname(originalname) || '').toLowerCase();
  return `${ts}_${rnd}${ext || ''}`;
}
function pickFileFromReq(req) {
  if (req.file) return req.file;
  return req.files?.file?.[0] || req.files?.document?.[0] || req.files?.archivo?.[0] || null;
}
export function logUploadEnter(req, _res, next) {
  console.log('─── [Upload Enter]', req.method, req.originalUrl);
  console.log('Content-Type:', req.headers['content-type']);
  next();
}
export function logAfterMulter(req, _res, next) {
  const f = pickFileFromReq(req);
  if (!f) {
    console.warn('[Upload] Multer no capturó archivo. Revisa campo file/document/archivo.');
  } else {
    console.log('[Upload] Archivo capturado:');
    console.log('  originalname:', f.originalname);
    console.log('  mimetype:    ', f.mimetype);
    console.log('  size:        ', f.size, 'bytes');
  }
  next();
}
function guessResourceType(mime = '') {
  const m = String(mime).toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'raw'; // pdf y otros binarios
}
function stripExt(name = '') {
  return name.replace(/\.[^.]+$/, '');
}

/**
 * Sube a Cloudinary y envía por correo (link + adjunto).
 * Deja en req.uploadResult y ajusta req.file.filename para que el controller
 * pueda reconstruir la URL de Cloudinary sin 404.
 */
export async function pushToMail(req, res, next) {
  try {
    const f = pickFileFromReq(req);
    if (!f) throw new Error('No se recibió archivo (req.file/req.files vacío)');

    // 1) Subir a Cloudinary
    const folder = process.env.CLOUDINARY_FOLDER || 'cardex';
    const uniqueName = stripExt(buildFilename(f.originalname)); // sin extensión para public_id
    const ext = (path.extname(f.originalname) || '').toLowerCase();
    const resourceType = guessResourceType(f.mimetype);

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: uniqueName,     // <folder>/<uniqueName>
          resource_type: resourceType,
          type: 'upload',
          overwrite: true,
          use_filename: false,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(f.buffer);
    });

    const publicId = uploadResult.public_id;            // p.ej. "cardex/20250917_210227_36toll"
    const deliveredType = resourceType;                 // 'raw' para pdf
    const viewUrl = cloudinary.url(publicId, {
      secure: true,
      resource_type: deliveredType,
      type: 'upload',
    });
    const downloadUrl = cloudinary.url(publicId, {
      secure: true,
      resource_type: deliveredType,
      type: 'upload',
      transformation: [{ flags: 'attachment' }],
    });

    console.log('────────────────────────── [Cloudinary Upload]');
    console.log('PublicID:  ', publicId);
    console.log('Type:      ', deliveredType);
    console.log('SecureURL: ', uploadResult.secure_url);
    console.log('View:      ', viewUrl);
    console.log('Download:  ', downloadUrl);
    console.log('──────────────────────────────────────────────');

    // 2) Enviar correo
    const filename = `${uniqueName}${ext || ''}`; // lo guardaremos así en la DB
    const mailTo = (process.env.CARDEX_MAIL_TO || 'amagana-2023257@kinal.edu.gt')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const subject = process.env.CARDEX_MAIL_SUBJECT || 'Nuevo archivo de Cardex';
    const cardexId = req.params?.cardexId || '(sin id)';

    const text = `Se ha recibido un archivo para el Cardex ${cardexId}.
Nombre: ${filename}
MIME: ${f.mimetype}
Tamaño: ${f.size} bytes
Ver: ${viewUrl}
Descargar: ${downloadUrl}
`;
    const html = `
      <p>Se ha recibido un archivo para el <b>Cardex ${cardexId}</b>.</p>
      <ul>
        <li><b>Nombre:</b> ${filename}</li>
        <li><b>MIME:</b> ${f.mimetype}</li>
        <li><b>Tamaño:</b> ${f.size} bytes</li>
        <li><b>Ver:</b> <a href="${viewUrl}" target="_blank" rel="noopener">Abrir</a></li>
        <li><b>Descargar:</b> <a href="${downloadUrl}" target="_blank" rel="noopener">Link</a></li>
      </ul>
    `;

    const info = await sendMail({
      to: mailTo,
      subject,
      text,
      html,
      attachments: [
        {
          filename,
          content: f.buffer,
          contentType: f.mimetype,
        },
      ],
    });

    console.log('────────────────────────── [Mail Sent]');
    console.log('To:', mailTo.join(', '));
    console.log('Subject:', subject);
    console.log('MsgID:', info.messageId);
    console.log('──────────────────────────────────────');

    // 3) Propagar datos al controller:
    //    - filename coherente con public_id (para reconstrucción sin 404)
    //    - provider y URLs
    req.file = f;
    req.file.storedAs = 'cloudinary';
    req.file.finalFilename = filename;
    // OJO: multer.memoryStorage no define file.filename; lo seteamos para que el controller lo use
    req.file.filename = filename;

    req.driveFile = { // compat
      provider: 'cloudinary',
      publicId,
      resourceType: deliveredType,
      secure_url: uploadResult.secure_url,
      viewUrl,
      downloadUrl,
    };
    req.uploadResult = {
      provider: 'cloudinary',
      publicId,
      resourceType: deliveredType,
      filename,
      viewUrl,
      downloadUrl,
      emailMessageId: info.messageId,
    };

    return next();
  } catch (err) {
    console.error('[Upload/Mail] Error:', err.message);
    if (String(err.message || '').includes('File too large')) {
      return res.status(413).json({ success: false, message: `Adjunto supera el límite de ${MAX_MB} MB` });
    }
    return next(err);
  }
}
