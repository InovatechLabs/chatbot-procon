import express from 'express';
import webhookRoutes from './webhook/webhookRoutes.js';
import flowRoutes from './flow/flowRoutes.js';
import adminRoutes from './admin/adminRoutes.js';

const routes = express.Router();

routes.use('/webhook', webhookRoutes);
routes.use('/flow', flowRoutes);
routes.use('/admin', adminRoutes);

export default routes;