import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import Cardex, { CARDEX_CATS } from './cardex.model.js';
import { handleErrorResponse } from '../middlewares/handle-errors.js';
import { logActivity } from '../movements/movement.controller.js';

/* =============================================================================
   Config legacy (solo para lectura de archivos viejos, NO subimos nada)
============================================================================= */
export const CARDEX_UPLOAD_DIR =
  process.env.CARDEX_UPLOAD_DIR && String(process.env.CARDEX_UPLOAD_DIR).trim()
    ? process.env.CARDEX_UPLOAD_DIR
    : path.resolve(process.cwd(), 'uploads', 'cardex');

async function ensureUploadDir() {
  try { await fsp.mkdir(CARDEX_UPLOAD_DIR, { recursive: true }); } catch {}
}

function toLegacyFileUrl(fileName) {
  return `/files/cardex/${encodeURIComponent(fileName)}`;
}

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

    if (host === '1drv.ms') return !u.pathname.startsWith('/f/');
    if (host.endsWith('sharepoint.com')) return u.pathname.startsWith('/:') && !u.pathname.startsWith('/:f:');
    if (host === 'onedrive.live.com') {
      const sp = u.searchParams;
      return sp.has('resid') || sp.has('id');
    }
    return false;
  } catch {
    return false;
  }
}

/** Devuelve la URL de descarga (añade download=1 preservando query existente) */
function toDownloadUrl(u = '') {
  try {
    const url = new URL(String(u));
    // OneDrive/SharePoint aceptan download=1 para forzar descarga
    url.searchParams.set('download', '1');
    return url.toString();
  } catch {
    return u;
  }
}

