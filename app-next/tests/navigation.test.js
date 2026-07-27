import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanComboNavigationTarget } from '../src/navigation.js';

const currentHref = 'https://donaantonia.com.br/cestas/mini-bonini-cestaminicomarroztiobonini/';
const currentOrigin = 'https://donaantonia.com.br';

function target(href) {
  return cleanComboNavigationTarget({ href, currentHref, currentOrigin });
}

test('não intercepta links hash da aplicação em páginas limpas', () => {
  for (const href of ['#/', '#/categorias', '#/ofertas', '#/favoritos', '#/produto/P440']) {
    assert.equal(target(href), '');
  }
});

test('intercepta somente URLs limpas de cestas e kits', () => {
  assert.equal(target('/cestas/'), '/cestas/');
  assert.equal(target('/cestas/economica-bonini-cestaeconomicacomarroztiobonini/'), '/cestas/economica-bonini-cestaeconomicacomarroztiobonini/');
  assert.equal(target('/kits/kit-cuidados-nivea-novo-kit-promocional-2/?origem=home'), '/kits/kit-cuidados-nivea-novo-kit-promocional-2/?origem=home');
});

test('não intercepta links externos, institucionais ou com hash', () => {
  assert.equal(target('https://example.com/cestas/teste/'), '');
  assert.equal(target('/sobre-nos.html'), '');
  assert.equal(target('/cestas/#/ofertas'), '');
  assert.equal(target('mailto:atendimento@donaantonia.com.br'), '');
});
