// src/cardex/cardex.controller.js
import Cardex, { CARDEX_CATS } from './cardex.model.js';
import { handleErrorResponse } from '../middlewares/handle-errors.js';
import { logActivity } from '../movements/movement.controller.js';

/* =============================================================================
   Helpers
============================================================================= */
const stripDiacritics = (s = '') =>
  String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();

function normalizeCategory(input) {
  if (!input) return null;
  const x = stripDiacritics(input);
  const alias = {
    MODULO: 'MODULOS',
    MODULOS: 'MODULOS',
    GUIA: 'GUIAS',
    GUIAS: 'GUIAS',
    FASCICULO: 'FASCICULOS',
    FASCICULOS: 'FASCICULOS',
    FASICULO: 'FASCICULOS',
    FASICULOS: 'FASCICULOS',
    BIFOLIAR: 'BIFOLIAR',
    FOLLETO: 'FOLLETO',
    INSTRUCTIVO: 'INSTRUCTIVO',
    LIBRO: 'LIBRO',
    DOCUMENTO: 'DOCUMENTO',
    INFORME: 'INFORME',
    MANUAL: 'MANUAL',
    OTRO: 'OTRO',
  };
  const mapped = alias[x] || x;
  return CARDEX_CATS.includes(mapped) ? mapped : null;
}

function tryParseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function toYear(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1800 && n <= 3000 ? n : null;
}

/** Validación pragmática de URLs de OneDrive/SharePoint/1drv.ms (archivos, no carpetas) */
function isOneDriveFileUrl(urlStr = '') {
  try {
    const u = new URL(String(urlStr));
    const host = u.hostname.toLowerCase();

    if (host === '1drv.ms') return !u.pathname.startsWith('/f/'); // /f/ => folders
    if (host.endsWith('sharepoint.com'))
      return u.pathname.startsWith('/:') && !u.pathname.startsWith('/:f:'); // :f: => folder
    if (host === 'onedrive.live.com') {
      const sp = u.searchParams;
      return sp.has('resid') || sp.has('id');
    }
    return false;
  } catch {
    return false;
  }
}

