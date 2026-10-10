import assert from 'node:assert/strict';
import {routeAnaMessage} from '../supabase/functions/_shared/ana-admin-config-v1.mjs';
import {isSimpleAnaGreeting} from '../supabase/functions/_shared/ana-policy-v1.mjs';

const configuration={
  behavior:{tone:'cordial',emoji:'sparingly',conciseness:'short',use_known_first_name_on_first_greeting:true},
  knowledge:[],
  triggers:[
    {key:'humano',name:'Pedido de atendimento humano',match:'phrase',actions:[{type:'handoff'}],enabled:true,phrases:['atendente','atendimento humano','falar com uma pessoa','falar com humano','quero falar com alguém'],channels:['all'],priority:100},
    {key:'reclamacao',name:'Problema ou reclamação',match:'phrase',actions:[{type:'handoff'}],enabled:true,phrases:['reclamação','reclamar','problema com pedido','pedido atrasou','não chegou','veio errado','produto errado'],channels:['all'],priority:95},
    {key:'catalogo',name:'Abrir catálogo',match:'phrase',actions:[{type:'fixed_reply',response_text:'Você pode ver nossas cestas, kits e produtos no catálogo: www.donaantonia.com.br'}],enabled:true,phrases:['catálogo','catalogo','ver produtos','ver cestas','cestas básicas','cesta básica'],channels:['all'],priority:80},
    {key:'fazer-pedido',name:'Quero fazer um pedido',match:'phrase',actions:[{type:'fixed_reply',response_text:'Para escolher os produtos e fazer seu pedido, acesse www.donaantonia.com.br. Se precisar de ajuda, posso orientar por aqui.'}],enabled:true,phrases:['quero fazer um pedido','quero comprar','fazer pedido','como faço pedido','como comprar'],channels:['all'],priority:85},
    {key:'pagamento',name:'Formas de pagamento',match:'phrase',actions:[{type:'fixed_reply',response_text:'O pagamento é feito na entrega. Aceitamos PIX, dinheiro, cartão de crédito e cartões de alimentação/refeição.'}],enabled:true,phrases:['forma de pagamento','formas de pagamento','como pagar','aceita pix','aceita cartão','aceita cartao','pagar no cartão','pagar no cartao','tem pix','pode pagar na entrega'],channels:['all'],priority:75},
    {key:'area-entrega',name:'Área de entrega',match:'phrase',actions:[{type:'fixed_reply',response_text:'Atendemos Cuiabá e Várzea Grande. Para confirmar uma situação específica de entrega, posso encaminhar para atendimento humano.'}],enabled:true,phrases:['onde entrega','área de entrega','area de entrega','entrega em cuiabá','entrega em cuiaba','entrega em várzea grande','entrega em varzea grande','vocês entregam','voces entregam','faz entrega','entrega aqui'],channels:['all'],priority:75}
  ],
  test_cases:[
    {key:'greeting',input:'Oi',expected:'reply'},
    {key:'dynamic_price',input:'Qual o preço?',expected:'handoff'},
    {key:'operational_issue',input:'Meu pedido atrasou',expected:'handoff'},
    {key:'human_request',input:'Quero falar com atendente',expected:'handoff'},
    {key:'catalog_request',input:'Quero ver o catálogo',expected:'reply'},
    {key:'order_request',input:'Quero fazer um pedido',expected:'reply'},
    {key:'payment_pix',input:'Aceita pix?',expected:'reply'},
    {key:'payment_delivery',input:'Pode pagar na entrega?',expected:'reply'},
    {key:'delivery_area',input:'Vocês entregam?',expected:'reply'},
    {key:'complaint_wrong',input:'Veio errado',expected:'handoff'}
  ]
};

function deterministicOutcome(input,channel='0975'){
  if(isSimpleAnaGreeting(input))return 'reply';
  const route=routeAnaMessage(configuration,input,channel,{humanMode:false,customerLinked:false});
  if(route.path==='fixed_reply')return 'reply';
  if(route.path==='handoff')return 'handoff';
  if(route.path==='label'||route.path==='remove_label')return 'label';
  if(route.path==='actions'){
    if(route.actions.some(action=>action.type==='handoff'))return 'handoff';
    if(route.actions.some(action=>action.type==='fixed_reply'))return 'reply';
    if(route.actions.some(action=>['label','remove_label'].includes(action.type)))return 'label';
  }
  return 'ai';
}

for(const scenario of configuration.test_cases){
  assert.equal(
    deterministicOutcome(scenario.input,scenario.channel||'0975'),
    scenario.expected,
    `required scenario ${scenario.key} must be deterministic`
  );
}

console.log('PASS: all 10 required ANA r6 scenarios are deterministic and match expected outcomes');
