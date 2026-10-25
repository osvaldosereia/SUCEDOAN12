import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {flowExchange,parseQty,assertBasket,SIZE_KEYS,ITEM_SCREENS,PAGE_SIZE} from '../supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs';
import {signState,verifyState,hmac,verifyAppSignature,decryptMetaPayload,encryptMetaResponse} from '../supabase/functions/whatsapp-1018-basket-flow-v1/crypto.mjs';
import {canonicalMessagesFromMeta} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';
import {parseBasketFlowRequest,latestBasketFlowRequest,CANARY_CONVERSATION} from '../vitrine/admin/whatsapp-lab/reply-parser.mjs';
globalThis.crypto??=webcrypto;
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const flow=JSON.parse(read('vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v1.json'));
assert.equal(flow.version,'7.3');assert.equal(flow.data_api_version,'3.0');
assert.equal(flow.screens.length,7);
const flowJsonText=JSON.stringify(flow);
assert.doesNotMatch(flowJsonText,/R\s*\$\s*\d/,'Flow JSON examples must not contain invented commercial prices');
assert.doesNotMatch(flowJsonText,/Arroz 5 kg|Marca 1|Marca 2/,'Flow JSON examples must not present invented product or brand names');
const combinationScreen=flow.screens.find(s=>s.id==='COMBINACAO');
assert.equal(combinationScreen.data.resumoMarcas?.type,'string','brand mix summary is populated dynamically');
assert.ok(combinationScreen.layout.children.some(x=>x.type==='TextBody'&&x.text==='\u0024{data.resumoMarcas}'),'customer can compare the real brands in all three combinations');
const totalNode=flow.screens.find(s=>s.id==='RESUMO').layout.children.find(x=>x.text?.includes('\u0024{data.valor}'));
assert.equal(totalNode?.text,'\u0024{data.valor}','Meta text interpolation must be a standalone dynamic binding');
const storefrontSource=read('supabase/functions/storefront-v2/index.ts');
assert.ok(storefrontSource.includes('select("id,name,brand,sku,'),'basket catalog reads real product brand metadata');
assert.ok(storefrontSource.includes('brand:selected.brand||""'),'basket detail exposes actual brand metadata to Flow');

const edges=Object.values(flow.routing_model).reduce((sum,next)=>sum+next.length,0);
assert.ok(edges<=10,'Meta Flow routing_model cannot exceed ten edges');
assert.equal(edges,8);
const ids=flow.screens.map(screen=>screen.id);
assert.ok(ids.every(id=>/^[A-Z_]+$/.test(id)),'screen IDs must contain only letters and underscores');
assert.equal(new Set(ids).size,ids.length);
assert.deepEqual(ids,['TAMANHO','COMBINACAO',...ITEM_SCREENS,'RESUMO']);
assert.equal(flow.routing_model.RESUMO.length,0);
assert.deepEqual(flow.routing_model.ITENS_UM,['ITENS_DOIS']);
assert.deepEqual(flow.routing_model.ITENS_DOIS,['ITENS_TRES','RESUMO']);
assert.deepEqual(flow.routing_model.ITENS_TRES,['ITENS_QUATRO','RESUMO']);
assert.deepEqual(flow.routing_model.ITENS_QUATRO,['RESUMO']);

