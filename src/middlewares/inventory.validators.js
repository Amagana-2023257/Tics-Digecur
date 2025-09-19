// src/middlewares/inventory.validators.js
import mongoose from 'mongoose';
import { body, param, query, validationResult } from 'express-validator';

/* ========================= Helpers ========================= */
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

function collect(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  return res.status(422).json({
    success: false,
    message: 'Validación fallida',
    errors: result.array().map((e) => ({
      field: e.param,
      msg: e.msg,
      location: e.location,
    })),
  });
}

const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));

const isFlexibleItemId = (v) => {
  const s = String(v||'').trim();
  return isObjectId(s) || isUUID(s);
};

/* ========================= CRUD: Items ========================= */

// POST /inventory
export const createItemValidator = [
  body('noBien')
    .exists({ checkFalsy: true }).withMessage('noBien es obligatorio')
    .isString().withMessage('noBien debe ser string')
    .trim()
    .isLength({ min: 1, max: 120 }).withMessage('noBien longitud 1..120'),
  body('nombreBien')
    .exists({ checkFalsy: true }).withMessage('nombreBien es obligatorio')
    .isString().withMessage('nombreBien debe ser string')
    .trim()
    .isLength({ min: 1, max: 240 }).withMessage('nombreBien longitud 1..240'),
  body('descripcion').optional({ nullable: true }).isString().withMessage('descripcion debe ser string').trim(),
  body('responsable').optional({ nullable: true }).isString().withMessage('responsable debe ser string').trim(),
  body('responsableId')
    .optional({ nullable: true })
    .custom((v) => (v == null || isObjectId(v))).withMessage('responsableId debe ser ObjectId'),
  body('observaciones').optional({ nullable: true }).isString().withMessage('observaciones debe ser string').trim(),
  body('numeroTarjeta').optional({ nullable: true }).isString().withMessage('numeroTarjeta debe ser string').trim(),
  body('monto').optional({ nullable: true })
    .custom((v) => (v === '' || v === null || typeof v === 'undefined' || Number.isFinite(Number(v))))
    .withMessage('monto debe ser numérico'),
  body('isActive').optional().isBoolean().withMessage('isActive debe ser booleano'),
  collect,
];

// GET /inventory
export const listItemsValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('page debe ser >= 1'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit debe estar entre 1 y 1000'),
  query('q').optional().isString().withMessage('q debe ser string').trim(),
  query('responsable').optional().isString().withMessage('responsable debe ser string').trim(),
  query('responsableId').optional().custom(isObjectId).withMessage('responsableId inválido'),
  query('numeroTarjeta').optional().isString().withMessage('numeroTarjeta debe ser string').trim(),
  query('isActive').optional().isBoolean().withMessage('isActive debe ser booleano').toBoolean(),
  query('montoMin').optional().custom((v) => Number.isFinite(Number(v))).withMessage('montoMin debe ser numérico'),
  query('montoMax').optional().custom((v) => Number.isFinite(Number(v))).withMessage('montoMax debe ser numérico'),
  query('sort').optional().isString().withMessage('sort debe ser string'),
  query('mine').optional().isIn(['0', '1']).withMessage('mine debe ser 0 o 1'),
  collect,
];

// GET /inventory/:itemId
export const getByIdValidator = [
  // ⬇️ antes: .custom(isObjectId)
  param('itemId').custom(isFlexibleItemId).withMessage('itemId inválido'),
  collect,
];

// PUT /inventory/:itemId
export const updateItemValidator = [
  param('itemId').custom(isObjectId).withMessage('itemId inválido'),
  body('noBien').optional().custom(() => false).withMessage('noBien no puede modificarse'),
  body('nombreBien').optional().isString().withMessage('nombreBien debe ser string').trim().isLength({ min: 1, max: 240 }),
  body('descripcion').optional({ nullable: true }).isString().withMessage('descripcion debe ser string').trim(),
  body('responsable').optional({ nullable: true }).isString().withMessage('responsable debe ser string').trim(),
  body('responsableId')
    .optional({ nullable: true })
    .custom((v) => (v == null || isObjectId(v))).withMessage('responsableId debe ser ObjectId'),
  body('observaciones').optional({ nullable: true }).isString().withMessage('observaciones debe ser string').trim(),
  body('numeroTarjeta').optional({ nullable: true }).isString().withMessage('numeroTarjeta debe ser string').trim(),
  body('monto').optional({ nullable: true })
    .custom((v) => (v === '' || v === null || typeof v === 'undefined' || Number.isFinite(Number(v))))
    .withMessage('monto debe ser numérico'),
  body('isActive').optional().isBoolean().withMessage('isActive debe ser booleano'),
  collect,
];

// PATCH /inventory/:itemId/active
export const setActiveValidator = [
  param('itemId').custom(isObjectId).withMessage('itemId inválido'),
  body('isActive').exists().withMessage('isActive es obligatorio').isBoolean().withMessage('isActive debe ser booleano'),
  collect,
];

/* ========================= Transfer: invite/confirm ========================= */
/**
 * POST /inventory/:itemId/transfer-requests
 * - sin inviteCode => crear invitación
 * - con inviteCode  => confirmar con código
 */
