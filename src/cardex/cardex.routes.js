import { Router } from 'express';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { hasRoles } from '../middlewares/validate-roles.js';
import {
  createCardex, getAllCardex, getCardexById,
  updateCardex, deleteCardex,
  streamCardexFile, downloadCardexFile
} from './cardex.controller.js';

const router = Router();
const CARD_ROLES = ['ADMIN', 'DIRECTOR', 'MATERIALES'];
const canUseCardex = hasRoles(...CARD_ROLES);

/* =========================================================
   Sin subida de archivos — solo se recibe onedriveUrl en body
   Body esperado en create/update:
   {
     titulo, descripcion, categoria, tags,
     onedriveUrl,              // ← requerido
     fechaDocumento?, anioDocumento?,
     originalName?, mimeType?, size?,
     isActive?
   }
   ========================================================= */

// Crear
router.post('/', validateJWT, canUseCardex, createCardex);

// Actualizar
router.put('/:cardexId', validateJWT, canUseCardex, updateCardex);

// Listar / Obtener / Eliminar / Ver / Descargar
router.get('/', validateJWT, getAllCardex);
router.get('/:cardexId', validateJWT, getCardexById);
router.delete('/:cardexId', validateJWT, canUseCardex, deleteCardex);
router.get('/:cardexId/view', validateJWT, streamCardexFile);
router.get('/:cardexId/download', validateJWT, downloadCardexFile);

export default router;
