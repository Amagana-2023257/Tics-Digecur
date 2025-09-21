// src/middlewares/multer-uploads.js

import multer from 'multer';
import { cloudinary } from '../../configs/cloudinary.js';
import { Readable } from 'stream';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import path from 'path';

// --- 1) Configuración básica ---
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Solo se aceptan imágenes válidas'));
  }
  cb(null, true);
};

// NUEVOS: un campo 'image' por entidad con imagen
export const uploadDepartmentImage = multer({ storage, fileFilter }).single('image');
export const uploadNewsImage = multer({ storage, fileFilter }).single('image');

// --- 2) Helper para streaming a Cloudinary ---
const bufferToStream = buffer => {
  const s = new Readable();
  s.push(buffer);
  s.push(null);
  return s;
};

// --- 3) Upload simplificado y seguro ---
export const uploadToCloudinary = async (req, folder = 'profile-pictures') => {
  const file = req.file;
  if (!file?.buffer) {
    throw new Error('No se subió ningún archivo');
  }
  const buffer = file.buffer;
  const originalName = file.originalname;

  // 3.1 Verificar magic bytes
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !type.mime.startsWith('image/')) {
    throw new Error('El archivo no es una imagen válida');
  }

  // 3.2 Verificar metadata con sharp
  try {
    await sharp(buffer).metadata();
  } catch {
    throw new Error('No se pudo procesar como imagen');
  }

  // 3.3 Comprimir manteniendo resolución
  let processed;
  if (type.mime === 'image/jpeg' || type.mime === 'image/jpg') {
    processed = await sharp(buffer)
      .jpeg({ quality: 75 })
      .toBuffer();
  } else if (type.mime === 'image/png') {
    processed = await sharp(buffer)
      .png({ compressionLevel: 8 })
      .toBuffer();
  } else {
    processed = await sharp(buffer)
      .jpeg({ quality: 75 })
      .toBuffer();
  }

  // 3.4 Subir a Cloudinary
  return new Promise((resolve, reject) => {
    const publicId = `${folder}/${path.parse(originalName).name}-${Date.now()}`;
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'image' },
      (err, result) => {
        if (err) {
          console.error('Error al subir a Cloudinary:', err);
          return reject(new Error('Error al subir imagen'));
        }
        resolve(result.secure_url);
      }
    );
    bufferToStream(processed).pipe(uploadStream);
  });
};
