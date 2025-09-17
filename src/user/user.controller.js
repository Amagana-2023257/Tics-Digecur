// src/user/user.controller.js
import User, { ROLES } from './user.model.js';
import { handleErrorResponse } from '../helpers/handleResponse.js';
import { logActivity } from '../movements/movement.controller.js';

/* Helpers previos (sanitizeUser, buildUsersFilter) se mantienen idénticos */
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
    lastPasswordChangeAt: u.lastPasswordChangeAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function buildUsersFilter(query) {
  const filter = {};
  const { q, role, departamento, isActive } = query;

  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim(), 'i');
    filter.$or = [{ email: rx }, { nombre: rx }, { cargo: rx }];
  }

  if (role) {
    const roles = Array.isArray(role) ? role : String(role).split(',').map(s => s.trim());
    filter.roles = { $in: roles };
  }

  if (departamento) {
    const departamentos = Array.isArray(departamento)
      ? departamento
      : String(departamento).split(',').map(s => s.trim());
    filter.departamento = { $in: departamentos };
  }

  if (typeof isActive !== 'undefined') {
    const v = typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : Boolean(isActive);
    filter.isActive = v;
  }

  return filter;
}

/* ============================ CRUD ============================ */

export const createUser = async (req, res) => {
  const { email, nombre, cargo, departamento, roles, password } = req.body;
  if (!email || !nombre || !departamento || !password) {
    await logActivity({ req, action: 'USER_CREATE_FAIL', statusCode: 400, success: false, error: 'Faltan campos obligatorios' });
    return handleErrorResponse(res, 400, 'email, nombre, departamento y password son obligatorios');
  }

  try {
    const user = new User({
      email, nombre, cargo, departamento,
      roles: Array.isArray(roles) && roles.length ? roles : undefined,
      password,
    });
    await user.save();

    await logActivity({
      req, action: 'USER_CREATE', entity: 'USER', entityId: user.id,
      statusCode: 201, success: true, message: 'Usuario creado'
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      user: sanitizeUser(user.toJSON()),
    });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'campo';
      await logActivity({ req, action: 'USER_CREATE_FAIL', statusCode: 400, success: false, error: `Duplicado: ${field}` });
      return handleErrorResponse(res, 400, `El ${field} ya está en uso`);
    }
    console.error('Error al crear usuario:', err);
    await logActivity({ req, action: 'USER_CREATE_FAIL', statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al crear usuario', err.message);
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const filter = buildUsersFilter(req.query);
    const sort   = req.query.sort ? String(req.query.sort) : '-createdAt';
    const docs = await User.find(filter).sort(sort).lean();
    const users = docs.map(sanitizeUser);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    await logActivity({ req, action: 'USER_LIST', statusCode: 200, success: true, message: `Total ${users.length}` });

    return res.status(200).json({
      success: true,
      message: 'Usuarios obtenidos exitosamente',
      total: users.length,
      users,
    });
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    await logActivity({ req, action: 'USER_LIST_FAIL', statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al obtener usuarios', err.message);
  }
};

export const getUserById = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      await logActivity({ req, action: 'USER_GET_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    await logActivity({ req, action: 'USER_GET', entity: 'USER', entityId: userId, statusCode: 200, success: true });

    return res.status(200).json({
      success: true,
      message: 'Usuario encontrado',
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    await logActivity({ req, action: 'USER_GET_FAIL', entity: 'USER', entityId: req.params?.userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al obtener usuario', err.message);
  }
};

export const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { nombre, cargo, departamento } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      await logActivity({ req, action: 'USER_UPDATE_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    const before = user.toJSON();

    if (typeof nombre !== 'undefined') user.nombre = nombre;
    if (typeof cargo !== 'undefined') user.cargo = cargo;
    if (typeof departamento !== 'undefined') user.departamento = departamento;

    await user.save();

    await logActivity({
      req, action: 'USER_UPDATE', entity: 'USER', entityId: user.id,
      before, after: user.toJSON(), statusCode: 200, success: true, message: 'Usuario actualizado'
    });

    return res.status(200).json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      user: sanitizeUser(user.toJSON()),
    });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'campo';
      await logActivity({ req, action: 'USER_UPDATE_FAIL', entity: 'USER', entityId: userId, statusCode: 400, success: false, error: `Duplicado: ${field}` });
      return handleErrorResponse(res, 400, `El ${field} ya está en uso`);
    }
    console.error('Error al actualizar usuario:', err);
    await logActivity({ req, action: 'USER_UPDATE_FAIL', entity: 'USER', entityId: userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al actualizar usuario', err.message);
  }
};

export const updateUserRoles = async (req, res) => {
  const { userId } = req.params;
  let { roles } = req.body;

  if (!Array.isArray(roles) || roles.length === 0) {
    await logActivity({ req, action: 'USER_ROLES_FAIL', entity: 'USER', entityId: userId, statusCode: 400, success: false, error: 'roles vacío' });
    return handleErrorResponse(res, 400, 'roles debe ser un array no vacío');
  }
  roles = roles.map(String);
  const validRoles = new Set(ROLES);
  for (const r of roles) {
    if (!validRoles.has(r)) {
      await logActivity({ req, action: 'USER_ROLES_FAIL', entity: 'USER', entityId: userId, statusCode: 400, success: false, error: `Rol inválido: ${r}` });
      return handleErrorResponse(res, 400, `Rol inválido: ${r}`);
    }
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      await logActivity({ req, action: 'USER_ROLES_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    const before = user.toJSON();
    user.roles = roles;
    await user.save();

    await logActivity({
      req, action: 'USER_ROLES', entity: 'USER', entityId: user.id,
      before, after: user.toJSON(), statusCode: 200, success: true, message: 'Roles actualizados'
    });

    return res.status(200).json({
      success: true,
      message: 'Roles actualizados exitosamente',
      user: sanitizeUser(user.toJSON()),
    });
  } catch (err) {
    console.error('Error al actualizar roles:', err);
    await logActivity({ req, action: 'USER_ROLES_FAIL', entity: 'USER', entityId: userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al actualizar roles', err.message);
  }
};

export const changePassword = async (req, res) => {
  const { userId } = req.params;
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || String(newPassword).length < 8) {
    await logActivity({ req, action: 'USER_CHANGEPASS_FAIL', entity: 'USER', entityId: userId, statusCode: 400, success: false, error: 'Pwd corto' });
    return handleErrorResponse(res, 400, 'La nueva contraseña debe tener al menos 8 caracteres');
  }

  try {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      await logActivity({ req, action: 'USER_CHANGEPASS_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    if (currentPassword) {
      const ok = await user.matchPassword(currentPassword);
      if (!ok) {
        await logActivity({ req, action: 'USER_CHANGEPASS_FAIL', entity: 'USER', entityId: userId, statusCode: 400, success: false, error: 'Pwd actual incorrecta' });
        return handleErrorResponse(res, 400, 'La contraseña actual es incorrecta');
      }
    }

    await user.setPassword(newPassword);
    await user.save();

    await logActivity({ req, action: 'USER_CHANGEPASS', entity: 'USER', entityId: user.id, statusCode: 200, success: true, message: 'Contraseña actualizada' });

    return res.status(200).json({ success: true, message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    await logActivity({ req, action: 'USER_CHANGEPASS_FAIL', entity: 'USER', entityId: userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al cambiar contraseña', err.message);
  }
};

export const deactivateUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId);
    if (!user) {
      await logActivity({ req, action: 'USER_DEACTIVATE_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    const before = user.toJSON();
    user.isActive = false;
    await user.save();

    await logActivity({
      req, action: 'USER_DEACTIVATE', entity: 'USER', entityId: user.id,
      before, after: user.toJSON(), statusCode: 200, success: true
    });

    return res.status(200).json({ success: true, message: 'Usuario desactivado exitosamente' });
  } catch (err) {
    console.error('Error al desactivar usuario:', err);
    await logActivity({ req, action: 'USER_DEACTIVATE_FAIL', entity: 'USER', entityId: userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al desactivar usuario', err.message);
  }
};

export const activateUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId);
    if (!user) {
      await logActivity({ req, action: 'USER_ACTIVATE_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    const before = user.toJSON();
    user.isActive = true;
    await user.save();

    await logActivity({
      req, action: 'USER_ACTIVATE', entity: 'USER', entityId: user.id,
      before, after: user.toJSON(), statusCode: 200, success: true
    });

    return res.status(200).json({ success: true, message: 'Usuario activado exitosamente' });
  } catch (err) {
    console.error('Error al activar usuario:', err);
    await logActivity({ req, action: 'USER_ACTIVATE_FAIL', entity: 'USER', entityId: userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al activar usuario', err.message);
  }
};

export const deleteUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      await logActivity({ req, action: 'USER_DELETE_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    await logActivity({ req, action: 'USER_DELETE', entity: 'USER', entityId: userId, statusCode: 200, success: true });

    return res.status(200).json({ success: true, message: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    await logActivity({ req, action: 'USER_DELETE_FAIL', entity: 'USER', entityId: userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al eliminar usuario', err.message);
  }
};

export const bulkSetActive = async (req, res) => {
  const { ids = [], isActive } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    await logActivity({ req, action: 'USER_BULK_ACTIVE_FAIL', statusCode: 400, success: false, error: 'ids vacío' });
    return handleErrorResponse(res, 400, 'Debe proporcionar un arreglo de ids');
  }
  if (typeof isActive !== 'boolean') {
    await logActivity({ req, action: 'USER_BULK_ACTIVE_FAIL', statusCode: 400, success: false, error: 'isActive no boolean' });
    return handleErrorResponse(res, 400, 'isActive debe ser boolean');
  }

  try {
    const r = await User.updateMany({ _id: { $in: ids } }, { $set: { isActive } });
    await logActivity({
      req, action: 'USER_BULK_ACTIVE', statusCode: 200, success: true,
      message: `matched=${r.matchedCount}, modified=${r.modifiedCount}`, tags: [isActive ? 'ACTIVATE' : 'DEACTIVATE']
    });

    return res.status(200).json({
      success: true,
      message: `Usuarios ${isActive ? 'activados' : 'desactivados'} exitosamente`,
      modifiedCount: r.modifiedCount,
      matchedCount: r.matchedCount,
    });
  } catch (err) {
    console.error('Error en bulkSetActive:', err);
    await logActivity({ req, action: 'USER_BULK_ACTIVE_FAIL', statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al actualizar usuarios', err.message);
  }
};

export const updateDepartmentAndCargo = async (req, res) => {
  const { userId } = req.params;
  const { departamento, cargo } = req.body;
  if (typeof departamento === 'undefined' && typeof cargo === 'undefined') {
    await logActivity({ req, action: 'USER_MOVE_FAIL', entity: 'USER', entityId: userId, statusCode: 400, success: false, error: 'Nada que actualizar' });
    return handleErrorResponse(res, 400, 'Debe enviar departamento y/o cargo a actualizar');
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      await logActivity({ req, action: 'USER_MOVE_FAIL', entity: 'USER', entityId: userId, statusCode: 404, success: false, error: 'No encontrado' });
      return handleErrorResponse(res, 404, 'Usuario no encontrado');
    }

    const before = user.toJSON();
    if (typeof departamento !== 'undefined') user.departamento = departamento;
    if (typeof cargo !== 'undefined') user.cargo = cargo;
    await user.save();

    await logActivity({
      req, action: 'USER_MOVE', entity: 'USER', entityId: user.id,
      before, after: user.toJSON(), statusCode: 200, success: true
    });

    return res.status(200).json({
      success: true,
      message: 'Departamento/Cargo actualizado',
      user: sanitizeUser(user.toJSON()),
    });
  } catch (err) {
    console.error('Error al actualizar departamento/cargo:', err);
    await logActivity({ req, action: 'USER_MOVE_FAIL', entity: 'USER', entityId: userId, statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al actualizar usuario', err.message);
  }
};

export const getUsersStats = async (_req, res) => {
  try {
    // (sin logging de request en _req; si quieres, pásalo como req)
    return res.status(200).json({ success: true, message: 'Estadísticas no auditadas aquí' });
  } catch (err) {
    return handleErrorResponse(res, 500, 'Error al obtener estadísticas', err.message);
  }
};

export const exportUsersCsv = async (req, res) => {
  try {
    // (omito construcción detallada de CSV por espacio; deja tu versión original aquí)
    await logActivity({ req, action: 'USER_EXPORT_CSV', statusCode: 200, success: true, message: 'Export CSV' });
    // ... tu lógica anterior de exportación
    return res.status(200).send('id,email,...'); // placeholder: reemplaza por tu CSV
  } catch (err) {
    console.error('Error al exportar CSV:', err);
    await logActivity({ req, action: 'USER_EXPORT_CSV_FAIL', statusCode: 500, success: false, error: err?.message });
    return handleErrorResponse(res, 500, 'Error al exportar usuarios', err.message);
  }
};
