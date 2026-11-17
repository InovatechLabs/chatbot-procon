import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { privacyKeys } from '../src/services/privacy/crypto.js';
const file = new URL('../.env', import.meta.url);
const existing = parse(await readFile(file, 'utf8').catch(() => ''));
const additions: string[] = [];
for (const name of ['DATA_ENCRYPTION_KEY', 'DATA_LOOKUP_KEY']) {
  if (process.env.PRIVACY_KEYS_EXTERNAL && !process.env[name]) throw new Error(`Injete ${name} pelo mecanismo de secrets antes de continuar.`);
  const value = process.env[name] || existing[name] || randomBytes(32).toString('base64');
  process.env[name] = value;
  if (!existing[name] && !process.env.PRIVACY_KEYS_EXTERNAL) additions.push(`${name}="${value}"`);
}
privacyKeys();
if (additions.length) await appendFile(file, `\n# Chaves pessoais: preservar fora do banco, nunca commitar.\n${additions.join('\n')}\n`, { mode: 0o600 });
console.log('Chaves de privacidade verificadas. Faça backup seguro separado do banco; os valores não serão exibidos.');
