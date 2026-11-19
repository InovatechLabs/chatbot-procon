import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, lookupHash } from '../../src/services/privacy/crypto.js';
import { prepare, protectData } from '../../src/services/privacy/protectedPrisma.js';
import { redactIdentifiers } from '../../src/services/privacy/redact.js';
import { appointmentView } from '../../src/services/privacy/appointmentView.js';

process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.DATA_LOOKUP_KEY = randomBytes(32).toString('base64');
test('AES-GCM é aleatório, autenticado, vinculado ao campo e falha sem chave', () => {
  const value = 'Dado fictício';
  const ciphertext = encrypt(value, 'UserSession.userName');
  assert.notEqual(ciphertext, encrypt(value, 'UserSession.userName'));
  assert.equal(decrypt(ciphertext, 'UserSession.userName'), value);
  assert.throws(() => decrypt(ciphertext, 'Appointment.userName'));
  const parts = ciphertext.split(':');
  const body = Buffer.from(parts[4]!, 'base64'); body[0] = body[0]! ^ 1; parts[4] = body.toString('base64');
  assert.throws(() => decrypt(parts.join(':'), 'UserSession.userName'));
  assert.throws(() => decrypt(value, 'UserSession.userName'));
  const previous = process.env.DATA_ENCRYPTION_KEY;
  delete process.env.DATA_ENCRYPTION_KEY;
  assert.throws(() => encrypt(value, 'test'));
  process.env.DATA_ENCRYPTION_KEY = previous!;
});
test('busca usa HMAC separado, filtros equivalentes e escritas aninhadas falham fechadas', () => {
  assert.equal(lookupHash('userCpf', '529.982.247-25'), lookupHash('userCpf', '52998224725'));
  assert.notEqual(lookupHash('userCpf', '52998224725'), lookupHash('phoneNumber', '52998224725'));
  const args = prepare('UserSession', 'findMany', { where: { OR: [{ phoneNumber: { in: ['5512999999999'] } }, { userCpf: '52998224725' }] } });
  assert.ok(args.where.OR[0].phoneLookup.in[0]); assert.ok(args.where.OR[1].cpfLookup);
  assert.throws(() => prepare('UserSession', 'findMany', { where: { phoneNumber: { contains: '9999' } } }));
  assert.throws(() => protectData('UserSession', { chatLogs: { create: { messageText: 'pessoal' } } }));
  assert.throws(() => protectData('UserSession', { phoneLookup: 'forjado' }));
  const data = protectData('UserSession', { phoneNumber: '5512999999999', userCpf: { set: null }, userName: 'Nome Teste' });
  assert.ok(data.phoneNumber.startsWith('enc:v1:')); assert.equal(data.cpfLookup, null);
});
test('minimização conserva contexto, artigo e prazo sem expor identificadores comuns', () => {
  const text = redactIdentifiers('Sou Nome Teste, CPF 529.982.247-25, telefone +55 (12) 99999-9999, email teste@example.com. Art. 49: 7 dias e R$ 100.', ['Nome Teste']);
  for (const sensitive of ['Nome Teste', '529', '99999', 'teste@example']) assert.ok(!text.includes(sensitive));
  assert.ok(text.includes('Art. 49: 7 dias e R$ 100.'));
  assert.ok(!redactIdentifiers('CPF 529 982 247 25').includes('529'));
  assert.ok(!redactIdentifiers('CNPJ 12.345.678/0001-90').includes('0001'));
  const view = appointmentView({ id: 'test', phoneNumber: '5512999999999', userCpf: '52998224725', userName: 'Nome Teste', notes: 'privado', status: 'pending', scheduledAt: new Date(), source: 'PANEL' });
  assert.equal(view.status, 'PENDING'); assert.ok(view.phoneNumber.includes('*'));
  assert.equal('userCpf' in view, false); assert.equal('notes' in view, false);
});
