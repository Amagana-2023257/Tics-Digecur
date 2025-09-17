// models/item.model.js
import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema(
  {
    noBien:        { type: String, required: true, unique: true, trim: true },
    nombreBien:    { type: String, required: true, trim: true },
    descripcion:   { type: String, trim: true, default: '' },

    // Mantén el nombre legible...
    responsable:   { type: String, trim: true, default: '' },
    // ...y guarda también el ID del usuario responsable
    responsableId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    observaciones: { type: String, trim: true, default: '' },
    numeroTarjeta: { type: String, trim: true, default: '' },
    monto:         { type: Number, min: 0, default: undefined },
    isActive:      { type: Boolean, default: true },
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

/* ===================== Normalización ===================== */
const normalizeFields = (obj) => {
  if (!obj) return;
  if (obj.noBien != null) obj.noBien = String(obj.noBien).trim().toUpperCase();
  if (obj.nombreBien != null) obj.nombreBien = String(obj.nombreBien).trim();
  if (obj.responsable != null) obj.responsable = String(obj.responsable).trim();
  if (obj.monto === '' || obj.monto === null) delete obj.monto; // evita forzar 0
};

ItemSchema.pre('save', function (next) { normalizeFields(this); next(); });
ItemSchema.pre('findOneAndUpdate', function (next) { normalizeFields(this._update || {}); next(); });
ItemSchema.pre('updateOne', function (next) { normalizeFields(this.getUpdate() || {}); next(); });

/* ===================== Índices ===================== */
// Unicidad en noBien
ItemSchema.index({ noBien: 1 }, { unique: true });

// Búsqueda de texto (en campos de string)
ItemSchema.index({
  noBien: 'text',
  nombreBien: 'text',
  descripcion: 'text',
  responsable: 'text',
  numeroTarjeta: 'text',
});

// Index útil para filtrar por responsableId
ItemSchema.index({ responsableId: 1 });

/* ===== (Opcional) Auto-fijar índices correctos al arrancar ===== */
ItemSchema.statics.ensureCorrectIndexes = async function ensureCorrectIndexes() {
  try {
    const idxs = await this.collection.indexes();
    // Si queda algún índice legacy en "codigo", elimínalo
    if (idxs.some((i) => i.name === 'codigo_1')) {
      await this.collection.dropIndex('codigo_1');
    }
    await this.createIndexes();
  } catch (e) {
    console.warn('[InventoryItem.ensureCorrectIndexes] advertencia:', e?.message);
  }
};

const InventoryItem = mongoose.model('InventoryItem', ItemSchema, 'inventoryitems');
export default InventoryItem;
