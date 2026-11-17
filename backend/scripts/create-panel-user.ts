import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { prisma } from '../src/database/index.js';
import { normalizeUsername } from '../src/services/auth/authService.js';
import { bootstrapAdmin } from '../src/services/auth/panelUserService.js';

let muted = false;
const output = new Writable({ write(chunk, _encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
const terminal = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
try {
  if (await prisma.panelUser.count()) throw new Error('Configuração inicial já realizada. Gerencie as contas pelo painel.');
  const username = normalizeUsername(process.env.AUTH_BOOTSTRAP_USERNAME || await terminal.question('Usuário: '));
  if (process.env.AUTH_BOOTSTRAP_ROLE && process.env.AUTH_BOOTSTRAP_ROLE !== 'ADMIN') throw new Error('A configuração inicial cria somente um ADMIN. Cadastre atendentes pelo painel.');
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw new Error('Usuário inválido (3–64 caracteres).');
  let password = process.env.AUTH_BOOTSTRAP_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) throw new Error('Use um terminal interativo ou injete AUTH_BOOTSTRAP_PASSWORD por secret.');
    process.stdout.write('Senha (12–128 caracteres, oculta): ');
    muted = true;
    password = await terminal.question('');
    muted = false;
    process.stdout.write('\n');
  }
  await bootstrapAdmin(username, password);
  console.log(`Administrador inicial ${username} criado. Cadastre as demais contas na seção Usuários do painel.`);
} catch (error) {
  console.error(error instanceof Error && !error.name.startsWith('Prisma') ? error.message : 'Não foi possível criar a conta. Verifique conexão e migração.');
  process.exitCode = 1;
} finally {
  muted = false;
  terminal.close();
  await prisma.$disconnect();
}
