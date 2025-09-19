// src/cardex/cardex.routes.js
import { Router } from 'express';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { requireDeptAndRole } from '../middlewares/authorize-dept-role.js';
import {
  createCardex, getAllCardex, getCardexById,
  updateCardex, deleteCardex,
} from './cardex.controller.js';

const router = Router();

/**
 * Autorización Cardex:
 * - Departamentos habilitados: área de materiales (operativo), dirección (jefatura) y desarrollo (superadmin).
 * - Roles habilitados: operativos y jefaturas.
 *
 * Ajusta a tu organigrama si lo necesitas.
 */
const CARDEX_DEPTS = ['AREA DE MATERIALES EDUCATIVOS', 'DIRECCION', 'DESAROLLO'];
const CARDEX_ROLES = ['ADMIN', 'DIRECTOR', 'JEFE', 'TECNICO', 'ASISTENTE'];
const canUseCardex = requireDeptAndRole(CARDEX_DEPTS, CARDEX_ROLES);


// Crear (requiere dept + rol)
router.post('/', validateJWT, canUseCardex, createCardex);

// Actualizar (requiere dept + rol)
router.put('/:cardexId', validateJWT, canUseCardex, updateCardex);



// Listar / Obtener 
router.get('/', validateJWT, getAllCardex);              
router.get('/:cardexId', validateJWT, getCardexById);    



router.delete('/:cardexId', validateJWT, canUseCardex, deleteCardex);


export default router;
