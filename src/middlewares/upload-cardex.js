// src/middlewares/upload-cardex.js
import multer from 'multer';
import path from 'path';
import { uploadBufferToDrive } from '../../server/drive.js'; // ajusta la ruta si difiere

/* ===== MIME permitidos ===== */
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.has(file.mimetype)) return cb(null, true);
  cb(new Error('Tipo de archivo no permitido'), false);
};

/* ===== Multer en memoria (para subir directo a Drive) ===== */
const storage = multer.memoryStorage();

export const uploadCardex = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

/* ===== Helper para nombre único ===== */
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

/**
 * Middleware que sube el archivo ya capturado por multer a Google Drive.
 * Anexa resultado en: req.driveFile y req.uploadResult
 */
export async function pushToDrive(req, _res, next) {
  try {
    if (!req.file) throw new Error('No se recibió archivo');

    const filename = buildFilename(req.file.originalname);

    const driveData = await uploadBufferToDrive({
      buffer: req.file.buffer,
      filename,
      mimeType: req.file.mimetype,
      // Por defecto usa CARDEX_DRIVE_FOLDER_ID del .env
      makePublic: process.env.CARDEX_DRIVE_PUBLIC === 'true',
    });

    req.file.storedAs = 'google-drive';
    req.file.finalFilename = filename;
    req.driveFile = driveData;
    req.uploadResult = {
      provider: 'google-drive',
      filename,
      ...driveData,
    };

    next();
  } catch (err) {
    next(err);
  }
}
