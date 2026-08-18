import { Router } from 'express';
import { verifyWebhook, handleWebhookEvent } from '../../controllers/webhook/webhookController.js';

const webhookRoutes = Router();

webhookRoutes.get('/', verifyWebhook);
webhookRoutes.post('/', handleWebhookEvent);

export default webhookRoutes;