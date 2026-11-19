import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function privacyKeys() {
  const read = (name: string) => {
    const value = process.env[name];
    if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error(`Configure ${name} com 32 bytes aleatórios em base64.`);
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) throw new Error(`Chave inválida: ${name}.`);
    return key;
  };
  const encryption = read('DATA_ENCRYPTION_KEY');
  const lookup = read('DATA_LOOKUP_KEY');
  if (timingSafeEqual(encryption, lookup)) throw new Error('As chaves de criptografia e busca devem ser diferentes.');
  return { encryption, lookup };
}
export const encrypted = (value: string) => value.startsWith('enc:v1:');
export function encrypt(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', privacyKeys().encryption, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
}
export function decrypt(value: string, context: string) {
  if (!encrypted(value)) throw new Error('Dado pessoal legado: execute a migração de privacidade antes de iniciar.');
  try {
    const parts = value.split(':');
    if (parts.length !== 5) throw new Error();
    const iv = Buffer.from(parts[2]!, 'base64');
    const tag = Buffer.from(parts[3]!, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', privacyKeys().encryption, iv);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[4]!, 'base64')), decipher.final()]).toString('utf8');
  } catch { throw new Error('Não foi possível autenticar um dado protegido. Verifique as chaves e a integridade do banco.'); }
}
export function lookupHash(kind: 'phoneNumber' | 'userCpf', value: string) {
  // Preserva IDs sintéticos do benchmark; números reais são comparados só por dígitos.
  const normalized = /[a-z]/i.test(value) ? value : value.replace(/\D/g, '');
  return createHmac('sha256', privacyKeys().lookup).update(`${kind}:${normalized}`).digest('hex');
}