function sanitizeCardex(d) {
  if (!d) return null;
  const hasOneDrive = !!d.onedriveUrl;

  return {
    id: d._id || d.id,
    titulo: d.titulo,
    descripcion: d.descripcion,
    categoria: d.categoria,
    tags: d.tags || [],
    provider: d.provider || (hasOneDrive ? 'onedrive' : null),
    onedriveUrl: hasOneDrive ? d.onedriveUrl : null,
    // Para UI
    viewUrl: hasOneDrive ? d.onedriveUrl : null,
    downloadUrl: hasOneDrive ? `${d.onedriveUrl}${d.onedriveUrl.includes('?') ? '&' : '?'}download=1` : null,
    // Metadatos opcionales
    originalName: d.originalName || null,
    mimeType: d.mimeType || null,
    size: d.size ?? null,
    // Fechas
    fechaDocumento: d.fechaDocumento || null,
    anioDocumento:
      typeof d.anioDocumento === 'number'
        ? d.anioDocumento
        : d.fechaDocumento
        ? new Date(d.fechaDocumento).getUTCFullYear()
        : null,
    uploadedBy: d.uploadedBy ? String(d.uploadedBy) : null,
    isActive: !!d.isActive,
    views: d.views ?? 0,
    downloads: d.downloads ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function buildFilter(q = {}) {
  const filter = {};
  const {
    q: text,
    categoria,
    isActive,
    uploadedBy,
    tag,
    anio,
    anioDocumento,
    fechaFrom,
    fechaTo,
  } = q;

  if (text && String(text).trim()) {
    const rx = new RegExp(String(text).trim(), 'i');
    filter.$or = [{ titulo: rx }, { descripcion: rx }, { originalName: rx }, { tags: rx }];
  }

  if (categoria) {
    const norm = normalizeCategory(categoria);
    if (norm) filter.categoria = norm;
  }

  if (typeof isActive !== 'undefined') {
    const v = typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : Boolean(isActive);
    filter.isActive = v;
  }

  if (uploadedBy) filter.uploadedBy = String(uploadedBy);
  if (tag && String(tag).trim()) filter.tags = { $in: [String(tag).trim()] };

  const y = toYear(anioDocumento ?? anio);
  if (y !== null) filter.anioDocumento = y;

  const df = tryParseDate(fechaFrom);
  const dt = tryParseDate(fechaTo);
  if (df || dt) {
    filter.fechaDocumento = {};
    if (df) filter.fechaDocumento.$gte = df;
    if (dt) filter.fechaDocumento.$lte = dt;
  }

  return filter;
}

/* =============================================================================
   CRUD (solo URL de OneDrive; sin archivos locales)
============================================================================= */

export const createCardex = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      categoria,
      tags,
      isActive,
      fechaDocumento,
      anioDocumento,
      onedriveUrl,
      originalName, // opcional
      mimeType,     // opcional
      size,         // opcional
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      await logActivity({
        req, action: 'CARDEX_CREATE_FAIL', entity: 'CARDEX',
        statusCode: 400, success: false, error: 'El título es obligatorio',
        tags: ['cardex'],
      });
      return handleErrorResponse(res, 400, 'El título es obligatorio');
    }

    if (!onedriveUrl || !isOneDriveFileUrl(onedriveUrl)) {
      await logActivity({
        req, action: 'CARDEX_CREATE_FAIL', entity: 'CARDEX',
        statusCode: 400, success: false, error: 'onedriveUrl inválida (debe ser archivo)', tags: ['cardex'],
      });
      return handleErrorResponse(res, 400, 'onedriveUrl inválida (debe ser archivo de OneDrive/SharePoint)');
    }

    const catNorm = normalizeCategory(categoria) || 'DOCUMENTO';
    const fechaDoc = tryParseDate(fechaDocumento);
    const anioDoc  = toYear(anioDocumento) ?? (fechaDoc ? fechaDoc.getUTCFullYear() : null);

    const payload = {
      titulo: String(titulo).trim(),
      descripcion: descripcion ? String(descripcion).trim() : '',
      categoria: catNorm,
      tags: Array.isArray(tags)
        ? tags.map(String).map((s) => s.trim()).filter(Boolean)
        : (typeof tags === 'string'
            ? String(tags).split(',').map((s) => s.trim()).filter(Boolean)
            : []),
      provider: 'onedrive',
      onedriveUrl: String(onedriveUrl).trim(),
      originalName: originalName ? String(originalName).trim() : null,
      mimeType: mimeType ? String(mimeType).trim() : null,
      size: typeof size !== 'undefined' && size !== null ? Number(size) : null,
      uploadedBy: req.user?.id || req.user?._id || null,
      ...(typeof isActive !== 'undefined'
        ? { isActive: typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : !!isActive }
        : {}),
      ...(fechaDoc ? { fechaDocumento: fechaDoc } : {}),
      ...(anioDoc !== null ? { anioDocumento: anioDoc } : {}),
    };

    const doc = await Cardex.create(payload);

    await logActivity({
      req, action: 'CARDEX_CREATE', entity: 'CARDEX', entityId: doc._id,
      statusCode: 201, success: true, message: 'Documento creado',
      after: sanitizeCardex(doc.toJSON ? doc.toJSON() : doc), tags: ['cardex'],
    });

    return res.status(201).json({
      success: true,
      message: 'Documento creado',
      cardex: sanitizeCardex(doc),
    });
  } catch (err) {
    console.error('Error createCardex:', err);
    await logActivity({
      req, action: 'CARDEX_CREATE_FAIL', entity: 'CARDEX',
      statusCode: 500, success: false, error: err?.message, tags: ['cardex'],
    });
    return handleErrorResponse(res, 500, 'Error al crear documento', err?.message);
  }
};

export const getAllCardex = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip  = (page - 1) * limit;
    const sort  = req.query.sort ? String(req.query.sort) : '-createdAt';

    const filter = buildFilter(req.query);

    const [total, docs] = await Promise.all([
      Cardex.countDocuments(filter),
      Cardex.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ]);

    // No-cache para listados
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    await logActivity({
      req, action: 'CARDEX_LIST', entity: 'CARDEX',
      statusCode: 200, success: true, message: `Listado OK (${docs.length})`,
      tags: ['cardex'],
    });

    return res.status(200).json({
      success: true,
      message: 'Cardex obtenido',
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      items: docs.map(sanitizeCardex),
    });
  } catch (err) {
    console.error('Error getAllCardex:', err);
    await logActivity({
      req, action: 'CARDEX_LIST_FAIL', entity: 'CARDEX',
      statusCode: 500, success: false, error: err?.message, tags: ['cardex'],
    });
    return handleErrorResponse(res, 500, 'Error al obtener documentos', err?.message);
  }
};

export const getCardexById = async (req, res) => {
  try {
    const doc = await Cardex.findById(req.params.cardexId).lean();
    if (!doc) {
      await logActivity({
        req, action: 'CARDEX_GET_FAIL', entity: 'CARDEX', entityId: req.params.cardexId,
        statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'],
      });
      return handleErrorResponse(res, 404, 'Documento no encontrado');
    }

    await logActivity({
      req, action: 'CARDEX_GET', entity: 'CARDEX', entityId: doc._id,
      statusCode: 200, success: true, message: 'Documento encontrado', tags: ['cardex'],
    });

    return res.status(200).json({
      success: true,
      message: 'Documento encontrado',
      cardex: sanitizeCardex(doc),
    });
  } catch (err) {
    console.error('Error getCardexById:', err);
    await logActivity({
      req, action: 'CARDEX_GET_FAIL', entity: 'CARDEX', entityId: req.params.cardexId,
      statusCode: 500, success: false, error: err?.message, tags: ['cardex'],
    });
    return handleErrorResponse(res, 500, 'Error al obtener documento', err?.message);
  }
};

