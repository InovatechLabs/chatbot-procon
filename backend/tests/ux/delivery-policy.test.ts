import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import { outgoingFailure, retryDelay } from '../../src/services/whatsapp/durableMessages.js';

test('retry distingue rejeição temporária, permanente e resultado incerto', () => {
  const http = (status: number) => new AxiosError('fictício', undefined, undefined, undefined, { status } as any);
  assert.equal(outgoingFailure(http(429), 1).state, 'PENDING');
  assert.equal(outgoingFailure(http(503), 1).state, 'PENDING');
  assert.equal(outgoingFailure(http(503), 5).state, 'DEAD');
  assert.equal(outgoingFailure(http(401), 1).state, 'DEAD');
  assert.equal(outgoingFailure(http(400), 1).state, 'DEAD');
  const transient = new AxiosError('fictício', undefined, undefined, undefined, { status: 400, data: { error: { code: 123, is_transient: true } } } as any);
  assert.deepEqual(outgoingFailure(transient, 1), { state: 'PENDING', reason: 'HTTP_400_META_123' });
  assert.equal(outgoingFailure(new AxiosError('timeout', 'ECONNABORTED'), 1).state, 'UNKNOWN');
  assert.equal(outgoingFailure(new Error('connection interrupted'), 1).state, 'UNKNOWN');
  assert.equal(retryDelay(1), 2000); assert.equal(retryDelay(9), 60000);
});
