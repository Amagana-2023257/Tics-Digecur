// src/middlewares/upload-cardex.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { CARDEX_UPLOAD_DIR as DEFAULT_CARDEX_DIR } from '../cardex/cardex.controller.js';

/**
 * Directorío final de subida (Windows-friendly)
 * - Prioriza variable de entorno CARDEX_UPLOAD_DIR
 * - Si no existe, usa el valor exportado por el controller
 * - Normaliza el path para Windows
 */
const RAW_DIR =
  (process.env.CARDEX_UPLOAD_DIR && process.env.CARDEX_UPLOAD_DIR.trim()) ||
  DEFAULT_CARDEX_DIR;

const normalize = (p) =>
  process.platform === 'win32' ? path.win32.normalize(p) : path.normalize(p);

export const CARDEX_UPLOAD_DIR_RESOLVED = normalize(RAW_DIR);

/**
 * Storage en disco con nombre único: YYYYMMDD_HHmmss_random.ext
 * Ruta fija (resuelta): CARDEX_UPLOAD_DIR_RESOLVED
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(CARDEX_UPLOAD_DIR_RESOLVED, { recursive: true });
    } catch {
      // no-op
    }
    cb(null, CARDEX_UPLOAD_DIR_RESOLVED);
  },
  filename: (_req, file, cb) => {
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
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    cb(null, `${ts}_${rnd}${ext}`);
  },
});

const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  // agrega más si lo necesitas
]);

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.has(file.mimetype)) return cb(null, true);
  cb(new Error('Tipo de archivo no permitido'), false);
};

export const uploadCardex = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB
  },
});
