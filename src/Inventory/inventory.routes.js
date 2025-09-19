// src/Inventory/inventory.routes.js
import { Router } from 'express';
import multer from 'multer';

import {
  // Bienes (CRUD)
  createItem,
  getAllItems,
  getItemById,
  updateItem,
  setActive,
  deleteItem,

  // Transfer requests
  createOrConfirmTransferRequest,
  getTransferRequestsList,
  getTransferRequestById,
  getTransferRequestDetail,
  uploadTransferSignedDoc,
  approveTransferRequest,
  rejectTransferRequest,
} from './inventory.controller.js';

import {
  // ===== Bienes
  createItemValidator,
  listItemsValidator,
  getByIdValidator,
  updateItemValidator,
  setActiveValidator,

  // ===== Transfer requests 
  createOrConfirmTransferRequestValidator,
  approveTransferRequestValidator,
  rejectTransferRequestValidator,
  getTransferRequestsListValidator,   
  getTransferRequestByIdValidator,
  getTransferRequestDetailValidator,
  uploadTransferSignedDocValidator,  

} from '../middlewares/inventory.validators.js';

import { validateJWT } from '../middlewares/validate-jwt.js';
import { requireDeptAndRole } from '../middlewares/authorize-dept-role.js';

const router = Router();
const upload = multer(); 

const INV_DEPTS = ['AREA FINANCIERA', 'DIRECCION', 'DESAROLLO'];
const INV_ROLES = ['ADMIN', 'DIRECTOR', 'JEFE', 'TECNICO'];

// -------------------------------------------------------------------------
// INVENTORY — Transfer Requests (luego)
// -------------------------------------------------------------------------
// Listado (se mantiene lectura con solo JWT, como antes)
router.get(
  '/transfer-requests/list',
  validateJWT,
  getTransferRequestsListValidator,
  getTransferRequestsList
);

// Detalle simple (solo JWT)
router.get(
  '/transfer-requests/:requestId',
  validateJWT,
  getTransferRequestByIdValidator,
  getTransferRequestById
);

// Detalle extendido (solo JWT)
router.get(
  '/transfer-requests/:requestId/detail',
  validateJWT,
  getTransferRequestDetailValidator,
  getTransferRequestDetail
);

// Subir/guardar documento firmado (PDF) — requiere dept+rol
router.post(
  '/transfer-requests/:requestId/signed-doc',
  validateJWT,
  requireDeptAndRole(INV_DEPTS, INV_ROLES),
  upload.single('file'),              
  uploadTransferSignedDocValidator,   
  uploadTransferSignedDoc
);

// Aprobar / Rechazar (requiere dept+rol)
router.patch(
  '/transfer-requests/:requestId/approve',
  validateJWT,
  requireDeptAndRole(INV_DEPTS, INV_ROLES),
  approveTransferRequestValidator,
  approveTransferRequest
);

router.patch(
  '/transfer-requests/:requestId/reject',
  validateJWT,
  requireDeptAndRole(INV_DEPTS, INV_ROLES),
  rejectTransferRequestValidator,
  rejectTransferRequest
);

// -------------------------------------------------------------------------
// INVENTORY — Bienes (CRUD sin :itemId primero)
// -------------------------------------------------------------------------
// Listado de bienes (solo JWT, como antes)
router.get('/', validateJWT, listItemsValidator, getAllItems);

// Crear bien (requiere dept+rol)
router.post(
  '/',
  validateJWT,
  requireDeptAndRole(INV_DEPTS, INV_ROLES),
  createItemValidator,
  createItem
);

// -------------------------------------------------------------------------
// AL FINAL: rutas con :itemId (restringidas por REGEX)
//   - Acepta Mongo ObjectId (24 hex) o UUID v1–v5
// -------------------------------------------------------------------------
const ITEM_ID_REGEX =
  '([a-fA-F0-9]{24}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})';

router.get(
  `/:itemId(${ITEM_ID_REGEX})`,
  validateJWT,
  getByIdValidator,        
  getItemById
);

router.put(
  `/:itemId(${ITEM_ID_REGEX})`,
  validateJWT,
  requireDeptAndRole(INV_DEPTS, INV_ROLES),
  updateItemValidator,
  updateItem
);

router.patch(
  `/:itemId(${ITEM_ID_REGEX})/active`,
  validateJWT,
  requireDeptAndRole(INV_DEPTS, INV_ROLES),
  setActiveValidator,
  setActive
);

router.delete(
  `/:itemId(${ITEM_ID_REGEX})`,
  validateJWT,
  requireDeptAndRole(INV_DEPTS, INV_ROLES),
  getByIdValidator,
  deleteItem
);

router.post(
  `/:itemId(${ITEM_ID_REGEX})/transfer-requests`,
  validateJWT,
  createOrConfirmTransferRequestValidator,
  createOrConfirmTransferRequest
);

export default router;
