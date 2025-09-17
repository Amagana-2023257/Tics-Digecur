// src/Inventory/inventory.controller.js
import mongoose from 'mongoose';
import InventoryItem from './item.model.js';
import TransferRequest, { TRANSFER_STATUS } from './transferRequest.model.js';
import User from '../user/user.model.js';
import { handleErrorResponse } from '../helpers/handleResponse.js';
import { logActivity } from '../movements/movement.controller.js';

/* ============================= Helpers ============================= */
const toNumberOrUndef = (v) => {
  if (v === '' || v === null || typeof v === 'undefined') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const toObjectIdOrUndef = (v) => {
  if (!v) return undefined;
  return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : undefined;
};

const userLabelFromDoc = (u, fallbackId) =>
  (u?.nombre || u?.name || '') || (u?.email || '') || String(fallbackId || u?._id || '');

const fetchUserLabelById = async (oid) => {
  try {
    const u = await User.findById(oid).lean();
    return userLabelFromDoc(u, oid);
  } catch {
    return String(oid);
  }
};

const sanitizeItem = (it) => {
  if (!it) return null;
  return {
    id: it._id || it.id,
    noBien: it.noBien,
    nombreBien: it.nombreBien,
    descripcion: it.descripcion,
    responsable: it.responsable, // etiqueta legible
    responsableId: it.responsableId ? String(it.responsableId) : null, // ID de usuario
    observaciones: it.observaciones,
    numeroTarjeta: it.numeroTarjeta,
    monto: typeof it.monto === 'number' ? it.monto : toNumberOrUndef(it.monto),
    isActive: it.isActive,
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
  };
};

const userHasInventoryRole = (req) => {
  const roles = Array.isArray(req?.user?.roles) ? req.user.roles.map(String) : [];
  return roles.some((r) => ['ADMIN', 'DIRECTOR', 'INVENTARIO'].includes(r.toUpperCase()));
};

const escapeRx = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ============================= Filtros ============================= */
const buildFilter = (q = {}) => {
  const {
    q: text,
    responsable,
    responsableId,
    numeroTarjeta,
    isActive,
    montoMin,
    montoMax,
  } = q;

  const filter = {};
  const orClauses = [];

  if (text && String(text).trim()) {
    const rx = new RegExp(String(text).trim(), 'i');
    orClauses.push(
      { noBien: rx },
      { nombreBien: rx },
      { descripcion: rx },
      { responsable: rx },
      { numeroTarjeta: rx },
    );
  }

  let respRx = null;
  if (responsable && String(responsable).trim()) {
    respRx = new RegExp(String(responsable).trim(), 'i');
  }

  let respOid = null;
  if (responsableId && mongoose.Types.ObjectId.isValid(responsableId)) {
    respOid = new mongoose.Types.ObjectId(responsableId);
  }

  if (respRx && respOid) {
    orClauses.push({ responsableId: respOid }, { responsable: respRx });
  } else if (respOid) {
    filter.responsableId = respOid;
  } else if (respRx) {
    filter.responsable = respRx;
  }

  if (numeroTarjeta && String(numeroTarjeta).trim()) {
    filter.numeroTarjeta = new RegExp(String(numeroTarjeta).trim(), 'i');
  }

  if (typeof isActive !== 'undefined') {
    const v = typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : Boolean(isActive);
    filter.isActive = v;
  }

  const min = toNumberOrUndef(montoMin);
  const max = toNumberOrUndef(montoMax);
  if (typeof min === 'number' || typeof max === 'number') {
    filter.monto = {};
    if (typeof min === 'number') filter.monto.$gte = min;
    if (typeof max === 'number') filter.monto.$lte = max;
  }

  if (orClauses.length > 0) {
    filter.$or = (filter.$or || []).concat(orClauses);
  }

  return filter;
};

/* ============================= CRUD ============================= */
export const createItem = async (req, res) => {
  try {
    let {
      noBien,
      nombreBien,
      descripcion,
      responsable,      // nombre/etiqueta (opcional)
      responsableId,    // ID de usuario (opcional)
      observaciones,
      numeroTarjeta,
      monto,
      isActive,
    } = req.body;

    if (!noBien || !nombreBien) {
      await logActivity({
        req, action: 'INVENTORY_CREATE_FAIL', entity: 'INVENTORY_ITEM',
        statusCode: 400, success: false, error: 'noBien y nombreBien son obligatorios', tags: ['inventory']
      });
      return handleErrorResponse(res, 400, 'noBien y nombreBien son obligatorios');
    }

    noBien = String(noBien).trim().toUpperCase();
    nombreBien = String(nombreBien).trim();

    const oid = toObjectIdOrUndef(responsableId);
    // Si no vino etiqueta y SÍ vino ID, obtén etiqueta legible
    let responsableLabel = (typeof responsable === 'string' && responsable.trim()) ? responsable.trim() : undefined;
    if (!responsableLabel && oid) {
      responsableLabel = await fetchUserLabelById(oid);
    }

    const payload = {
      noBien,
      nombreBien,
      descripcion,
      responsable: responsableLabel,
      responsableId: oid,
      observaciones,
      numeroTarjeta,
      monto: toNumberOrUndef(monto),
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
    };

    const item = await InventoryItem.create(payload);

    await logActivity({
      req, action: 'INVENTORY_CREATE', entity: 'INVENTORY_ITEM', entityId: item._id,
      statusCode: 201, success: true, message: 'Bien creado exitosamente',
      after: sanitizeItem(item?.toJSON?.() || item), tags: ['inventory']
    });

    return res.status(201).json({
      success: true,
      message: 'Bien creado exitosamente',
      item: sanitizeItem(item),
    });
  } catch (err) {
    if (err?.code === 11000 && (err?.keyPattern?.noBien || err?.message?.includes('noBien'))) {
      await logActivity({
        req, action: 'INVENTORY_CREATE_FAIL', entity: 'INVENTORY_ITEM',
        statusCode: 409, success: false, error: `noBien duplicado`, tags: ['inventory']
      });
      return handleErrorResponse(res, 409, `El noBien ya existe (${err?.keyValue?.noBien ?? ''})`);
    }
    console.error('Error al crear bien:', err);
    await logActivity({
      req, action: 'INVENTORY_CREATE_FAIL', entity: 'INVENTORY_ITEM',
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al crear bien', err?.message);
  }
};

export const getAllItems = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = buildFilter(req.query);

    if (String(req.query.mine || '').toLowerCase() === '1' && req.user) {
      const myId = req.user?.id || req.user?._id;
      const myEmail = (req.user?.email || '').trim();
      const myName  = (req.user?.nombre || '').trim();

      const extraOr = [];
      if (myId && mongoose.Types.ObjectId.isValid(myId)) {
        extraOr.push({ responsableId: new mongoose.Types.ObjectId(myId) });
      }
      if (myEmail) extraOr.push({ responsable: new RegExp(escapeRx(myEmail), 'i') });
      if (myName)  extraOr.push({ responsable: new RegExp(escapeRx(myName),  'i') });

      if (extraOr.length) {
        filter.$or = (filter.$or || []).concat(extraOr);
      }
    }

    const sort = req.query.sort ? String(req.query.sort) : '-createdAt';

    const [total, docs] = await Promise.all([
      InventoryItem.countDocuments(filter),
      InventoryItem.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ]);

    await logActivity({
      req, action: 'INVENTORY_LIST', entity: 'INVENTORY_ITEM',
      statusCode: 200, success: true, message: `Listado OK (${docs.length})`, tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Bienes obtenidos exitosamente',
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      items: docs.map(sanitizeItem),
    });
  } catch (err) {
    console.error('Error al obtener bienes:', err);
    await logActivity({
      req, action: 'INVENTORY_LIST_FAIL', entity: 'INVENTORY_ITEM',
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al obtener bienes', err?.message);
  }
};

export const getItemById = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.itemId).lean();
    if (!item) {
      await logActivity({
        req, action: 'INVENTORY_GET_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    await logActivity({
      req, action: 'INVENTORY_GET', entity: 'INVENTORY_ITEM', entityId: item._id,
      statusCode: 200, success: true, message: 'Bien encontrado', tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Bien encontrado',
      item: sanitizeItem(item),
    });
  } catch (err) {
    console.error('Error al obtener bien:', err);
    await logActivity({
      req, action: 'INVENTORY_GET_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al obtener bien', err?.message);
  }
};

export const updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const update = { ...req.body };

    if ('noBien' in update) delete update.noBien;

    if ('monto' in update) {
      const n = toNumberOrUndef(update.monto);
      if (typeof n === 'number') update.monto = n;
      else delete update.monto;
    }

    // Si cambia responsableId, sincroniza etiqueta "responsable"
    if ('responsableId' in update) {
      const oid = toObjectIdOrUndef(update.responsableId);
      if (oid) {
        update.responsableId = oid;
        // Solo sobreescribe etiqueta si no la envían explícita
        if (!('responsable' in update) || !String(update.responsable || '').trim()) {
          update.responsable = await fetchUserLabelById(oid);
        } else if (typeof update.responsable === 'string') {
          update.responsable = update.responsable.trim();
          if (!update.responsable) {
            update.responsable = await fetchUserLabelById(oid);
          }
        }
      } else {
        // Si envían algo falsy, limpiamos el campo
        update.responsableId = undefined;
        if (!('responsable' in update)) {
          update.responsable = ''; // dejas etiqueta vacía si se quita el responsable
        }
      }
    }

    if ('responsable' in update && typeof update.responsable === 'string') {
      update.responsable = update.responsable.trim();
      if (!update.responsable) delete update.responsable;
    }

    const before = await InventoryItem.findById(itemId).lean();
    if (!before) {
      await logActivity({
        req, action: 'INVENTORY_UPDATE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    const item = await InventoryItem.findByIdAndUpdate(itemId, update, { new: true }).lean();

    await logActivity({
      req, action: 'INVENTORY_UPDATE', entity: 'INVENTORY_ITEM', entityId: itemId,
      statusCode: 200, success: true, message: 'Bien actualizado',
      before: sanitizeItem(before), after: sanitizeItem(item), tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Bien actualizado',
      item: sanitizeItem(item),
    });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.noBien) {
      await logActivity({
        req, action: 'INVENTORY_UPDATE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
        statusCode: 409, success: false, error: 'noBien duplicado', tags: ['inventory']
      });
      return handleErrorResponse(res, 409, 'El noBien ya existe');
    }
    console.error('Error al actualizar bien:', err);
    await logActivity({
      req, action: 'INVENTORY_UPDATE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al actualizar bien', err?.message);
  }
};

export const setActive = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      await logActivity({
        req, action: 'INVENTORY_SET_ACTIVE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 400, success: false, error: 'isActive debe ser boolean', tags: ['inventory']
      });
      return handleErrorResponse(res, 400, 'isActive debe ser boolean');
    }

    const r = await InventoryItem.findByIdAndUpdate(itemId, { isActive }, { new: true }).lean();
    if (!r) {
      await logActivity({
        req, action: 'INVENTORY_SET_ACTIVE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    await logActivity({
      req, action: 'INVENTORY_SET_ACTIVE', entity: 'INVENTORY_ITEM', entityId: itemId,
      statusCode: 200, success: true, message: `Bien ${isActive ? 'activado' : 'desactivado'}`,
      after: sanitizeItem(r), tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: `Bien ${isActive ? 'activado' : 'desactivado'}`,
      item: sanitizeItem(r),
    });
  } catch (err) {
    console.error('Error en setActive:', err);
    await logActivity({
      req, action: 'INVENTORY_SET_ACTIVE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al actualizar bien', err?.message);
  }
};

export const deleteItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const before = await InventoryItem.findById(itemId).lean();
    if (!before) {
      await logActivity({
        req, action: 'INVENTORY_DELETE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    const r = await InventoryItem.findByIdAndDelete(itemId);
    if (!r) {
      await logActivity({
        req, action: 'INVENTORY_DELETE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    await logActivity({
      req, action: 'INVENTORY_DELETE', entity: 'INVENTORY_ITEM', entityId: itemId,
      statusCode: 200, success: true, message: 'Bien eliminado exitosamente',
      before: sanitizeItem(before), tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Bien eliminado exitosamente',
    });
  } catch (err) {
    console.error('Error al eliminar bien:', err);
    await logActivity({
      req, action: 'INVENTORY_DELETE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al eliminar bien', err?.message);
  }
};

/* ====================== Transferencias (Solicitudes) ====================== */
export const createTransferRequest = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { toUser, motivo } = req.body;

    if (!toUser) {
      await logActivity({
        req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST', entityId: null,
        statusCode: 400, success: false, error: 'toUser es obligatorio', tags: ['inventory']
      });
      return handleErrorResponse(res, 400, 'toUser es obligatorio');
    }

    const item = await InventoryItem.findById(itemId).lean();
    if (!item) {
      await logActivity({
        req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST', entityId: null,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    const fromUser = req.user?.id || req.user?._id;
    if (!fromUser) {
      await logActivity({
        req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST', entityId: null,
        statusCode: 401, success: false, error: 'No autenticado', tags: ['inventory']
      });
      return handleErrorResponse(res, 401, 'No autenticado');
    }

    const tr = await TransferRequest.create({
      item: itemId,
      fromUser,
      toUser,
      motivo,
      status: TRANSFER_STATUS.PENDING,
    });

    const created = await TransferRequest.findById(tr._id)
      .populate('item', 'noBien nombreBien responsable responsableId')
      .populate('fromUser', 'email nombre')
      .populate('toUser', 'email nombre')
      .lean();

    await logActivity({
      req, action: 'INVENTORY_TR_CREATE', entity: 'TRANSFER_REQUEST', entityId: tr._id,
      statusCode: 201, success: true, message: 'Solicitud de traslado creada',
      after: created, tags: ['inventory']
    });

    return res.status(201).json({
      success: true,
      message: 'Solicitud de traslado creada',
      request: created,
    });
  } catch (err) {
    console.error('Error al crear solicitud de traslado:', err);
    await logActivity({
      req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST',
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al crear solicitud', err?.message);
  }
};

export const getTransferRequests = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    const isInv = userHasInventoryRole(req);

    const { status, item } = req.query;
    if (status) filter.status = String(status);
    if (item) filter.item = String(item);

    if (!isInv) {
      const uid = req.user?.id || req.user?._id?.toString?.();
      filter.$or = [{ fromUser: uid }, { toUser: uid }];
    }

    const [total, docs] = await Promise.all([
      TransferRequest.countDocuments(filter),
      TransferRequest.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('item', 'noBien nombreBien responsable responsableId')
        .populate('fromUser', 'email nombre')
        .populate('toUser', 'email nombre')
        .populate('decidedBy', 'email nombre')
        .lean(),
    ]);

    await logActivity({
      req, action: 'INVENTORY_TR_LIST', entity: 'TRANSFER_REQUEST',
      statusCode: 200, success: true, message: `Solicitudes obtenidas (${docs.length})`, tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Solicitudes obtenidas',
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      requests: docs,
    });
  } catch (err) {
    console.error('Error al obtener solicitudes:', err);
    await logActivity({
      req, action: 'INVENTORY_TR_LIST_FAIL', entity: 'TRANSFER_REQUEST',
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al obtener solicitudes', err?.message);
  }
};

export const approveTransferRequest = async (req, res) => {
  try {
    if (!userHasInventoryRole(req)) {
      await logActivity({
        req, action: 'INVENTORY_TR_APPROVE_FAIL', entity: 'TRANSFER_REQUEST', entityId: req.params.requestId,
        statusCode: 403, success: false, error: 'No autorizado', tags: ['inventory']
      });
      return handleErrorResponse(res, 403, 'No autorizado para aprobar solicitudes');
    }

    const approverId = req.user?.id || req.user?._id;
    const { requestId } = req.params;

    const tr = await TransferRequest.findById(requestId);
    if (!tr) {
      await logActivity({
        req, action: 'INVENTORY_TR_APPROVE_FAIL', entity: 'TRANSFER_REQUEST', entityId: requestId,
        statusCode: 404, success: false, error: 'Solicitud no encontrada', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Solicitud no encontrada');
    }

    if (tr.status !== TRANSFER_STATUS.PENDING) {
      const populated = await TransferRequest.findById(tr._id)
        .populate('item', 'noBien nombreBien descripcion numeroTarjeta monto responsable responsableId')
        .populate('fromUser', 'email nombre')
        .populate('toUser', 'email nombre')
        .populate('decidedBy', 'email nombre')
        .lean();

      await logActivity({
        req, action: 'INVENTORY_TR_APPROVE', entity: 'TRANSFER_REQUEST', entityId: tr._id,
        statusCode: 200, success: true, message: 'Solicitud ya resuelta', after: populated, tags: ['inventory']
      });

      return res.status(200).json({
        success: true,
        message: 'La solicitud ya fue resuelta',
        request: populated,
        alreadyResolved: true,
      });
    }

    const item = await InventoryItem.findById(tr.item);
    if (!item) {
      await logActivity({
        req, action: 'INVENTORY_TR_APPROVE_FAIL', entity: 'TRANSFER_REQUEST', entityId: tr._id,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    const to = await User.findById(tr.toUser).lean();
    if (!to) {
      await logActivity({
        req, action: 'INVENTORY_TR_APPROVE_FAIL', entity: 'TRANSFER_REQUEST', entityId: tr._id,
        statusCode: 404, success: false, error: 'Usuario destino no encontrado', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Usuario destino no encontrado');
    }

    const beforeItem = item.toObject();
    item.responsableId = to._id;
    item.responsable = userLabelFromDoc(to, to._id);
    await item.save();

    tr.status = TRANSFER_STATUS.APPROVED;
    tr.decidedBy = approverId;
    tr.decidedAt = new Date();
    await tr.save();

    const populated = await TransferRequest.findById(tr._id)
      .populate('item', 'noBien nombreBien descripcion numeroTarjeta monto responsable responsableId')
      .populate('fromUser', 'email nombre')
      .populate('toUser', 'email nombre')
      .populate('decidedBy', 'email nombre')
      .lean();

    await logActivity({
      req, action: 'INVENTORY_TR_APPROVE', entity: 'TRANSFER_REQUEST', entityId: tr._id,
      statusCode: 200, success: true, message: 'Solicitud aprobada y responsable actualizado',
      before: { item: sanitizeItem(beforeItem) }, after: { item: sanitizeItem(item) },
      tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Solicitud aprobada y responsable actualizado',
      request: populated,
      alreadyResolved: false,
    });
  } catch (err) {
    console.error('Error al aprobar solicitud:', err);
    await logActivity({
      req, action: 'INVENTORY_TR_APPROVE_FAIL', entity: 'TRANSFER_REQUEST', entityId: req.params.requestId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al aprobar solicitud', err?.message);
  }
};

export const rejectTransferRequest = async (req, res) => {
  try {
    if (!userHasInventoryRole(req)) {
      await logActivity({
        req, action: 'INVENTORY_TR_REJECT_FAIL', entity: 'TRANSFER_REQUEST', entityId: req.params.requestId,
        statusCode: 403, success: false, error: 'No autorizado', tags: ['inventory']
      });
      return handleErrorResponse(res, 403, 'No autorizado para rechazar solicitudes');
    }

    const approverId = req.user?.id || req.user?._id;
    const { requestId } = req.params;
    const { reason } = req.body;

    const tr = await TransferRequest.findById(requestId);
    if (!tr) {
      await logActivity({
        req, action: 'INVENTORY_TR_REJECT_FAIL', entity: 'TRANSFER_REQUEST', entityId: requestId,
        statusCode: 404, success: false, error: 'Solicitud no encontrada', tags: ['inventory']
      });
      return handleErrorResponse(res, 404, 'Solicitud no encontrada');
    }

    if (tr.status !== TRANSFER_STATUS.PENDING) {
      const populated = await TransferRequest.findById(tr._id)
        .populate('item', 'noBien nombreBien responsable responsableId')
        .populate('fromUser', 'email nombre')
        .populate('toUser', 'email nombre')
        .populate('decidedBy', 'email nombre')
        .lean();

      await logActivity({
        req, action: 'INVENTORY_TR_REJECT', entity: 'TRANSFER_REQUEST', entityId: tr._id,
        statusCode: 200, success: true, message: 'Solicitud ya resuelta', after: populated, tags: ['inventory']
      });

      return res.status(200).json({
        success: true,
        message: 'La solicitud ya fue resuelta',
        request: populated,
        alreadyResolved: true,
      });
    }

    tr.status = TRANSFER_STATUS.REJECTED;
    tr.rejectionReason = reason || '';
    tr.decidedBy = approverId;
    tr.decidedAt = new Date();
    await tr.save();

    const populated = await TransferRequest.findById(tr._id)
      .populate('item', 'noBien nombreBien responsable responsableId')
      .populate('fromUser', 'email nombre')
      .populate('toUser', 'email nombre')
      .populate('decidedBy', 'email nombre')
      .lean();

    await logActivity({
      req, action: 'INVENTORY_TR_REJECT', entity: 'TRANSFER_REQUEST', entityId: tr._id,
      statusCode: 200, success: true, message: 'Solicitud rechazada',
      after: populated, tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Solicitud rechazada',
      request: populated,
      alreadyResolved: false,
    });
  } catch (err) {
    console.error('Error al rechazar solicitud:', err);
    await logActivity({
      req, action: 'INVENTORY_TR_REJECT_FAIL', entity: 'TRANSFER_REQUEST', entityId: req.params.requestId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory']
    });
    return handleErrorResponse(res, 500, 'Error al rechazar solicitud', err?.message);
  }
};
