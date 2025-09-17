// src/models/User.js
import mongoose from 'mongoose';
import argon2 from 'argon2';

// Enums básicos (puedes extenderlos)
export const DEPARTAMENTOS = Object.freeze([
  'DIRECCION',
  'MATERIALES_EDUCATIVOS',
  'INVENTARIO',
  'ASISTENCIA',
  'EVALUACION',
]);

export const ROLES = Object.freeze([
  'ADMIN',
  'DIRECTOR',
  'MATERIALES',
  'INVENTARIO',
  'ASISTENCIA',
  'EVALUACION',
  'LECTOR', // por defecto solo lectura
]);

const PEPPER = process.env.PASSWORD_PEPPER || '';
const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MB
  timeCost: 3,
  parallelism: 1,
};

function withPepper(plain) {
  return `${plain}${PEPPER}`;
}

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Correo inválido'],
    },
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      minlength: [2, 'El nombre es muy corto'],
      maxlength: [100, 'El nombre es muy largo'],
    },
    cargo: {
      type: String,
      trim: true,
      maxlength: [120, 'El cargo es muy largo'],
      default: '',
    },
    departamento: {
      type: String,
      enum: DEPARTAMENTOS,
      required: [true, 'El departamento es obligatorio'],
    },
    roles: {
      type: [String],
      enum: ROLES,
      default: ['LECTOR'],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Debe existir al menos un rol',
      },
    },
    // Seguridad
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria'],
      minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
      select: false,
    },
    // Estado & auditoría
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    lastPasswordChangeAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.password;
        return ret;
      },
    },
  }
);

// Índice único para email (case-insensitive)
UserSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

// Hash con Argon2 si cambia el password
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await argon2.hash(withPepper(this.password), ARGON_OPTS);
    this.lastPasswordChangeAt = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

// Métodos de instancia
UserSchema.methods.matchPassword = function (candidate) {
  return argon2.verify(this.password, withPepper(candidate));
};

UserSchema.methods.setPassword = async function (newPlainPassword) {
  this.password = newPlainPassword;
  this.lastPasswordChangeAt = new Date();
};

const User = mongoose.model('User', UserSchema);
export default User;
