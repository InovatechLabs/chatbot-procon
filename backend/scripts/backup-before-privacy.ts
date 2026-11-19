import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { encrypt } from '../src/services/privacy/crypto.js';
// Execução local antes da migração; nenhuma saída de pg_dump é enviada ao console.
const url = new URL(process.env.DATABASE_URL!);
const database = url.pathname.slice(1);
const user = decodeURIComponent(url.username);
if (!database || !user) throw new Error('Conexão de banco inválida.');
const dump = execFileSync('docker', ['exec', 'database', 'pg_dump', '-U', user, '-d', database, '--no-owner', '--no-acl'], { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const folder = new URL('../../.private-backups/', import.meta.url);
await mkdir(folder, { recursive: true, mode: 0o700 });
const file = new URL(`pre-privacy-${Date.now()}.sql.enc`, folder);
await writeFile(file, encrypt(dump.toString('utf8'), 'database-backup'), { mode: 0o600, flag: 'wx' });
console.log('Backup criptografado salvo em .private-backups (ignorado pelo Git).');
