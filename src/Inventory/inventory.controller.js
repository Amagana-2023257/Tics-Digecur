// src/Inventory/inventory.controller.js
import mongoose from 'mongoose';
import InventoryItem from './item.model.js';
import TransferRequest, { TRANSFER_STATUS } from './transferRequest.model.js';
import TransferPendingCode from './transferPendingCode.model.js';
import User from '../user/user.model.js';
import { handleErrorResponse } from '../helpers/handleResponse.js';
import { logActivity } from '../movements/movement.controller.js';
import { sendMail } from '../helpers/mailer.js';
import crypto from 'crypto';

/* ============================= Helpers genéricos ============================= */
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
const userHasInventoryRole = (req) => {
  const roles = Array.isArray(req?.user?.roles) ? req.user.roles.map(String) : [];
  return roles.some((r) => ['ADMIN', 'DIRECTOR', 'INVENTARIO'].includes(r.toUpperCase()));
};
const escapeRx = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeItem = (it) => {
  if (!it) return null;
  return {
    id: it._id || it.id,
    noBien: it.noBien,
    nombreBien: it.nombreBien,
    descripcion: it.descripcion,
    responsable: it.responsable,
    responsableId: it.responsableId ? String(it.responsableId) : null,
    observaciones: it.observaciones,
    numeroTarjeta: it.numeroTarjeta,
    monto: typeof it.monto === 'number' ? it.monto : toNumberOrUndef(it.monto),
    isActive: it.isActive,
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
  };
};

/* ============================= Helpers de traslado ============================= */
const INVITE_TTL_MS = 15 * 60 * 1000; // 15 min
const genCode = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
const nowPlus = (ms) => new Date(Date.now() + ms);

/* ============================= Filtros (listados) ============================= */
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

/* ============================================================================ */
/*                                CRUD de bienes                               */
/* ============================================================================ */
export const createItem = async (req, res) => {
  try {
    let {
      noBien, nombreBien, descripcion,
      responsable, responsableId, observaciones,
      numeroTarjeta, monto, isActive,
    } = req.body;

    if (!noBien || !nombreBien) {
      await logActivity({ req, action: 'INVENTORY_CREATE_FAIL', entity: 'INVENTORY_ITEM',
        statusCode: 400, success: false, error: 'noBien y nombreBien son obligatorios', tags: ['inventory'] });
      return handleErrorResponse(res, 400, 'noBien y nombreBien son obligatorios');
    }

    noBien = String(noBien).trim().toUpperCase();
    nombreBien = String(nombreBien).trim();

    const oid = toObjectIdOrUndef(responsableId);
    let responsableLabel = (typeof responsable === 'string' && responsable.trim()) ? responsable.trim() : undefined;
    if (!responsableLabel && oid) responsableLabel = await fetchUserLabelById(oid);

    const payload = {
      noBien, nombreBien, descripcion,
      responsable: responsableLabel,
      responsableId: oid,
      observaciones, numeroTarjeta,
      monto: toNumberOrUndef(monto),
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
    };

    const item = await InventoryItem.create(payload);

    await logActivity({
      req, action: 'INVENTORY_CREATE', entity: 'INVENTORY_ITEM', entityId: item._id,
      statusCode: 201, success: true, message: 'Bien creado exitosamente',
      after: sanitizeItem(item?.toJSON?.() || item), tags: ['inventory']
    });

    return res.status(201).json({ success: true, message: 'Bien creado exitosamente', item: sanitizeItem(item) });
  } catch (err) {
    if (err?.code === 11000 && (err?.keyPattern?.noBien || err?.message?.includes('noBien'))) {
      await logActivity({ req, action: 'INVENTORY_CREATE_FAIL', entity: 'INVENTORY_ITEM',
        statusCode: 409, success: false, error: 'noBien duplicado', tags: ['inventory'] });
      return handleErrorResponse(res, 409, `El noBien ya existe (${err?.keyValue?.noBien ?? ''})`);
    }
    console.error('Error al crear bien:', err);
    await logActivity({ req, action: 'INVENTORY_CREATE_FAIL', entity: 'INVENTORY_ITEM',
      statusCode: 500, success: false, error: err?.message, tags: ['inventory'] });
    return handleErrorResponse(res, 500, 'Error al crear bien', err?.message);
  }
};

