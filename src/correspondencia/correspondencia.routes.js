import { Router } from 'express';
import { validateJWT } from '../middlewares/validate-jwt.js';
import { requireDeptAndRole } from '../middlewares/authorize-dept-role.js';
import {
  createCorrespondencia,
  getCorrespondenciaById,
  listCorrespondencia,
  recepcionEnviarADireccion,
  direccionInstruirYEnviar,
  subdireccionAceptar,
  subdireccionAsignarJefe,
  jefeAceptar,
  jefeAsignarTecnico,
  tecnicoStart,
  tecnicoResolver,
  jefeDevolverArriba,
  subdirDevolverADireccion,
  direccionRemitirArchivo,
  recepcionArchivar,
  recepcionAAEnviarADireccion
} from './correspondencia.controller.js';

const RECEPCION_DEPTS = ['AREA ADMINISTRATIVA', 'DESAROLLO'];
const RECEPCION_ROLES = ['ASISTENTE', 'DESAROLLADOR', 'ADMIN'];

const DIR_DEPTS = ['DIRECCION', 'DESAROLLO'];
const DIR_ROLES = ['DIRECTOR', 'DESAROLLADOR', 'ADMIN'];

const SUBDIR_DEPTS = [
  'SUBDIRECCION EVALUACION CURRICULAR',
  'SUBDIRECCION DISEÑO Y DESAROLLO CURRICULAR',
  'DESAROLLO'
];
const SUBDIR_ROLES = ['SUBDIRECTOR', 'DESAROLLADOR', 'ADMIN'];

const JEFE_ROLES = ['JEFE', 'DESAROLLADOR', 'ADMIN'];
const TEC_ROLES  = ['TECNICO', 'DESAROLLADOR', 'ADMIN'];

const router = Router();

/* =================== Compat: inbox por rol =================== */
// 🔴 IMPORTANTE: declarado ANTES de "/:id" para no colisionar
router.get('/inbox/:role', validateJWT, listCorrespondencia);

/* =================== Creates & Reads =================== */
// Crear (Recepción)
router.post(
  '/',
  validateJWT,
  requireDeptAndRole(RECEPCION_DEPTS, RECEPCION_ROLES),
  createCorrespondencia
);

// Bandeja/Listado (auto-filtra según rol actual)
router.get('/', validateJWT, listCorrespondencia);

// Leer uno
router.get('/:id', validateJWT, getCorrespondenciaById);

/* =================== Transiciones =================== */
// Recepción -> Dirección
router.post(
  '/:id/recepcion/enviar-a-direccion',
  validateJWT,
  requireDeptAndRole(RECEPCION_DEPTS, RECEPCION_ROLES),
  recepcionEnviarADireccion
);

// Dirección instruye y envía (a Subdirector o Jefe)
router.post(
  '/:id/direccion/instrucciones-y-enviar',
  validateJWT,
  requireDeptAndRole(DIR_DEPTS, DIR_ROLES),
  direccionInstruirYEnviar
);

// Subdirección acepta
router.post(
  '/:id/subdireccion/aceptar',
  validateJWT,
  requireDeptAndRole(SUBDIR_DEPTS, SUBDIR_ROLES),
  subdireccionAceptar
);

// Subdirección asigna Jefe
router.post(
  '/:id/subdireccion/asignar-jefe',
  validateJWT,
  requireDeptAndRole(SUBDIR_DEPTS, SUBDIR_ROLES),
  subdireccionAsignarJefe
);

// Jefe acepta
router.post(
  '/:id/jefe/aceptar',
  validateJWT,
  requireDeptAndRole([], JEFE_ROLES),
  jefeAceptar
);

// Jefe asigna Técnico
router.post(
  '/:id/jefe/asignar-tecnico',
  validateJWT,
  jefeAsignarTecnico
);

// Técnico: iniciar trabajo
router.post(
  '/:id/tecnico/start',
  validateJWT,
  tecnicoStart
);

// Técnico: resolver y devolver a Jefe
router.post(
  '/:id/tecnico/resolver',
  validateJWT,
  tecnicoResolver
);

// Jefe: devolver a Subdirección o Dirección
router.post(
  '/:id/jefe/devolver-arriba',
  validateJWT,
  jefeDevolverArriba
);

// Subdirección -> Dirección (revisión final)
router.post(
  '/:id/subdireccion/devolver-direccion',
  validateJWT,
  requireDeptAndRole(SUBDIR_DEPTS, SUBDIR_ROLES),
  subdirDevolverADireccion
);

// Dirección remite a Recepción para archivo
router.post(
  '/:id/direccion/remitir-archivo',
  validateJWT,
  requireDeptAndRole(DIR_DEPTS, DIR_ROLES),
  direccionRemitirArchivo
);

// Recepción archiva
router.post(
  '/:id/recepcion/archivar',
  validateJWT,
  requireDeptAndRole(RECEPCION_DEPTS, RECEPCION_ROLES),
  recepcionArchivar
);

router.post(
  '/:id/recepcion/aa/enviar-a-direccion',
  validateJWT,
  requireDeptAndRole(['AREA ADMINISTRATIVA'], ['ASISTENTE']),
  recepcionAAEnviarADireccion
);

export default router;
