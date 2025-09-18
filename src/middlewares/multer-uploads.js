// src/middlewares/multer-uploads.js
import multer from 'multer';
import { cloudinary } from '../../configs/cloudinary.js';
import { Readable } from 'stream';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import path from 'path';

/* ──────────────────────────────────────────────────────────────────────────
   1) Configuración base: memoryStorage + filtros
   ────────────────────────────────────────────────────────────────────────── */
const storage = multer.memoryStorage();

// Solo-imágenes (para tus middlewares existentes)
const imageOnlyFilter = (req, file, cb) => {
  if (!file.mimetype?.startsWith('image/')) {
    return cb(new Error('Solo se aceptan imágenes válidas'));
  }
  cb(null, true);
};

// Archivos generales (permitir pdf, office, csv, txt, zip, imágenes, video, audio)
const ANY_ALLOWED = new Set([
  // imágenes
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  // pdf
  'application/pdf',
  // office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // xlsx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  // texto / datos
  'text/plain', 'text/csv', 'application/json',
  // comprimidos
  'application/zip', 'application/x-7z-compressed', 'application/x-rar-compressed',
  // audio/video (Cloudinary los maneja bajo resource_type 'video')
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
]);

const anyFileFilter = (req, file, cb) => {
  if (!ANY_ALLOWED.has(file.mimetype)) {
    return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
  }
  cb(null, true);
};

// Middlewares existentes (solo imágenes)
export const uploadProfilePicture = multer({ storage, fileFilter: imageOnlyFilter }).single('profilePicture');
export const uploadCommunityPicture = multer({ storage, fileFilter: imageOnlyFilter }).single('communityPicture');
export const uploadPostImage = multer({ storage, fileFilter: imageOnlyFilter }).single('postImage');

// Nuevo: captura "cualquier archivo" (campo: file / document / archivo)
const MAX_FILE_MB = Number(process.env.MAX_UPLOAD_MB || '100');
export const uploadAnyFile = multer({
  storage,
  fileFilter: anyFileFilter,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'document', maxCount: 1 },
  { name: 'archivo', maxCount: 1 },
]);

/* ──────────────────────────────────────────────────────────────────────────
   2) Helpers varios
   ────────────────────────────────────────────────────────────────────────── */
const bufferToStream = (buffer) => {
  const s = new Readable();
  s.push(buffer);
  s.push(null);
  return s;
};

function pickFileFromReq(req) {
  if (req.file?.buffer) return req.file;
  const f = req.files?.file?.[0] || req.files?.document?.[0] || req.files?.archivo?.[0] || null;
  return f;
}

function slugifyBase(name = '') {
  const base = name.replace(/\.[^.]+$/, ''); // sin extensión
  return base
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'file';
}

function guessResourceType(mime = '') {
  const m = String(mime).toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/') || m.startsWith('audio/')) return 'video';
  return 'raw'; // pdf/office/zip/txt/etc.
}

function buildViewUrl(publicId, resourceType) {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType, // 'image' | 'raw' | 'video'
    type: 'upload',
    // Para imágenes puedes optimizar delivery (opcional):
    transformation: resourceType === 'image' ? [{ fetch_format: 'auto', quality: 'auto' }] : undefined,
  });
}

function buildDownloadUrl(publicId, resourceType) {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType,
    type: 'upload',
    transformation: [{ flags: 'attachment' }], // fuerza descarga
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   3) Subida de IMAGEN (segura + compresión) → retorna secure_url
   ────────────────────────────────────────────────────────────────────────── */
