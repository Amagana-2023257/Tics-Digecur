// src/correspondencia/correspondencia.controller.js
import mongoose from 'mongoose';
import Correspondencia, {
  CORR_ESTADOS,
  DEPTS_SIN_SUBDIRECTOR,
  SUBDIRS,
  SUBDIR_MAP, // puede venir vacío / desalineado: añadimos fallback abajo
} from './correspondencia.model.js';
import User from '../user/user.model.js';
import { handleErrorResponse } from '../helpers/handleResponse.js';
import { logActivity } from '../movements/movement.controller.js';

/* ============================== Helpers ============================== */
const now = () => new Date();

const isValidOneDriveFileUrl = (u = '') => {
  try {
    const url = new URL(String(u));
    const host = url.hostname.toLowerCase();
    if (host === '1drv.ms') return !url.pathname.startsWith('/f/');
    if (host.endsWith('sharepoint.com'))
      return url.pathname.startsWith('/:') && !url.pathname.startsWith('/:f:');
    if (host === 'onedrive.live.com') {
      const sp = url.searchParams;
      return sp.has('resid') || sp.has('id');
    }
    return false;
  } catch {
    return false;
  }
};

const toPlainItem = (docOrObj) => {
  const o =
    docOrObj && typeof docOrObj.toObject === 'function'
      ? docOrObj.toObject()
      : docOrObj
      ? { ...docOrObj }
      : null;
  if (!o) return o;
  if (o._id && !o.id) o.id = String(o._id);
  return o;
};

const pushHist = (doc, { action, fromState, toState, notes, actor }) => {
  doc.historial.push({
    at: now(),
    action,
    fromState,
    toState,
    notes: notes || '',
    actorUserId: actor?.id || actor?._id || null,
    actorDept: actor?.departamento || null,
    actorRole:
      (Array.isArray(actor?.roles) ? actor.roles[0] : actor?.role) || null,
  });
};

const consoleTransition = (label, { id, from, to, actor, extra = {} }) => {
  console.log(
    `[CORR:${label}] #${id} ${from} -> ${to} by ${
      actor?.email || actor?.id || 'unknown'
    }`,
    extra
  );
};

/* ---- Normalización robusta (acentos, mayúsculas, variantes) ---- */
const normStr = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

/** Alias para nombres de departamentos con variantes ortográficas */
const aliasDept = (s = '') => {
  const n = normStr(s);
  // Sistema usa "DESAROLLO" (una sola R) en algunos lugares; homogenizamos a esa variante
  if (n === 'DESARROLLO') return 'DESAROLLO';
  return n;
};

const canonicalFromList = (value, list) => {
  const n = normStr(value);
  const found = (list || []).find((x) => normStr(x) === n);
  return found || value;
};

/** Fallback interno por si el SUBDIR_MAP del modelo no está alineado */
const SUBDIR_FALLBACK_MAP = {
  'SUBDIRECCION EVALUACION CURRICULAR': ['PRIMARIA', 'EVALUACION', 'DESAROLLO'],
  'SUBDIRECCION DISENO Y DESAROLLO CURRICULAR': [
    'INICIAL Y PREPRIMARIA',
    'BASICO',
    'DIVERSIFICADO',
  ],
  // Nota: arriba normalizamos 'DISEÑO' -> 'DISENO' con normStr, así que la key queda sin tilde
};

/** Mapa normalizado (keys sin acentos/mayúsculas; values pasados por aliasDept) */
const buildSubdirMapNorm = () => {
  const merged = {};

  const add = (k, arr = []) => {
    if (!k) return;
    const K = normStr(k);
    const set = new Set(merged[K] || []);
    arr.forEach((d) => set.add(aliasDept(d)));
    merged[K] = Array.from(set);
  };

  // 1) Modelo
  Object.entries(SUBDIR_MAP || {}).forEach(([k, arr]) => add(k, arr));
  // 2) Fallback (se fusiona, no reemplaza)
  Object.entries(SUBDIR_FALLBACK_MAP).forEach(([k, arr]) => add(k, arr));

  return merged;
};

