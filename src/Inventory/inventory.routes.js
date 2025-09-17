import { Router } from 'express';
import {
  createItem, getAllItems, getItemById,
  updateItem, setActive, deleteItem,
  createTransferRequest, getTransferRequests,
  approveTransferRequest, rejectTransferRequest,
} from './inventory.controller.js';

import {
  createItemValidator, listItemsValidator, getByIdValidator,
  updateItemValidator, setActiveValidator,
  createTransferRequestValidator, approveTransferRequestValidator,
  rejectTransferRequestValidator,
} from '../middlewares/inventory.validators.js';

import { validateJWT } from '../middlewares/validate-jwt.js';
import { requireRolesAny } from '../middlewares/validate-roles.js'; // el que ya corregimos

const router = Router();

// Lectura (requiere estar logueado, cualquier rol)
router.get('/', validateJWT, listItemsValidator, getAllItems);
router.get('/:itemId', validateJWT, getByIdValidator, getItemById);

// CRUD (solo roles con permiso de inventario)
const INVENTARIO_ROLES = ['ADMIN', 'DIRECTOR', 'INVENTARIO'];

router.post('/', validateJWT, requireRolesAny(...INVENTARIO_ROLES), createItemValidator, createItem);
router.put('/:itemId', validateJWT, requireRolesAny(...INVENTARIO_ROLES), updateItemValidator, updateItem);
router.patch('/:itemId/active', validateJWT, requireRolesAny(...INVENTARIO_ROLES), setActiveValidator, setActive);
router.delete('/:itemId', validateJWT, requireRolesAny(...INVENTARIO_ROLES), getByIdValidator, deleteItem);

// Transferencias
router.get('/transfer-requests/list', validateJWT, getTransferRequests);
router.post('/:itemId/transfer-requests', validateJWT, createTransferRequestValidator, createTransferRequest);
router.patch('/transfer-requests/:requestId/approve', validateJWT, requireRolesAny(...INVENTARIO_ROLES), approveTransferRequestValidator, approveTransferRequest);
router.patch('/transfer-requests/:requestId/reject', validateJWT, requireRolesAny(...INVENTARIO_ROLES), rejectTransferRequestValidator, rejectTransferRequest);

export default router;
