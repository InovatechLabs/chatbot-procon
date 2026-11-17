import { Router } from 'express';
import flowRouter from './flow/flowRoutes.js';
import appointmentsRouter from './appointments/appointments.js';
import nodesRouter from './nodes/nodes.js';
import { createAuthService } from '../services/auth/authService.js';
import type { AuthService } from '../services/auth/authService.js';
import { authConfig, authMiddleware, createAuthRouter } from './auth/auth.js';
import type { AuthConfig } from './auth/auth.js';
import { createPanelUsersRouter } from './auth/panelUsers.js';
import { createPanelUserService } from '../services/auth/panelUserService.js';
import type { PanelUserService } from '../services/auth/panelUserService.js';
import { createScheduleAdminRouter } from './appointments/scheduleAdmin.js';
import analyticsRouter from './analytics/analytics.js';

export function createApiRouter(service: AuthService = createAuthService(), config: AuthConfig = authConfig(), users: PanelUserService = createPanelUserService()) {
const ApiRouter = Router();
const { requireAuth, trustedMutation, roles } = authMiddleware(service, config);

ApiRouter.use('/auth', createAuthRouter(service, config));
ApiRouter.use(requireAuth, trustedMutation);
ApiRouter.use((_req, res, next) => {
  if (res.locals.panelUser.mustChangePassword) { res.status(403).json({ error: 'Altere a senha temporária antes de acessar o painel.', code: 'PASSWORD_CHANGE_REQUIRED' }); return; }
  next();
});
ApiRouter.use('/appointments', roles('ADMIN', 'ATTENDANT'), appointmentsRouter);
ApiRouter.use(roles('ADMIN'));
ApiRouter.use('/analytics', analyticsRouter);
ApiRouter.use('/schedule', createScheduleAdminRouter());
ApiRouter.use('/users', createPanelUsersRouter(users));
ApiRouter.use('/flow', flowRouter);
ApiRouter.use('/nodes', nodesRouter);

return ApiRouter;
}