/* ============================== Creates & Reads ============================== */

// Recepción crea registro
export const createCorrespondencia = async (req, res) => {
  try {
    const {
      regExpediente,
      confirmacion,
      movimiento,
      documentoRecibido,
      enviadoPor,
      foliosRecibidos,
      observaciones,
      profesionales,
      onedriveUrl,
    } = req.body;

    if (!onedriveUrl || !isValidOneDriveFileUrl(onedriveUrl)) {
      return handleErrorResponse(res, 400, 'onedriveUrl inválida (archivo).');
    }

    const doc = await Correspondencia.create({
      regExpediente,
      confirmacion: !!confirmacion,
      movimiento: movimiento === 'ENVIADO' ? 'ENVIADO' : 'RECIBIDO',
      documentoRecibido,
      enviadoPor,
      foliosRecibidos: Number.isFinite(Number(foliosRecibidos))
        ? Number(foliosRecibidos)
        : 0,
      observaciones,
      profesionales: Array.isArray(profesionales)
        ? profesionales.map(String)
        : [],
      onedriveUrl,
      estado: CORR_ESTADOS.EN_RECEPCION,
      ownerDept: 'AREA ADMINISTRATIVA',
      ownerRole: 'ASISTENTE',
      createdBy: req.user?.id || null,
      historial: [],
    });

    pushHist(doc, {
      action: 'RECEPCION_CREATE',
      fromState: null,
      toState: CORR_ESTADOS.EN_RECEPCION,
      actor: req.user,
      notes: 'Ingreso en recepción',
    });
    await doc.save();

    consoleTransition('CREATE', {
      id: doc._id,
      from: '∅',
      to: doc.estado,
      actor: req.user,
    });

    await logActivity({
      req,
      action: 'CORR_CREATE',
      entity: 'CORRESPONDENCIA',
      entityId: doc._id,
      statusCode: 201,
      success: true,
      message: 'Correspondencia creada',
      after: doc.toObject(),
      tags: ['correspondencia'],
    });

    const item = toPlainItem(doc);
    return res.status(201).json({
      success: true,
      message: 'Correspondencia creada',
      id: item.id,
      item,
    });
  } catch (err) {
    console.error('createCorrespondencia error:', err);
    return handleErrorResponse(
      res,
      500,
      'Error al crear correspondencia',
      err?.message
    );
  }
};

// Obtener por id
export const getCorrespondenciaById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return handleErrorResponse(res, 400, 'ID inválido');
    }
    const doc = await Correspondencia.findById(id).lean();
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    const item = toPlainItem(doc);
    return res.status(200).json({ success: true, item });
  } catch (err) {
    console.error('getCorrespondenciaById error:', err);
    return handleErrorResponse(res, 500, 'Error al obtener', err?.message);
  }
};

