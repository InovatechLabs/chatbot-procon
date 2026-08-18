import { Router } from 'express';
import webhookRouter from './webhook/webhookRoutes.js';

const ApiRouter = Router();    

ApiRouter.use('/webhook', webhookRouter);

export default ApiRouter;