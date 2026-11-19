import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { decrypt } from '../src/services/privacy/crypto.js';
const folder = new URL('../../.private-backups/', import.meta.url);
const names = (await readdir(folder)).filter(name => name.endsWith('.sql.enc')).sort();
if (!names.length) throw new Error('Nenhum backup criptografado encontrado.');
for (const name of names) {
  const sql = decrypt(await readFile(new URL(name, folder), 'utf8'), 'database-backup');
  if (!sql.includes('PostgreSQL database dump')) throw new Error('Conteúdo de backup inválido.');
}
console.log(`${names.length} backup(s) autenticado(s); conteúdo SQL validado sem exibir dados.`);
