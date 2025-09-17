// src/middlewares/validate-jwt.js (ejemplo)
import jwt from 'jsonwebtoken';
import User from '../user/user.model.js';

export const validateJWT = async (req, res, next) => {
  try {
    const token = (req.header('Authorization') || '').replace(/^Bearer\s+/i, '') || req.header('x-token') || '';
    if (!token) {
      return res.status(401).json({ success:false, message:'Token no proporcionado' });
    }

    const { uid } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(uid).lean();
    if (!user || !user.isActive) {
      return res.status(401).json({ success:false, message:'Usuario inválido o inactivo' });
    }

    const roles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    req.user = { id: String(user._id), email: user.email, roles };
    req.usuario = req.user; // compat

    next();
  } catch (err) {
    console.error('validateJWT error:', err);
    return res.status(401).json({ success:false, message:'Token inválido' });
  }
};