function sanitizeCardex(d) {
  if (!d) return null;

  const hasOneDrive = !!d.onedriveUrl;
  const legacyLocal = !!d.fileName;

  const base = {
    id: d._id || d.id,
    titulo: d.titulo,
    descripcion: d.descripcion,
    categoria: d.categoria,
    tags: d.tags || [],
    // Fuente principal
    provider: d.provider || (hasOneDrive ? 'onedrive' : null),
    onedriveUrl: hasOneDrive ? d.onedriveUrl : null,
    // Compat: exponer fileUrl como la URL principal usable por el front
    fileUrl: hasOneDrive ? d.onedriveUrl : (legacyLocal ? toLegacyFileUrl(d.fileName) : null),

    // Legacy metadata (si existiera)
    fileName: d.fileName || null,
    originalName: d.originalName || null,
    mimeType: d.mimeType || null,
    size: d.size ?? null,

    // Nuevo: helpers para vista/descarga
    viewUrl: hasOneDrive ? d.onedriveUrl : (legacyLocal ? toLegacyFileUrl(d.fileName) : null),
    downloadUrl: hasOneDrive ? toDownloadUrl(d.onedriveUrl) : (legacyLocal ? toLegacyFileUrl(d.fileName) : null),

    fechaDocumento: d.fechaDocumento || null,
    anioDocumento: typeof d.anioDocumento === 'number'
      ? d.anioDocumento
      : (d.fechaDocumento ? new Date(d.fechaDocumento).getUTCFullYear() : null),

    uploadedBy: d.uploadedBy ? String(d.uploadedBy) : null,
    isActive: !!d.isActive,
    views: d.views ?? 0,
    downloads: d.downloads ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };

  return base;
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
   CRUD (sin subida de PDF — solo URL de OneDrive)
============================================================================= */

export const createCardex = async (req, res) => {
  try {
    // No subimos nada; mantenemos dir legacy por si luego se visualizan antiguos
    await ensureUploadDir();

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
        statusCode: 400, success: false,
        error: 'El título es obligatorio',
        tags: ['cardex'],
      });
      return handleErrorResponse(res, 400, 'El título es obligatorio');
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
      statusCode: 201, success: true, message: 'Documento creado (OneDrive)',
      after: sanitizeCardex(doc.toJSON ? doc.toJSON() : doc), tags: ['cardex'],
    });

    return res.status(201).json({
      success: true,
      message: 'Documento creado',
      cardex: sanitizeCardex(doc),
    });
  } catch (err) {
    console.error('Error createCardex:', err);
    await logActivity({ req, action: 'CARDEX_CREATE_FAIL', entity: 'CARDEX', statusCode: 500, success: false, error: err?.message, tags: ['cardex'] });
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

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    await logActivity({
      req, action: 'CARDEX_LIST', entity: 'CARDEX',
      statusCode: 200, success: true, message: `Listado de cardex Ok (${docs.length} items)`,
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
    await logActivity({ req, action: 'CARDEX_LIST_FAIL', entity: 'CARDEX', statusCode: 500, success: false, error: err?.message, tags: ['cardex'] });
    return handleErrorResponse(res, 500, 'Error al obtener documentos', err?.message);
  }
};

export const getCardexById = async (req, res) => {
  try {
    const doc = await Cardex.findById(req.params.cardexId).lean();
    if (!doc) {
      await logActivity({ req, action: 'CARDEX_GET_FAIL', entity: 'CARDEX', entityId: req.params.cardexId, statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Documento no encontrado');
    }

    await logActivity({ req, action: 'CARDEX_GET', entity: 'CARDEX', entityId: doc._id, statusCode: 200, success: true, message: 'Documento encontrado', tags: ['cardex'] });

    return res.status(200).json({
      success: true,
      message: 'Documento encontrado',
      cardex: sanitizeCardex(doc),
    });
  } catch (err) {
    console.error('Error getCardexById:', err);
    await logActivity({ req, action: 'CARDEX_GET_FAIL', entity: 'CARDEX', entityId: req.params.cardexId, statusCode: 500, success: false, error: err?.message, tags: ['cardex'] });
    return handleErrorResponse(res, 500, 'Error al obtener documento', err?.message);
  }
};

export const updateCardex = async (req, res) => {
  try {
    await ensureUploadDir();

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
      await logActivity({ req, action: 'CARDEX_UPDATE_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'] });
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
      else if (typeof tags === 'string') doc.tags = String(tags).split(',').map((s) => s.trim()).filter(Boolean);
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

    // Cambiar URL de OneDrive (validada)
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

    // Notar que YA NO aceptamos archivo (req.file) ni tocamos fileName.

    await doc.save();

    const after = doc.toJSON ? doc.toJSON() : doc;

    await logActivity({
      req, action: 'CARDEX_UPDATE', entity: 'CARDEX', entityId: doc._id,
      statusCode: 200, success: true, message: 'Documento actualizado (OneDrive)',
      before, after, tags: ['cardex'],
    });

    return res.status(200).json({
      success: true,
      message: 'Documento actualizado',
      cardex: sanitizeCardex(after),
    });
  } catch (err) {
    console.error('Error updateCardex:', err);
    await logActivity({ req, action: 'CARDEX_UPDATE_FAIL', entity: 'CARDEX', entityId: req.params.cardexId, statusCode: 500, success: false, error: err?.message, tags: ['cardex'] });
    return handleErrorResponse(res, 500, 'Error al actualizar documento', err?.message);
  }
};

export const deleteCardex = async (req, res) => {
  try {
    const { cardexId } = req.params;
    const doc = await Cardex.findByIdAndDelete(cardexId);
    if (!doc) {
      await logActivity({ req, action: 'CARDEX_DELETE_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Documento no encontrado');
    }

    // No hay que borrar nada en la nube (OneDrive es externo y lo gestiona el usuario).
    // Legacy: intentar borrar archivo local si existiera (no afecta si no existe)
    try { if (doc.fileName) await fsp.unlink(path.resolve(CARDEX_UPLOAD_DIR, doc.fileName)); } catch {}

    await logActivity({
      req, action: 'CARDEX_DELETE', entity: 'CARDEX', entityId: doc._id,
      statusCode: 200, success: true, message: 'Documento eliminado',
      before: sanitizeCardex(doc), tags: ['cardex'],
    });

    return res.status(200).json({ success: true, message: 'Documento eliminado' });
  } catch (err) {
    console.error('Error deleteCardex:', err);
    await logActivity({ req, action: 'CARDEX_DELETE_FAIL', entity: 'CARDEX', entityId: req.params.cardexId, statusCode: 500, success: false, error: err?.message, tags: ['cardex'] });
    return handleErrorResponse(res, 500, 'Error al eliminar documento', err?.message);
  }
};

/* =============================================================================
   Visualización y descarga (redirección a OneDrive). Fallback legacy local.
============================================================================= */

async function bumpCounter(id, field) {
  try { await Cardex.updateOne({ _id: id }, { $inc: { [field]: 1 } }); } catch {}
}

export const streamCardexFile = async (req, res) => {
  try {
    const { cardexId } = req.params;
    const doc = await Cardex.findById(cardexId).lean();
    if (!doc) {
      await logActivity({ req, action: 'CARDEX_VIEW_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Documento no encontrado');
    }

    if (doc.onedriveUrl) {
      bumpCounter(cardexId, 'views');
      await logActivity({ req, action: 'CARDEX_VIEW', entity: 'CARDEX', entityId: cardexId, statusCode: 302, success: true, message: 'Redirect a OneDrive (view)', tags: ['cardex'] });
      return res.redirect(302, doc.onedriveUrl);
    }

    // Fallback legacy local (si existiera fileName)
    if (!doc.fileName) {
      await logActivity({ req, action: 'CARDEX_VIEW_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Documento sin fuente disponible', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Documento sin fuente disponible');
    }

    const filePath = path.resolve(CARDEX_UPLOAD_DIR, doc.fileName);
    if (!fs.existsSync(filePath)) {
      await logActivity({ req, action: 'CARDEX_VIEW_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Archivo no encontrado en servidor (legacy)', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Archivo no encontrado en servidor');
    }

    const stat = await fsp.stat(filePath);
    const range = req.headers.range;

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (start >= stat.size || end >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
        await logActivity({ req, action: 'CARDEX_VIEW_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 416, success: false, error: 'Rango inválido', tags: ['cardex'] });
        return res.end();
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
      bumpCounter(cardexId, 'views');

      await logActivity({ req, action: 'CARDEX_VIEW', entity: 'CARDEX', entityId: cardexId, statusCode: 206, success: true, message: 'Stream parcial (local legacy)', tags: ['cardex'] });
    } else {
      res.setHeader('Content-Length', stat.size);
      res.status(200);
      fs.createReadStream(filePath).pipe(res);
      bumpCounter(cardexId, 'views');

      await logActivity({ req, action: 'CARDEX_VIEW', entity: 'CARDEX', entityId: cardexId, statusCode: 200, success: true, message: 'Stream completo (local legacy)', tags: ['cardex'] });
    }
  } catch (err) {
    console.error('Error streamCardexFile:', err);
    await logActivity({ req, action: 'CARDEX_VIEW_FAIL', entity: 'CARDEX', entityId: req.params.cardexId, statusCode: 500, success: false, error: err?.message, tags: ['cardex'] });
    return handleErrorResponse(res, 500, 'Error al visualizar archivo', err?.message);
  }
};

export const downloadCardexFile = async (req, res) => {
  try {
    const { cardexId } = req.params;
    const doc = await Cardex.findById(cardexId).lean();
    if (!doc) {
      await logActivity({ req, action: 'CARDEX_DOWNLOAD_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Documento no encontrado', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Documento no encontrado');
    }

    if (doc.onedriveUrl) {
      bumpCounter(cardexId, 'downloads');
      const dl = toDownloadUrl(doc.onedriveUrl);
      await logActivity({ req, action: 'CARDEX_DOWNLOAD', entity: 'CARDEX', entityId: cardexId, statusCode: 302, success: true, message: 'Redirect descarga OneDrive', tags: ['cardex'] });
      return res.redirect(302, dl);
    }

    // Fallback legacy local
    if (!doc.fileName) {
      await logActivity({ req, action: 'CARDEX_DOWNLOAD_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Documento sin fuente disponible', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Documento sin fuente disponible');
    }

    const filePath = path.resolve(CARDEX_UPLOAD_DIR, doc.fileName);
    if (!fs.existsSync(filePath)) {
      await logActivity({ req, action: 'CARDEX_DOWNLOAD_FAIL', entity: 'CARDEX', entityId: cardexId, statusCode: 404, success: false, error: 'Archivo no encontrado en servidor (legacy)', tags: ['cardex'] });
      return handleErrorResponse(res, 404, 'Archivo no encontrado en servidor');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalName || doc.fileName)}"`);

    await logActivity({ req, action: 'CARDEX_DOWNLOAD', entity: 'CARDEX', entityId: cardexId, statusCode: 200, success: true, message: 'Descarga (local legacy)', tags: ['cardex'] });

    fs.createReadStream(filePath).pipe(res);
    bumpCounter(cardexId, 'downloads');
  } catch (err) {
    console.error('Error downloadCardexFile:', err);
    await logActivity({ req, action: 'CARDEX_DOWNLOAD_FAIL', entity: 'CARDEX', entityId: req.params.cardexId, statusCode: 500, success: false, error: err?.message, tags: ['cardex'] });
    return handleErrorResponse(res, 500, 'Error al descargar archivo', err?.message);
  }
};