export const getAllItems = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache'); res.set('Expires', '0'); res.set('Surrogate-Control', 'no-store');

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

      if (extraOr.length) filter.$or = (filter.$or || []).concat(extraOr);
    }

    const sort = req.query.sort ? String(req.query.sort) : '-createdAt';

    const [total, docs] = await Promise.all([
      InventoryItem.countDocuments(filter),
      InventoryItem.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ]);

    await logActivity({ req, action: 'INVENTORY_LIST', entity: 'INVENTORY_ITEM',
      statusCode: 200, success: true, message: `Listado OK (${docs.length})`, tags: ['inventory'] });

    return res.status(200).json({
      success: true, message: 'Bienes obtenidos exitosamente',
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      items: docs.map(sanitizeItem),
    });
  } catch (err) {
    console.error('Error al obtener bienes:', err);
    await logActivity({ req, action: 'INVENTORY_LIST_FAIL', entity: 'INVENTORY_ITEM',
      statusCode: 500, success: false, error: err?.message, tags: ['inventory'] });
    return handleErrorResponse(res, 500, 'Error al obtener bienes', err?.message);
  }
};

export const getItemById = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.itemId).lean();
    if (!item) {
      await logActivity({ req, action: 'INVENTORY_GET_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory'] });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    await logActivity({ req, action: 'INVENTORY_GET', entity: 'INVENTORY_ITEM', entityId: item._id,
      statusCode: 200, success: true, message: 'Bien encontrado', tags: ['inventory'] });

    return res.status(200).json({ success: true, message: 'Bien encontrado', item: sanitizeItem(item) });
  } catch (err) {
    console.error('Error al obtener bien:', err);
    await logActivity({ req, action: 'INVENTORY_GET_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory'] });
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
      if (typeof n === 'number') update.monto = n; else delete update.monto;
    }

    if ('responsableId' in update) {
      const oid = toObjectIdOrUndef(update.responsableId);
      if (oid) {
        update.responsableId = oid;
        if (!('responsable' in update) || !String(update.responsable || '').trim()) {
          update.responsable = await fetchUserLabelById(oid);
        } else if (typeof update.responsable === 'string') {
          update.responsable = update.responsable.trim();
          if (!update.responsable) update.responsable = await fetchUserLabelById(oid);
        }
      } else {
        update.responsableId = undefined;
        if (!('responsable' in update)) update.responsable = '';
      }
    }

    if ('responsable' in update && typeof update.responsable === 'string') {
      update.responsable = update.responsable.trim();
      if (!update.responsable) delete update.responsable;
    }

    const before = await InventoryItem.findById(itemId).lean();
    if (!before) {
      await logActivity({ req, action: 'INVENTORY_UPDATE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory'] });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    const item = await InventoryItem.findByIdAndUpdate(itemId, update, { new: true }).lean();

    await logActivity({
      req, action: 'INVENTORY_UPDATE', entity: 'INVENTORY_ITEM', entityId: itemId,
      statusCode: 200, success: true, message: 'Bien actualizado',
      before: sanitizeItem(before), after: sanitizeItem(item), tags: ['inventory']
    });

    return res.status(200).json({ success: true, message: 'Bien actualizado', item: sanitizeItem(item) });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.noBien) {
      await logActivity({ req, action: 'INVENTORY_UPDATE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
        statusCode: 409, success: false, error: 'noBien duplicado', tags: ['inventory'] });
      return handleErrorResponse(res, 409, 'El noBien ya existe');
    }
    console.error('Error al actualizar bien:', err);
    await logActivity({ req, action: 'INVENTORY_UPDATE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory'] });
    return handleErrorResponse(res, 500, 'Error al actualizar bien', err?.message);
  }
};

export const setActive = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      await logActivity({ req, action: 'INVENTORY_SET_ACTIVE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 400, success: false, error: 'isActive debe ser boolean', tags: ['inventory'] });
      return handleErrorResponse(res, 400, 'isActive debe ser boolean');
    }

    const r = await InventoryItem.findByIdAndUpdate(itemId, { isActive }, { new: true }).lean();
    if (!r) {
      await logActivity({ req, action: 'INVENTORY_SET_ACTIVE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory'] });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    await logActivity({
      req, action: 'INVENTORY_SET_ACTIVE', entity: 'INVENTORY_ITEM', entityId: itemId,
      statusCode: 200, success: true, message: `Bien ${isActive ? 'activado' : 'desactivado'}`,
      after: sanitizeItem(r), tags: ['inventory']
    });

    return res.status(200).json({ success: true, message: `Bien ${isActive ? 'activado' : 'desactivado'}`, item: sanitizeItem(r) });
  } catch (err) {
    console.error('Error en setActive:', err);
    await logActivity({ req, action: 'INVENTORY_SET_ACTIVE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory'] });
    return handleErrorResponse(res, 500, 'Error al actualizar bien', err?.message);
  }
};

