// server/index.js  (o donde tengas el código que mostraste)
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
import cardexRouter from '../src/cardex/cardex.routes.js';
import inventoryRoutes from '../src/Inventory/inventory.routes.js';

import auditApiRoutes from '../src/movements/audit.routes.js';
import { mountAuditUI } from '../src/movements/audit.ui.routes.js';

import { ensureDefaultAdmin } from '../src/bootstrap/ensure-admin.js';
import { connectMongo } from './mongo.js';
import { attachAudit } from '../src/movements/movement.controller.js';



const { PORT = 3000, CORS_ORIGIN } = process.env;

const middlewares = (app) => {
  app.use(express.urlencoded({ extended: false, limit: '10mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(compression());

  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  app.use(cors({
    origin: CORS_ORIGIN ? CORS_ORIGIN.split(',') : true,
    credentials: true,
  }));

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"], // inline sólo con nonce en /audit
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
      }
    },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-site" },
    frameguard: { action: "sameorigin" },
  }));

  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(apiLimiter);


  attachAudit(app);
};

const routes = (app) => {
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.use('/digecur/v1/auth', authRoutes);
  app.use('/digecur/v1/users', userRoutes);
  app.use('/digecur/v1/inventory', inventoryRoutes);
  app.use('/digecur/v1/cardex', cardexRouter);

  app.use('/digecur/v1/audit', auditApiRoutes);
  mountAuditUI(app);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));


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
