import { Router } from 'express';
import webhookRouter from './webhook/webhookRoutes.js';
import flowRouter from './flow/flowRoutes.js';
import appointmentsRouter from './appointments/appointments.js';
import nodesRouter from './nodes/nodes.js';

const ApiRouter = Router();    

ApiRouter.use('/webhook', webhookRouter);
ApiRouter.use('/flow', flowRouter);
ApiRouter.use('/appointments', appointmentsRouter);
ApiRouter.use('/nodes', nodesRouter);

export default ApiRouter;