import assert from 'node:assert/strict';
import fs from 'node:fs';
const doc=JSON.parse(fs.readFileSync(new URL('../vitrine/admin/whatsapp-lab/meta-flow/flow-quantity-prototype.json',import.meta.url),'utf8'));
assert.equal(doc.version,'7.3');
assert.deepEqual(doc.screens.map(s=>s.id),['TAMANHO','COMBINACAO','PRODUTOS']);
assert.equal(doc.screens[2].terminal,true);
for(const s of doc.screens){assert.equal(s.layout.type,'SingleColumnLayout');assert.ok(s.layout.children.length<=50);assert.ok(s.layout.children.some(c=>c.type==='Footer'));}
const quantities=doc.screens[2].layout.children.filter(x=>x.type==='Dropdown');
assert.equal(quantities.length,8);
for(const q of quantities){assert.equal(q.label,'Quantidade');assert.equal(q['data-source'].length,11);assert.equal(q['data-source'][0].id,'0');assert.equal(q['data-source'][10].id,'10');assert.ok(['1','2'].includes(q['init-value']));assert.ok(q.name.length<=20);}
const first=doc.screens[0].layout.children.find(x=>x.type==='RadioButtonsGroup');assert.equal(first['data-source'].length,5);
const second=doc.screens[1].layout.children.find(x=>x.type==='RadioButtonsGroup');assert.equal(second['data-source'].length,3);
assert.equal(doc.screens[2].layout.children.at(-1)['on-click-action'].name,'complete');
const json=JSON.stringify(doc);assert.doesNotMatch(json,/172,70|189,90|299,90/,'prototype must not contain fictitious prices');
console.log('PASS draft Flow JSON shape: 3 screens, 5 sizes, 3 combinations, 8 direct quantity selectors (0-10), no invented prices');
