import { Router } from 'express';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { requireDeptAndRole } from '../middlewares/authorize-dept-role.js';
import { uploadNewsImage } from '../middlewares/multer-uploads.js';

import {
  createMural,
  getAllMurals,
  getMuralById,
  updateMural,
  deleteMural,
  publishMural,
  archiveMural,
} from './mural.controller.js';

const router = Router();

/**
 * Autorización Mural:
 * - Ajusta los departamentos/roles según tu organigrama.
 *   Incluyo Comunicación Social, Dirección, Desarrollo y Materiales, por si aplica.
 */
const MURAL_DEPTS = ['COMUNICACION SOCIAL', 'DIRECCION', 'DESAROLLO', 'AREA DE MATERIALES EDUCATIVOS'];
const MURAL_ROLES = ['ADMIN', 'DIRECTOR', 'JEFE', 'TECNICO', 'ASISTENTE'];
const canUseMural = requireDeptAndRole(MURAL_DEPTS, MURAL_ROLES);

/* ======================================
   CRUD + acciones rápidas
====================================== */
// Crear (con imagen principal opcional)
router.post('/', validateJWT, canUseMural, uploadNewsImage, createMural);

// Actualizar (con posible nueva imagen principal)
router.put('/:muralId', validateJWT, canUseMural, uploadNewsImage, updateMural);

// Listar / Obtener (solo requiere estar autenticado)
router.get('/', validateJWT, getAllMurals);
router.get('/:muralId', validateJWT, getMuralById);

// Acciones rápidas
router.patch('/:muralId/publish', validateJWT, canUseMural, publishMural);
router.patch('/:muralId/archive', validateJWT, canUseMural, archiveMural);

// Eliminar
router.delete('/:muralId', validateJWT, canUseMural, deleteMural);

export default router;
