import { Router } from 'express';
import webhookRouter from './webhook/webhookRoutes.js';
import flowRouter from './flow/flowRoutes.js';
import appointmentsRouter from './appointments/appointments.js';

const ApiRouter = Router();    

ApiRouter.use('/webhook', webhookRouter);
ApiRouter.use('/flow', flowRouter);
ApiRouter.use('/appointments', appointmentsRouter);

export default ApiRouter;