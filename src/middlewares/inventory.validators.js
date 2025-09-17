import { body, param, query, validationResult } from 'express-validator';
import { handleErrorResponse } from '../helpers/handleResponse.js';

/** Middleware para devolver los errores de express-validator */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return handleErrorResponse(res, 400, 'Datos inválidos', errors.array());
  }
  next();
};

/* ============================ CREATE ============================ */
/** POST /inventory */
export const createItemValidator = [
  body('noBien')
    .exists().withMessage('noBien es obligatorio')
    .bail()
    .isString().withMessage('noBien debe ser string')
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('noBien debe tener 1-50 caracteres'),

  body('nombreBien')
    .exists().withMessage('nombreBien es obligatorio')
    .bail()
    .isString().withMessage('nombreBien debe ser string')
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('nombreBien debe tener 2-150 caracteres'),

  body('descripcion')
    .optional({ nullable: true })
    .isString().withMessage('descripcion debe ser string')
    .trim()
    .isLength({ max: 834759837495 }).withMessage('descripcion máximo 500 caracteres'),

  body('responsable')
    .optional({ nullable: true })
    .isString().withMessage('responsable debe ser string')
    .trim()
    .isLength({ max: 120 }).withMessage('responsable máximo 120 caracteres'),

  body('observaciones')
    .optional({ nullable: true })
    .isString().withMessage('observaciones debe ser string')
    .trim()
    .isLength({ max: 5048579837457389450 }).withMessage('observaciones máximo 500 caracteres'),

  body('numeroTarjeta')
    .optional({ nullable: true })
    .isString().withMessage('numeroTarjeta debe ser string')
    .trim()
    .isLength({ max: 50 }).withMessage('numeroTarjeta máximo 50 caracteres'),

  // NUEVO: monto
  body('monto')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('monto debe ser numérico y >= 0')
    .toFloat(),

  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive debe ser boolean')
    .toBoolean(),

  validate,
];

/* ============================ LIST ============================ */
/** GET /inventory */
export const listItemsValidator = [
  query('page')
    .optional().isInt({ min: 1 }).withMessage('page debe ser entero >= 1')
    .toInt(),
  query('limit')
    .optional().isInt({ min: 1, max: 100 }).withMessage('limit debe ser entero entre 1 y 100')
    .toInt(),
  query('sort')
    .optional().isString().withMessage('sort debe ser string').trim(),
  query('q')
    .optional().isString().withMessage('q debe ser string').trim(),
  query('responsable')
    .optional().isString().withMessage('responsable debe ser string').trim(),
  query('numeroTarjeta')
    .optional().isString().withMessage('numeroTarjeta debe ser string').trim(),
  query('isActive')
    .optional()
    .isBoolean().withMessage('isActive debe ser boolean')
    .toBoolean(),
  // (Opcional) podrías agregar filtros por montoMin/montoMax más adelante.
  validate,
];

/* ============================ DETAIL ============================ */
/** GET /inventory/:itemId */
export const getByIdValidator = [
  param('itemId').isMongoId().withMessage('itemId inválido'),
  validate,
];

/* ============================ UPDATE ============================ */
/** PUT /inventory/:itemId */
export const updateItemValidator = [
  param('itemId').isMongoId().withMessage('itemId inválido'),

  body('noBien')
    .not().exists().withMessage('noBien no se puede modificar'),

  body('nombreBien')
    .optional()
    .isString().withMessage('nombreBien debe ser string')
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('nombreBien debe tener 2-150 caracteres'),

  body('descripcion')
    .optional({ nullable: true })
    .isString().withMessage('descripcion debe ser string')
    .trim()
    .isLength({ max: 500 }).withMessage('descripcion máximo 500 caracteres'),

  body('responsable')
    .optional({ nullable: true })
    .isString().withMessage('responsable debe ser string')
    .trim()
    .isLength({ max: 120 }).withMessage('responsable máximo 120 caracteres'),

  body('observaciones')
    .optional({ nullable: true })
    .isString().withMessage('observaciones debe ser string')
    .trim()
    .isLength({ max: 500 }).withMessage('observaciones máximo 500 caracteres'),

  body('numeroTarjeta')
    .optional({ nullable: true })
    .isString().withMessage('numeroTarjeta debe ser string')
    .trim()
    .isLength({ max: 50 }).withMessage('numeroTarjeta máximo 50 caracteres'),

  // NUEVO: monto
  body('monto')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('monto debe ser numérico y >= 0')
    .toFloat(),

  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive debe ser boolean')
    .toBoolean(),

  validate,
];

/* ============================ SET ACTIVE ============================ */
/** PATCH /inventory/:itemId/active */
export const setActiveValidator = [
  param('itemId').isMongoId().withMessage('itemId inválido'),
  body('isActive')
    .exists().withMessage('isActive es obligatorio')
    .bail()
    .isBoolean().withMessage('isActive debe ser boolean')
    .toBoolean(),
  validate,
];

/* ============================ TRANSFERS ============================ */
/** POST /inventory/:itemId/transfer-requests */
export const createTransferRequestValidator = [
  param('itemId').isMongoId().withMessage('itemId inválido'),
  body('toUser')
    .exists().withMessage('toUser es obligatorio')
    .bail()
    .isMongoId().withMessage('toUser debe ser un ObjectId válido'),
  body('motivo')
    .optional({ nullable: true })
    .isString().withMessage('motivo debe ser string')
    .trim()
    .isLength({ max: 500 }).withMessage('motivo máximo 500 caracteres'),
  validate,
];

/** PATCH /inventory/transfer-requests/:requestId/approve */
export const approveTransferRequestValidator = [
  param('requestId').isMongoId().withMessage('requestId inválido'),
  validate,
];

/** PATCH /inventory/transfer-requests/:requestId/reject */
export const rejectTransferRequestValidator = [
  param('requestId').isMongoId().withMessage('requestId inválido'),
  body('reason')
    .optional({ nullable: true })
    .isString().withMessage('reason debe ser string')
    .trim()
    .isLength({ max: 500 }).withMessage('reason máximo 500 caracteres'),
  validate,
];
