// src/routes/user.routes.js
import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  updateUserRoles,
  changePassword,
  deactivateUser,
  activateUser,
  deleteUser,
  bulkSetActive,
  updateDepartmentAndCargo,
  getUsersStats,
  exportUsersCsv,
} from './user.controller.js';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { requireDeptAndRole, selfOrDeptAndRole } from '../middlewares/authorize-dept-role.js';

const router = Router();

/**
 * Grupos de autorización sugeridos.
 * Ajusta estos arrays según tu organigrama real.
 */
const ADMIN_DEPTS = ['DESAROLLO'];
const ADMIN_ROLES = ['ADMIN'];

// --- Admin-like (crear, listar, stats, exportar, bulk) ---
router.post(
  '/',
  validateJWT,
  requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES),
  createUser
);

router.get('/', validateJWT, requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES), getAllUsers);
router.get('/stats', validateJWT, requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES), getUsersStats);
router.get('/export', validateJWT, requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES), exportUsersCsv);
router.post('/bulk/active', validateJWT, requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES), bulkSetActive);

// --- Movimientos internos ---
router.patch(
  '/:userId/move',
  validateJWT,
  requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES),
  updateDepartmentAndCargo
);

// --- Lectura/edición individual (propio usuario o dept+rol admin-like) ---
router.get('/:userId', validateJWT, selfOrDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES), getUserById);

router.put(
  '/:userId',
  validateJWT,
  selfOrDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES),

  updateUser
);

router.patch(
  '/:userId/password',
  validateJWT,
  selfOrDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES),
  changePassword
);

// --- Gestión de roles (solo dept+rol admin-like) ---
router.patch(
  '/:userId/roles',
  validateJWT,
  requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES),
  updateUserRoles
);

// --- Activación/Desactivación (admin-like) ---
router.patch('/:userId/deactivate', validateJWT, requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES), deactivateUser);
router.patch('/:userId/activate', validateJWT, requireDeptAndRole(ADMIN_DEPTS, ADMIN_ROLES), activateUser);

// --- Eliminación (solo DIRECTOR de DIRECCION/AREA ADMINISTRATIVA) ---
router.delete(
  '/:userId',
  validateJWT,
  requireDeptAndRole(['DIRECCION', 'AREA ADMINISTRATIVA'], ['DIRECTOR']),
  deleteUser
);

export default router;
