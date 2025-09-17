// src/routes/auth.routes.js
import { Router } from 'express';
import { register, login, me } from './auth.controller.js';
import { registerValidator, loginValidator } from '../middlewares/auth-validators.js';
import { validateJWT } from '../middlewares/validate-jwt.js';

const router = Router();

router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.get('/me', validateJWT, me);

export default router;
