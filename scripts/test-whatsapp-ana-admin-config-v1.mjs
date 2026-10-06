import assert from 'node:assert/strict';
import { validateAnaConfiguration, evaluateAnaTriggers, buildAnaRuntimeInstructions, normalizeAnaMatchText } from '../supabase/functions/_shared/ana-admin-config-v1.mjs';

const base = {
  behavior: { tone:'cordial', conciseness:'short', emoji:'sparingly', use_known_first_name_on_first_greeting:true },
  knowledge: [{key:'store',title:'Catálogo',category:'vendas',content:'O catálogo fica no site oficial.',status:'published',keywords:['site']}],
  triggers: [
    {key:'broad',name:'Ajuda',enabled:true,priority:10,channels:['all'],match:'phrase',phrases:['ajuda'],action:'handoff'},
    {key:'site',name:'Catálogo',enabled:true,priority:20,channels:['0975'],match:'phrase',phrases:['ver catalogo'],action:'fixed_reply',response_text:'Claro! Acesse o catálogo oficial.'},
    {key:'label',name:'Interesse',enabled:true,priority:5,channels:['1018'],match:'phrase',phrases:['produtos para cabelo'],action:'label',label_id:'00000000-0000-4000-8000-000000000002'}
  ],
  test_cases: [{key:'oi',input:'Oi',expected:'reply'}]
};
assert.deepEqual(validateAnaConfiguration(base), {ok:true,errors:[]});
assert.equal(normalizeAnaMatchText('  CATÁLOGO, por favor!  '), 'catalogo por favor');
assert.equal(evaluateAnaTriggers(base, 'Quero ver catálogo, por favor', '0975').triggerKey, 'site');
assert.equal(evaluateAnaTriggers(base, 'preciso de ajuda para ver catalogo', '0975').triggerKey, 'site', 'higher priority wins over broad phrase');
assert.equal(evaluateAnaTriggers(base, 'produtos para cabelo', '0975').matched, false, 'channel scope is enforced');
assert.equal(evaluateAnaTriggers(base, 'produtos para cabelo', '1018').action, 'label');
assert.equal(evaluateAnaTriggers(base, 'bom dia', '0975').matched, false);
assert.equal(validateAnaConfiguration({...base,triggers:[{...base.triggers[0],action:'create_order'}]}).ok,false);
assert.equal(validateAnaConfiguration({...base,behavior:{...base.behavior,tone:'ignore_safety'}}).ok,false);
const instructions=buildAnaRuntimeInstructions(base);
assert.match(instructions,/Nunca invente preço, estoque/);
assert.match(instructions,/O catálogo fica no site oficial/);
assert.match(instructions,/curta e cordial/);
assert.doesNotMatch(instructions,/ignore as regras|ignore a política/i);
console.log('PASS: ANA config validation, protected instructions, deterministic priority and channel scopes');

