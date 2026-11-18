import test from 'node:test';
import assert from 'node:assert/strict';
import { redactIdentifiers } from '../../src/services/privacy/redact.js';

test('menções a nome, endereço e contato preservam os fatos quando não apresentam identificadores', () => {
  for (const text of [
    'Descobri que uma empresa colocou meu nome em um cadastro de consumidores com uma informação negativa que está errada e não me permite saber qual dado foi registrado.',
    'Meu nome está negativado e a dívida não é minha.',
    'O cadastro deixou meu nome errado e não consigo corrigir.',
    'Meu endereço em um cadastro está incorreto.',
    'Moro normalmente nesta cidade e comprei pela internet.',
    'O banco me chamou para conversar sobre a dívida.',
  ]) assert.equal(redactIdentifiers(text), text);
});

test('apresentações explícitas continuam ocultando nomes acentuados e sem acento', () => {
  for (const prefix of ['Meu nome é', 'meu nome e', 'Me chamo', 'Nome completo:', 'MEU NOME É:']) {
    const text = `${prefix} Pessoa Fictícia. A loja cobrou após cancelar.`;
    assert.equal(redactIdentifiers(text), '[NOME INFORMADO]. A loja cobrou após cancelar.', prefix);
  }
  assert.equal(redactIdentifiers('Me chamo Pessoa Fictícia, recebi cobrança.'), '[NOME INFORMADO], recebi cobrança.');
});

test('apresentações de endereço continuam ocultas sem consumir o relato seguinte', () => {
  for (const prefix of ['Meu endereço é', 'Meu endereço e', 'Moro na', 'Moro no', 'Moro em', 'Endereço:']) {
    assert.equal(redactIdentifiers(`${prefix} Rua Exemplo, 10; o pedido não chegou.`), '[ENDEREÇO INFORMADO]; o pedido não chegou.', prefix);
  }
});
