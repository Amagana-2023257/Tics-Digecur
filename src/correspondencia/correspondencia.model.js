// src/correspondencia/correspondencia.model.js
import mongoose from 'mongoose';
import { DEPARTAMENTOS, ROLES } from '../user/user.model.js';

/* === Estados EXACTOS que usa el controller === */
export const CORR_ESTADOS = Object.freeze({
  EN_RECEPCION: 'EN_RECEPCION',

  EN_DIRECCION_POR_INSTRUIR: 'EN_DIRECCION_POR_INSTRUIR',
  EN_DIRECCION_POR_REASIGNAR: 'EN_DIRECCION_POR_REASIGNAR',

  EN_SUBDIRECCION_POR_RECIBIR: 'EN_SUBDIRECCION_POR_RECIBIR',
  RECIBIDO_EN_SUBDIRECCION: 'RECIBIDO_EN_SUBDIRECCION',

  EN_DEPARTAMENTO_POR_RECIBIR: 'EN_DEPARTAMENTO_POR_RECIBIR',
  RECIBIDO_EN_DEPARTAMENTO: 'RECIBIDO_EN_DEPARTAMENTO',

  ASIGNADO_A_TECNICO: 'ASIGNADO_A_TECNICO',
  EN_TRABAJO_TECNICO: 'EN_TRABAJO_TECNICO',
  RESUELTO_POR_TECNICO: 'RESUELTO_POR_TECNICO',

  EN_SUBDIRECCION_REVISION: 'EN_SUBDIRECCION_REVISION',
  EN_DIRECCION_REVISION_FINAL: 'EN_DIRECCION_REVISION_FINAL',

  EN_RECEPCION_PARA_ARCHIVO: 'EN_RECEPCION_PARA_ARCHIVO',
  ARCHIVADO: 'ARCHIVADO',

  EN_RECEPCION_CORRECCION: 'EN_RECEPCION_CORRECCION',
});

/* === Subdirecciones válidas (coinciden con lo que usas) === */
export const SUBDIRS = Object.freeze([
  'SUBDIRECCION EVALUACION CURRICULAR',
  'SUBDIRECCION DISEÑO Y DESAROLLO CURRICULAR',
]);

/* === Departamentos que NO pasan por subdirección === */
export const DEPTS_SIN_SUBDIRECTOR = Object.freeze([
  'AREA FINANCIERA',
  'AREA DE MATERIALES EDUCATIVOS',
  'AREA ADMINISTRATIVA',
]);

/* === Mapa subdirección -> departamentos (jefaturas) === */
// OJO: en tu catálogo usas "DESAROLLO" (una sola R) y así debe quedar aquí.
export const SUBDIR_MAP = Object.freeze({
  'SUBDIRECCION EVALUACION CURRICULAR': ['PRIMARIA', 'EVALUACION', 'DESAROLLO'],
  'SUBDIRECCION DISEÑO Y DESAROLLO CURRICULAR': [
    'INICIAL Y PREPRIMARIA',
    'BASICO',
    'DIVERSIFICADO',
  ],
});

/* === Historial de auditoría === */
const HistEventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true },
    fromState: { type: String },
    toState: { type: String },
    notes: { type: String },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorDept: { type: String, enum: DEPARTAMENTOS, required: false },
    actorRole: { type: String, enum: ROLES, required: false },
  },
  { _id: false }
);

/* === Esquema de correspondencia === */
const CorrespondenciaSchema = new mongoose.Schema(
  {
    // Ingreso/Recepción
    regExpediente: { type: String, trim: true },
    confirmacion: { type: Boolean, default: false },
    movimiento: {
      type: String,
      enum: ['RECIBIDO', 'ENVIADO'],
      default: 'RECIBIDO',
    },
    documentoRecibido: { type: String, trim: true },
    enviadoPor: { type: String, trim: true },
    foliosRecibidos: { type: Number, min: 0, default: 0 },
    observaciones: { type: String, trim: true },
    profesionales: [{ type: String, trim: true }],
    onedriveUrl: { type: String, required: true, trim: true },

    // Dirección
    instruccionesDireccion: { type: String, trim: true },

    // Destino fijado por Dirección
    destinoTipo: {
      type: String,
      enum: ['SUBDIRECCION', 'DEPARTAMENTO', null],
      default: null,
    },
    destinoSubdireccion: { type: String, enum: SUBDIRS.concat([null]) },
    destinoDepartamento: { type: String, enum: DEPARTAMENTOS.concat([null]) },

    // Asignaciones
    jefeAsignadoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    jefeAsignadoLabel: { type: String, trim: true },
    tecnicoAsignadoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tecnicoAsignadoLabel: { type: String, trim: true },

    // Estado y ownership (para bandejas)
    estado: {
      type: String,
      enum: Object.values(CORR_ESTADOS),
      default: CORR_ESTADOS.EN_RECEPCION,
      index: true,
    },
    ownerDept: {
      type: String,
      enum: DEPARTAMENTOS,
      default: 'AREA ADMINISTRATIVA',
      index: true,
    },
    ownerRole: {
      type: String,
      enum: ROLES,
      default: 'ASISTENTE',
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // Auditoría
    historial: { type: [HistEventSchema], default: [] },

    // Flags
    isActive: { type: Boolean, default: true },

    // Metas
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

/* Índices útiles para bandejas/búsquedas */
CorrespondenciaSchema.index({ estado: 1, ownerDept: 1, ownerRole: 1, updatedAt: -1 });
CorrespondenciaSchema.index({ regExpediente: 1 });
CorrespondenciaSchema.index({ documentoRecibido: 1 });

const Correspondencia = mongoose.model('Correspondencia', CorrespondenciaSchema);
export default Correspondencia;
