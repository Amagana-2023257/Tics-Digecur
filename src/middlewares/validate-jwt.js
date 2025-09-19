// src/middlewares/validate-jwt.js
import jwt from 'jsonwebtoken';
import User, { DEPARTAMENTOS, ROLES } from '../user/user.model.js';

const norm = (s) => String(s || '').trim().toUpperCase();
const uniq = (a) => [...new Set(a)];

// Mapas canónicos (case-insensitive) a partir de tus enums
const CANON_DEPS  = new Map(DEPARTAMENTOS.map((d) => [norm(d), d]));
const CANON_ROLES = new Map(ROLES.map((r) => [norm(r), r]));

/**
 * Valida el JWT y adjunta en req.user:
 *  - id, email, nombre, cargo
 *  - departamento (valor canónico del enum DEPARTAMENTOS)
 *  - roles (array de valores canónicos del enum ROLES)
 *  - isActive
 */
export const validateJWT = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization') || req.header('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    const token = bearerToken || req.header('x-token') || '';

    if (!token) {
      return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }

    // Acepta SECRET en distintas vars por compatibilidad
    const secret =
      process.env.JWT_SECRET ||
      process.env.JWT_PRIVATE_KEY ||
      process.env.JWT_PUBLIC_KEY ||
      'dev-secret';

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
    }

    const uid = payload.uid || payload.id || payload._id || payload.sub;
    if (!uid) {
      return res.status(401).json({ success: false, message: 'Token sin uid' });
    }

    // Traer usuario y campos necesarios
    const user = await User.findById(uid)
      .select('email nombre cargo departamento roles isActive createdAt updatedAt')
      .lean();

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Usuario inactivo' });
    }

    // Canonizar departamento contra enum
    const depKey = norm(user.departamento || user.department || '');
    const departamentoCanon = CANON_DEPS.get(depKey) || null;

    // Canonizar roles contra enum (descarta desconocidos)
    const rolesRaw = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    const rolesCanon = uniq(
      rolesRaw
        .map(norm)
        .map((r) => CANON_ROLES.get(r))
        .filter(Boolean)
    );

    // Armar identidad en req.user
    req.user = {
      id: String(user._id),
      email: user.email || null,
      nombre: user.nombre || null,
      cargo: user.cargo || '',
      departamento: departamentoCanon, // null si no coincide con enum
      roles: rolesCanon,               // [] si no coincide con enum
      isActive: Boolean(user.isActive),
      createdAt: user.createdAt || null,
      updatedAt: user.updatedAt || null,
    };

    // Compatibilidad con middlewares previos
    req.usuario = req.user;

    return next();
  } catch (err) {
    console.error('validateJWT error:', err);
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

export default validateJWT;
