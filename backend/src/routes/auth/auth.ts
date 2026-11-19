import { Router } from 'express';
import type { CookieOptions, RequestHandler } from 'express';
import { z } from 'zod';
import { AuthError } from '../../services/auth/authService.js';
import type { AuthService, PanelRole, PanelIdentity } from '../../services/auth/authService.js';

export const SESSION_COOKIE = 'procon_session';
export function sessionCookie(raw?: string): string | undefined {
  return raw?.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}
export interface AuthConfig { origins: string[]; secure: boolean }
export function authConfig(): AuthConfig {
  const secure = process.env.NODE_ENV === 'production';
  const origins = (process.env.PANEL_ORIGINS || (secure ? '' : 'http://localhost:5173,http://127.0.0.1:5173')).split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => {
    const url = new URL(origin);
    return url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (secure && url.protocol !== 'https:');
  })) {
    throw new Error('Configure PANEL_ORIGINS com origens exatas do painel (HTTPS em produção).');
  }
  return { origins, secure };
}
export function authMiddleware(service: AuthService, config: AuthConfig) {
  const requireAuth: RequestHandler = async (req, res, next) => {
    try {
      const user = await service.current(sessionCookie(req.headers.cookie));
      if (!user) { res.status(401).json({ error: 'Entre no painel para continuar.' }); return; }
      res.locals.panelUser = user;
      res.setHeader('Cache-Control', 'no-store');
      next();
    } catch (error) { next(error); }
  };
  const trustedMutation: RequestHandler = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    if (!req.headers.origin || !config.origins.includes(req.headers.origin)) {
      res.status(403).json({ error: 'Origem da solicitação não autorizada.' }); return;
    }
    next();
  };
  const roles = (...allowed: PanelRole[]): RequestHandler => (_req, res, next) => {
    const user = res.locals.panelUser as PanelIdentity | undefined;
    if (!user || !allowed.includes(user.role)) { res.status(403).json({ error: 'Você não tem permissão para esta operação.' }); return; }
    next();
  };
  return { requireAuth, trustedMutation, roles };
}
const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) }).strict();
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).strict();

export function createAuthRouter(service: AuthService, config: AuthConfig) {
  const router = Router();
  const { requireAuth, trustedMutation } = authMiddleware(service, config);
  const cookie: CookieOptions = { httpOnly: true, secure: config.secure, sameSite: 'strict', path: '/api' };
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(trustedMutation);
  router.post('/login', async (req, res, next) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Informe usuário e senha válidos.' }); return; }
    try {
      const result = await service.login(body.data.username, body.data.password, req.ip || 'unknown', sessionCookie(req.headers.cookie));
      res.cookie(SESSION_COOKIE, result.token, { ...cookie, expires: result.expiresAt });
      res.json({ user: result.user });
    } catch (error) { next(error); }
  });
  router.get('/me', requireAuth, (_req, res) => { res.json({ user: res.locals.panelUser }); });
  
  router.post('/logout', async (req, res, next) => {
    try {
      await service.logout(sessionCookie(req.headers.cookie));
      res.clearCookie(SESSION_COOKIE, cookie).sendStatus(204);
    } catch (error) { next(error); }
  });
  router.post('/password', requireAuth, async (req, res, next) => {
    const body = passwordSchema.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'A nova senha deve ter entre 12 e 128 caracteres.' }); return; }
    try {
      await service.changePassword(res.locals.panelUser.id, body.data.currentPassword, body.data.newPassword);
      res.clearCookie(SESSION_COOKIE, cookie).sendStatus(204);
    } catch (error) { next(error); }
  });
  return router;
}

export function authError(error: unknown): { status: number; error: string } {
  return error instanceof AuthError ? { status: error.status, error: error.message } : { status: 500, error: 'Não foi possível concluir a solicitação. Tente novamente.' };
}
