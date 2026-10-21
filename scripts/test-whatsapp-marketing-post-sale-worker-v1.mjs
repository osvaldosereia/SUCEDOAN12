import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPostSaleCarouselComponents,runPostSaleWorkerBatch} from '../supabase/functions/_shared/marketing-post-sale-worker-v1.mjs';
import {sendTemplateViaMeta} from '../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';

const workerPath='supabase/functions/whatsapp-post-sale-worker-v1/index.ts';
assert.equal(fs.existsSync(workerPath),true,'Edge Function do worker D+20 deve existir');
const worker=fs.readFileSync(workerPath,'utf8');
const orchestration=fs.readFileSync('supabase/functions/_shared/marketing-post-sale-worker-v1.mjs','utf8');
assert.match(worker,/marketing_campaign_worker_internal_key_v1/,'worker deve exigir a chave interna já usada pelo marketing');
assert.match(worker,/sendTemplateViaMeta/,'worker deve reutilizar o transporte oficial Meta');
assert.doesNotMatch(worker,/cron\.schedule|net\.http_post/i,'worker não pode ativar cron nesta etapa');
assert.match(orchestration,/marketing_post_sale_claim_due_v1/,'worker deve chamar a fila D+20');

const baskets=['economica','mini','pequena','media','grande'];
const imagePaths=baskets.map(name=>`img/marketing-post-sale/${name}.jpg`);
for(const path of imagePaths){
  const bytes=fs.readFileSync(path);
  assert.deepEqual([...bytes.subarray(0,3)],[0xff,0xd8,0xff],`${path} deve ser JPEG para mídia do WhatsApp`);
  assert.ok(bytes.length>20_000&&bytes.length<=5_000_000,`${path} deve ter tamanho útil e abaixo de 5 MB`);
}

const templateComponents=[
  {type:'BODY',text:'Conheça nossos cinco tipos de cesta básica. Responda SAIR para não receber mensagens de marketing.'},
  {type:'CAROUSEL',cards:baskets.map(name=>({components:[
    {type:'HEADER',format:'IMAGE',example:{header_handle:[`4::sample-${name}`]}},
    {type:'BODY',text:`Cesta ${{economica:'Econômica',mini:'Mini',pequena:'Pequena',media:'Média',grande:'Grande'}[name]}`},
    {type:'BUTTONS',buttons:[{type:'URL',text:'Ver cestas',url:'https://www.donaantonia.com.br/?campanha={{1}}'} ]},
  ]}))},
];
const carouselAssets=baskets.map((name,index)=>({
  card_index:index,
  basket_type:name,
  image_url:`https://www.donaantonia.com.br/img/marketing-post-sale/${name}.jpg`,
}));
const components=buildPostSaleCarouselComponents(templateComponents,carouselAssets);
assert.equal(components.length,1);
assert.equal(components[0].type,'carousel');
assert.equal(components[0].cards.length,5);
assert.deepEqual(components[0].cards.map(card=>card.card_index),[0,1,2,3,4]);
assert.ok(components[0].cards.every(card=>card.components.length===2&&card.components[0].type==='header'&&card.components[1].type==='button'));
assert.deepEqual(components[0].cards.map(card=>card.components[1].parameters[0].text),baskets.map(name=>`d20_${name}`),'cada card precisa preencher o sufixo seguro do botão dinâmico');
assert.throws(()=>buildPostSaleCarouselComponents(templateComponents,carouselAssets.slice(1)),/carousel_assets_invalid/);
assert.throws(()=>buildPostSaleCarouselComponents(templateComponents,carouselAssets.map((asset,index)=>index===2?{...asset,image_url:'https://attacker.example/fake.jpg'}:asset)),/carousel_image_url_invalid/);
assert.throws(()=>buildPostSaleCarouselComponents(templateComponents.map(row=>row.type==='BODY'?{...row,text:'Saia pelo canal oficial'}:row),carouselAssets),/post_sale_optout_copy_required/);
const dynamicButtons=structuredClone(templateComponents);
dynamicButtons[1].cards[0].components[2].buttons[0].url='https://www.donaantonia.com.br/cestas?mt={{1}}';
assert.throws(()=>buildPostSaleCarouselComponents(dynamicButtons,carouselAssets),/post_sale_static_url_button_required/);

