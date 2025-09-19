// src/auth/auth.controller.js
import User from '../user/user.model.js';
import { generateJWT } from '../helpers/generate-jwt.js';
import { handleErrorResponse } from '../helpers/handleResponse.js';
import { validationResult } from 'express-validator';
import { logActivity } from '../movements/movement.controller.js';

/* ============================================================================
 * Helpers
 * ==========================================================================*/

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u._id || u.id,
    email: u.email,
    nombre: u.nombre,
    cargo: u.cargo,
    departamento: u.departamento,
    roles: u.roles,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/**
 * POST /auth/login
 * Inicia sesión y devuelve token + perfil.
 */
export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    await logActivity({
      req,
      action: 'AUTH_LOGIN_FAIL',
      entity: 'USER',
      statusCode: 400,
      success: false,
      error: 'Datos inválidos',
      tags: ['auth'],
    });
    return handleErrorResponse(res, 400, 'Datos inválidos', errors.array());
  }

  const { email, password } = req.body;

  try {
    // Incluye hash para validar contraseña
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      await logActivity({
        req,
        action: 'AUTH_LOGIN_FAIL',
        entity: 'USER',
        statusCode: 404,
        success: false,
        error: 'Usuario no encontrado',
        tags: ['auth'],
      });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    if (!user.isActive) {
      await logActivity({
        req,
        action: 'AUTH_LOGIN_FAIL',
        entity: 'USER',
        entityId: user._id,
        statusCode: 403,
        success: false,
        error: 'Usuario desactivado',
        tags: ['auth'],
      });
      return handleErrorResponse(res, 403, 'Usuario desactivado');
    }

    const ok = await user.matchPassword(password);
    if (!ok) {
      await logActivity({
        req,
        action: 'AUTH_LOGIN_FAIL',
        entity: 'USER',
        entityId: user._id,
        statusCode: 401,
        success: false,
        error: 'Credenciales inválidas',
        tags: ['auth'],
      });
      return handleErrorResponse(res, 401, 'Credenciales inválidas');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = await generateJWT(user._id);

    await logActivity({
      req,
      action: 'AUTH_LOGIN',
      entity: 'USER',
      entityId: user._id,
      statusCode: 200,
      success: true,
      message: 'Inicio de sesión exitoso',
      tags: ['auth'],
    });

    return res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: { ...sanitizeUser(user.toJSON()), token },
    });
  } catch (err) {
    console.error('Error al iniciar sesión:', err);
    await logActivity({
      req,
      action: 'AUTH_LOGIN_FAIL',
      entity: 'USER',
      statusCode: 500,
      success: false,
      error: err?.message || 'Error inesperado',
      tags: ['auth'],
    });
    return handleErrorResponse(res, 500, 'Error al iniciar sesión', err.message);
  }
};

/**
 * GET /auth/me
 * Requiere validateJWT. Devuelve el perfil del usuario autenticado.
 */
export const me = async (req, res) => {
  try {
    const uid = req.user?.id || req.user?._id;
    if (!uid) {
      await logActivity({
        req,
        action: 'AUTH_ME_FAIL',
        entity: 'USER',
        statusCode: 401,
        success: false,
        error: 'No autenticado',
        tags: ['auth'],
      });
      return handleErrorResponse(res, 401, 'No autenticado');
    }

    const user = await User.findById(uid).lean();
    if (!user) {
      await logActivity({
        req,
        action: 'AUTH_ME_FAIL',
        entity: 'USER',
        entityId: uid,
        statusCode: 404,
        success: false,
        error: 'Usuario no encontrado',
        tags: ['auth'],
      });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    await logActivity({
      req,
      action: 'AUTH_ME',
      entity: 'USER',
      entityId: user._id,
      statusCode: 200,
      success: true,
      message: 'Perfil obtenido',
      tags: ['auth'],
    });

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('Error en /auth/me:', err);
    await logActivity({
      req,
      action: 'AUTH_ME_FAIL',
      entity: 'USER',
      statusCode: 500,
      success: false,
      error: err?.message || 'Error inesperado',
      tags: ['auth'],
    });
    return handleErrorResponse(res, 500, 'Error al obtener perfil', err.message);
  }
};
