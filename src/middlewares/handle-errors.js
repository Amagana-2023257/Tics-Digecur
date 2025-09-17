// src/middlewares/handle-errors.js

/**
 * Respuesta de error uniforme para los controladores.
 * @param {Response} res
 * @param {number} status
 * @param {string} message
 * @param {any} details
 */
export const handleErrorResponse = (res, status = 500, message = 'Error', details = undefined) => {
  const body = { success: false, message };
  if (typeof details !== 'undefined') body.details = details;
  return res.status(status).json(body);
};

/**
 * Middleware de manejo de errores para Express.
 * Si el error viene con `status=400` o `errors`, responde 400 con estructura estándar.
 * Para el resto, responde con 500 (o el status que traiga el error).
 */
export const handleErrors = (err, _req, res, _next) => {
  if (err?.status === 400 || err?.errors) {
    return res.status(400).json({
      success: false,
      errors: err.errors || [{ message: err.message || 'Bad Request' }],
    });
  }

  const status = err?.status || 500;
  return res.status(status).json({
    success: false,
    message: err?.message || 'Internal Server Error',
  });
};