// Listado con filtros básicos + restricciones por rol
export const listCorrespondencia = async (req, res) => {
  try {
    // --------- Paginación / orden ----------
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;
    const sort = req.query.sort ? String(req.query.sort) : '-updatedAt';

    // --------- Filtros de búsqueda ----------
    const qRaw = String(req.query.q || '').trim();
    const anyState = ['1', 'true', 'yes', 'all'].includes(
      String(req.query.anyState || '').toLowerCase()
    );
    const estadoRaw = String(req.query.estado || '').trim();
    const ownerDept = String(req.query.ownerDept || req.query.department || '').trim();
    const ownerRole = String(req.query.ownerRole || '').trim();
    const ownerUserId = String(req.query.ownerUserId || '').trim();
    const createdBy = String(req.query.createdBy || '').trim();

    const dateField = ['createdAt', 'updatedAt'].includes(String(req.query.dateField))
      ? String(req.query.dateField)
      : 'updatedAt';
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;

    // --------- Contexto del usuario ----------
    const roles = Array.isArray(req.user?.roles)
      ? req.user.roles.map((r) => String(r).toUpperCase().trim())
      : [];
    const myDept = String(req.user?.departamento || '');
    const myId = req.user?.id;
    const isAssistant = roles.includes('ASISTENTE');
    const isDirector = roles.includes('DIRECTOR');
    const isJefe = roles.includes('JEFE');
    const isTec = roles.includes('TECNICO') || roles.includes('TENICO');
    const isAdminLike = roles.includes('ADMIN') || roles.includes('DESAROLLADOR'); // super-roles

    // --------- Filtro base ----------
    const filter = {};

    // Texto libre
    if (qRaw) {
      const rx = new RegExp(qRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { regExpediente: rx },
        { documentoRecibido: rx },
        { enviadoPor: rx },
        { observaciones: rx },
        { profesionales: { $elemMatch: { $regex: rx } } },
      ];
    }

    // Filtros directos si vienen en query
    if (ownerDept) filter.ownerDept = ownerDept;
    if (ownerRole) filter.ownerRole = ownerRole;
    if (ownerUserId && mongoose.isValidObjectId(ownerUserId))
      filter.ownerUserId = ownerUserId;
    if (createdBy) filter.createdBy = createdBy;

    // Rango fechas (createdAt|updatedAt)
    if ((dateFrom && !isNaN(dateFrom)) || (dateTo && !isNaN(dateTo))) {
      filter[dateField] = {};
      if (dateFrom && !isNaN(dateFrom)) filter[dateField].$gte = dateFrom;
      if (dateTo && !isNaN(dateTo)) filter[dateField].$lte = dateTo;
    }

    // --------- Restricciones por rol ----------
    const userSetEstado = estadoRaw.length > 0;
    const estadoList = userSetEstado
      ? estadoRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    if (!isAdminLike) {
      if (isAssistant) {
        // Asistente: ve TODO
      } else if (isDirector) {
        filter.ownerDept = ownerDept || 'DIRECCION';
      } else if (isJefe) {
        filter.ownerDept = ownerDept || myDept;
        filter.ownerRole = ownerRole || 'JEFE';
        if (!anyState && !userSetEstado) {
          filter.estado = {
            $in: [
              CORR_ESTADOS.RECIBIDO_EN_DEPARTAMENTO,
              CORR_ESTADOS.RESUELTO_POR_TECNICO,
            ],
          };
        }
      } else if (isTec) {
        filter.ownerRole = ownerRole || 'TECNICO';
        filter.ownerUserId = myId;
        if (!anyState && !userSetEstado) {
          filter.estado = {
            $in: [CORR_ESTADOS.ASIGNADO_A_TECNICO, CORR_ESTADOS.EN_TRABAJO_TECNICO],
          };
        }
      } else {
        // Otros roles: sin restricciones extra
      }
    }

    if (userSetEstado) {
      filter.estado = estadoList.length ? { $in: estadoList } : undefined;
      if (!filter.estado) delete filter.estado;
    }

    // --------- Consulta ----------
    const [total, docs] = await Promise.all([
      Correspondencia.countDocuments(filter),
      Correspondencia.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ]);

    const items = (docs || []).map((d) => {
      if (d && d._id && !d.id) d.id = String(d._id);
      return d;
    });

    return res.status(200).json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      items,
    });
  } catch (err) {
    console.error('listCorrespondencia error:', err);
    return handleErrorResponse(res, 500, 'Error al listar', err?.message);
  }
};

/* ============================== Transiciones ============================== */

