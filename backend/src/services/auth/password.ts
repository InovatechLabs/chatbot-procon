import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP: scrypt N=2^15, r=8, p=3 (32 MiB), sal aleatório por senha.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key));
});
export const validNewPassword = (password: string) => password.length >= 12 && password.length <= 128;
export async function hashPassword(password: string): Promise<string> {
  if (!validNewPassword(password)) throw new Error('A senha deve ter entre 12 e 128 caracteres.');
  const salt = randomBytes(16);
  return `scrypt$32768$8$3$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
}
export const DUMMY_HASH = `scrypt$32768$8$3$${'00'.repeat(16)}$${'00'.repeat(64)}`;
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored)) return false;
  const parts = stored.split('$');
  const actual = await derive(password, Buffer.from(parts[4]!, 'hex'));
  return timingSafeEqual(actual, Buffer.from(parts[5]!, 'hex'));
}