assert.equal(flow.screens.at(-1).terminal,true);
const completePayload=flow.screens.find(s=>s.id==='RESUMO').layout.children.at(-1)['on-click-action'].payload;
assert.deepEqual(completePayload,{resultado:'solicitacao_para_atendimento',resumo:'${data.resumo}',valor:'${data.valor}',itens:'${data.itens}'});
for(const s of flow.screens){assert.ok(s.layout.children.length<=50);assert.equal(s.layout.children.filter(x=>x.type==='Footer').length,1);}
for(const screen of flow.screens.filter(s=>ITEM_SCREENS.includes(s.id))){for(const field of screen.layout.children.filter(c=>c.type==='Dropdown'))assert.equal(field.required,field.visible,`${screen.id}.${field.name} must be required only when visible`);}
for(let i=1;i<=ITEM_SCREENS.length;i++){
 const screen=flow.screens.find(x=>x.id===ITEM_SCREENS[i-1]);
 assert.ok(screen);assert.equal(screen.layout.children.filter(c=>c.type==='Dropdown').length,16);
 assert.ok(screen.layout.children.filter(c=>c.type==='Dropdown'&&c.label==='Quantidade').length===8);
 assert.equal(screen.layout.children.at(-1)['on-click-action'].name,'data_exchange');
}
assert.equal(flow.screens.find(x=>x.id==='TAMANHO').layout.children.at(-1)['on-click-action'].name,'data_exchange');
assert.equal(flow.screens.at(-1).layout.children.at(-1)['on-click-action'].name,'complete');
assert.doesNotMatch(JSON.stringify(flow),/submit_order|create_order/);
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const flowResponseJson=JSON.stringify({estado:'opaque-session-state',resultado:'solicitacao_para_atendimento',resumo:'Cesta Média · Combinação 2',valor:'R$ 123,45',itens:'1x Feijão\n2x Arroz'});
const normalizedFlowMessages=canonicalMessagesFromMeta({entry:[{id:'test-waba',changes:[{field:'messages',value:{metadata:{phone_number_id:'12345'},messages:[{from:'5511999999999',id:'wamid.flow.test',timestamp:'1792864800',type:'interactive',interactive:{nfm_reply:{body:'Solicitação de cesta recebida',response_json:flowResponseJson}}}]}}]}]},()=>uuid(8000));
assert.equal(normalizedFlowMessages.length,1);
const normalizedFlowMessage={...normalizedFlowMessages[0].message,provider:normalizedFlowMessages[0].provider};
assert.equal(normalizedFlowMessage.message_type,'interactive');
assert.equal(normalizedFlowMessage.metadata.interactive.nfm_reply.response_json,flowResponseJson);
const basketFlowRequest=parseBasketFlowRequest(normalizedFlowMessage);
assert.deepEqual(basketFlowRequest,{summary:'Cesta Média · Combinação 2',total:'R$ 123,45',items:'1x Feijão\n2x Arroz',receivedAt:normalizedFlowMessage.received_at});
assert.equal(Object.hasOwn(basketFlowRequest,'estado'),false,'session state must not be exposed in the Admin view');
assert.equal(parseBasketFlowRequest({...normalizedFlowMessage,direction:'outbound'}),null);
assert.equal(parseBasketFlowRequest({...normalizedFlowMessage,provider:'papoai'}),null);
const malformedFlowMessage={...normalizedFlowMessage,metadata:{interactive:{nfm_reply:{response_json:'{invalid'}}}};
assert.equal(parseBasketFlowRequest(malformedFlowMessage),null);
const unrelatedFlowMessage={...normalizedFlowMessage,metadata:{interactive:{nfm_reply:{response_json:JSON.stringify({resultado:'other'})}}}};
assert.equal(parseBasketFlowRequest(unrelatedFlowMessage),null);
const accountId=uuid(8000);
const canaryDetail={ok:true,conversation:{id:CANARY_CONVERSATION,phone_e164:'+5565999828360',whatsapp_account_id:accountId},account:{id:accountId,phone_e164:'+5565984491018'},messages:[{...normalizedFlowMessage,id:'db-message',message_at:normalizedFlowMessage.received_at}]};
const latestFlowRequest=latestBasketFlowRequest(canaryDetail);
assert.deepEqual(latestFlowRequest,{summary:'Cesta Média · Combinação 2',total:'R$ 123,45',items:'1x Feijão\n2x Arroz',receivedAt:normalizedFlowMessage.received_at});
assert.equal(latestBasketFlowRequest({...canaryDetail,conversation:{...canaryDetail.conversation,id:'other-conversation'}}),null);
assert.equal(latestBasketFlowRequest({...canaryDetail,conversation:{...canaryDetail.conversation,phone_e164:'+5565991111111'}}),null);
const labSource=read('vitrine/admin/whatsapp-lab/lab.js');
assert.match(labSource,/latestBasketFlowRequest\(detail\)/);
assert.match(labSource,/readFlowRequestBtn/);
assert.match(labSource,/content\.textContent=value/,'Flow data must be inserted as text, not HTML');
assert.match(labSource,/A conclusão do Flow não cria pedido/);
assert.match(read('vitrine/admin/whatsapp-lab/index.html'),/id="flowRequestStatus"/);
const shell={ok:true,baskets:SIZE_KEYS.map((key,i)=>({id:uuid(i+1),size_key:key}))};
const itemCount=27,basketId=shell.baskets[0].id,items=Array.from({length:itemCount},(_,i)=>({position_id:uuid(i+100),product_id:uuid(i+1000),name:'Produto '+(i+1)+' Marca A 1 kg',quantity:i===0?2:1}));
const secret='A'.repeat(64);
const deps={
 async shell(){return shell},
 async basket(id,n){return {ok:true,basket:{id,composition_number:n,display_price_cents:17270+n*100,stock_quantity:10},items:items.map(x=>({...x,brand:'Marca '+n}))}},
 async options(_id,_n,positions){return {ok:true,positions:positions.map(row=>({position_id:row.position_id,alternatives:[{product_id:items.find(x=>x.position_id===row.position_id).product_id,name:'Marca A 1 kg',stock_quantity:20},{product_id:uuid(6000+items.findIndex(x=>x.position_id===row.position_id)),name:'Marca B 1 kg',stock_quantity:20}]}))}},
 async quote(id,n,all){assert.equal(all.length,itemCount);assert.equal(id,basketId);assert.equal(n,1);return {ok:true,total_cents:17000+all.reduce((sum,x)=>sum+x.quantity*10,0),basket:{stock_quantity:2},items:all.map((x,i)=>({...x,name:'Produto '+(i+1)+' 1 kg'}))}},
 signState:st=>signState(st,secret),verifyState:s=>verifyState(s,secret)
};
const init=await flowExchange({action:'INIT'},deps);
assert.equal(init.screen,'TAMANHO');assert.equal(init.data.tamanhos.length,5);
const combos=await flowExchange({action:'data_exchange',screen:'TAMANHO',data:{etapa:'tamanho',tamanho:'mini'}},deps);
assert.equal(combos.screen,'COMBINACAO');assert.equal(combos.data.opcoes.length,3);assert.match(combos.data.opcoes[0].description,/R\$/);
assert.deepEqual(combos.data.resumoMarcas.split('\\n'),['Combinação 1: Marca 1','Combinação 2: Marca 2','Combinação 3: Marca 3']);
const first=await flowExchange({action:'data_exchange',screen:'COMBINACAO',data:{etapa:'combinacao',tamanho:'mini',combinacao:'1'}},deps);
assert.equal(first.screen,ITEM_SCREENS[0]);assert.equal(first.data.vis0,true);
assert.equal(first.data.marca0,items[0].product_id);
let stage=first;
for(let page=1;page<=Math.ceil(itemCount/PAGE_SIZE);page++){
 const d={etapa:'itens',estado:stage.data.estado,pagina:String(page)};
 for(let j=0;j<PAGE_SIZE;j++){d['marca'+j]=stage.data['marca'+j];d['quant'+j]=stage.data['quant'+j];}
 if(page===1){d.quant0='0';d.marca1=uuid(6001);}
 const res=await flowExchange({action:'data_exchange',screen:ITEM_SCREENS[page-1],data:d},deps);
 const routeSource=ITEM_SCREENS[page-1];
 assert.ok(flow.routing_model[routeSource].includes(res.screen),`route ${routeSource} -> ${res.screen} is declared`);
 if(page<Math.ceil(itemCount/PAGE_SIZE))assert.equal(res.screen,ITEM_SCREENS[page]);
 else{assert.equal(res.screen,'RESUMO');assert.match(res.data.valor,/R\$/);assert.ok(res.data.itens.includes('Produto'));}
 stage=res;
}
for(const count of [14,15,16,17,23,24,25,27,30]){
 const rangeItems=Array.from({length:count},(_,i)=>({position_id:uuid(i+100),product_id:uuid(i+1000),name:'Item '+(i+1),quantity:i===0?2:1}));
 const rangeDeps={
  async shell(){return shell;},
  async basket(id,n){return {ok:true,basket:{id,composition_number:n,display_price_cents:17270+n*100,stock_quantity:10},items:rangeItems.map(x=>({...x}))};},
  async options(_id,_n,positions){return {ok:true,positions:positions.map(row=>{const index=rangeItems.findIndex(x=>x.position_id===row.position_id);const item=rangeItems[index];return {position_id:row.position_id,alternatives:[{product_id:item.product_id,name:item.name,stock_quantity:20},{product_id:uuid(7000+index),name:'Alternativa '+index,stock_quantity:20}]};})};},
  async quote(id,n,all){return {ok:true,total_cents:17000+all.reduce((sum,x)=>sum+x.quantity*10,0),basket:{stock_quantity:2},items:all.map((x,i)=>({...x,name:'Item '+(i+1)}))};},
  signState:st=>signState(st,secret),verifyState:s=>verifyState(s,secret)
 };
 let pageState=await flowExchange({action:'data_exchange',screen:'COMBINACAO',data:{etapa:'combinacao',tamanho:'mini',combinacao:'1'}},rangeDeps);
 const pageCount=Math.ceil(count/PAGE_SIZE);
 for(let page=1;page<=pageCount;page++){
  const data={etapa:'itens',estado:pageState.data.estado,pagina:String(page)};
  for(let j=0;j<PAGE_SIZE;j++){data['marca'+j]=pageState.data['marca'+j];data['quant'+j]=pageState.data['quant'+j];}
  const current=ITEM_SCREENS[page-1];
  const next=await flowExchange({action:'data_exchange',screen:current,data},rangeDeps);
  assert.ok(flow.routing_model[current].includes(next.screen),`route ${current} -> ${next.screen} exists for ${count} items`);
  if(page<pageCount)assert.equal(next.screen,ITEM_SCREENS[page]);
  else assert.equal(next.screen,'RESUMO');
  pageState=next;
 }
}
assert.throws(()=>parseQty('-1'));assert.throws(()=>parseQty('11'));assert.equal(parseQty('0'),0);
const validSigned=await signState({ok:true},secret);
await assert.rejects(()=>verifyState(validSigned.replace(/.$/,'X'),secret));
await assert.rejects(()=>flowExchange({action:'data_exchange',screen:'TAMANHO',data:{etapa:'tamanho',tamanho:'invalido'}},deps));
const keypair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
const privateDer=await crypto.subtle.exportKey('pkcs8',keypair.privateKey);
const asB64=x=>Buffer.from(x).toString('base64');
const pem='-----BEGIN PRIVATE KEY-----\n'+asB64(privateDer)+'\n-----END PRIVATE KEY-----';
const aesBytes=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(16));
const key=await crypto.subtle.importKey('raw',aesBytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
const request={action:'ping'};
const requestData=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(request)));
const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},keypair.publicKey,aesBytes);
const decrypted=await decryptMetaPayload({encrypted_aes_key:asB64(wrapped),encrypted_flow_data:asB64(requestData),initial_vector:asB64(iv)},pem);
assert.deepEqual(decrypted.payload,request);
const responseB64=await encryptMetaResponse({data:{status:'active'}},decrypted);
const flipped=Uint8Array.from(iv,x=>x^255);
const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:flipped},key,Buffer.from(responseB64,'base64'));
assert.equal(JSON.parse(new TextDecoder().decode(decoded)).data.status,'active');
const body='{"some":"data"}',appSecret='B'.repeat(40),digest=await hmac(appSecret,body);
const signature='sha256='+Buffer.from(digest).toString('hex');
assert.equal(await verifyAppSignature(body,signature,appSecret),true);
assert.equal(await verifyAppSignature(body,signature.replace(/.$/,'0'),appSecret),false);
console.log('PASS Meta dynamic Flow 7 screens/30 item capacity, 14-30 item route branches, choices, brands, quantities, quote, signatures and RSA/AES encryption');
