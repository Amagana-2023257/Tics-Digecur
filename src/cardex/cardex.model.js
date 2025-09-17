import mongoose from 'mongoose';

export const CARDEX_CATS = Object.freeze([
  'LIBRO',
  'DOCUMENTO',
  'INFORME',
  'MANUAL',
  'OTRO',
  // nuevas
  'BIFOLIAR',
  'FOLLETO',
  'MODULOS',
  'GUIAS',
  'INSTRUCTIVO',
  'FASCICULOS',
]);

const normalizaTags = (val) => {
  if (Array.isArray(val)) {
    return val.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    return val.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const CardexSchema = new mongoose.Schema(
  {
    // Metadatos
    titulo: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: [200, 'El título es muy largo'],
    },
    descripcion: {
      type: String,
      trim: true,
      default: '',
    },
    categoria: {
      type: String,
      enum: CARDEX_CATS,
      default: 'DOCUMENTO',
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      set: normalizaTags, // asegura strings limpios
    },

    // Archivo físico
    fileName: {
      type: String,
      required: [true, 'fileName es obligatorio'],
      trim: true,
      unique: true,
      index: true,
    },
    originalName: {
      type: String,
      required: [true, 'originalName es obligatorio'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'mimeType es obligatorio'],
      trim: true,
    },
    size: {
      type: Number,
      required: [true, 'size es obligatorio'],
      min: [0, 'Tamaño inválido'],
    },

    // Atributos nuevos: fecha y año de creación del documento
    fechaDocumento: {
      type: Date,
      default: null,
      index: true,
    },
    anioDocumento: {
      type: Number,
      min: [1800, 'Año inválido'],
      max: [3000, 'Año inválido'],
      default: function () {
        if (this.fechaDocumento instanceof Date && !isNaN(this.fechaDocumento)) {
          return this.fechaDocumento.getUTCFullYear();
        }
        return undefined;
      },
      index: true,
    },

    // Auditoría / estado
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    downloads: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

/* =========================
 * Índices
 * =======================*/

// Índice de texto SOLO en campos string (¡sin arrays!)
// default_language "spanish" para stemming/búsqueda en español.
CardexSchema.index(
  { titulo: 'text', descripcion: 'text', originalName: 'text' },
  {
    weights: { titulo: 6, descripcion: 3, originalName: 2 },
    default_language: 'spanish',
    name: 'cardex_text_v2',
  }
);

// Búsquedas por etiqueta -> multikey (arrays soportados)
CardexSchema.index({ tags: 1 }, { name: 'cardex_tags_idx' });

// Compuesto útil para listados/filtrado reciente
CardexSchema.index(
  { categoria: 1, isActive: 1, createdAt: -1 },
  { name: 'cardex_filters_idx' }
);

// Índices para la nueva metadata temporal
CardexSchema.index({ anioDocumento: 1 }, { name: 'cardex_year_idx' });
CardexSchema.index({ fechaDocumento: -1 }, { name: 'cardex_date_idx' });

const Cardex = mongoose.model('Cardex', CardexSchema);
export default Cardex;