export const createOrConfirmTransferRequestValidator = [
  param('itemId').custom(isObjectId).withMessage('itemId inválido'),
  body('toUser').exists({ checkFalsy: true }).withMessage('toUser es obligatorio').custom(isObjectId).withMessage('toUser inválido'),
  body('motivo').optional({ nullable: true }).isString().withMessage('motivo debe ser string').trim().isLength({ max: 2000 }),
  body('inviteCode').optional({ nullable: true }).isString().withMessage('inviteCode debe ser string').trim().isLength({ min: 4, max: 20 }),
  collect,
];

// Alias de compatibilidad
export const createTransferRequestValidator = createOrConfirmTransferRequestValidator;

/* ========================= Transfer: list/detail/approve/reject ========================= */

// GET /inventory/transfer-requests/list
export const getTransferRequestsListValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('page debe ser >= 1'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit debe estar entre 1 y 1000'),
  query('item').optional().custom(isObjectId).withMessage('item inválido'),
  query('status')
    .optional({ nullable: true })
    .customSanitizer((v) => (v ? String(v).toUpperCase() : undefined))
    .isIn(['PENDING', 'APPROVED', 'REJECTED', undefined]).withMessage('status inválido'),
  collect,
];

// GET /inventory/transfer-requests/:requestId
export const getTransferRequestByIdValidator = [
  param('requestId').custom(isObjectId).withMessage('requestId inválido'),
  collect,
];

// GET /inventory/transfer-requests/:requestId/detail
export const getTransferRequestDetailValidator = [
  param('requestId').custom(isObjectId).withMessage('requestId inválido'),
  collect,
];

// PATCH /inventory/transfer-requests/:requestId/approve
export const approveTransferRequestValidator = [
  param('requestId').custom(isObjectId).withMessage('requestId inválido'),
  collect,
];

// PATCH /inventory/transfer-requests/:requestId/reject
export const rejectTransferRequestValidator = [
  param('requestId').custom(isObjectId).withMessage('requestId inválido'),
  body('reason').optional({ nullable: true }).isString().withMessage('reason debe ser string').trim().isLength({ max: 2000 }),
  collect,
];

// POST /inventory/transfer-requests/:requestId/signed-doc
// (archivo multipart "file" o JSON { url } o { pdfBase64 })
export const uploadTransferSignedDocValidator = [
  param('requestId').custom(isObjectId).withMessage('requestId inválido'),
  body().custom((_, { req }) => {
    if (req.file) return true;
    const { url, pdfBase64 } = req.body || {};
    if (typeof url === 'string' && url.trim()) return true;
    if (typeof pdfBase64 === 'string' && pdfBase64.trim()) return true;
    throw new Error('Debes proporcionar file, url o pdfBase64');
  }),
  body('url').optional().isURL().withMessage('url inválida'),
  body('pdfBase64').optional().isString().withMessage('pdfBase64 debe ser string'),
  collect,
];

/* ========================= Pending Codes ========================= */

// GET /inventory/transfer-pending-codes
export const listTransferPendingCodesValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page debe ser >= 1')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('limit debe estar entre 1 y 1000')
    .toInt(),

  // status: ALL|OPEN|CLOSED — cualquier otra cosa se normaliza a 'ALL'
  query('status')
    .optional({ nullable: true })
    .customSanitizer((v) => {
      const s = String(v ?? 'ALL').trim().toUpperCase();
      const ok = ['ALL', 'OPEN', 'CLOSED'];
      return ok.includes(s) ? s : 'ALL';
    }),
    // 👆 Nota: no usamos .isIn(...).withMessage(...) para que
    //       jamás dispare 422 por este campo.

  collect,
];

// GET /inventory/transfer-pending-codes/:pendingId
export const getTransferPendingCodeByIdValidator = [
  param('pendingId').custom(isObjectId).withMessage('pendingId inválido'),
  collect,
];

// PATCH /inventory/transfer-pending-codes/:pendingId
export const updateTransferPendingCodeValidator = [
  param('pendingId').custom(isObjectId).withMessage('pendingId inválido'),
  body('codePlain')
    .optional({ nullable: true })
    .isString().withMessage('codePlain debe ser string')
    .trim()
    .isLength({ min: 4, max: 20 }).withMessage('codePlain longitud 4..20'),
  body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt debe ser fecha ISO'),
  body('sentEmail').optional().isBoolean().withMessage('sentEmail debe ser booleano'),
  body('resolvedAt')
    .optional({ nullable: true })
    .custom((v) => v === null || !v || !Number.isNaN(new Date(v).getTime()))
    .withMessage('resolvedAt debe ser fecha válida o null'),
  collect,
];

// DELETE /inventory/transfer-pending-codes/:pendingId
export const deleteTransferPendingCodeValidator = [
  param('pendingId').custom(isObjectId).withMessage('pendingId inválido'),
  collect,
];

/* ===== Aliases de compatibilidad con imports antiguos en routes ===== */
export const listTransferRequestsValidator = getTransferRequestsListValidator;
export const uploadSignedDocValidator = uploadTransferSignedDocValidator;