const dispatchId='00000000-0000-4000-8000-000000000001';
const validatedItem={id:dispatchId,phone_number_id:'945659128620084',to_phone_e164:'+5565998150975',template_name:'carrossel_cestas_basicas_5_tipos_d20',language_code:'pt_BR',template_components:templateComponents,carousel_assets:carouselAssets};
const calls=[];
const db={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='marketing_post_sale_claim_due_v1')return {data:{ok:true,items:[{id:dispatchId}]}};
  if(name==='marketing_post_sale_validate_dispatch_v1')return {data:{ok:true,item:validatedItem}};
  if(name==='marketing_post_sale_finish_dispatch_v1')return {data:{ok:true,status:args.p_status}};
  throw new Error(`unexpected_rpc:${name}`);
}};
const sendRequests=[];
const results=await runPostSaleWorkerBatch({db,sendTemplate:async request=>{
  sendRequests.push(request);
  return {providerMessageId:'wamid.POST_SALE_TEST'};
},limit:1});
assert.deepEqual(results.map(row=>row.status),['accepted']);
assert.equal(sendRequests.length,1);
assert.equal(sendRequests[0].toE164,validatedItem.to_phone_e164);
assert.deepEqual(sendRequests[0].components,components);
assert.deepEqual(calls.map(call=>call.name),[
  'marketing_post_sale_claim_due_v1',
  'marketing_post_sale_validate_dispatch_v1',
  'marketing_post_sale_finish_dispatch_v1',
]);
assert.equal(calls.at(-1).args.p_status,'accepted');

const noSendCalls=[];
const uncertainDb={rpc:async(name,args)=>{
  noSendCalls.push({name,args});
  if(name==='marketing_post_sale_claim_due_v1')return {data:{ok:true,items:[{id:dispatchId}]}};
  if(name==='marketing_post_sale_validate_dispatch_v1')return {data:{ok:true,item:validatedItem}};
  if(name==='marketing_post_sale_finish_dispatch_v1')return {data:{ok:true,status:args.p_status}};
  throw new Error(`unexpected_rpc:${name}`);
}};
const uncertain=await runPostSaleWorkerBatch({db:uncertainDb,sendTemplate:async()=>{throw Object.assign(new Error('timeout'),{uncertain:true,code:'meta_timeout_uncertain'})}});
assert.deepEqual(uncertain.map(row=>row.status),['uncertain'],'resultado de transporte incerto nunca deve tentar novamente');
assert.equal(noSendCalls.at(-1).args.p_status,'uncertain');

const invalidDb={rpc:async(name,args)=>{
  if(name==='marketing_post_sale_claim_due_v1')return {data:{ok:true,items:[{id:dispatchId}]}};
  if(name==='marketing_post_sale_validate_dispatch_v1')return {data:{ok:true,item:{...validatedItem,carousel_assets:[]}}};
  if(name==='marketing_post_sale_finish_dispatch_v1')return {data:{ok:true,status:args.p_status}};
  throw new Error(`unexpected_rpc:${name}`);
}};
let invalidWasSent=false;
const invalid=await runPostSaleWorkerBatch({db:invalidDb,sendTemplate:async()=>{invalidWasSent=true;return {providerMessageId:'never'}}});
assert.equal(invalidWasSent,false,'mídia inválida deve bloquear o transporte antes de qualquer envio');
assert.equal(invalid[0].status,'failed');

const mismatchDb={rpc:async(name,args)=>{
  if(name==='marketing_post_sale_claim_due_v1')return {data:{ok:true,items:[{id:dispatchId}]}};
  if(name==='marketing_post_sale_validate_dispatch_v1')return {data:{ok:true,item:{...validatedItem,template_name:'template_nao_aprovado'}}};
  if(name==='marketing_post_sale_finish_dispatch_v1')return {data:{ok:true,status:args.p_status}};
  throw new Error(`unexpected_rpc:${name}`);
}};
let mismatchWasSent=false;
const mismatch=await runPostSaleWorkerBatch({db:mismatchDb,sendTemplate:async()=>{mismatchWasSent=true;return {providerMessageId:'never'}}});
assert.equal(mismatchWasSent,false,'nome/idioma do template de jornada devem ser fixos antes do transporte');
assert.equal(mismatch[0].status,'failed');

const requests=[];
const metaResponse=await sendTemplateViaMeta({
  accessToken:'test-token',phoneNumberId:'945659128620084',toE164:'+5565998150975',
  templateName:'carrossel_cestas_basicas_5_tipos_d20',languageCode:'pt_BR',components,
  graphVersion:'v24.0',fetchImpl:async(_url,init)=>{
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({messages:[{id:'wamid.CAROUSEL_STATIC_CTA_TEST'}]}),{status:200,headers:{'content-type':'application/json'}});
  },
});
assert.equal(metaResponse.providerMessageId,'wamid.CAROUSEL_STATIC_CTA_TEST');
assert.equal(requests[0].template.components[0].cards.length,5);
assert.ok(requests[0].template.components[0].cards.every(card=>card.components.length===2));
assert.deepEqual(requests[0].template.components[0].cards.map(card=>card.components[1].parameters[0].text),baskets.map(name=>`d20_${name}`));

console.log('marketing post-sale D+20 worker: ok');
