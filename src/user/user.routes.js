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
import { hasRoles } from '../middlewares/validate-roles.js';
import { ROLES } from './user.model.js';

const router = Router();

/**
 * Middleware helper: permite si es el propio usuario o si posee alguno de los roles requeridos.
 * Requiere que validateJWT haya puesto req.user { id/_id, roles }.
 */
const selfOr = (...roles) => (req, res, next) => {
  const authUser = req.user || {};
  const uid = authUser.id || authUser._id?.toString?.();
  if (uid && uid === req.params.userId) return next();
  return hasRoles(...roles)(req, res, next);
};

// --- Admin ops (crear, listar, estadísticas, exportar, bulk) ---
router.post('/', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), createUser);
router.get('/', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), getAllUsers);
router.get('/stats', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), getUsersStats);
router.get('/export', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), exportUsersCsv);
router.post('/bulk/active', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), bulkSetActive);

// --- Movimientos internos ---
router.patch('/:userId/move', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), updateDepartmentAndCargo);

// --- Lectura/edición individual (propio usuario o admin/director) ---
router.get('/:userId', validateJWT, selfOr(ROLES.ADMIN, ROLES.DIRECTOR), getUserById);
router.put('/:userId', validateJWT, selfOr(ROLES.ADMIN, ROLES.DIRECTOR), updateUser);
router.patch('/:userId/password', validateJWT, selfOr(ROLES.ADMIN, ROLES.DIRECTOR), changePassword);

// --- Gestión de roles (solo admin/director) ---
router.patch('/:userId/roles', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), updateUserRoles);

// --- Activación/Desactivación (admin/director) ---
router.patch('/:userId/deactivate', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), deactivateUser);
router.patch('/:userId/activate', validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR), activateUser);

// --- Eliminación (solo ADMIN) ---
router.delete('/:userId', validateJWT, hasRoles(ROLES.ADMIN), deleteUser);

export default router;
