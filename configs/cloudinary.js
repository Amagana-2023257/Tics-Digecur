// cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

// Cargar las variables del archivo .env
dotenv.config();

// Configuración de Cloudinary
const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};

console.log('Iniciando conexión a Cloudinary...');

try {
  cloudinary.config(cloudinaryConfig);
  console.log('Conexión establecida a Cloudinary');
} catch (err) {
  console.error('Conexión fallida a Cloudinary', err);
}

// Exportar el cliente de Cloudinary configurado
export { cloudinary };
