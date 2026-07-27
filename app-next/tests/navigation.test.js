import test from 'node:test';
import assert from 'node:assert/strict';
import { rootHashTarget } from '../src/bundle-routes.js';

test('logo e links internos sempre voltam para a raiz da aplicação', () => {
  assert.equal(rootHashTarget('#/'), '/#/');
  assert.equal(rootHashTarget('#/categorias'), '/#/categorias');
  assert.equal(rootHashTarget('#/ofertas'), '/#/ofertas');
  assert.equal(rootHashTarget('#/favoritos'), '/#/favoritos');
  assert.equal(rootHashTarget('#/produto/P440'), '/#/produto/P440');
});

test('links comuns não são alterados', () => {
  assert.equal(rootHashTarget('/cestas/'), '');
  assert.equal(rootHashTarget('/sobre-nos.html'), '');
  assert.equal(rootHashTarget('https://example.com'), '');
  assert.equal(rootHashTarget('mailto:atendimento@donaantonia.com.br'), '');
});
