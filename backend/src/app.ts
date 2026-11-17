import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { createApiRouter } from './routes/index.js';
import { authConfig, authError } from './routes/auth/auth.js';
import type { AuthConfig } from './routes/auth/auth.js';
import type { AuthService } from './services/auth/authService.js';
import type { PanelUserService } from './services/auth/panelUserService.js';
import { createWebhookRouter } from './routes/webhook/webhookRoutes.js';

export function createApp(service?: AuthService, config: AuthConfig = authConfig(), users?: PanelUserService) {
  const app = express();
  app.disable('x-powered-by');
  // Não confiar em X-Forwarded-For vindo diretamente do cliente.
  app.set('trust proxy', false);
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || config.origins.includes(origin)), credentials: true }));
  // Assinatura calculada nos bytes originais, antes do parser JSON administrativo.
  app.use('/api/webhook', createWebhookRouter());
  app.use(express.json());
  app.use('/api', createApiRouter(service, config, users));
  app.get('/health', (_req, res) => { res.json({ status: 'OK', message: 'API está funcionando corretamente!' }); });
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    const result = error?.type === 'entity.too.large' ? { status: 413, error: 'Corpo da solicitação muito grande.' }
      : error?.type === 'encoding.unsupported' ? { status: 415, error: 'Codificação do corpo não suportada.' }
      : error instanceof SyntaxError ? { status: 400, error: 'JSON inválido.' } : authError(error);
    if (result.status >= 500) console.error('Falha na API:', error instanceof Error ? error.name : 'UnknownError');
    res.status(result.status).json({ error: result.error });
  };
  app.use(onError);
  return app;
}
