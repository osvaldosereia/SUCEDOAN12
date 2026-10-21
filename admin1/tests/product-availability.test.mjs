import test from 'node:test';
import assert from 'node:assert/strict';
import { canSetProductActive, getProductAvailability } from '../src/product-availability.js';

test('permite ativar produto inativo com estoque positivo', () => {
  assert.deepEqual(getProductAvailability({ active: false, stock_quantity: 2 }), {
    active: false, canActivate: true, action: 'activate', label: 'Inativo', reason: ''
  });
  assert.equal(canSetProductActive({ stock_quantity: 2 }, true), true);
});

test('bloqueia ativação quando o estoque está zerado, negativo ou ausente', () => {
  for (const stock_quantity of [0, -1, null, undefined, 'indisponível']) {
    assert.equal(canSetProductActive({ stock_quantity }, true), false);
    assert.equal(getProductAvailability({ active: false, stock_quantity }).action, null);
  }
});

test('permite desativar mesmo sem estoque e indica o estado de indisponibilidade', () => {
  assert.equal(canSetProductActive({ stock_quantity: 0 }, false), true);
  assert.deepEqual(getProductAvailability({ active: true, stock_quantity: 0 }), {
    active: false, canActivate: false, action: 'deactivate',
    label: 'Sem estoque · desativado', reason: 'Produto sem estoque não pode ser ativado.'
  });
});

test('não reativa automaticamente após reposição: reativação é uma ação explícita', () => {
  assert.equal(getProductAvailability({ active: false, stock_quantity: 8 }).action, 'activate');
});

test('não confunde estoque sem confirmação recente com estoque zerado', () => {
  assert.deepEqual(getProductAvailability({ active: true, stock_quantity: 0, stock_known: false }), {
    active: true, canActivate: false, action: 'deactivate',
    label: 'Ativo · estoque indisponível', reason: 'Não foi possível confirmar o estoque vendável.'
  });
  assert.equal(canSetProductActive({ stock_quantity: 0, stock_known: false }, true), false);
});
