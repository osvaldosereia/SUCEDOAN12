import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('admin/index.html');
const names=read('admin/nomes-produtos.html');
const service=read('admin/atendimento.html');
const count=read('contagem/index.html');
const visual=read('admin/admin-visual-standard-v3.css');
const balance=read('contagem/admin-visual-v3.css');

for(const [label,html] of [['main',index],['names',names],['service',service]]){
  assert.match(html,/admin-visual-standard-v3\.css/,label+' must load shared visual standard');
  assert.match(html,/da-standard-page/,label+' must opt into shared visual standard');
}
assert.match(names,/admin-subpage-shell-v2\.js/,'names must use canonical subpage shell');
assert.match(names,/id="adminShellNavigation"/,'names must render canonical navigation');
assert.doesNotMatch(names,/consulta demorou mais de 20 segundos/i,'names must not retain obsolete 20s failure threshold');
assert.match(names,/60000/,'names must allow slow read-only normalization query before failing');
assert.match(service,/id="sidebar"/,'service must use canonical sidebar');
assert.match(service,/id="adminShellNavigation"/,'service must use canonical navigation');
assert.match(service,/admin-subpage-shell-v2\.js/,'service must use canonical subpage shell');
assert.match(count,/admin-visual-v3\.css/,'count must load operational visual standard');
assert.match(visual,/--da-v3-touch:44px/,'shared standard must preserve minimum touch target');
assert.match(visual,/@media\(max-width:620px\)/,'shared standard must include mobile layout');
assert.match(balance,/width:min\(100%,980px\)/,'balance desktop must use available width');
assert.match(balance,/@media\(max-width:620px\)/,'balance must remain mobile-first');
console.log('Admin Visual Standard V3 contract: OK');
