import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('admin/admin-global-shell-v3.js');
const css=read('admin/admin-global-shell-v3.css');
const fastBasketsJs=read('cesta-mobile/cesta-mobile.js');
const fastBasketsCss=read('cesta-mobile/cesta-mobile.css');
const pages=[
  ['relationship','admin/relacionamento.html'],
  ['intelligence','admin/inteligencia.html'],
  ['learning','admin/aprendizados.html'],
  ['video','video/index.html'],
  ['count','contagem/index.html'],
  ['registration','cadastro/index.html'],
  ['expiries','validades/index.html'],
  ['fast-baskets','cesta-mobile/index.html'],
  ['kits','kit-mobile/index.html']
];
assert.doesNotMatch(shell,/fetch\s*\(/,'global shell must not create transport');
assert.doesNotMatch(shell,/localStorage|sessionStorage/,'global shell must not create persistence');
assert.match(shell,/adminNavigationModel/,'global shell must use canonical registry navigation');
assert.match(shell,/\/admin\/#\$\{route\.value\}/,'hash modules must return to canonical Admin');
assert.match(css,/\.da-global-topbar/,'global header must be shared');
assert.match(css,/\.da-global-sidebar/,'global sidebar must be shared');
assert.match(css,/body\[data-admin-module="video"\]/,'VIDEO must be visually integrated');
assert.match(css,/body\[data-admin-module="stockCount"\]/,'quick count must be visually integrated');
assert.match(css,/\.da-ops-secondary-nav/,'operational tools must retain a secondary tool switcher');
assert.match(css,/html\[data-admin-global-shell="v3"\] body\.ops-suite \.da-ops-secondary-nav a\{/,'operational switcher must override legacy dark-header link colors');
assert.match(css,/background:#fff!important/,'inactive operational tools need a visible surface on the light Admin shell');
assert.match(fastBasketsCss,/\.basket-workspace\[hidden\]\{display:none!important\}/,'hidden basket workspaces must remain truly hidden');
assert.match(fastBasketsJs,/\.workspace-tabs'\)\.addEventListener\('click'/,'basket workspace tabs must use delegated click handling');
assert.match(fastBasketsJs,/list\.hidden = !listMode/,'basket list tab must explicitly toggle the list workspace');
assert.match(fastBasketsJs,/renderBasketList\(\)/,'opening the basket list must render current baskets');
assert.match(css,/@media\(max-width:900px\)/,'global shell must collapse to mobile drawer');
for(const [label,path] of pages){
  const html=read(path);
  assert.match(html,/admin-global-shell-v3\.css/,label+' must load global shell CSS');
  assert.match(html,/admin-global-shell-v3\.js/,label+' must load global shell JS');
  assert.match(html,/data-admin-module=/,label+' must identify its Admin module');
}
console.log('Admin Global Shell V3 contract: OK');
