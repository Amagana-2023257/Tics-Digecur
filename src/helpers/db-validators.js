import User from "../user/user.model.js";

/**
 * Verifica si un correo electrónico ya está registrado.
 * @param {String} email - Correo electrónico a verificar.
 * @throws {Error} Si el correo ya está registrado.
 */
export const emailExists = async (email = "") => {
  if (!email || typeof email !== 'string') {
    throw new Error("El correo electrónico debe ser una cadena no vacía.");
  }
  
  const existe = await User.findOne({ email }).select('_id');  // Solo devolver el _id para optimizar la consulta
  if (existe) {
    throw new Error(`El correo electrónico ${email} ya está registrado.`);
  }
};

/**
 * Verifica si un nombre de usuario ya está registrado.
 * @param {String} username - Nombre de usuario a verificar.
 * @throws {Error} Si el nombre de usuario ya está registrado.
 */
export const usernameExists = async (username = "") => {
  if (!username || typeof username !== 'string') {
    throw new Error("El nombre de usuario debe ser una cadena no vacía.");
  }

  const existe = await User.findOne({ username }).select('_id');  // Solo devolver el _id para optimizar la consulta
  if (existe) {
    throw new Error(`El nombre de usuario ${username} ya está registrado.`);
  }
};

/**
 * Verifica si el usuario con el ID proporcionado existe.
 * @param {String} uid - ID del usuario a verificar.
 * @throws {Error} Si el usuario no existe con el ID proporcionado.
 */
export const userExists = async (uid = "") => {
  if (!uid || typeof uid !== 'string') {
    throw new Error("El ID del usuario debe ser una cadena no vacía.");
  }

  const existe = await User.findById(uid).select('_id');  // Solo devolver el _id para optimizar la consulta
  if (!existe) {
    throw new Error("No existe un usuario con el ID proporcionado.");
  }
};