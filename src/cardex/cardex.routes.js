// src/cardex/cardex.routes.js
import { Router } from 'express';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { hasRoles } from '../middlewares/validate-roles.js';
import {
  createCardex, getAllCardex, getCardexById,
  updateCardex, deleteCardex,
  streamCardexFile, downloadCardexFile
} from './cardex.controller.js';

import {
  uploadAnyFile,
  makeUploadAnyToCloudinary,
} from '../middlewares/multer-uploads.js';

const router = Router();
const CARD_ROLES = ['ADMIN', 'DIRECTOR', 'MATERIALES'];
const canUseCardex = hasRoles(...CARD_ROLES);

// Crear (campo: file/document/archivo)
router.post(
  '/',
  validateJWT,
  canUseCardex,
  uploadAnyFile,
  makeUploadAnyToCloudinary('cardex'), // ← sube a Cloudinary y deja req.file.filename + req.cloudinaryFile
  createCardex
);

// Actualizar (si viene reemplazo de archivo)
router.put(
  '/:cardexId',
  validateJWT,
  canUseCardex,
  uploadAnyFile,
  makeUploadAnyToCloudinary('cardex'),
  updateCardex
);

// Resto igual:
router.get('/', validateJWT, getAllCardex);
router.get('/:cardexId', validateJWT, getCardexById);
router.delete('/:cardexId', validateJWT, canUseCardex, deleteCardex);
router.get('/:cardexId/view', validateJWT, streamCardexFile);
router.get('/:cardexId/download', validateJWT, downloadCardexFile);

export default router;
