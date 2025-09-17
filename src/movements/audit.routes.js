// src/audit/audit.routes.js
import { Router } from 'express';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { hasRoles } from '../middlewares/validate-roles.js';
import { ROLES } from '../user/user.model.js';

import {
  listMovements,         // GET /search
  getMovementById,       // GET /:id
  statsMovements,        // GET /stats
  exportMovementsCsv,    // GET /export
  purgeMovements,        // DELETE (aquí lo adaptamos a POST /purge)
} from './movement.controller.js'; // <-- si este file vive en /src/movements, usa './movement.controller.js'

const router = Router();

// Solo ADMIN o DIRECTOR
const guard = [validateJWT, hasRoles(ROLES.ADMIN, ROLES.DIRECTOR)];

/**
 * GET /digecur/v1/audit/search
 * Lista con filtros + paginación
 */
router.get('/search', ...guard, listMovements);

/**
 * GET /digecur/v1/audit/stats
 * Estadísticas básicas
 */
router.get('/stats', ...guard, statsMovements);

/**
 * GET /digecur/v1/audit/export
 * Exporta a CSV (según filtros)
 */
router.get('/export', ...guard, exportMovementsCsv);

/**
 * POST /digecur/v1/audit/purge
 * El UI embebido envía POST con body { olderThanDays } ó { dateFrom, dateTo }.
 * El controlador original recibe por query, así que adaptamos body -> query.
 */
router.post('/purge', ...guard, (req, res, next) => {
  req.query = { ...(req.query || {}), ...(req.body || {}) };
  return purgeMovements(req, res, next);
});

/**
 * GET /digecur/v1/audit/:id
 * Detalle de un registro
 */
router.get('/:id', ...guard, getMovementById);

export default router;
