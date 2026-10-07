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
const multi={...base,triggers:[{key:'basket',name:'Cestas',enabled:true,priority:90,channels:['all'],match:'phrase',phrases:['cesta basica'],conditions:[{type:'customer_linked',value:true}],actions:[{type:'label',label_id:'00000000-0000-4000-8000-000000000002'},{type:'fixed_reply',response_text:'Veja nossas cestas no catálogo.'},{type:'continue_ai'}]}]};
assert.equal(validateAnaConfiguration(multi).ok,true);
assert.equal(evaluateAnaTriggers(multi,'quero cesta básica','0975',{customerLinked:false}).matched,false);
const routed=evaluateAnaTriggers(multi,'quero cesta básica','0975',{customerLinked:true});
assert.equal(routed.matched,true);
assert.deepEqual(routed.actions.map(x=>x.type),['label','fixed_reply','continue_ai']);
assert.equal(validateAnaConfiguration({...base,triggers:[{...base.triggers[0],action:'create_order'}]}).ok,false);
assert.equal(validateAnaConfiguration({...base,triggers:[{...base.triggers[0],actions:[{type:'create_order'}],action:undefined}]}).ok,false);
assert.equal(validateAnaConfiguration({...base,behavior:{...base.behavior,tone:'ignore_safety'}}).ok,false);
const specificity={...base,triggers:[
  {key:'pedido',name:'Pedido',enabled:true,priority:50,channels:['all'],match:'phrase',phrases:['pedido'],actions:[{type:'handoff'}]},
  {key:'pedido-atrasado',name:'Pedido atrasado',enabled:true,priority:50,channels:['all'],match:'phrase',phrases:['pedido atrasou'],actions:[{type:'handoff'}]}
]};
assert.equal(evaluateAnaTriggers(specificity,'meu pedido atrasou ontem','0975').triggerKey,'pedido-atrasado','more specific phrase wins at equal priority');
const exclusion={...base,triggers:[{key:'comprar',name:'Comprar',enabled:true,priority:50,channels:['all'],match:'phrase',phrases:['quero comprar'],exclude_phrases:['nao quero comprar'],actions:[{type:'continue_ai'}]}]};
assert.equal(evaluateAnaTriggers(exclusion,'eu quero comprar','0975').triggerKey,'comprar');
assert.equal(evaluateAnaTriggers(exclusion,'eu nao quero comprar agora','0975').matched,false,'exclude phrases suppress false positives');
const disabledDraft={...base,triggers:[{key:'draft-rule',name:'Rascunho',enabled:false,priority:50,channels:['all'],match:'phrase',phrases:[],actions:[{type:'handoff'}]}]};
assert.equal(validateAnaConfiguration(disabledDraft).ok,true,'disabled draft automation may be saved without phrases');
const badSequence={...base,triggers:[{key:'bad-sequence',name:'Inválida',enabled:true,priority:50,channels:['all'],match:'phrase',phrases:['teste'],actions:[{type:'fixed_reply',response_text:'Oi'},{type:'continue_ai'}]}]};
assert.equal(validateAnaConfiguration(badSequence).ok,false,'only one terminal outcome is allowed');
const contradictory={...base,triggers:[{key:'bad-condition',name:'Condição',enabled:true,priority:50,channels:['all'],match:'phrase',phrases:['teste'],conditions:[{type:'customer_linked',value:true},{type:'customer_linked',value:false}],actions:[{type:'handoff'}]}]};
assert.equal(validateAnaConfiguration(contradictory).ok,false,'contradictory conditions are rejected');
const instructions=buildAnaRuntimeInstructions(base);
assert.match(instructions,/Nunca invente preço, estoque/);
assert.match(instructions,/O catálogo fica no site oficial/);
assert.match(instructions,/curta e cordial/);
assert.doesNotMatch(instructions,/ignore as regras|ignore a política/i);
console.log('PASS: ANA config validation, protected instructions, deterministic priority and channel scopes');

