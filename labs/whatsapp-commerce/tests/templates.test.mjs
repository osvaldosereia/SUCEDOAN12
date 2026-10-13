import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=new URL('../templates/drafts.json',import.meta.url);
const data=JSON.parse(readFileSync(file,'utf8'));
test('Drafts never silently alter or send production templates',()=>{
 assert.equal(data.status,'DRAFT_ONLY_NOT_SUBMITTED');
 assert.equal(data.templates.length,4);
 assert.ok(data.templates.every(x=>x.name.startsWith('da_lab_')));
 assert.ok(data.templates.every(x=>['UTILITY','MARKETING'].includes(x.category)));
});
test('Utility templates use transactional texts only, no promotional content',()=>{
 const utility=data.templates.filter(x=>x.category==='UTILITY');
 assert.equal(utility.length,3);
 for(const draft of utility){
  assert.match(draft.components.find(x=>x.type==='BODY').text,/pedido/);
  assert.doesNotMatch(draft.components.find(x=>x.type==='BODY').text,/promoç|desconto|oferta|compre mais/i);
 }
});
test('Placeholders and example values have compatible counts',()=>{
 for(const draft of data.templates){
  assert.equal(draft.language,'pt_BR');
  const body=draft.components.find(x=>x.type==='BODY');
  const tokens=[...body.text.matchAll(/\{\{(\d+)\}\}/g)].map(m=>Number(m[1]));
  const max=tokens.length?Math.max(...tokens):0;
  if(max)assert.equal(body.example?.body_text?.[0]?.length,max,draft.name);
  else assert.equal(body.example,undefined,draft.name);
 }
});
test('Marketing trial is explicitly marked and not mixed with Utility',()=>{
 const m=data.templates.filter(x=>x.category==='MARKETING');
 assert.equal(m.length,1);
 assert.match(m[0].name,/ofertas/);
 assert.ok(m[0].components.find(c=>c.type==='BUTTONS'));
});