export const uploadToCloudinary = async (req, folder = 'profile-pictures') => {
  const file = req.file;
  if (!file?.buffer) throw new Error('No se subió ningún archivo');

  const buffer = file.buffer;
  const originalName = file.originalname;

  // Verificar magic-bytes
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !type.mime.startsWith('image/')) {
    throw new Error('El archivo no es una imagen válida');
  }

  // Validar que sharp puede leer
  try { await sharp(buffer).metadata(); }
  catch { throw new Error('No se pudo procesar como imagen'); }

  // Comprimir (mantener resolución)
  let processed;
  if (type.mime === 'image/jpeg' || type.mime === 'image/jpg') {
    processed = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
  } else if (type.mime === 'image/png') {
    processed = await sharp(buffer).png({ compressionLevel: 8 }).toBuffer();
  } else {
    processed = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
  }

  const baseId = `${slugifyBase(originalName)}-${Date.now()}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, public_id: baseId, resource_type: 'image', type: 'upload', overwrite: true },
      (err, result) => {
        if (err) {
          console.error('Error al subir a Cloudinary:', err);
          return reject(new Error('Error al subir imagen'));
        }
        resolve(result.secure_url);
      }
    );
    bufferToStream(processed).pipe(uploadStream);
  });
};

/* ──────────────────────────────────────────────────────────────────────────
   4) Subida de ARCHIVO (general) → retorna { publicId, viewUrl, downloadUrl, ... }
   - PDF se visualiza inline con resource_type 'raw'
   - Imágenes usan 'image' (optimizable)
   - Video/Audio usan 'video'
   ────────────────────────────────────────────────────────────────────────── */
export const uploadFileToCloudinary = async (req, folder = 'uploads') => {
  const file = pickFileFromReq(req);
  if (!file?.buffer) throw new Error('No se subió ningún archivo');

  // Detectar MIME real por magic-bytes (más confiable que header)
  const detected = await fileTypeFromBuffer(file.buffer).catch(() => null);
  const realMime = detected?.mime || file.mimetype || 'application/octet-stream';
  if (!ANY_ALLOWED.has(realMime)) {
    throw new Error(`Tipo de archivo no permitido (detectado): ${realMime}`);
  }

  // Si es imagen, opcional: comprimir
  let bufferToSend = file.buffer;
  if (realMime.startsWith('image/')) {
    try {
      await sharp(file.buffer).metadata();
      if (realMime === 'image/jpeg' || realMime === 'image/jpg') {
        bufferToSend = await sharp(file.buffer).jpeg({ quality: 80 }).toBuffer();
      } else if (realMime === 'image/png') {
        bufferToSend = await sharp(file.buffer).png({ compressionLevel: 8 }).toBuffer();
      }
    } catch {
      // si sharp falla, seguimos con el buffer original
    }
  }

  const resourceType = guessResourceType(realMime);
  const baseId = `${slugifyBase(file.originalname)}-${Date.now()}`;

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: baseId,
        resource_type: resourceType,
        type: 'upload',
        overwrite: true,
      },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    bufferToStream(bufferToSend).pipe(uploadStream);
  });

  // public_id devuelto ya incluye el folder (p.ej. "cardex/mi-archivo-...").
  const publicId = result.public_id;
  const viewUrl = buildViewUrl(publicId, resourceType);
  const downloadUrl = buildDownloadUrl(publicId, resourceType);

  // Para que tus controllers puedan persistir un "fileName" coherente
  const ext = (path.extname(file.originalname) || '').toLowerCase();
  const finalFilename = `${baseId}${ext}`; // esto guardas en DB

  // Adjunta info útil al request (compatibilidad con tus controllers)
  req.file = file; // por si el controller esperaba req.file
  req.file.storedAs = 'cloudinary';
  req.file.filename = finalFilename;   // <- lo que tu controller persiste como fileName
  req.file.originalname = file.originalname;
  req.file.mimetype = realMime;
  req.file.size = file.size;

  req.cloudinaryFile = {
    provider: 'cloudinary',
    resourceType,
    publicId,
    viewUrl,
    downloadUrl,
    secure_url: result.secure_url,
    bytes: result.bytes,
    format: result.format,
  };

  return req.cloudinaryFile;
};

/* ──────────────────────────────────────────────────────────────────────────
   5) Middleware listo para usar en rutas (fábrica)
   ────────────────────────────────────────────────────────────────────────── */
export const makeUploadAnyToCloudinary = (folder = 'uploads') => {
  return async (req, res, next) => {
    try {
      if (!pickFileFromReq(req)) return next(new Error('No se recibió archivo'));
      const out = await uploadFileToCloudinary(req, folder);
      // Log útil
      console.log('──────── Cloudinary (any) ────────');
      console.log('publicId:   ', out.publicId);
      console.log('type:       ', out.resourceType);
      console.log('viewUrl:    ', out.viewUrl);
      console.log('downloadUrl:', out.downloadUrl);
      console.log('───────────────────────────────────');
      next();
    } catch (err) {
      console.error('[Cloudinary any] Error:', err.message);
      next(err);
    }
  };
};