export const updateCardex = async (req, res) => {
  try {
    const { cardexId } = req.params;
    const {
      titulo,
      descripcion,
      categoria,
      tags,
      isActive,
      fechaDocumento,
      anioDocumento,
      onedriveUrl,
      originalName, // opcional
      mimeType,     // opcional
      size,         // opcional
    } = req.body;

    const doc = await Cardex.findById(cardexId);
    if (!doc) {
      await logActivity({
        req, action: 'CARDEX_UPDATE_FAIL', entity: 'CARDEX', entityId: cardexId,
        statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'],
      });
      return handleErrorResponse(res, 404, 'Documento no encontrado');
    }

    const before = doc.toObject ? doc.toObject() : { ...doc };

    if (typeof titulo !== 'undefined') doc.titulo = String(titulo).trim();
    if (typeof descripcion !== 'undefined') doc.descripcion = String(descripcion).trim();

    if (typeof categoria !== 'undefined') {
      const cat = normalizeCategory(categoria);
      if (cat) doc.categoria = cat;
    }

    if (typeof tags !== 'undefined') {
      if (Array.isArray(tags)) doc.tags = tags.map(String).map((s) => s.trim()).filter(Boolean);
      else if (typeof tags === 'string')
        doc.tags = String(tags).split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (typeof isActive !== 'undefined') {
      doc.isActive = typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : !!isActive;
    }

    const fechaDoc = tryParseDate(fechaDocumento);
    const anioDoc  = toYear(anioDocumento);
    if (fechaDoc) {
      doc.fechaDocumento = fechaDoc;
      if (anioDoc === null) doc.anioDocumento = fechaDoc.getUTCFullYear();
    }
    if (anioDoc !== null) doc.anioDocumento = anioDoc;

    if (typeof onedriveUrl !== 'undefined') {
      if (!onedriveUrl || !isOneDriveFileUrl(onedriveUrl)) {
        await logActivity({
          req, action: 'CARDEX_UPDATE_FAIL', entity: 'CARDEX', entityId: cardexId,
          statusCode: 400, success: false, error: 'onedriveUrl inválida (archivo).', tags: ['cardex'],
        });
        return handleErrorResponse(res, 400, 'onedriveUrl inválida (archivo).');
      }
      doc.provider = 'onedrive';
      doc.onedriveUrl = String(onedriveUrl).trim();
    }

    // Metadatos opcionales
    if (typeof originalName !== 'undefined') doc.originalName = originalName ? String(originalName).trim() : null;
    if (typeof mimeType !== 'undefined') doc.mimeType = mimeType ? String(mimeType).trim() : null;
    if (typeof size !== 'undefined') doc.size = (size === null || size === '') ? null : Number(size);

    await doc.save();

    const after = doc.toJSON ? doc.toJSON() : doc;

    await logActivity({
      req, action: 'CARDEX_UPDATE', entity: 'CARDEX', entityId: doc._id,
      statusCode: 200, success: true, message: 'Documento actualizado',
      before, after, tags: ['cardex'],
    });

    return res.status(200).json({
      success: true,
      message: 'Documento actualizado',
      cardex: sanitizeCardex(after),
    });
  } catch (err) {
    console.error('Error updateCardex:', err);
    await logActivity({
      req, action: 'CARDEX_UPDATE_FAIL', entity: 'CARDEX', entityId: req.params.cardexId,
      statusCode: 500, success: false, error: err?.message, tags: ['cardex'],
    });
    return handleErrorResponse(res, 500, 'Error al actualizar documento', err?.message);
  }
};

export const deleteCardex = async (req, res) => {
  try {
    const { cardexId } = req.params;
    const doc = await Cardex.findByIdAndDelete(cardexId);
    if (!doc) {
      await logActivity({
        req, action: 'CARDEX_DELETE_FAIL', entity: 'CARDEX', entityId: cardexId,
        statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'],
      });
      return handleErrorResponse(res, 404, 'Documento no encontrado');
    }

    await logActivity({
      req, action: 'CARDEX_DELETE', entity: 'CARDEX', entityId: doc._id,
      statusCode: 200, success: true, message: 'Documento eliminado',
      before: sanitizeCardex(doc), tags: ['cardex'],
    });

    return res.status(200).json({ success: true, message: 'Documento eliminado' });
  } catch (err) {
    console.error('Error deleteCardex:', err);
    await logActivity({
      req, action: 'CARDEX_DELETE_FAIL', entity: 'CARDEX', entityId: req.params.cardexId,
      statusCode: 500, success: false, error: err?.message, tags: ['cardex'],
    });
    return handleErrorResponse(res, 500, 'Error al eliminar documento', err?.message);
  }
};
