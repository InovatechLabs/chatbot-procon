import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../database/index.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';

export type PanelRole = 'ADMIN' | 'ATTENDANT';
export interface PanelIdentity { id: string; username: string; role: PanelRole; mustChangePassword: boolean }
export const isRole = (role: string): role is PanelRole => role === 'ADMIN' || role === 'ATTENDANT';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const normalizeUsername = (username: string) => username.trim().toLowerCase();
export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const identity = (user: { id: string; username: string; role: string; mustChangePassword?: boolean }): PanelIdentity => {
  if (!isRole(user.role)) throw new AuthError(401, 'Sessão inválida. Entre novamente.');
  return { id: user.id, username: user.username, role: user.role, mustChangePassword: Boolean(user.mustChangePassword) };
};

export function createAuthService(db = prisma, now = () => new Date()) {
  const validSession = async (token?: string) => {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await db.panelSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
    if (!session || session.expiresAt <= now() || !session.user.active || !isRole(session.user.role)) return null;
    return session;
  };
  return {
    async login(username: string, password: string, ip: string, previousToken?: string) {
      const at = now();
      const window = Math.floor(at.getTime() / 900_000);
      const expiresAt = new Date((window + 1) * 900_000);
      // Limite por IP antes de criar buckets por conta; contadores compartilhados no banco.
      for (const [key, limit] of [[`ip:${ip}`, 30], [`account:${normalizeUsername(username)}`, 10]] as const) {
        const attempt = await db.panelLoginAttempt.upsert({
          where: { key: tokenHash(`${window}:${key}`) },
          create: { key: tokenHash(`${window}:${key}`), count: 1, expiresAt }, update: { count: { increment: 1 } },
        });
        if (attempt.count > limit) throw new AuthError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      }
      await db.panelLoginAttempt.deleteMany({ where: { expiresAt: { lt: at } } });
      const user = await db.panelUser.findUnique({ where: { username: normalizeUsername(username) } });
      const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user?.active || !matches) throw new AuthError(401, 'Usuário ou senha incorretos.');
      const publicUser = identity(user);
      const token = randomBytes(32).toString('hex');
      const sessionExpiresAt = new Date(at.getTime() + 8 * 60 * 60_000);
      await db.$transaction(async tx => {
        // Serializa criação de sessão com alteração/desativação da conta.
        const current = await tx.panelUser.updateMany({ where: { id: user.id, active: true, passwordHash: user.passwordHash }, data: { updatedAt: at } });
        if (!current.count) throw new AuthError(401, 'Usuário ou senha incorretos.');
        await tx.panelSession.deleteMany({ where: { OR: [
          { expiresAt: { lt: at } }, ...(previousToken ? [{ tokenHash: tokenHash(previousToken) }] : []),
        ] } });
        await tx.panelSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: sessionExpiresAt } });
      });
      return { user: publicUser, token, expiresAt: sessionExpiresAt };
    },
    async current(token?: string): Promise<PanelIdentity | null> {
      const session = await validSession(token);
      return session ? identity(session.user) : null;
    },
    async logout(token?: string) {
      if (token) await db.panelSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
    },
    async changePassword(userId: string, currentPassword: string, newPassword: string) {
      const user = await db.panelUser.findUnique({ where: { id: userId } });
      if (!user?.active || !await verifyPassword(currentPassword, user.passwordHash)) throw new AuthError(400, 'Senha atual incorreta.');
      const nextHash = await hashPassword(newPassword);
      await db.$transaction(async tx => {
        if (newPassword === currentPassword) throw new AuthError(400, 'Escolha uma senha diferente da atual.');
        const changed = await tx.panelUser.updateMany({ where: { id: userId, active: true, passwordHash: user.passwordHash }, data: { passwordHash: nextHash, mustChangePassword: false } });
        if (!changed.count) throw new AuthError(409, 'A conta foi alterada. Entre novamente.');
        await tx.panelSession.deleteMany({ where: { userId } });
      });
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
