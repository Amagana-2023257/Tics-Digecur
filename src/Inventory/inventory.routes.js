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

  // Pending codes
  listTransferPendingCodes,
  getTransferPendingCodeById,
  updateTransferPendingCode,
  deleteTransferPendingCode,
} from './inventory.controller.js';

import {
  // ===== Bienes
  createItemValidator,
  listItemsValidator,
  getByIdValidator,
  updateItemValidator,
  setActiveValidator,

  // ===== Transfer requests (nombres EXACTOS según validators.js)
  createOrConfirmTransferRequestValidator,
  approveTransferRequestValidator,
  rejectTransferRequestValidator,
  getTransferRequestsListValidator,   // (alias disponible: listTransferRequestsValidator)
  getTransferRequestByIdValidator,
  getTransferRequestDetailValidator,
  uploadTransferSignedDocValidator,   // (alias disponible: uploadSignedDocValidator)

  // ===== Pending codes
  listTransferPendingCodesValidator,
  getTransferPendingCodeByIdValidator,
  updateTransferPendingCodeValidator,
  deleteTransferPendingCodeValidator,
} from '../middlewares/inventory.validators.js';

import { validateJWT } from '../middlewares/validate-jwt.js';
import { requireRolesAny } from '../middlewares/validate-roles.js';

const router = Router();
const upload = multer(); // memoryStorage por defecto

// Roles con permiso de inventario
const INVENTARIO_ROLES = ['ADMIN', 'DIRECTOR', 'INVENTARIO'];

/* =========================================================================
   ⚠️ ORDEN IMPORTANTE:
   1) Primero rutas ESPECÍFICAS (sin params) y con params distintos a :itemId
   2) Después rutas /transfer-requests/:requestId y /transfer-pending-codes/:pendingId
   3) AL FINAL rutas con :itemId (y además restringidas por REGEX)
   Esto evita que '/transfer-pending-codes' matchee '/:itemId' y dispare 422.
   ========================================================================= */

// -------------------------------------------------------------------------
// INVENTORY — Transfer Pending Codes (primero)
// -------------------------------------------------------------------------
router.get(
  '/transfer-pending-codes',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  listTransferPendingCodesValidator,
  listTransferPendingCodes
);

router.get(
  '/transfer-pending-codes/:pendingId',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  getTransferPendingCodeByIdValidator,
  getTransferPendingCodeById
);

router.patch(
  '/transfer-pending-codes/:pendingId',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  updateTransferPendingCodeValidator,
  updateTransferPendingCode
);

router.delete(
  '/transfer-pending-codes/:pendingId',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  deleteTransferPendingCodeValidator,
  deleteTransferPendingCode
);

// -------------------------------------------------------------------------
// INVENTORY — Transfer Requests (luego)
// -------------------------------------------------------------------------
// Listado (admin ve todo; sin rol ve propias en el controller)
router.get(
  '/transfer-requests/list',
  validateJWT,
  getTransferRequestsListValidator,
  getTransferRequestsList
);

// Detalle simple
router.get(
  '/transfer-requests/:requestId',
  validateJWT,
  getTransferRequestByIdValidator,
  getTransferRequestById
);

// Detalle extendido
router.get(
  '/transfer-requests/:requestId/detail',
  validateJWT,
  getTransferRequestDetailValidator,
  getTransferRequestDetail
);

// Subir/guardar documento firmado (PDF) — file/url/pdfBase64
router.post(
  '/transfer-requests/:requestId/signed-doc',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  upload.single('file'),               // ⬅️ primero el upload
  uploadTransferSignedDocValidator,    // ⬅️ luego el validador (usa req.file/url/base64)
  uploadTransferSignedDoc
);

// Aprobar / Rechazar (requiere rol)
router.patch(
  '/transfer-requests/:requestId/approve',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  approveTransferRequestValidator,
  approveTransferRequest
);

router.patch(
  '/transfer-requests/:requestId/reject',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  rejectTransferRequestValidator,
  rejectTransferRequest
);

// -------------------------------------------------------------------------
// INVENTORY — Bienes (CRUD sin :itemId primero)
// -------------------------------------------------------------------------
router.get('/', validateJWT, listItemsValidator, getAllItems);

router.post(
  '/',
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
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
  getByIdValidator,           // ya flexible (ObjectId o UUID)
  getItemById
);

router.put(
  `/:itemId(${ITEM_ID_REGEX})`,
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  updateItemValidator,
  updateItem
);

router.patch(
  `/:itemId(${ITEM_ID_REGEX})/active`,
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  setActiveValidator,
  setActive
);

router.delete(
  `/:itemId(${ITEM_ID_REGEX})`,
  validateJWT,
  requireRolesAny(...INVENTARIO_ROLES),
  getByIdValidator,
  deleteItem
);

// Crear invitación o confirmar con código de traslado (por item)
router.post(
  `/:itemId(${ITEM_ID_REGEX})/transfer-requests`,
  validateJWT,
  createOrConfirmTransferRequestValidator,
  createOrConfirmTransferRequest
);

export default router;
