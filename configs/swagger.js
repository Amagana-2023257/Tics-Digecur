import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DIGECUR API',
      version: '1.0.0',
    },
  },
  apis: ['./src/**/*.js'], // Ajusta según dónde estén tus rutas/documentación
};

export const swaggerDocs = swaggerJsdoc(swaggerOptions);
export { swaggerUi };