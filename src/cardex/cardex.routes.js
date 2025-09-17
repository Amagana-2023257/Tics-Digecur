// src/cardex/cardex.routes.js
import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { hasRoles } from '../middlewares/validate-roles.js';
import {
  CARDEX_UPLOAD_DIR,
  createCardex, getAllCardex, getCardexById,
  updateCardex, deleteCardex,
  streamCardexFile, downloadCardexFile
} from './cardex.controller.js';

// ---- Configuración de carga de archivos (multer)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CARDEX_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '');
    const ext = path.extname(file.originalname);
    cb(null, `${ts}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

// ---- Exponer carpeta estática (si decides mantener el acceso directo al fichero físico)
export const mountCardexStatic = (app) => {
  app.use('/files/cardex', express.static(CARDEX_UPLOAD_DIR, { maxAge: '1d', fallthrough: true }));
};

const router = Router();

// ---- Roles permitidos en Cardex
const CARD_ROLES = ['ADMIN', 'DIRECTOR', 'MATERIALES'];
const canUseCardex = hasRoles(...CARD_ROLES);

// ======================= CRUD =======================
// Crear
router.post('/', validateJWT, canUseCardex, upload.single('file'), createCardex);

// Listar
router.get('/', validateJWT, getAllCardex);

// Obtener por id
router.get('/:cardexId', validateJWT, getCardexById);

// Actualizar
router.put('/:cardexId', validateJWT, canUseCardex, upload.single('file'), updateCardex);

// Eliminar
router.delete('/:cardexId', validateJWT, canUseCardex, deleteCardex);

// =================== Ver / Descargar ===================
// Stream inline
router.get('/:cardexId/view', validateJWT, streamCardexFile);

// Forzar descarga
router.get('/:cardexId/download', validateJWT, downloadCardexFile);

export default router;
