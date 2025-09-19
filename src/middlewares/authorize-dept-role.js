// src/middlewares/authorize-dept-role.js
import { DEPARTAMENTOS, ROLES } from '../user/user.model.js';

const norm = (s) => String(s || '').trim().toUpperCase();
const normList = (arr) => (arr || []).flat().map(norm).filter(Boolean);
const uniq = (a) => [...new Set(a)];

// Mapas canónicos (case-insensitive)
const CANON_DEPS = new Map(DEPARTAMENTOS.map((d) => [norm(d), d]));
const CANON_ROLES = new Map(ROLES.map((r) => [norm(r), r]));

// Normaliza listas permitidas contra canónicos; soporta '*'
function canonAllow(list, mapAll) {
  const upper = normList(list);
  if (upper.includes('*')) return ['*'];
  const canon = upper.map((k) => mapAll.get(k)).filter(Boolean);
  return uniq(canon);
}

/**
 * Requiere que el usuario pertenezca a ALGUNO de los departamentos permitidos
 * Y tenga ALGUNO de los roles permitidos. Ambos deben cumplirse.
 *
 * Uso: requireDeptAndRole(['DIRECCION', 'AREA ADMINISTRATIVA'], ['DIRECTOR','JEFE'])
 *      // '*' en depts o roles permite cualquiera de ese lado.
 */
export const requireDeptAndRole = (allowedDepts = [], allowedRoles = []) => {
  const allowDeps = canonAllow(allowedDepts, CANON_DEPS);   // e.g., ['DIRECCION', ...] o ['*']
  const allowRoles = canonAllow(allowedRoles, CANON_ROLES); // e.g., ['DIRECTOR', ...] o ['*']

  // Seguridad: si algún lado quedó vacío (mal config) => bloquear
  const misconfigured = (arr) => Array.isArray(arr) && arr.length === 0;

  return (req, res, next) => {
    const u = req.user || req.usuario;
    if (!u) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado (token faltante o inválido)',
      });
    }

    if (misconfigured(allowDeps) || misconfigured(allowRoles)) {
      return res.status(500).json({
        success: false,
        message:
          'Autorización mal configurada: listas de departamentos/roles vacías.',
      });
    }

    const userDeptKey = norm(u.departamento || u.department || '');
    const userDept = CANON_DEPS.get(userDeptKey); // puede quedar undefined si viene fuera del enum
    const userRoles = normList(Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []));
    const userRolesCanon = uniq(userRoles.map((r) => CANON_ROLES.get(r)).filter(Boolean));

    const deptOk =
      allowDeps.includes('*') || (userDept && allowDeps.includes(userDept));
    const roleOk =
      allowRoles.includes('*') ||
      (userRolesCanon.length > 0 &&
        userRolesCanon.some((r) => allowRoles.includes(r)));

    if (!deptOk || !roleOk) {
      return res.status(403).json({
        success: false,
        message:
          'Acceso denegado: requiere pertenecer a un departamento permitido y tener un rol permitido.',
        needed: {
          departamentos: allowDeps.includes('*') ? '*' : allowDeps,
          roles: allowRoles.includes('*') ? '*' : allowRoles,
        },
        youHave: {
          departamento: userDept || u.departamento || null,
          roles: userRolesCanon.length ? userRolesCanon : u.roles || [],
        },
      });
    }

    return next();
  };
};

/**
 * Variante “propietario o (departamento Y rol)”.
 * Si el :userId coincide con el del token, permite; si no, aplica requireDeptAndRole.
 */
export const selfOrDeptAndRole = (allowedDepts = [], allowedRoles = []) => {
  const guard = requireDeptAndRole(allowedDepts, allowedRoles);
  return (req, res, next) => {
    const authUser = req.user || {};
    const uid = authUser.id || authUser._id?.toString?.();
    if (uid && uid === req.params.userId) return next();
    return guard(req, res, next);
  };
};
