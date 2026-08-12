import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompleteProductPayload,
  isValidGtin,
  normalizeDate,
  resolveProduct
} from './bling-sync-core.mjs';

test('valida o dígito verificador de GTIN e rejeita o GTIN que falhou no Bling', () => {
  assert.equal(isValidGtin('7898568545032'), true);
  assert.equal(isValidGtin('7896004006407'), false);
  assert.equal(isValidGtin('123'), false);
});

test('normaliza datas brasileiras e rejeita datas inexistentes', () => {
  assert.equal(normalizeDate('11/08/2026'), '2026-08-11');
  assert.equal(normalizeDate('2026-08-11T12:00:00Z'), '2026-08-11');
  assert.equal(normalizeDate('31/02/2026'), '');
});

test('PUT completo sempre contém situação válida', () => {
  const payload = buildCompleteProductPayload(
    { id: 10, nome: 'Antigo', codigo: 'A1', tipo: 'P', formato: 'S', situacao: { valor: 'A' } },
    { nome: 'Novo', codigo: 'A1', preco: 5 },
    {},
    'A'
  );
  assert.equal(payload.situacao, 'A');
  assert.equal(payload.id, undefined);
  assert.equal(payload.nome, 'Novo');
});

test('código atual remapeia um ID histórico obsoleto sem alterar o registro antigo', () => {
  const antigo = { id: 1, codigo: 'ANTIGO' };
  const canonico = { id: 2, codigo: 'SKU-1' };
  const result = resolveProduct(
    { codigo: 'SKU-1', gtin: '' },
    { blingId: 1 },
    {
      byId: new Map([['1', antigo], ['2', canonico]]),
      byCode: new Map([['SKU-1', canonico]]),
      byGtin: new Map(),
      duplicateCodes: new Map()
    }
  );
  assert.equal(result.row.id, 2);
  assert.equal(result.matchedBy, 'codigo-remapeado');
  assert.equal(result.staleStateRow.id, 1);
});

test('duplicidade só é resolvida quando histórico ou GTIN identifica um registro único', () => {
  const rows = [{ id: 1, codigo: 'SKU', gtin: '7898568545032' }, { id: 2, codigo: 'SKU', gtin: '7898568545049' }];
  const maps = { byId: new Map(rows.map(row => [String(row.id), row])), byCode: new Map(), byGtin: new Map(), duplicateCodes: new Map([['SKU', rows]]) };
  assert.equal(resolveProduct({ codigo: 'SKU', gtin: '7898568545032' }, {}, maps).row.id, 1);
  assert.equal(resolveProduct({ codigo: 'SKU', gtin: '' }, {}, maps).conflict, 'codigo_duplicado');
});
