// models/TransferRequest.model.js
import mongoose from "mongoose";

export const TRANSFER_STATUS = Object.freeze(["PENDING", "APPROVED", "REJECTED"]);

const TransferRequestSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    motivo: { type: String, trim: true, maxlength: 500, default: "" },
    // 👇 quité `index: true` para evitar el warning por índice duplicado
    status: { type: String, enum: TRANSFER_STATUS, default: "PENDING" },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
    rejectionReason: { type: String, trim: true, default: "" },
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

// Índices
TransferRequestSchema.index({ item: 1, status: 1 });
TransferRequestSchema.index({ createdAt: -1 });

const TransferRequest = mongoose.model("TransferRequest", TransferRequestSchema);
export default TransferRequest;
