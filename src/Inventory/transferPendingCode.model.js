// src/Inventory/transferPendingCode.model.js
import mongoose from 'mongoose';

const TransferPendingCodeSchema = new mongoose.Schema({
  inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransferRequest' }, // se rellena al confirmar
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  motivo: { type: String, default: '' },

  // Código
  codePlain: { type: String }, // ⚠️ para producción, usa SOLO hash (opcional mostrar en admin)
  codeHash: { type: String },

  // Email + vencimiento
  sentEmail: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },

  // Estado
  resolvedAt: { type: Date }, // se setea al confirmar o cancelar
}, { timestamps: true });

TransferPendingCodeSchema.index({ itemId: 1, toUserId: 1, resolvedAt: 1 });
TransferPendingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { resolvedAt: { $exists: false } } });
// ^ Opcional TTL para borrar automáticamente invitaciones expiradas (MongoDB TTL index)

export default mongoose.model('TransferPendingCode', TransferPendingCodeSchema);
