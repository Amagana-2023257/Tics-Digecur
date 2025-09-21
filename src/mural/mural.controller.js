import Mural, { MURAL_KINDS, MURAL_CONTENT_TYPES, MURAL_STATUS } from './mural.model.js';
import { handleErrorResponse } from '../middlewares/handle-errors.js';
import { logActivity } from '../movements/movement.controller.js';
import { uploadToCloudinary } from '../middlewares/multer-uploads.js';

/* =============================================================================
   Helpers
============================================================================= */
const stripDiacritics = (s = '') =>
  String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();

const toEnum = (val, list) => (list.includes(val) ? val : null);

const tryParseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

const parseHHmm = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) ? { hh, mm } : null;
};

const parseYouTubeId = (url) => {
  if (!url) return null;
  try {
    const u = new URL(String(url));
    if (/youtu\.be$/i.test(u.hostname)) {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/watch')) return u.searchParams.get('v');
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    }
    return null;
  } catch {
    return null;
  }
};

function sanitizeMural(d) {
  if (!d) return null;
  return {
    id: d._id || d.id,
    title: d.title,
    slug: d.slug || null,
    kind: d.kind,
    contentType: d.contentType,
    body: d.body || '',
    mainImageUrl: d.mainImageUrl || null,
    galleryUrls: Array.isArray(d.galleryUrls) ? d.galleryUrls : [],
    videoUrl: d.videoUrl || null,
    youtubeId: d.youtubeId || null,
    publishFrom: d.publishFrom || null,
    publishTo: d.publishTo || null,
    recurrence: d.recurrence || { freq: 'NONE' },
    status: d.status,
    isActive: !!d.isActive,
    isPinned: !!d.isPinned,
    priority: typeof d.priority === 'number' ? d.priority : 0,
    createdBy: d.createdBy ? String(d.createdBy) : null,
    updatedBy: d.updatedBy ? String(d.updatedBy) : null,
    views: d.views ?? 0,
    clicks: d.clicks ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function buildFilter(q = {}) {
  const filter = {};
  const {
    q: text,
    kind,
    contentType,
    status,
    isActive,
    isPinned,
    from,
    to,
    visibleNow,
  } = q;

  if (text && String(text).trim()) {
    const rx = new RegExp(String(text).trim(), 'i');
    filter.$or = [{ title: rx }, { body: rx }];
  }

  if (kind) {
    const k = String(kind).toUpperCase().trim();
    if (MURAL_KINDS.includes(k)) filter.kind = k;
  }
  if (contentType) {
    const ct = String(contentType).toUpperCase().trim();
    if (MURAL_CONTENT_TYPES.includes(ct)) filter.contentType = ct;
  }
  if (status) {
    const st = String(status).toUpperCase().trim();
    if (MURAL_STATUS.includes(st)) filter.status = st;
  }

  if (typeof isActive !== 'undefined') {
    const v = typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : Boolean(isActive);
    filter.isActive = v;
  }

  if (typeof isPinned !== 'undefined') {
    const v = typeof isPinned === 'string' ? isPinned.toLowerCase() === 'true' : Boolean(isPinned);
    filter.isPinned = v;
  }

  const df = tryParseDate(from);
  const dt = tryParseDate(to);
  if (df || dt) {
    if (df) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ publishFrom: { $gte: df } }, { publishFrom: null }] }]);
    }
    if (dt) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ publishTo: { $lte: dt } }, { publishTo: null }] }]);
    }
  }

  // visibleNow sin $function (compatible con Atlas tiers bajos)
  if (typeof visibleNow !== 'undefined') {
    const wantVisible = (typeof visibleNow === 'string' ? visibleNow.toLowerCase() === 'true' : !!visibleNow);
    if (wantVisible) {
      const now = new Date();

      // Ventana de fechas (server-side now; esto está bien)
      const dateWindow = {
        $and: [
          { $or: [{ publishFrom: { $lte: now } }, { publishFrom: null }, { publishFrom: { $exists: false } }] },
          { $or: [{ publishTo: { $gte: now } }, { publishTo: null }, { publishTo: { $exists: false } }] },
        ],
      };

      // Semanal con $$NOW y TZ fija (0=Dom..6=Sáb, como en tu modelo)
      const TZ = 'America/Guatemala';
      const weeklyOk = {
        $or: [
          { 'recurrence.freq': 'NONE' },
          { 'recurrence.freq': 'DAILY' },
          {
            'recurrence.freq': 'WEEKLY',
            $expr: {
              $in: [
                { $subtract: [{ $dayOfWeek: { date: '$$NOW', timezone: TZ } }, 1] },
                { $ifNull: ['$recurrence.daysOfWeek', []] },
              ],
            },
          },
        ],
      };

      // Ventana diaria HH:mm sin $function
      const dailyWindow = {
        $expr: {
          $let: {
            vars: {
              nowParts: { $dateToParts: { date: '$$NOW', timezone: TZ } },
              sStr: { $ifNull: ['$recurrence.startTime', null] },
              eStr: { $ifNull: ['$recurrence.endTime', null] },
            },
            in: {
              $let: {
                vars: {
                  nowMin: { $add: [{ $multiply: ['$$nowParts.hour', 60] }, '$$nowParts.minute'] },
                  sMin: {
                    $cond: [
                      { $ne: ['$$sStr', null] },
                      {
                        $add: [
                          { $multiply: [{ $toInt: { $substrBytes: ['$$sStr', 0, 2] } }, 60] },
                          { $toInt: { $substrBytes: ['$$sStr', 3, 2] } },
                        ],
                      },
                      null,
                    ],
                  },
                  eMin: {
                    $cond: [
                      { $ne: ['$$eStr', null] },
                      {
                        $add: [
                          { $multiply: [{ $toInt: { $substrBytes: ['$$eStr', 0, 2] } }, 60] },
                          { $toInt: { $substrBytes: ['$$eStr', 3, 2] } },
                        ],
                      },
                      null,
                    ],
                  },
                },
                in: {
                  // Si hay ambos: sMin <= now <= eMin
                  // Si sólo sMin: now >= sMin
                  // Si sólo eMin: now <= eMin
                  // Si ninguno: true
                  $cond: [
                    { $and: [{ $ne: ['$$sMin', null] }, { $ne: ['$$eMin', null] }] },
                    { $and: [{ $gte: ['$$nowMin', '$$sMin'] }, { $lte: ['$$nowMin', '$$eMin'] }] },
                    {
                      $cond: [
                        { $ne: ['$$sMin', null] },
                        { $gte: ['$$nowMin', '$$sMin'] },
                        { $cond: [{ $ne: ['$$eMin', null] }, { $lte: ['$$nowMin', '$$eMin'] }, true] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      };

      filter.isActive = true;
      filter.status = { $in: ['PUBLISHED', 'SCHEDULED'] };
      filter.$and = (filter.$and || []).concat([dateWindow, weeklyOk, dailyWindow]);
    }
  }

  return filter;
}


/* =============================================================================
   CRUD
============================================================================= */

/** Crear mural (con imagen principal opcional, subida a Cloudinary) */
export const createMural = async (req, res) => {
  try {
    const {
      title,
      slug,
      kind,
      contentType,
      body,
      videoUrl,
      galleryUrls,         // array o string coma-separada
      publishFrom, publishTo,
      status,
      isActive,
      isPinned,
      priority,
      recurrence,          // { freq, daysOfWeek, startTime, endTime, timezone }
    } = req.body;

    // Validaciones mínimas
    if (!title || !String(title).trim()) {
      await logActivity({ req, action: 'MURAL_CREATE_FAIL', entity: 'MURAL', statusCode: 400, success: false, error: 'El título es obligatorio', tags: ['mural'] });
      return handleErrorResponse(res, 400, 'El título es obligatorio');
    }

    const ct = toEnum(String(contentType || '').toUpperCase(), MURAL_CONTENT_TYPES);
    if (!ct) {
      await logActivity({ req, action: 'MURAL_CREATE_FAIL', entity: 'MURAL', statusCode: 400, success: false, error: 'contentType inválido', tags: ['mural'] });
      return handleErrorResponse(res, 400, `contentType inválido. Use: ${MURAL_CONTENT_TYPES.join(', ')}`);
    }

    const kd = toEnum(String((kind || 'INFORMACION')).toUpperCase(), MURAL_KINDS) || 'INFORMACION';
    const st = toEnum(String((status || 'DRAFT')).toUpperCase(), MURAL_STATUS) || 'DRAFT';

    // Imagen principal (si viene archivo)
    let mainImageUrl = undefined;
    if (req.file?.buffer) {
      // sube a Cloudinary -> carpeta 'mural'
      mainImageUrl = await uploadToCloudinary(req, 'mural');
    }

    // Galería opcional
    const gallery = Array.isArray(galleryUrls)
      ? galleryUrls.map(String).map((s) => s.trim()).filter(Boolean)
      : (typeof galleryUrls === 'string'
          ? String(galleryUrls).split(',').map((s) => s.trim()).filter(Boolean)
          : []);

    // Video YouTube opcional
    const ytId = videoUrl ? parseYouTubeId(videoUrl) : null;

    // Ventana de publicación
    const pf = tryParseDate(publishFrom);
    const pt = tryParseDate(publishTo);

    // Recurrencia opcional
    const rec = typeof recurrence === 'object' && recurrence !== null ? recurrence : {};
    const rStart = parseHHmm(rec.startTime)?.hh !== undefined ? rec.startTime : undefined;
    const rEnd   = parseHHmm(rec.endTime)?.hh !== undefined ? rec.endTime : undefined;
    const rFreq  = toEnum(String((rec.freq || 'NONE')).toUpperCase(), ['NONE','DAILY','WEEKLY']) || 'NONE';
    const rDays  = Array.isArray(rec.daysOfWeek) ? rec.daysOfWeek.map(Number).filter((n) => Number.isInteger(n) && n>=0 && n<=6) : undefined;
    const rTz    = rec.timezone || 'America/Guatemala';

    const doc = await Mural.create({
      title: String(title).trim(),
      slug: slug ? String(slug).trim() : undefined,
      kind: kd,
      contentType: ct,
      body: body ? String(body).trim() : '',
      mainImageUrl,
      galleryUrls: gallery,
      videoUrl: videoUrl ? String(videoUrl).trim() : undefined,
      youtubeId: ytId || undefined,
      publishFrom: pf || undefined,
      publishTo: pt || undefined,
      status: st,
      isActive: typeof isActive !== 'undefined'
        ? (typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : !!isActive)
        : true,
      isPinned: typeof isPinned !== 'undefined'
        ? (typeof isPinned === 'string' ? isPinned.toLowerCase() === 'true' : !!isPinned)
        : false,
      priority: typeof priority !== 'undefined' && priority !== null ? Number(priority) : 0,
      createdBy: req.user?.id || req.user?._id || null,
      recurrence: {
        freq: rFreq,
        daysOfWeek: rDays,
        startTime: rStart,
        endTime: rEnd,
        timezone: rTz,
      },
    });

    await logActivity({
      req, action: 'MURAL_CREATE', entity: 'MURAL', entityId: doc._id,
      statusCode: 201, success: true, message: 'Mural creado',
      after: sanitizeMural(doc.toJSON ? doc.toJSON() : doc), tags: ['mural'],
    });

    res.status(201).json({ success: true, message: 'Mural creado', mural: sanitizeMural(doc) });
  } catch (err) {
    console.error('Error createMural:', err);
    await logActivity({ req, action: 'MURAL_CREATE_FAIL', entity: 'MURAL', statusCode: 500, success: false, error: err?.message, tags: ['mural'] });
    return handleErrorResponse(res, 500, 'Error al crear mural', err?.message);
  }
};

/** Listar murales (con filtros y paginación) */
export const getAllMurals = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip  = (page - 1) * limit;
    const sort  = req.query.sort ? String(req.query.sort) : '-isPinned -priority -publishFrom -createdAt';

    const filter = buildFilter(req.query);

    const [total, docs] = await Promise.all([
      Mural.countDocuments(filter),
      Mural.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ]);

    // No-cache para listados
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    await logActivity({
      req, action: 'MURAL_LIST', entity: 'MURAL',
      statusCode: 200, success: true, message: `Listado OK (${docs.length})`, tags: ['mural'],
    });

    res.status(200).json({
      success: true,
      message: 'Murales obtenidos',
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      items: docs.map(sanitizeMural),
    });
  } catch (err) {
    console.error('Error getAllMurals:', err);
    await logActivity({ req, action: 'MURAL_LIST_FAIL', entity: 'MURAL', statusCode: 500, success: false, error: err?.message, tags: ['mural'] });
    return handleErrorResponse(res, 500, 'Error al obtener murales', err?.message);
  }
};

/** Obtener por ID */
export const getMuralById = async (req, res) => {
  try {
    const doc = await Mural.findById(req.params.muralId).lean();
    if (!doc) {
      await logActivity({ req, action: 'MURAL_GET_FAIL', entity: 'MURAL', entityId: req.params.muralId, statusCode: 404, success: false, error: 'Mural no encontrado', tags: ['mural'] });
      return handleErrorResponse(res, 404, 'Mural no encontrado');
    }

    await logActivity({ req, action: 'MURAL_GET', entity: 'MURAL', entityId: doc._id, statusCode: 200, success: true, message: 'Mural encontrado', tags: ['mural'] });

    res.status(200).json({ success: true, message: 'Mural encontrado', mural: sanitizeMural(doc) });
  } catch (err) {
    console.error('Error getMuralById:', err);
    await logActivity({ req, action: 'MURAL_GET_FAIL', entity: 'MURAL', entityId: req.params.muralId, statusCode: 500, success: false, error: err?.message, tags: ['mural'] });
    return handleErrorResponse(res, 500, 'Error al obtener mural', err?.message);
  }
};

/** Actualizar mural (imagen principal opcional) */
export const updateMural = async (req, res) => {
  try {
    const { muralId } = req.params;
    const doc = await Mural.findById(muralId);
    if (!doc) {
      await logActivity({ req, action: 'MURAL_UPDATE_FAIL', entity: 'MURAL', entityId: muralId, statusCode: 404, success: false, error: 'Mural no encontrado', tags: ['mural'] });
      return handleErrorResponse(res, 404, 'Mural no encontrado');
    }

    const before = doc.toObject ? doc.toObject() : { ...doc };

    // Campos editables
    const {
      title, slug, kind, contentType, body,
      videoUrl, galleryUrls,
      publishFrom, publishTo,
      status, isActive, isPinned, priority,
      recurrence,
    } = req.body;

    if (typeof title !== 'undefined') doc.title = String(title).trim();
    if (typeof slug !== 'undefined')  doc.slug  = slug ? String(slug).trim() : undefined;

    if (typeof kind !== 'undefined') {
      const kd = toEnum(String(kind).toUpperCase(), MURAL_KINDS);
      if (kd) doc.kind = kd;
    }

    if (typeof contentType !== 'undefined') {
      const ct = toEnum(String(contentType).toUpperCase(), MURAL_CONTENT_TYPES);
      if (ct) doc.contentType = ct;
    }

    if (typeof body !== 'undefined') doc.body = String(body).trim();

    // Imagen principal nueva (si viene archivo)
    if (req.file?.buffer) {
      doc.mainImageUrl = await uploadToCloudinary(req, 'mural');
    }

    // Galería
    if (typeof galleryUrls !== 'undefined') {
      if (Array.isArray(galleryUrls)) doc.galleryUrls = galleryUrls.map(String).map((s) => s.trim()).filter(Boolean);
      else if (typeof galleryUrls === 'string')
        doc.galleryUrls = String(galleryUrls).split(',').map((s) => s.trim()).filter(Boolean);
      else doc.galleryUrls = [];
    }

    // Video
    if (typeof videoUrl !== 'undefined') {
      doc.videoUrl = videoUrl ? String(videoUrl).trim() : undefined;
      doc.youtubeId = doc.videoUrl ? (parseYouTubeId(doc.videoUrl) || undefined) : undefined;
    }

    // Ventana de publicación
    const pf = tryParseDate(publishFrom);
    const pt = tryParseDate(publishTo);
    if (publishFrom !== undefined) doc.publishFrom = pf || undefined;
    if (publishTo   !== undefined) doc.publishTo   = pt || undefined;

    // Estado / flags
    if (typeof status !== 'undefined') {
      const st = toEnum(String(status).toUpperCase(), MURAL_STATUS);
      if (st) doc.status = st;
    }
    if (typeof isActive !== 'undefined')
      doc.isActive = (typeof isActive === 'string') ? (isActive.toLowerCase() === 'true') : !!isActive;
    if (typeof isPinned !== 'undefined')
      doc.isPinned = (typeof isPinned === 'string') ? (isPinned.toLowerCase() === 'true') : !!isPinned;
    if (typeof priority !== 'undefined')
      doc.priority = (priority === null || priority === '') ? 0 : Number(priority);

    // Recurrencia
    if (typeof recurrence !== 'undefined') {
      const rec = typeof recurrence === 'object' && recurrence !== null ? recurrence : {};
      const rFreq = toEnum(String((rec.freq || 'NONE')).toUpperCase(), ['NONE','DAILY','WEEKLY']) || 'NONE';
      const rDays = Array.isArray(rec.daysOfWeek)
        ? rec.daysOfWeek.map(Number).filter((n) => Number.isInteger(n) && n>=0 && n<=6)
        : undefined;
      const rStart = parseHHmm(rec.startTime)?.hh !== undefined ? rec.startTime : undefined;
      const rEnd   = parseHHmm(rec.endTime)?.hh !== undefined ? rec.endTime : undefined;
      const rTz    = rec.timezone || 'America/Guatemala';

      doc.recurrence = { freq: rFreq, daysOfWeek: rDays, startTime: rStart, endTime: rEnd, timezone: rTz };
    }

    doc.updatedBy = req.user?.id || req.user?._id || null;

    await doc.save();

    const after = doc.toJSON ? doc.toJSON() : doc;

    await logActivity({
      req, action: 'MURAL_UPDATE', entity: 'MURAL', entityId: doc._id,
      statusCode: 200, success: true, message: 'Mural actualizado',
      before, after, tags: ['mural'],
    });

    res.status(200).json({ success: true, message: 'Mural actualizado', mural: sanitizeMural(after) });
  } catch (err) {
    console.error('Error updateMural:', err);
    await logActivity({ req, action: 'MURAL_UPDATE_FAIL', entity: 'MURAL', entityId: req.params.muralId, statusCode: 500, success: false, error: err?.message, tags: ['mural'] });
    return handleErrorResponse(res, 500, 'Error al actualizar mural', err?.message);
  }
};

/** Eliminar mural */
export const deleteMural = async (req, res) => {
  try {
    const { muralId } = req.params;
    const doc = await Mural.findByIdAndDelete(muralId);
    if (!doc) {
      await logActivity({ req, action: 'MURAL_DELETE_FAIL', entity: 'MURAL', entityId: muralId, statusCode: 404, success: false, error: 'Mural no encontrado', tags: ['mural'] });
      return handleErrorResponse(res, 404, 'Mural no encontrado');
    }

    await logActivity({
      req, action: 'MURAL_DELETE', entity: 'MURAL', entityId: doc._id,
      statusCode: 200, success: true, message: 'Mural eliminado',
      before: sanitizeMural(doc), tags: ['mural'],
    });

    res.status(200).json({ success: true, message: 'Mural eliminado' });
  } catch (err) {
    console.error('Error deleteMural:', err);
    await logActivity({ req, action: 'MURAL_DELETE_FAIL', entity: 'MURAL', entityId: req.params.muralId, statusCode: 500, success: false, error: err?.message, tags: ['mural'] });
    return handleErrorResponse(res, 500, 'Error al eliminar mural', err?.message);
  }
};

/** Endpoints opcionales: publicar / archivar rápido */
export const publishMural = async (req, res) => {
  try {
    const { muralId } = req.params;
    const doc = await Mural.findById(muralId);
    if (!doc) return handleErrorResponse(res, 404, 'Mural no encontrado');

    const before = doc.toObject ? doc.toObject() : { ...doc };
    doc.status = 'PUBLISHED';
    doc.isActive = true;
    doc.updatedBy = req.user?.id || req.user?._id || null;
    await doc.save();

    await logActivity({
      req, action: 'MURAL_PUBLISH', entity: 'MURAL', entityId: doc._id,
      statusCode: 200, success: true, message: 'Mural publicado',
      before, after: doc, tags: ['mural'],
    });

    res.status(200).json({ success: true, message: 'Mural publicado', mural: sanitizeMural(doc) });
  } catch (err) {
    console.error('Error publishMural:', err);
    return handleErrorResponse(res, 500, 'Error al publicar', err?.message);
  }
};

export const archiveMural = async (req, res) => {
  try {
    const { muralId } = req.params;
    const doc = await Mural.findById(muralId);
    if (!doc) return handleErrorResponse(res, 404, 'Mural no encontrado');

    const before = doc.toObject ? doc.toObject() : { ...doc };
    doc.status = 'ARCHIVED';
    doc.isActive = false;
    doc.updatedBy = req.user?.id || req.user?._id || null;
    await doc.save();

    await logActivity({
      req, action: 'MURAL_ARCHIVE', entity: 'MURAL', entityId: doc._id,
      statusCode: 200, success: true, message: 'Mural archivado',
      before, after: doc, tags: ['mural'],
    });

    res.status(200).json({ success: true, message: 'Mural archivado', mural: sanitizeMural(doc) });
  } catch (err) {
    console.error('Error archiveMural:', err);
    return handleErrorResponse(res, 500, 'Error al archivar', err?.message);
  }
};
