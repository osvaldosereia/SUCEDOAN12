import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const flow=JSON.parse(read('flows/pilot.draft.flow.json'));
test('Pilot Flow JSON has static valid shape and isolated endpoint design',()=>{
 assert.equal(flow.version,'7.3');
 assert.equal(flow.data_api_version,'3.0');
 assert.equal(flow.screens.length,6);
 assert.deepEqual(flow.screens.filter(s=>s.terminal).map(s=>s.id),['SIMULATED_FINISH']);
 const ids=new Set(flow.screens.map(s=>s.id));
 assert.equal(ids.size,flow.screens.length);
 for(const screen of flow.screens){
  assert.match(screen.id,/^[A-Z_]+$/);
  assert.equal(screen.layout.type,'SingleColumnLayout');
  assert.ok(screen.title.length>0);
  assert.ok(screen.data&&typeof screen.data==='object');
  assert.equal(screen.layout.children.length,1);
  const form=screen.layout.children[0];
  assert.equal(form.type,'Form');
  assert.equal(form.children.filter(x=>x.type==='Footer').length,1);
  const footer=form.children.at(-1);
  assert.equal(footer.type,'Footer');
  assert.ok(['data_exchange','complete'].includes(footer['on-click-action'].name));
 }
 for(const [src,targets] of Object.entries(flow.routing_model)){
  assert.ok(ids.has(src));for(const target of targets)assert.ok(ids.has(target));
 }
 assert.equal(flow.screens.at(-1).layout.children[0].children.at(-1)['on-click-action'].name,'complete');
});
test('Native radio choices, dynamic data exchange and real WhatsApp privacy guards',()=>{
 const s=JSON.stringify(flow);
 assert.ok(s.includes('RadioButtonsGroup'));
 assert.ok(s.includes('CheckboxGroup'));
 assert.ok(s.includes('data_exchange'));
 assert.ok(!s.includes('hidden_adjustment'));
 assert.ok(!s.includes('service_role'));
 assert.ok(!s.includes('ssbesxgaijknwsjbsbcz'));
 assert.ok(!s.includes('0975'));
 assert.ok(!s.includes('1018'));
});
test('Interactive mock UI cannot connect to external systems',()=>{
 const p=read('preview/index.html');
 assert.ok(p.includes("connect-src 'none'"));
 assert.match(p,/simula(?:ç|c)(?:ã|a)o|simulado/i);
 assert.ok(p.includes('type="module" src="./app.mjs"'));
 assert.ok(!p.includes('<script type="module">'), 'CSP forbids inline ES modules');
 const app=read('preview/app.mjs');
 assert.ok(app.includes('../fixtures/fake-catalog.mjs'));
 // The only literal HTTP URL in the UI source is the standard static SVG XML namespace,
 // which is a data-URI declaration, not an outgoing request.
 const noSvgNamespace=app.replaceAll('http://www.w3.org/2000/svg','');
 assert.ok(!/https?:\/\/|wss?:\/\/|fetch\(|WebSocket\(|sendBeacon\(/.test(noSvgNamespace),'Preview module must remain offline');
 assert.match(p,/(?:sem mensagens|nenhuma mensagem)/i);
 assert.ok(!/https?:\/\/|wss?:\/\//.test(p),'Preview must not fetch from external hosts');
 assert.ok(!p.includes('fetch('));
 assert.ok(!p.includes('navigator.sendBeacon'));
});
test('No live credentials or message send methods exist in isolated session code',()=>{
 for(const name of ['src/engine.mjs','src/session.mjs','fixtures/fake-catalog.mjs']){
  const t=read(name);
  assert.ok(!/https?:\/\/|process\.env|service_role|apikey\s*:|fetch\(|WebSocket\(|sendMessage\(/.test(t),name);
 }
});
