import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/index.js';
import { AuthError, normalizeUsername } from './authService.js';
import type { PanelRole } from './authService.js';
import { hashPassword } from './password.js';

const publicFields = { id: true, username: true, displayName: true, role: true, active: true, mustChangePassword: true, createdAt: true, updatedAt: true } as const;
// Mesmo lock no bootstrap e na gestão: protege o último ADMIN entre processos.
export async function lockPanelUsers(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(19781116, 1)::text`;
}
export async function bootstrapAdmin(username: string, password: string, db = prisma) {
  const passwordHash = await hashPassword(password);
  return db.$transaction(async tx => {
    await lockPanelUsers(tx);
    if (await tx.panelUser.count()) throw new AuthError(409, 'Configuração inicial já realizada. Gerencie as contas pelo painel.');
    return tx.panelUser.create({ data: { username: normalizeUsername(username), passwordHash, role: 'ADMIN' }, select: publicFields });
  });
}
export function createPanelUserService(db = prisma) {
  const authorized = async (tx: Prisma.TransactionClient, actorId: string) => {
    const actor = await tx.panelUser.findUnique({ where: { id: actorId } });
    if (!actor?.active || actor.role !== 'ADMIN' || actor.mustChangePassword) throw new AuthError(403, 'Acesso restrito a administradores com senha definitiva.');
  };
  const uniqueError = (error: unknown): never => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AuthError(409, 'Este usuário já está cadastrado.');
    throw error;
  };
  return {
    async list(actorId: string) {
      return db.$transaction(async tx => {
        await authorized(tx, actorId);
        return tx.panelUser.findMany({ select: publicFields, orderBy: [{ username: 'asc' }, { id: 'asc' }] });
      });
    },
    async create(actorId: string, input: { username: string; password: string; role: PanelRole; displayName?: string | null | undefined }) {
      const passwordHash = await hashPassword(input.password);
      try {
        return await db.$transaction(async tx => {
          await lockPanelUsers(tx);
          await authorized(tx, actorId);
          return tx.panelUser.create({ data: { username: normalizeUsername(input.username), displayName: input.displayName ?? null, passwordHash, role: input.role, mustChangePassword: true }, select: publicFields });
        });
      } catch (error) { return uniqueError(error); }
    },
    async update(actorId: string, id: string, input: { username?: string | undefined; role?: PanelRole | undefined; active?: boolean | undefined; displayName?: string | null | undefined }) {
      try {
        return await db.$transaction(async tx => {
          await lockPanelUsers(tx);
          await authorized(tx, actorId);
          const target = await tx.panelUser.findUnique({ where: { id } });
          if (!target) throw new AuthError(404, 'Conta não encontrada.');
          const next = { username: input.username === undefined ? target.username : normalizeUsername(input.username), role: input.role ?? target.role, active: input.active ?? target.active };
          if (target.active && target.role === 'ADMIN' && (!next.active || next.role !== 'ADMIN') && await tx.panelUser.count({ where: { active: true, role: 'ADMIN' } }) <= 1) {
            throw new AuthError(409, 'É necessário manter pelo menos um administrador ativo.');
          }
          const updated = await tx.panelUser.update({ where: { id }, data: { ...next, displayName: input.displayName === undefined ? target.displayName : input.displayName }, select: publicFields });
          if (next.username !== target.username || next.role !== target.role || next.active !== target.active) await tx.panelSession.deleteMany({ where: { userId: id } });
          return updated;
        });
      } catch (error) { return uniqueError(error); }
    },
    async resetPassword(actorId: string, id: string, password: string) {
      const passwordHash = await hashPassword(password);
      await db.$transaction(async tx => {
        await lockPanelUsers(tx);
        await authorized(tx, actorId);
        // Lock da conta coordena também com login e alteração da própria senha.
        const changed = await tx.panelUser.updateMany({ where: { id }, data: { passwordHash, mustChangePassword: true } });
        if (!changed.count) throw new AuthError(404, 'Conta não encontrada.');
        await tx.panelSession.deleteMany({ where: { userId: id } });
      });
    },
    async revokeSessions(actorId: string, id: string) {
      await db.$transaction(async tx => {
        await lockPanelUsers(tx);
        await authorized(tx, actorId);
        const changed = await tx.panelUser.updateMany({ where: { id }, data: { updatedAt: new Date() } });
        if (!changed.count) throw new AuthError(404, 'Conta não encontrada.');
        await tx.panelSession.deleteMany({ where: { userId: id } });
      });
    },
    async remove(actorId: string, id: string) {
      await db.$transaction(async tx => {
        await lockPanelUsers(tx);
        await authorized(tx, actorId);
        const target = await tx.panelUser.findUnique({ where: { id } });
        if (!target) throw new AuthError(404, 'Conta não encontrada.');
        if (target.active && target.role === 'ADMIN' && await tx.panelUser.count({ where: { active: true, role: 'ADMIN' } }) <= 1) throw new AuthError(409, 'É necessário manter pelo menos um administrador ativo.');
        await tx.panelUser.delete({ where: { id } });
      });
    },
  };
}
export type PanelUserService = ReturnType<typeof createPanelUserService>;
