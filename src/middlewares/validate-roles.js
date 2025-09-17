// src/middlewares/validate-roles.js

// Normaliza lista de roles (mayúsculas, sin vacíos)
const normalizeRoles = (arr) =>
  (arr || [])
    .flat()
    .map((r) => String(r || '').toUpperCase().trim())
    .filter(Boolean);

// Base: permite acceso si el usuario tiene ALGUNO de los roles requeridos
export const hasRoles = (...allowed) => {
  const required = normalizeRoles(allowed);

  return (req, res, next) => {
    const u = req.user || req.usuario; // compatibilidad con middlewares previos

    if (!u) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado (token faltante o inválido)',
      });
    }

    const userRolesRaw = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
    const userRoles = normalizeRoles(userRolesRaw);

    // Si no se exigieron roles, basta con estar autenticado
    if (required.length === 0) return next();

    const ok = required.some((r) => userRoles.includes(r));
    if (!ok) {
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para acceder a este recurso',
        neededAnyOf: required,
        yourRoles: userRoles,
      });
    }

    return next();
  };
};

// Alias explícito (ANY)
export const requireRolesAny = (...roles) => hasRoles(...roles);

// Variante: requiere que el usuario tenga TODOS los roles listados
export const requireRolesAll = (...allowed) => {
  const required = normalizeRoles(allowed);

  return (req, res, next) => {
    const u = req.user || req.usuario;

    if (!u) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado (token faltante o inválido)',
      });
    }

    const userRolesRaw = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
    const userRoles = normalizeRoles(userRolesRaw);

    if (required.length === 0) return next();

    const ok = required.every((r) => userRoles.includes(r));
    if (!ok) {
      return res.status(403).json({
        success: false,
        message: 'No tiene todos los roles requeridos para este recurso',
        neededAllOf: required,
        yourRoles: userRoles,
      });
    }

    return next();
  };
};
