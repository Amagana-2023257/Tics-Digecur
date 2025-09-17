// src/movements/movement.controller.js
import Movement from './movement.model.js';

/* ============================ Utils ============================ */

const SENSITIVE_KEYS = new Set([
  'password', 'currentPassword', 'newPassword',
  'token', 'accessToken', 'idToken',
  'authorization', 'auth', 'secret', 'apikey', 'apiKey'
]);

function redact(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(String(k).toLowerCase()) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

function shallowDiff(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const diff = {};
  for (const k of keys) {
    const av = a?.[k];
    const bv = b?.[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      diff[k] = { from: av, to: bv };
    }
  }
  return diff;
}

function userFromReq(req = {}) {
  const u = req.user || {};
  const id = (u.id || u._id || null);
  const email = u.email || null;
  const nombre = u.nombre || null;
  const roles = Array.isArray(u.roles) ? u.roles.map(String) : [];
  return { id: id ? String(id) : null, email, nombre, roles };
}

function ipFromReq(req = {}) {
  return (req.headers?.['x-forwarded-for']?.split(',')[0]?.trim())
      || req.socket?.remoteAddress
      || req.ip
      || null;
}

/* ============================ API de logging ============================ */

/**
 * Registra una actividad puntual desde cualquier controlador.
 * @param {object} opt
 *  - req: express req
 *  - action: string (requerido)
 *  - entity: string (opcional) p.ej. 'USER'
 *  - entityId: string (opcional)
 *  - before/after: objetos (opcional)
 *  - statusCode/success/message/error/tags
 */
export async function logActivity(opt = {}) {
  const {
    req, action,
    entity = null, entityId = null,
    before = undefined, after = undefined,
    statusCode = undefined, success = undefined,
    message = undefined, error = undefined,
    tags = [],
  } = opt;

  try {
    const doc = {
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      user: userFromReq(req),
      request: {
        method: req?.method,
        path: req?.originalUrl || req?.url,
        query: redact(req?.query || {}),
        body: redact(req?.body || {}),
        params: redact(req?.params || {}),
        ip: ipFromReq(req),
        userAgent: req?.headers?.['user-agent'] || null,
      },
      response: {
        statusCode,
        success,
        message,
        error: error ? String(error).slice(0, 500) : undefined,
      },
      changes: (before || after)
        ? { before: redact(before), after: redact(after), diff: shallowDiff(before, after) }
        : undefined,
      tags: Array.isArray(tags) ? tags.filter(Boolean).map(String) : [],
    };

    await Movement.create(doc);
  } catch (e) {
    console.error('[AUDIT] Error al registrar movimiento:', e?.message || e);
  }
}

/**
 * Middleware opcional para auditar TODAS las requests HTTP.
 * (Deja un trazo global además de los logs puntuales por acción.)
 */
export const auditMiddleware = (opts = {}) => (req, res, next) => {
  const skip = opts.skip || ['/health', '/api-docs'];
  const shouldSkip = skip.some((p) => req.path.startsWith(p));
  if (shouldSkip) return next();

  const startedAt = Date.now();
  res.on('finish', () => {
    try {
      const statusCode = res.statusCode;
      const ok = statusCode >= 200 && statusCode < 400;
      logActivity({
        req,
        action: 'HTTP_REQUEST',
        statusCode,
        success: ok,
        message: `${req.method} ${req.originalUrl} (${Date.now() - startedAt}ms)`,
      });
    } catch (e) {
      console.error('[AUDIT] finish-hook error:', e?.message || e);
    }
  });

  next();
};

export function attachAudit(app) {
  app.use(auditMiddleware({ skip: ['/health', '/api-docs'] }));
}

/* ============================ Endpoints (para Swagger) ============================ */

/**
 * GET /movements
 * Lista con filtros y paginación.
 */
export const listMovements = async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      sort = '-createdAt',
      action,
      entity,
      entityId,
      userId,
      email,
      success,
      statusCode,
      q,
      dateFrom,
      dateTo,
      tag,
    } = req.query;

    const filter = {};
    if (action)   filter.action = String(action);
    if (entity)   filter.entity = String(entity);
    if (entityId) filter.entityId = String(entityId);
    if (userId)   filter['user.id'] = String(userId);
    if (email)    filter['user.email'] = new RegExp(String(email).trim(), 'i');
    if (typeof success !== 'undefined') {
      const v = typeof success === 'string' ? success.toLowerCase() === 'true' : !!success;
      filter['response.success'] = v;
    }
    if (statusCode) {
      const n = Number(statusCode);
      if (Number.isFinite(n)) filter['response.statusCode'] = n;
    }
    if (tag) {
      const t = String(tag).trim();
      if (t) filter.tags = { $in: [t] };
    }
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { 'response.message': rx },
        { 'response.error': rx },
        { 'request.path': rx },
        { action: rx },
        { entity: rx },
        { entityId: rx },
      ];
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    const p = Math.max(parseInt(page, 10), 1);
    const l = Math.min(Math.max(parseInt(limit, 10), 1), 200);
    const s = String(sort);

    const [total, items] = await Promise.all([
      Movement.countDocuments(filter),
      Movement.find(filter).sort(s).skip((p - 1) * l).limit(l).lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Movimientos obtenidos',
      pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) || 1 },
      items,
    });
  } catch (err) {
    console.error('[AUDIT] listMovements:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener movimientos', error: err?.message });
  }
};

