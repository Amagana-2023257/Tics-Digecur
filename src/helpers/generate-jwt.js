// src/helpers/generate-jwt.js
import jwt from 'jsonwebtoken';

export const generateJWT = (uid = '') =>
  new Promise((resolve, reject) => {
    const secret = process.env.JWT_SECRET;
    if (!secret || !secret.trim()) {
      return reject(new Error('JWT_SECRET no está definido'));
    }

    const payload = { uid };
    const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

    jwt.sign(payload, secret, { expiresIn }, (err, token) => {
      if (err) {
        return reject(err);
      }
      resolve(token);
    });
  });