export const deleteItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const before = await InventoryItem.findById(itemId).lean();
    if (!before) {
      await logActivity({ req, action: 'INVENTORY_DELETE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory'] });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    const r = await InventoryItem.findByIdAndDelete(itemId);
    if (!r) {
      await logActivity({ req, action: 'INVENTORY_DELETE_FAIL', entity: 'INVENTORY_ITEM', entityId: itemId,
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory'] });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    await logActivity({
      req, action: 'INVENTORY_DELETE', entity: 'INVENTORY_ITEM', entityId: itemId,
      statusCode: 200, success: true, message: 'Bien eliminado exitosamente',
      before: sanitizeItem(before), tags: ['inventory']
    });

    return res.status(200).json({ success: true, message: 'Bien eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar bien:', err);
    await logActivity({ req, action: 'INVENTORY_DELETE_FAIL', entity: 'INVENTORY_ITEM', entityId: req.params.itemId,
      statusCode: 500, success: false, error: err?.message, tags: ['inventory'] });
    return handleErrorResponse(res, 500, 'Error al eliminar bien', err?.message);
  }
};

/* ============================================================================ */
/*     TRANSFER — Crear invitación (correo) y Confirmación con código          */
/* ============================================================================ */
export const createOrConfirmTransferRequest = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { toUser, motivo, inviteCode } = req.body;

    if (!toUser) {
      await logActivity({ req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST',
        statusCode: 400, success: false, error: 'toUser es obligatorio', tags: ['inventory'] });
      return handleErrorResponse(res, 400, 'toUser es obligatorio');
    }

    const item = await InventoryItem.findById(itemId).lean();
    if (!item) {
      await logActivity({ req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST',
        statusCode: 404, success: false, error: 'Bien no encontrado', tags: ['inventory'] });
      return handleErrorResponse(res, 404, 'Bien no encontrado');
    }

    const fromUser = req.user?.id || req.user?._id;
    if (!fromUser) {
      await logActivity({ req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST',
        statusCode: 401, success: false, error: 'No autenticado', tags: ['inventory'] });
      return handleErrorResponse(res, 401, 'No autenticado');
    }

    // Fase 1: Crear invitación y enviar código (sin pedirlo en front)
    if (!String(inviteCode || '').trim()) {
      // Cierra pendientes abiertos previos del mismo par item/toUser
      await TransferPendingCode.updateMany(
        { itemId, toUserId: toUser, resolvedAt: { $exists: false } },
        { $set: { resolvedAt: new Date() } }
      );

      const code = genCode();
      const expiresAt = nowPlus(INVITE_TTL_MS);
      const invite = await TransferPendingCode.create({
        itemId,
        fromUserId: fromUser,
        toUserId: toUser,
        motivo: motivo || '',
        codePlain: code,
        codeHash: crypto.createHash('sha256').update(code).digest('hex'),
        expiresAt,
        sentEmail: false,
      });

      // Enviar correo
      let sent = false;
      try {
        const toUserDoc = await User.findById(toUser).lean();
        if (!toUserDoc?.email) throw new Error('Usuario destino sin email');
        await sendMail({
          to: toUserDoc.email,
          subject: `Código de confirmación para traslado de bien: ${item?.noBien || ''}`,
          text:
`Hola ${toUserDoc?.nombre || ''},

Has sido propuesto como nuevo responsable del bien "${item?.nombreBien || item?.noBien}".
Código de confirmación: ${code}
Este código vence el ${expiresAt.toLocaleString('es-GT')}.

Motivo: ${motivo || '—'}

Atentamente,
Sistema de Inventario`,
        });
        sent = true;
      } catch (mailErr) {
        console.error('Error enviando correo de invitación:', mailErr);
      }

      if (sent) {
        await TransferPendingCode.findByIdAndUpdate(invite._id, { $set: { sentEmail: true } });
      }

      await logActivity({
        req, action: 'INVENTORY_TR_INVITE', entity: 'TRANSFER_PENDING_CODE', entityId: invite._id,
        statusCode: 201, success: true, message: 'Invitación generada',
        after: { id: invite._id, itemId, toUser, expiresAt, sentEmail: sent }, tags: ['inventory']
      });

      return res.status(201).json({
        success: true,
        message: 'Invitación generada y correo enviado (si fue posible)',
        invite: {
          id: invite._id,
          itemId,
          toUser,
          expiresAt,
          sentEmail: sent,
          devCode: process.env.NODE_ENV !== 'production' ? code : undefined,
        },
      });
    }

    // Fase 2: Confirmación con código (se usa desde el flujo del destinatario)
    const codeStr = String(inviteCode).trim();
    const codeHash = crypto.createHash('sha256').update(codeStr).digest('hex');

    const pending = await TransferPendingCode.findOne({
      itemId,
      toUserId: toUser,
      $or: [
        { codeHash },
        { codePlain: codeStr },
      ],
      resolvedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (!pending) {
      await logActivity({ req, action: 'INVENTORY_TR_CONFIRM_FAIL', entity: 'TRANSFER_REQUEST',
        statusCode: 400, success: false, error: 'Código inválido o expirado', tags: ['inventory'] });
      return handleErrorResponse(res, 400, 'Código inválido o expirado');
    }

    const tr = await TransferRequest.create({
      item: itemId,
      fromUser,
      toUser,
      motivo,
      status: TRANSFER_STATUS.PENDING,
    });
    await TransferPendingCode.findByIdAndUpdate(pending._id, { $set: { resolvedAt: new Date(), inviteId: tr._id } });

    const created = await TransferRequest.findById(tr._id)
      .populate('item', 'noBien nombreBien responsable responsableId descripcion numeroTarjeta monto')
      .populate('fromUser', 'email nombre')
      .populate('toUser', 'email nombre')
      .lean();

    await logActivity({
      req, action: 'INVENTORY_TR_CONFIRM', entity: 'TRANSFER_REQUEST', entityId: tr._id,
      statusCode: 201, success: true, message: 'Solicitud creada tras confirmación de código',
      after: created, tags: ['inventory']
    });

    return res.status(201).json({ success: true, message: 'Solicitud creada', request: created });
  } catch (err) {
    console.error('Error en createOrConfirmTransferRequest:', err);
    await logActivity({ req, action: 'INVENTORY_TR_CREATE_FAIL', entity: 'TRANSFER_REQUEST',
      statusCode: 500, success: false, error: err?.message, tags: ['inventory'] });
    return handleErrorResponse(res, 500, 'Error al procesar la solicitud', err?.message);
  }
};

