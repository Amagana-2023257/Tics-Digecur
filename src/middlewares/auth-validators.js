// src/middlewares/auth-validators.js
import { body } from 'express-validator';

// Validador para registro
export const registerValidator = [
  body('email')
    .isEmail().withMessage('Correo inválido')
    .normalizeEmail(),
  body('password')
    .isString().withMessage('Contraseña inválida')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('nombre')
    .isString().withMessage('Nombre inválido')
    .isLength({ min: 2 }).withMessage('El nombre es muy corto'),
  body('departamento')
    .isString().withMessage('Departamento inválido')
    .notEmpty().withMessage('El departamento es obligatorio'),
  body('cargo')
    .optional()
    .isString().withMessage('Cargo inválido')
    .isLength({ max: 120 }).withMessage('El cargo es muy largo'),
];

// Validador para login
export const loginValidator = [
  body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
  body('password').isString().withMessage('Contraseña inválida'),
];
