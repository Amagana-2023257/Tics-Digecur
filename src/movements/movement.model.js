// src/movements/movement.model.js
import mongoose from 'mongoose';

const MovementSchema = new mongoose.Schema(
  {
    action:   { type: String, required: true, index: true },    
    entity:   { type: String, default: null, index: true },    
    entityId: { type: String, default: null, index: true },

    user: {
      id:    { type: String, default: null, index: true },
      email: { type: String, default: null, index: true },
      nombre:{ type: String, default: null },
      roles: [{ type: String }],
    },

    request: {
      method:    { type: String },
      path:      { type: String, index: true },
      query:     mongoose.Schema.Types.Mixed,
      body:      mongoose.Schema.Types.Mixed,
      params:    mongoose.Schema.Types.Mixed,
      ip:        { type: String, index: true },
      userAgent: { type: String },
    },

    response: {
      statusCode: { type: Number, index: true },
      success:    { type: Boolean, index: true },
      message:    { type: String },
      error:      { type: String },
    },

    changes: {
      before: mongoose.Schema.Types.Mixed,
      after:  mongoose.Schema.Types.Mixed,
      diff:   mongoose.Schema.Types.Mixed, 
    },

    tags: [{ type: String, index: true }],
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    versionKey: false,
  }
);

MovementSchema.index({ createdAt: -1 });
MovementSchema.index({ action: 1, createdAt: -1 });
MovementSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

const Movement = mongoose.model('Movement', MovementSchema);
export default Movement;