/* ============================================================================ */
/*               TRANSFER — Listados / Detalle / Aprobación / Rechazo          */
/* ============================================================================ */
export const getTransferRequestsList = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    const isInv = userHasInventoryRole(req);
    const { status, item } = req.query;
    if (status) filter.status = String(status).toUpperCase();
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
        .populate('item', 'noBien nombreBien responsable responsableId descripcion numeroTarjeta monto')
        .populate('fromUser', 'email nombre')
        .populate('toUser', 'email nombre')
        .populate('decidedBy', 'email nombre')
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Solicitudes obtenidas',
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      requests: docs,
    });
  } catch (err) {
    console.error('Error en getTransferRequestsList:', err);
    return handleErrorResponse(res, 500, 'Error al obtener solicitudes', err?.message);
  }
};

export const getTransferRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;
    const tr = await TransferRequest.findById(requestId).lean();
    if (!tr) return handleErrorResponse(res, 404, 'Solicitud no encontrada');
    return res.status(200).json({ success: true, request: tr });
  } catch (err) {
    console.error('Error en getTransferRequestById:', err);
    return handleErrorResponse(res, 500, 'Error al obtener solicitud', err?.message);
  }
};

export const getTransferRequestDetail = async (req, res) => {
  try {
    const { requestId } = req.params;
    const tr = await TransferRequest.findById(requestId)
      .populate('item', 'noBien nombreBien responsable responsableId descripcion numeroTarjeta monto')
      .populate('fromUser', 'email nombre')
      .populate('toUser', 'email nombre')
      .populate('decidedBy', 'email nombre')
      .lean();
    if (!tr) return handleErrorResponse(res, 404, 'Solicitud no encontrada');
    return res.status(200).json({ success: true, request: tr });
  } catch (err) {
    console.error('Error en getTransferRequestDetail:', err);
    return handleErrorResponse(res, 500, 'Error al obtener detalle', err?.message);
  }
};

