// src/config/mongo.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const { MONGODB_URI } = process.env;

export const connectMongo = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✔️  MongoDB conectado correctamente');
  } catch (err) {
    console.error('❌ Error al conectar MongoDB:', err);
    process.exit(1);
  }
};
