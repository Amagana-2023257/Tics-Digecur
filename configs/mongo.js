// src/config/mongo.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const { MONGODB_URI } = process.env;

// fuerza agregar query param si falta
function withParam(uri, key, value) {
  if (!uri.includes(`${key}=`)) {
    const sep = uri.includes('?') ? '&' : '?';
    return `${uri}${sep}${key}=${encodeURIComponent(value)}`;
  }
  return uri;
}

const FINAL_URI = [
  ['authSource', 'admin'],
  // Firestore Mongo API usa LB por 443; ya lo tienes en la URI.
  // Si no lo tuvieras: ['loadBalanced', 'true'],
].reduce((u, [k, v]) => withParam(u, k, v), MONGODB_URI);

// Opciones recomendadas para Firestore Mongo API / LB 443
const connectOpts = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  family: 4, // evita IPv6 raras en redes locales
  // tls queda tomado desde la URI (&tls=true)
};

mongoose.set('strictQuery', true);
// Activa logs del driver si necesitas diagnosticar (puedes comentar luego)
// mongoose.set('debug', true);

export const connectMongo = async () => {
  try {
    await mongoose.connect(FINAL_URI, connectOpts);
    console.log('✔️  MongoDB conectado correctamente');
  } catch (err) {
    console.error('❌ Error al conectar MongoDB:', err);
    process.exit(1);
  }
};