// Recepción -> Dirección
export const recepcionEnviarADireccion = async (req, res) => {
  try {
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');

    const from = doc.estado;
    doc.estado = CORR_ESTADOS.EN_DIRECCION_POR_INSTRUIR;
    doc.ownerDept = 'DIRECCION';
    doc.ownerRole = 'DIRECTOR';
    doc.ownerUserId = null;

    pushHist(doc, {
      action: 'RECEPCION->DIRECCION',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
      notes: 'Envío a Dirección para instrucciones',
    });
    await doc.save();

    consoleTransition('RECEP->DIR', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    await logActivity({
      req,
      action: 'CORR_SENT_TO_DIR',
      entity: 'CORRESPONDENCIA',
      entityId: doc._id,
      statusCode: 200,
      success: true,
      message: 'Enviado a Dirección',
      tags: ['correspondencia'],
    });

    return res
      .status(200)
      .json({ success: true, message: 'Enviado a Dirección', item: toPlainItem(doc) });
  } catch (err) {
    console.error('recepcionEnviarADireccion error:', err);
    return handleErrorResponse(res, 500, 'Error en transición', err?.message);
  }
};

// Dirección: fija instrucciones y ENVÍA a SUBDIRECTOR o JEFE
export const direccionInstruirYEnviar = async (req, res) => {
  try {
    const { subdireccion, departamento, roleDestino, instrucciones } = req.body;
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');

    if (
      doc.estado !== CORR_ESTADOS.EN_DIRECCION_POR_INSTRUIR &&
      doc.estado !== CORR_ESTADOS.EN_DIRECCION_POR_REASIGNAR
    ) {
      return handleErrorResponse(res, 400, 'No está en etapa de Dirección');
    }

    doc.instruccionesDireccion = String(instrucciones || '').trim();

    const from = doc.estado;

    if (roleDestino === 'SUBDIRECTOR') {
      const subdirsNorm = (SUBDIRS || []).map(normStr);
      if (!subdirsNorm.includes(normStr(subdireccion))) {
        return handleErrorResponse(res, 400, 'Subdirección inválida');
      }
      const canonical = canonicalFromList(subdireccion, SUBDIRS);

      doc.destinoTipo = 'SUBDIRECCION';
      doc.destinoSubdireccion = canonical;
      doc.destinoDepartamento = null;
      doc.estado = CORR_ESTADOS.EN_SUBDIRECCION_POR_RECIBIR;
      doc.ownerDept = canonical;
      doc.ownerRole = 'SUBDIRECTOR';
      doc.ownerUserId = null;
    } else if (roleDestino === 'JEFE') {
      const deptNorm = aliasDept(departamento);
      const inSinSubdir = (DEPTS_SIN_SUBDIRECTOR || [])
        .map(aliasDept)
        .includes(deptNorm);
      const inSubdir = Object.values(SUBDIR_MAP || {})
        .flat()
        .map(aliasDept)
        .includes(deptNorm);
      if (!inSinSubdir && !inSubdir) {
        return handleErrorResponse(res, 400, 'Departamento inválido');
      }

      doc.destinoTipo = 'DEPARTAMENTO';
      doc.destinoSubdireccion = null;
      doc.destinoDepartamento = departamento;
      doc.estado = CORR_ESTADOS.EN_DEPARTAMENTO_POR_RECIBIR;
      doc.ownerDept = departamento;
      doc.ownerRole = 'JEFE';
      doc.ownerUserId = null;
    } else {
      return handleErrorResponse(
        res,
        400,
        'roleDestino inválido (SUBDIRECTOR|JEFE)'
      );
    }

    pushHist(doc, {
      action: 'DIR_INSTRUYE_ENVIA',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
      notes: `Destino: ${
        roleDestino === 'SUBDIRECTOR' ? subdireccion : departamento
      }`,
    });

    await doc.save();

    consoleTransition('DIR->DEST', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
      extra: { roleDestino, subdireccion, departamento },
    });

    await logActivity({
      req,
      action: 'CORR_DIR_ROUTE',
      entity: 'CORRESPONDENCIA',
      entityId: doc._id,
      statusCode: 200,
      success: true,
      message: `Dirección envía a ${roleDestino}`,
      tags: ['correspondencia'],
    });

    return res
      .status(200)
      .json({ success: true, message: 'Enviado', item: toPlainItem(doc) });
  } catch (err) {
    console.error('direccionInstruirYEnviar error:', err);
    return handleErrorResponse(res, 500, 'Error al instruir/enviar', err?.message);
  }
};