/* === SOLO URL (sin file/base64) === */
export const uploadTransferSignedDoc = async (req, res) => {
  try {
    const { requestId } = req.params;

    const tr = await TransferRequest.findById(requestId);
    if (!tr) return handleErrorResponse(res, 404, 'Solicitud no encontrada');

    const url = String(req.body?.url || '').trim();
    if (!url) return handleErrorResponse(res, 400, 'Debes proporcionar url');

    tr.signedDocUrl = url;
    await tr.save();

    return res.status(200).json({ success: true, message: 'Documento guardado', data: { url } });
  } catch (err) {
    console.error('Error en uploadTransferSignedDoc:', err);
    return handleErrorResponse(res, 500, 'Error al guardar documento', err?.message);
  }
};

export const approveTransferRequest = async (req, res) => {
  try {
    if (!userHasInventoryRole(req)) {
      return handleErrorResponse(res, 403, 'No autorizado para aprobar solicitudes');
    }
    const approverId = req.user?.id || req.user?._id;
    const { requestId } = req.params;

    const tr = await TransferRequest.findById(requestId)
      .populate('item')
      .populate('toUser')
      .lean();
    if (!tr) return handleErrorResponse(res, 404, 'Solicitud no encontrada');

    if (tr.status !== TRANSFER_STATUS.PENDING) {
      const populated = await TransferRequest.findById(requestId)
        .populate('item', 'noBien nombreBien descripcion numeroTarjeta monto responsable responsableId')
        .populate('fromUser', 'email nombre')
        .populate('toUser', 'email nombre')
        .populate('decidedBy', 'email nombre')
        .lean();
      return res.status(200).json({ success: true, message: 'La solicitud ya fue resuelta', request: populated, alreadyResolved: true });
    }

    // Exigir documento firmado (URL)
    const trDoc = await TransferRequest.findById(requestId).lean();
    if (!trDoc?.signedDocUrl) {
      return handleErrorResponse(res, 400, 'Debe adjuntar la URL del documento firmado antes de aprobar');
    }

    const item = await InventoryItem.findById(tr.item._id);
    if (!item) return handleErrorResponse(res, 404, 'Bien no encontrado');

    const to = await User.findById(tr.toUser._id).lean();
    if (!to) return handleErrorResponse(res, 404, 'Usuario destino no encontrado');

    const beforeItem = item.toObject();
    item.responsableId = to._id;
    item.responsable = userLabelFromDoc(to, to._id);
    await item.save();

    await TransferRequest.findByIdAndUpdate(requestId, {
      $set: { status: TRANSFER_STATUS.APPROVED, decidedBy: approverId, decidedAt: new Date() }
    });

    const populated = await TransferRequest.findById(requestId)
      .populate('item', 'noBien nombreBien descripcion numeroTarjeta monto responsable responsableId')
      .populate('fromUser', 'email nombre')
      .populate('toUser', 'email nombre')
      .populate('decidedBy', 'email nombre')
      .lean();

    await logActivity({
      req, action: 'INVENTORY_TR_APPROVE', entity: 'TRANSFER_REQUEST', entityId: requestId,
      statusCode: 200, success: true, message: 'Solicitud aprobada y responsable actualizado',
      before: { item: sanitizeItem(beforeItem) }, after: { item: sanitizeItem(item) }, tags: ['inventory']
    });

    return res.status(200).json({
      success: true,
      message: 'Solicitud aprobada y responsable actualizado',
      request: populated,
      alreadyResolved: false,
    });
  } catch (err) {
    console.error('Error al aprobar solicitud:', err);
    return handleErrorResponse(res, 500, 'Error al aprobar solicitud', err?.message);
  }
};

