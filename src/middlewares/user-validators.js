import { body, param, validationResult } from "express-validator"; 
import { validarCampos } from "./validate-fields.js";
import { handleErrors } from "./handle-errors.js";
import { emailExists, usernameExists } from "../helpers/db-validators.js";

export const registerValidator = [
  // Nombre de usuario: requerido, mínimo 3 caracteres, y verificar que no exista ya
  body("username")
    .notEmpty().withMessage("El nombre de usuario es requerido")
    .isLength({ min: 3 }).withMessage("El nombre de usuario debe tener al menos 3 caracteres")
    .custom(async (value) => {
      const exists = await usernameExists(value);
      if (exists) {
        throw new Error("El nombre de usuario ya está registrado");
      }
      return true;
    }),

  // Email: requerido, formato de email, y verificar que no exista ya
  body("email")
    .notEmpty().withMessage("El email es requerido")
    .isEmail().withMessage("No es un email válido")
    .custom(async (value) => {
      const exists = await emailExists(value);
      if (exists) {
        throw new Error("El correo ya está registrado");
      }
      return true;
    }),

  // Contraseña: requerida y debe cumplir con la política de fortaleza
  body("password")
    .notEmpty().withMessage("La contraseña es requerida")
    .isStrongPassword({
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    }).withMessage("La contraseña debe tener al menos 8 caracteres, con mayúsculas, números y símbolos"),

  // Fecha de nacimiento: opcional, formato ISO (YYYY-MM-DD)
  body("dateOfBirth")
    .optional()
    .isISO8601().withMessage("La fecha de nacimiento no es válida"),

  // Biografía: opcional, se espera texto
  body("bio")
    .optional()
    .isString().withMessage("La biografía debe ser un texto"),
];


// Validador de inicio de sesión
export const loginValidator = [
  body("email")
    .notEmpty()
    .withMessage("El correo electrónico es requerido")
    .isEmail()
    .withMessage("El correo electrónico no es válido")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("La contraseña es requerida"),
  validarCampos,
  handleErrors,
];

// Validador para obtener un usuario por ID
export const getUserByIdValidator = [
  param("id")
    .isMongoId()
    .withMessage("No es un ID válido de MongoDB"),
  validarCampos,
  handleErrors,
];

// Validador para actualizar un usuario
export const updateUserValidator = [
  body("username")
    .optional()
    .isLength({ min: 3 })
    .withMessage("El nombre de usuario debe tener al menos 3 caracteres")
    .custom(usernameExists), // Verificamos si el nombre de usuario ya existe
  body("bio")
    .optional()
    .isLength({ max: 160 })
    .withMessage("La biografía no debe exceder los 160 caracteres"),
  body("dateOfBirth")
    .optional()
    .isDate()
    .withMessage("La fecha de nacimiento no es válida"),
  body("password")
    .optional()
    .isLength({ min: 6 })
    .withMessage("La contraseña debe tener al menos 6 caracteres"),
  body("profilePicture")
    .optional()
    .isURL()
    .withMessage("La foto de perfil debe ser una URL válida"),
  validarCampos,
  handleErrors,
];

// Validador para actualizar los detalles del usuario por ID
export const updateUserDetailsByIdValidator = [
  param("id")
    .isMongoId()
    .withMessage("No es un ID válido de MongoDB"),
  body("username")
    .optional()
    .isLength({ min: 3 })
    .withMessage("El nombre de usuario debe tener al menos 3 caracteres")
    .custom(usernameExists),
  body("bio")
    .optional()
    .isLength({ max: 160 })
    .withMessage("La biografía no debe exceder los 160 caracteres"),
  body("dateOfBirth")
    .optional()
    .isDate()
    .withMessage("La fecha de nacimiento no es válida"),
  body("password")
    .optional()
    .isLength({ min: 6 })
    .withMessage("La contraseña debe tener al menos 6 caracteres"),
  body("profilePicture")
    .optional()
    .isURL()
    .withMessage("La foto de perfil debe ser una URL válida"),
  validarCampos,
  handleErrors,
];

// Validador para eliminar un usuario (sin validaciones adicionales)
export const deleteUserValidator = [
  validarCampos,
  handleErrors,
];