/**
 * GET /movements/:id
 */
export const getMovementById = async (req, res) => {
  try {
    const mv = await Movement.findById(req.params.id).lean();
    if (!mv) return res.status(404).json({ success: false, message: 'Movimiento no encontrado' });
    return res.status(200).json({ success: true, movement: mv });
  } catch (err) {
    console.error('[AUDIT] getMovementById:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener movimiento', error: err?.message });
  }
};

/**
 * GET /movements/stats
 * Estadísticas básicas agrupadas.
 */
export const statsMovements = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const match = {};
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   match.createdAt.$lte = new Date(dateTo);
    }

    const [byAction, byEntity, bySuccess, last24h] = await Promise.all([
      Movement.aggregate([{ $match: match }, { $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Movement.aggregate([{ $match: match }, { $group: { _id: '$entity', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Movement.aggregate([{ $match: match }, { $group: { _id: '$response.success', count: { $sum: 1 } } }]),
      Movement.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } } },
        { $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit: 'hour' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Estadísticas de auditoría',
      stats: {
        byAction: byAction.map(x => ({ action: x._id || '—', count: x.count })),
        byEntity: byEntity.map(x => ({ entity: x._id || '—', count: x.count })),
        bySuccess: bySuccess.map(x => ({ success: !!x._id, count: x.count })),
        last24h: last24h.map(x => ({ hour: x._id, count: x.count })),
      },
    });
  } catch (err) {
    console.error('[AUDIT] statsMovements:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener estadísticas', error: err?.message });
  }
};

/**
 * GET /movements/export
 * Exporta a CSV (según filtros iguales a /movements).
 */
export const exportMovementsCsv = async (req, res) => {
  try {
    // Reusa build de filtros (simplemente llama a listMovements internamente sería ineficiente).
    const {
      action, entity, entityId, userId, email, success, statusCode, q, dateFrom, dateTo, tag, sort = '-createdAt',
      limit = '20000' // límite alto para export
    } = req.query;

    const filter = {};
    if (action)   filter.action = String(action);
    if (entity)   filter.entity = String(entity);
    if (entityId) filter.entityId = String(entityId);
    if (userId)   filter['user.id'] = String(userId);
    if (email)    filter['user.email'] = new RegExp(String(email).trim(), 'i');
    if (typeof success !== 'undefined') {
      const v = typeof success === 'string' ? success.toLowerCase() === 'true' : !!success;
      filter['response.success'] = v;
    }
    if (statusCode) {
      const n = Number(statusCode);
      if (Number.isFinite(n)) filter['response.statusCode'] = n;
    }
    if (tag) {
      const t = String(tag).trim();
      if (t) filter.tags = { $in: [t] };
    }
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { 'response.message': rx },
        { 'response.error': rx },
        { 'request.path': rx },
        { action: rx },
        { entity: rx },
        { entityId: rx },
      ];
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    const docs = await Movement.find(filter).sort(String(sort)).limit(Math.max(1, Math.min(parseInt(limit, 10) || 20000, 200000))).lean();

    const headers = [
      'id',
      'createdAt',
      'action',
      'entity',
      'entityId',
      'userId',
      'userEmail',
      'userNombre',
      'roles',
      'method',
      'path',
      'statusCode',
      'success',
      'message',
      'error',
      'ip',
      'userAgent',
      'tags',
    ];

    const rows = docs.map((d) => [
      d._id,
      d.createdAt?.toISOString?.() || d.createdAt,
      d.action || '',
      d.entity || '',
      d.entityId || '',
      d.user?.id || '',
      d.user?.email || '',
      d.user?.nombre || '',
      Array.isArray(d.user?.roles) ? d.user.roles.join('|') : '',
      d.request?.method || '',
      d.request?.path || '',
      typeof d.response?.statusCode === 'number' ? String(d.response.statusCode) : '',
      typeof d.response?.success === 'boolean' ? (d.response.success ? 'true' : 'false') : '',
      d.response?.message || '',
      d.response?.error || '',
      d.request?.ip || '',
      d.request?.userAgent || '',
      Array.isArray(d.tags) ? d.tags.join('|') : '',
    ]);

    const esc = (s) => {
      const str = String(s ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_movements.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('[AUDIT] exportMovementsCsv:', err);
    return res.status(500).json({ success: false, message: 'Error al exportar movimientos', error: err?.message });
  }
};

/**
 * DELETE /movements/purge
 * Purga por rango de fechas o por antigüedad en días.
 */
export const purgeMovements = async (req, res) => {
  try {
    const { olderThanDays, dateFrom, dateTo } = req.query;

    const filter = {};
    if (olderThanDays) {
      const days = Math.max(1, parseInt(String(olderThanDays), 10));
      filter.createdAt = { $lte: new Date(Date.now() - days * 86400000) };
    } else if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    } else {
      return res.status(400).json({ success: false, message: 'Debe enviar olderThanDays o dateFrom/dateTo' });
    }

    const r = await Movement.deleteMany(filter);

    return res.status(200).json({
      success: true,
      message: `Purgados ${r.deletedCount} movimientos`,
      deletedCount: r.deletedCount,
    });
  } catch (err) {
    console.error('[AUDIT] purgeMovements:', err);
    return res.status(500).json({ success: false, message: 'Error al purgar movimientos', error: err?.message });
  }
};