export const rejectTransferRequest = async (req, res) => {
  try {
    if (!userHasInventoryRole(req)) {
      return handleErrorResponse(res, 403, 'No autorizado para rechazar solicitudes');
    }
    const approverId = req.user?.id || req.user?._id;
    const { requestId } = req.params;
    const { reason } = req.body;

    const tr = await TransferRequest.findById(requestId);
    if (!tr) return handleErrorResponse(res, 404, 'Solicitud no encontrada');

    if (tr.status !== TRANSFER_STATUS.PENDING) {
      const populated = await TransferRequest.findById(tr._id)
        .populate('item', 'noBien nombreBien responsable responsableId')
        .populate('fromUser', 'email nombre')
        .populate('toUser', 'email nombre')
        .populate('decidedBy', 'email nombre')
        .lean();
      return res.status(200).json({ success: true, message: 'La solicitud ya fue resuelta', request: populated, alreadyResolved: true });
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

    return res.status(200).json({ success: true, message: 'Solicitud rechazada', request: populated, alreadyResolved: false });
  } catch (err) {
    console.error('Error al rechazar solicitud:', err);
    return handleErrorResponse(res, 500, 'Error al rechazar solicitud', err?.message);
  }
};

/* ============================================================================ */
/*                      PENDING CODES — CRUD para listado                       */
/* ============================================================================ */
export const listTransferPendingCodes = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const { status } = req.query; // ALL | OPEN | CLOSED
    const filter = {};
    if (status === 'OPEN') filter.resolvedAt = { $exists: false };
    if (status === 'CLOSED') filter.resolvedAt = { $exists: true };

    const [total, docs] = await Promise.all([
      TransferPendingCode.countDocuments(filter),
      TransferPendingCode.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    ]);

    return res.status(200).json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      items: docs.map((r) => ({
        id: r._id,
        inviteId: r.inviteId || null,
        itemId: r.itemId,
        fromUserId: r.fromUserId,
        toUserId: r.toUserId,
        motivo: r.motivo,
        codePlain: r.codePlain, // si no quieres exponerlo, quítalo
        expiresAt: r.expiresAt,
        sentEmail: r.sentEmail,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        resolvedAt: r.resolvedAt,
      })),
    });
  } catch (err) {
    console.error('Error listTransferPendingCodes:', err);
    return handleErrorResponse(res, 500, 'Error al listar pendientes', err?.message);
  }
};

export const getTransferPendingCodeById = async (req, res) => {
  try {
    const { pendingId } = req.params;
    const r = await TransferPendingCode.findById(pendingId).lean();
    if (!r) return handleErrorResponse(res, 404, 'Pendiente no encontrado');
    return res.status(200).json({
      success: true,
      item: {
        id: r._id,
        inviteId: r.inviteId || null,
        itemId: r.itemId,
        fromUserId: r.fromUserId,
        toUserId: r.toUserId,
        motivo: r.motivo,
        codePlain: r.codePlain,
        expiresAt: r.expiresAt,
        sentEmail: r.sentEmail,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        resolvedAt: r.resolvedAt,
      }
    });
  } catch (err) {
    console.error('Error getTransferPendingCodeById:', err);
    return handleErrorResponse(res, 500, 'Error al obtener pendiente', err?.message);
  }
};

export const updateTransferPendingCode = async (req, res) => {
  try {
    const { pendingId } = req.params;
    const update = {};
    if (typeof req.body?.codePlain === 'string') {
      update.codePlain = req.body.codePlain.trim();
      update.codeHash = crypto.createHash('sha256').update(update.codePlain).digest('hex');
    }
    if (req.body?.expiresAt) update.expiresAt = new Date(req.body.expiresAt);
    if (typeof req.body?.sentEmail === 'boolean') update.sentEmail = req.body.sentEmail;
    if (req.body?.resolvedAt === null) update.resolvedAt = undefined;
    if (req.body?.resolvedAt) update.resolvedAt = new Date(req.body.resolvedAt);

    const r = await TransferPendingCode.findByIdAndUpdate(pendingId, { $set: update }, { new: true }).lean();
    if (!r) return handleErrorResponse(res, 404, 'Pendiente no encontrado');

    return res.status(200).json({ success: true, item: r });
  } catch (err) {
    console.error('Error updateTransferPendingCode:', err);
    return handleErrorResponse(res, 500, 'Error al actualizar pendiente', err?.message);
  }
};

export const deleteTransferPendingCode = async (req, res) => {
  try {
    const { pendingId } = req.params;
    const r = await TransferPendingCode.findByIdAndDelete(pendingId).lean();
    if (!r) return handleErrorResponse(res, 404, 'Pendiente no encontrado');
    return res.status(200).json({ success: true, message: 'Pendiente eliminado' });
  } catch (err) {
    console.error('Error deleteTransferPendingCode:', err);
    return handleErrorResponse(res, 500, 'Error al eliminar pendiente', err?.message);
  }
};
