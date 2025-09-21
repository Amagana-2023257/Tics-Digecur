import mongoose from "mongoose";

const { Schema } = mongoose;

/* ============================================================================
   Catálogos / enums
============================================================================ */
export const MURAL_KINDS = ["NOTICIA", "EVENTO", "INFORMACION"];
export const MURAL_CONTENT_TYPES = ["TEXT", "TEXT_IMAGE", "TEXT_VIDEO", "IMAGE_ONLY"];
export const MURAL_STATUS = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

/* ============================================================================
   Sub-esquema de programación
   - publishFrom/publishTo: ventana general de publicación
   - recurrence:
       - freq: NONE | DAILY | WEEKLY
       - daysOfWeek: 0 (Dom) .. 6 (Sáb) (solo WEEKLY)
       - startTime/endTime: "HH:mm" (ventana diaria de visibilidad)
       - timezone: por simplicidad se asume timezone del servidor
============================================================================ */
const RecurrenceSchema = new Schema(
  {
    freq: { type: String, enum: ["NONE", "DAILY", "WEEKLY"], default: "NONE" },
    daysOfWeek: {
      type: [Number],
      validate: {
        validator: (arr) => !arr || arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 6),
        message: "daysOfWeek debe contener enteros entre 0 y 6",
      },
      default: undefined,
    },
    startTime: { type: String, match: [/^\d{2}:\d{2}$/, "startTime debe ser HH:mm"], default: undefined },
    endTime:   { type: String, match: [/^\d{2}:\d{2}$/, "endTime debe ser HH:mm"], default: undefined },
    timezone:  { type: String, trim: true, default: "America/Guatemala" },
  },
  { _id: false }
);

/* ============================================================================
   Esquema principal de Mural
============================================================================ */
const MuralSchema = new Schema(
  {
    // Identidad / clasificación
    title: { type: String, required: true, trim: true, index: true },
    slug:  { type: String, trim: true, index: true, default: undefined },
    kind:  { type: String, enum: MURAL_KINDS, default: "INFORMACION", index: true },

    // Formato de contenido
    contentType: { type: String, enum: MURAL_CONTENT_TYPES, required: true, index: true },

    // Contenido
    body: { type: String, trim: true, default: "" }, // texto enriquecido simple (HTML/markdown plano)
    mainImageUrl: { type: String, trim: true, default: undefined },
    galleryUrls: {
      type: [String],
      default: [],
      set: (arr) => (Array.isArray(arr) ? arr.map(String).map((s) => s.trim()).filter(Boolean) : []),
    },
    videoUrl: { type: String, trim: true, default: undefined },
    youtubeId: { type: String, trim: true, default: undefined },

    // Programación
    publishFrom: { type: Date, index: true, default: undefined },
    publishTo:   { type: Date, index: true, default: undefined },
    recurrence:  { type: RecurrenceSchema, default: () => ({}) },

    // Estado / orden
    status:   { type: String, enum: MURAL_STATUS, default: "DRAFT", index: true },
    isActive: { type: Boolean, default: true, index: true },
    isPinned: { type: Boolean, default: false, index: true },
    priority: { type: Number, default: 0, index: true },

    // Auditoría / métricas
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    views:     { type: Number, default: 0 },
    clicks:    { type: Number, default: 0 },
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
============================================================================ */
function emptyToUndef(v) {
  if (v === "") return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  return v;
}

MuralSchema.pre("validate", function normalizeOptionalStrings() {
  this.slug        = emptyToUndef(this.slug);
  this.mainImageUrl = emptyToUndef(this.mainImageUrl);
  this.videoUrl     = emptyToUndef(this.videoUrl);
  this.youtubeId    = emptyToUndef(this.youtubeId);
  if (this.recurrence) {
    this.recurrence.startTime = emptyToUndef(this.recurrence.startTime);
    this.recurrence.endTime   = emptyToUndef(this.recurrence.endTime);
    this.recurrence.timezone  = emptyToUndef(this.recurrence.timezone) ?? "America/Guatemala";
  }
});

/* ============================================================================
   Índices útiles
============================================================================ */
MuralSchema.index(
  { title: "text", body: "text" },
  { name: "mural_text_idx", default_language: "spanish" }
);
MuralSchema.index({ createdAt: -1 });
MuralSchema.index({ updatedAt: -1 });
MuralSchema.index({ isPinned: -1, priority: -1, publishFrom: -1 });

/* ============================================================================
   Modelo
============================================================================ */
const Mural = mongoose.models.Mural || mongoose.model("Mural", MuralSchema);
export default Mural;
