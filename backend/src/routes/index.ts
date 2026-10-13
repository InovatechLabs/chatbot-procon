import express from 'express';
import webhookRoutes from './webhook/webhookRoutes.js';
import flowRoutes from './flow/flowRoutes.js';

import analyticsRoutes from './analytics/analytics.js';
import nodesRoutes from './nodes/nodes.js';
import appointmentsRoutes from './appointments/appointments.js';

const routes = express.Router();

routes.use('/webhook', webhookRoutes);
routes.use('/flow', flowRoutes);

routes.use('/analytics', analyticsRoutes);
routes.use('/nodes', nodesRoutes);
routes.use('/appointments', appointmentsRoutes);

export default routes;