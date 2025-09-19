// src/cardex/cardex.model.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* ============================================================================
   Catálogo de categorías públicas para validación
============================================================================ */
export const CARDEX_CATS = [
  "DOCUMENTO",
  "LIBRO",
  "INFORME",
  "MANUAL",
  "OTRO",
  "BIFOLIAR",
  "FOLLETO",
  "MODULOS",
  "GUIAS",
  "INSTRUCTIVO",
  "FASCICULOS",
];

/* ============================================================================
   Esquema
============================================================================ */
const CardexSchema = new Schema(
  {
    titulo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    descripcion: {
      type: String,
      trim: true,
      default: "",
    },

    categoria: {
      type: String,
      enum: CARDEX_CATS,
      default: "DOCUMENTO",
      index: true,
    },

    tags: {
      type: [String],
      default: [],
      set: (arr) =>
        Array.isArray(arr)
          ? arr.map(String).map((s) => s.trim()).filter(Boolean)
          : [],
    },

    // Fuente / proveedor del recurso
    provider: {
      type: String, // 'onedrive' | 'legacy' | 'external' (opcional)
      trim: true,
      default: undefined,
      index: true,
    },

    // URL externa del archivo (OneDrive/SharePoint/lo que sea)
    onedriveUrl: {
      type: String,
      trim: true,
      default: undefined, // MUY IMPORTANTE para no insertar "" y chocar con el índice único
    },

    // Legacy: nombre de archivo guardado localmente (si es que existe)
    fileName: {
      type: String,
      trim: true,
      default: undefined, // igual: evitar "" persistente
    },

    // Metadatos opcionales
    originalName: { type: String, trim: true, default: undefined },
    mimeType: { type: String, trim: true, default: undefined },
    size: { type: Number, default: undefined },

    // Fechas del documento / año (para filtrado)
    fechaDocumento: { type: Date, index: true, default: undefined },
    anioDocumento: { type: Number, min: 1800, max: 3000, index: true },

    // Auditoría / estado
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    isActive: { type: Boolean, default: true, index: true },
    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    minimize: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/* ============================================================================
   Normalización: convertir "" en undefined en campos opcionales
   (evita colisiones con los índices únicos parciales)
============================================================================ */
function emptyToUndef(v) {
  if (v === "") return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  return v;
}

CardexSchema.pre("validate", function normalizeOptionalStrings() {
  this.onedriveUrl = emptyToUndef(this.onedriveUrl);
  this.fileName = emptyToUndef(this.fileName);
  this.originalName = emptyToUndef(this.originalName);
  this.mimeType = emptyToUndef(this.mimeType);
  this.provider = emptyToUndef(this.provider);
  // Si llega categoria vacía por error, déjala como undefined y caerá en default/enum
  this.categoria = emptyToUndef(this.categoria) ?? this.categoria;
});

/* ============================================================================
   Índices
   - Texto para búsqueda
   - Únicos parciales para onedriveUrl / fileName (solo cuando tengan un string no vacío)
============================================================================ */
CardexSchema.index(
  { titulo: "text", descripcion: "text", originalName: "text", tags: "text" },
  { name: "cardex_text_idx", default_language: "spanish" }
);

// Unicidad SOLO si hay string no vacío
CardexSchema.index(
  { onedriveUrl: 1 },
  {
    unique: true,
    name: "uniq_onedriveUrl_nonempty",
    partialFilterExpression: { onedriveUrl: { $type: "string", $ne: "" } },
  }
);

// Para legacy local: también único solo si hay string no vacío
CardexSchema.index(
  { fileName: 1 },
  {
    unique: true,
    name: "uniq_fileName_nonempty",
    partialFilterExpression: { fileName: { $type: "string", $ne: "" } },
  }
);

// Aceleradores de consulta
CardexSchema.index({ createdAt: -1 });
CardexSchema.index({ updatedAt: -1 });

/* ============================================================================
   Modelo
============================================================================ */
const Cardex =
  mongoose.models.Cardex || mongoose.model("Cardex", CardexSchema);

export default Cardex;
