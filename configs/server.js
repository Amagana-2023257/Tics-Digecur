import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import crypto from 'crypto';

import { swaggerDocs, swaggerUi } from './swagger.js';
import apiLimiter from '../src/middlewares/rate-limit-validator.js';

import authRoutes from '../src/auth/auth.routes.js';
import userRoutes from '../src/user/user.routes.js';
import cardexRouter, { mountCardexStatic } from '../src/cardex/cardex.routes.js';
import inventoryRoutes from '../src/Inventory/inventory.routes.js';

import auditApiRoutes from '../src/movements/audit.routes.js';     // API JSON de auditoría
import { mountAuditUI } from '../src/movements/audit.ui.routes.js'; // UI propietario embebido

import { ensureDefaultAdmin } from '../src/bootstrap/ensure-admin.js';
import { connectMongo } from './mongo.js';
import { attachAudit } from '../src/movements/movement.controller.js';

const { PORT = 3000, CORS_ORIGIN } = process.env;

const middlewares = (app) => {
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.urlencoded({ extended: false, limit: '10mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(compression());

  // Nonce por request (para CSP)
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  app.use(cors({
    origin: CORS_ORIGIN ? CORS_ORIGIN.split(',') : true,
    credentials: true,
  }));

  // Helmet con CSP general (sin inline). La UI /audit fijará cabecera con nonce por respuesta.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"], // inline sólo con nonce en /audit
        "style-src": ["'self'"],  // inline sólo con nonce en /audit
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        // Si vas a embeber PDFs por iframe: "frame-src": ["'self'"],
      }
    },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-site" },
    frameguard: { action: "sameorigin" },
  }));

  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(apiLimiter);

  // Archivos Cardex (static)
  mountCardexStatic(app);

  // Auditoría global de todas las requests (HTTP_REQUEST)
  attachAudit(app);
};

const routes = (app) => {
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // API
  app.use('/digecur/v1/auth', authRoutes);
  app.use('/digecur/v1/users', userRoutes);
  app.use('/digecur/v1/inventory', inventoryRoutes);
  app.use('/digecur/v1/cardex', cardexRouter);

  // Auditoría: API + UI propietario (tipo Swagger, embebido)
  app.use('/digecur/v1/audit', auditApiRoutes);  // Endpoints JSON con JWT + roles
  mountAuditUI(app);                              // UI HTML/JS/CSS inline con nonce

  // (Opcional) Swagger real para tu API REST (no la UI propietaria)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

  // 404
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));
};

export const initServer = async () => {
  const app = express();
  try {
    middlewares(app);
    await connectMongo();
    await ensureDefaultAdmin();
    routes(app);

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error(`Error en la inicialización del servidor:`, err);
    process.exit(1);
  }
};