// SUBDIRECTOR acepta recepción
export const subdireccionAceptar = async (req, res) => {
  try {
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.EN_SUBDIRECCION_POR_RECIBIR) {
      return handleErrorResponse(res, 400, 'No está pendiente en Subdirección');
    }

    const from = doc.estado;
    doc.estado = CORR_ESTADOS.RECIBIDO_EN_SUBDIRECCION;
    doc.ownerRole = 'SUBDIRECTOR';

    pushHist(doc, {
      action: 'SUBDIR_ACEPTAR',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
    });
    await doc.save();

    consoleTransition('SUBDIR_ACCEPT', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Recibido por Subdirección',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('subdireccionAceptar error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// SUBDIRECTOR asigna JEFE (sin validar dept; usa dept del jefe) + auto-aceptación
export const subdireccionAsignarJefe = async (req, res) => {
  try {
    const { jefeUserId } = req.body; // departamento ya no es necesario
    const { id } = req.params;

    const doc = await Correspondencia.findById(id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');

    // Auto-aceptación si el doc está "por recibir" y quien llama es SUBDIRECTOR
    const estadoActual = String(doc.estado || '');
    const rolesCaller = Array.isArray(req.user?.roles)
      ? req.user.roles.map((r) => normStr(r))
      : [];
    const isCallerSubdirector = rolesCaller.includes('SUBDIRECTOR');

    if (estadoActual === CORR_ESTADOS.EN_SUBDIRECCION_POR_RECIBIR && isCallerSubdirector) {
      const fromAuto = doc.estado;
      doc.estado = CORR_ESTADOS.RECIBIDO_EN_SUBDIRECCION;
      doc.ownerRole = 'SUBDIRECTOR';
      pushHist(doc, {
        action: 'SUBDIR_ACEPTAR_IMPLICITO',
        fromState: fromAuto,
        toState: doc.estado,
        actor: req.user,
        notes: 'Auto-aceptado por Subdirección al asignar a Jefatura',
      });
      await doc.save();
    }

    // Validar estado (ya sin revisar pertenencia a subdirección)
    const estado = String(doc.estado || '');
    const estadosPermitidos = [
      CORR_ESTADOS.RECIBIDO_EN_SUBDIRECCION,
      CORR_ESTADOS.EN_SUBDIRECCION_REVISION,
    ];
    if (!estadosPermitidos.includes(estado)) {
      return handleErrorResponse(res, 400, 'No está en etapa de Subdirección para asignar');
    }

    // Obtener Jefe (requerido)
    const jefe = await User.findById(jefeUserId).lean();
    if (!jefe) return handleErrorResponse(res, 404, 'Jefe no encontrado');

    // Usar SIEMPRE el departamento del jefe (ignora req.body.departamento)
    const deptJefe = String(jefe.departamento || '').trim();

    // Transición a Jefatura
    const from = doc.estado;
    doc.estado = CORR_ESTADOS.EN_DEPARTAMENTO_POR_RECIBIR;
    doc.ownerDept = deptJefe;
    doc.ownerRole = 'JEFE';
    doc.ownerUserId = jefe._id;
    doc.jefeAsignadoId = jefe._id;
    doc.jefeAsignadoLabel = jefe.nombre || jefe.email;

    pushHist(doc, {
      action: 'SUBDIR_ASIGNA_JEFE',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
      notes: `Dept (auto): ${deptJefe}; Jefe: ${doc.jefeAsignadoLabel}`,
    });
    await doc.save();

    consoleTransition('SUBDIR->JEFE', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
      extra: { jefeUserId, deptJefe },
    });

    return res.status(200).json({
      success: true,
      message: 'Asignado a Jefatura',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('subdireccionAsignarJefe error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// JEFE acepta
export const jefeAceptar = async (req, res) => {
  try {
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.EN_DEPARTAMENTO_POR_RECIBIR) {
      return handleErrorResponse(res, 400, 'No está pendiente en Jefatura');
    }
    const from = doc.estado;
    doc.estado = CORR_ESTADOS.RECIBIDO_EN_DEPARTAMENTO;
    doc.ownerRole = 'JEFE';

    pushHist(doc, {
      action: 'JEFE_ACEPTAR',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
    });
    await doc.save();

    consoleTransition('JEFE_ACCEPT', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Recibido por Jefatura',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('jefeAceptar error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// JEFE asigna TÉCNICO (sin guard heredado) + auto-aceptación si "por recibir"
export const jefeAsignarTecnico = async (req, res) => {
  try {
    // Aceptamos ambos nombres por retrocompat: tecnicoUserId o tecnicoId
    const { tecnicoUserId, tecnicoId } = req.body;
    const { id } = req.params;

    // --- Sesión obligatoria ---
    if (!req.user) {
      return handleErrorResponse(res, 401, 'Sesión no válida o expirada');
    }

    const doc = await Correspondencia.findById(id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');

    // --- Contexto del llamador (sin crashear si faltan campos) ---
    const myId = String(req.user?.id || req.user?._id || '');
    const rolesRaw = Array.isArray(req.user?.roles) ? req.user.roles : [];
    const roles = rolesRaw.map(r => String(r || '').toUpperCase().trim());
    const isSuper = roles.includes('ADMIN') || roles.includes('DESAROLLADOR');
    const isJefe  = roles.includes('JEFE');

    // --- Auto-aceptación si está "por recibir" y el llamador es el Jefe dueño ---
    if (
      doc.estado === CORR_ESTADOS.EN_DEPARTAMENTO_POR_RECIBIR &&
      isJefe &&
      myId &&
      String(doc.ownerUserId || '') === myId
    ) {
      const fromAuto = doc.estado;
      doc.estado = CORR_ESTADOS.RECIBIDO_EN_DEPARTAMENTO;
      doc.ownerRole = 'JEFE';
      pushHist(doc, {
        action: 'JEFE_ACEPTAR_IMPLICITO',
        fromState: fromAuto,
        toState: doc.estado,
        actor: req.user,
        notes: 'Auto-aceptado por Jefatura al asignar técnico',
      });
      await doc.save();
    }

    // --- Autorización: super o Jefe propietario del expediente ---
    if (!isSuper) {
      if (!isJefe || !myId || String(doc.ownerUserId || '') !== myId) {
        return handleErrorResponse(res, 403, 'No autorizado para asignar técnico en este expediente');
      }
    }

    // --- Estados válidos para asignar técnico ---
    if (![CORR_ESTADOS.RECIBIDO_EN_DEPARTAMENTO, CORR_ESTADOS.RESUELTO_POR_TECNICO].includes(doc.estado)) {
      return handleErrorResponse(res, 400, 'No está en etapa para asignar técnico');
    }

    // --- Buscar técnico por _id o email ---
    const raw = String(tecnicoUserId || tecnicoId || '').trim();
    let tec = null;
    if (raw) {
      if (mongoose.isValidObjectId(raw)) {
        tec = await User.findById(raw).lean();
      } else if (raw.includes('@')) {
        tec = await User.findOne({ email: raw.toLowerCase() }).lean();
      }
    }
    if (!tec) return handleErrorResponse(res, 404, 'Técnico no encontrado');

    // --- Transición a técnico ---
    const from = doc.estado;
    doc.estado = CORR_ESTADOS.ASIGNADO_A_TECNICO;
    doc.ownerRole = 'TECNICO';
    // ownerDept se mantiene; ownership de persona cambia al técnico:
    doc.ownerUserId = tec._id;
    doc.tecnicoAsignadoId = tec._id;
    doc.tecnicoAsignadoLabel = tec.nombre || tec.email;

    pushHist(doc, {
      action: 'JEFE_ASIGNA_TECNICO',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
      notes: `Técnico: ${doc.tecnicoAsignadoLabel}`,
    });
    await doc.save();

    consoleTransition('JEFE->TEC', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
      extra: { tecnicoUserId: raw },
    });

    return res.status(200).json({
      success: true,
      message: 'Asignado a Técnico',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('jefeAsignarTecnico error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// TECNICO inicia trabajo
export const tecnicoStart = async (req, res) => {
  try {
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.ASIGNADO_A_TECNICO) {
      return handleErrorResponse(res, 400, 'No está asignado a técnico');
    }
    const from = doc.estado;
    doc.estado = CORR_ESTADOS.EN_TRABAJO_TECNICO;

    pushHist(doc, {
      action: 'TEC_START',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
    });
    await doc.save();

    consoleTransition('TEC_START', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res
      .status(200)
      .json({ success: true, message: 'En trabajo', item: toPlainItem(doc) });
  } catch (err) {
    console.error('tecnicoStart error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// TECNICO resuelve y devuelve a JEFE
export const tecnicoResolver = async (req, res) => {
  try {
    const { notas } = req.body;
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.EN_TRABAJO_TECNICO) {
      return handleErrorResponse(res, 400, 'No está en trabajo técnico');
    }

    const from = doc.estado;
    doc.estado = CORR_ESTADOS.RESUELTO_POR_TECNICO;
    doc.ownerRole = 'JEFE'; // vuelve a Jefatura para revisión
    doc.ownerUserId = doc.jefeAsignadoId || null;

    pushHist(doc, { action: 'TEC_RESUELVE', fromState: from, toState: doc.estado, actor: req.user, notes: notas });
    await doc.save();

    consoleTransition('TEC->JEFE', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Resuelto por técnico',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('tecnicoResolver error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// JEFE devuelve arriba (a SUBDIRECCIÓN si existe o a DIRECCIÓN)
export const jefeDevolverArriba = async (req, res) => {
  try {
    const { notas } = req.body;
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.RESUELTO_POR_TECNICO) {
      return handleErrorResponse(res, 400, 'No está resuelto por técnico');
    }

    const from = doc.estado;
    if (doc.destinoTipo === 'SUBDIRECCION' && doc.destinoSubdireccion) {
      doc.estado = CORR_ESTADOS.EN_SUBDIRECCION_REVISION;
      doc.ownerDept = doc.destinoSubdireccion;
      doc.ownerRole = 'SUBDIRECTOR';
      doc.ownerUserId = null;
    } else {
      doc.estado = CORR_ESTADOS.EN_DIRECCION_REVISION_FINAL;
      doc.ownerDept = 'DIRECCION';
      doc.ownerRole = 'DIRECTOR';
      doc.ownerUserId = null;
    }

    pushHist(doc, {
      action: 'JEFE_DEVUELVE_ARRIBA',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
      notes: notas, // <— FIX
    });
    await doc.save();

    consoleTransition('JEFE->UP', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Devuelto para revisión superior',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('jefeDevolverArriba error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};


// SUBDIRECTOR devuelve a DIRECCIÓN (revisión final)
export const subdirDevolverADireccion = async (req, res) => {
  try {
    const { notas } = req.body;
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.EN_SUBDIRECCION_REVISION) {
      return handleErrorResponse(res, 400, 'No está en revisión de subdirección');
    }

    const from = doc.estado;
    doc.estado = CORR_ESTADOS.EN_DIRECCION_REVISION_FINAL;
    doc.ownerDept = 'DIRECCION';
    doc.ownerRole = 'DIRECTOR';
    doc.ownerUserId = null;

    pushHist(doc, { action: 'SUBDIR->DIR', fromState: from, toState: doc.estado, actor: req.user, notes });
    await doc.save();

    consoleTransition('SUBDIR->DIR', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Enviado a Dirección para cierre',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('subdirDevolverADireccion error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// DIRECCIÓN remite a Recepción para archivo
export const direccionRemitirArchivo = async (req, res) => {
  try {
    const { notas } = req.body;
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.EN_DIRECCION_REVISION_FINAL) {
      return handleErrorResponse(res, 400, 'No está en revisión final de Dirección');
    }

    const from = doc.estado;
    doc.estado = CORR_ESTADOS.EN_RECEPCION_PARA_ARCHIVO;
    doc.ownerDept = 'AREA ADMINISTRATIVA';
    doc.ownerRole = 'ASISTENTE';
    doc.ownerUserId = null;

    pushHist(doc, { action: 'DIR->RECEP_ARCH', fromState: from, toState: doc.estado, actor: req.user, notes });
    await doc.save();

    consoleTransition('DIR->RECEP', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Remitido a Recepción para archivar',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('direccionRemitirArchivo error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// RECEPCIÓN archiva
export const recepcionArchivar = async (req, res) => {
  try {
    const { notas } = req.body;
    const doc = await Correspondencia.findById(req.params.id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');
    if (doc.estado !== CORR_ESTADOS.EN_RECEPCION_PARA_ARCHIVO) {
      return handleErrorResponse(res, 400, 'No está para archivo');
    }

    const from = doc.estado;
    doc.estado = CORR_ESTADOS.ARCHIVADO;
    doc.ownerRole = 'ASISTENTE';

    pushHist(doc, { action: 'RECEP_ARCHIVAR', fromState: from, toState: doc.estado, actor: req.user, notes });
    await doc.save();

    consoleTransition('ARCHIVO', {
      id: doc._id,
      from,
      to: doc.estado,
      actor: req.user,
    });

    return res
      .status(200)
      .json({ success: true, message: 'Archivado', item: toPlainItem(doc) });
  } catch (err) {
    console.error('recepcionArchivar error:', err);
    return handleErrorResponse(res, 500, 'Error', err?.message);
  }
};

// Recepción (sólo Asistente AA) -> Dirección
export const recepcionAAEnviarADireccion = async (req, res) => {
  try {
    const roles = Array.isArray(req.user?.roles)
      ? req.user.roles.map((r) => String(r || '').toUpperCase().trim())
      : [];
    const dept = String(req.user?.departamento || '')
      .toUpperCase()
      .trim();

    const isAsistente = roles.includes('ASISTENTE');
    const isAreaAdmin = dept === 'AREA ADMINISTRATIVA';

    if (!isAsistente || !isAreaAdmin) {
      return handleErrorResponse(
        res,
        403,
        'Sólo la Asistente del Área Administrativa puede realizar esta acción'
      );
    }

    const { id } = req.params;
    const doc = await Correspondencia.findById(id);
    if (!doc) return handleErrorResponse(res, 404, 'No encontrado');

    if (doc.estado !== CORR_ESTADOS.EN_RECEPCION) {
      return handleErrorResponse(res, 400, 'El expediente no está en Recepción');
    }

    const from = doc.estado;

    doc.estado = CORR_ESTADOS.EN_DIRECCION_POR_INSTRUIR;
    doc.ownerDept = 'DIRECCION';
    doc.ownerRole = 'DIRECTOR';
    doc.ownerUserId = null;

    doc.recepcionAsignoADireccionAt = new Date();
    doc.recepcionAsignoADireccionPorId = req.user?.id ?? null;

    pushHist(doc, {
      action: 'AA_ASISTENTE_ENVIA_DIRECCION',
      fromState: from,
      toState: doc.estado,
      actor: req.user,
      notes:
        'Asignado desde Recepción (Área Administrativa) hacia Dirección para instrucción',
    });

    await doc.save();

    await logActivity({
      req,
      action: 'CORR_AA_SENT_TO_DIR',
      entity: 'CORRESPONDENCIA',
      entityId: doc._id,
      statusCode: 200,
      success: true,
      message: 'Enviado a Dirección por Asistente de Área Administrativa',
      tags: ['correspondencia', 'recepcion', 'aa-only'],
    });

    return res.status(200).json({
      success: true,
      message: 'Enviado a Dirección',
      item: toPlainItem(doc),
    });
  } catch (err) {
    console.error('recepcionAAEnviarADireccion error:', err);
    return handleErrorResponse(res, 500, 'Error en transición', err?.message);
  }
};
