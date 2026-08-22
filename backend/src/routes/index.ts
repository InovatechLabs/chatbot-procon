import { Router } from 'express';
import webhookRouter from './webhook/webhookRoutes.js';
import flowRouter from './flow/flowRoutes.js';

const ApiRouter = Router();    

ApiRouter.use('/webhook', webhookRouter);
ApiRouter.use('/flow', flowRouter);

export default ApiRouter;