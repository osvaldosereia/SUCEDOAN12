import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {flowExchange,parseQty,assertBasket,SIZE_KEYS,ITEM_SCREENS,PAGE_SIZE} from '../supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs';
import {flowExchange as legacyFlowExchange} from '../supabase/functions/whatsapp-1018-basket-flow-v1/engine-legacy-v1.mjs';
import {dispatchCanaryFlow,selectCanaryEngine,DYNAMIC_V2_FLOW_ID} from '../supabase/functions/whatsapp-1018-basket-flow-v1/flow-release-router.mjs';
import {loadProductImage,MAX_PRODUCT_IMAGE_BYTES} from '../supabase/functions/whatsapp-1018-basket-flow-v1/images.mjs';
import {signState,verifyState,hmac,verifyAppSignature,decryptMetaPayload,encryptMetaResponse} from '../supabase/functions/whatsapp-1018-basket-flow-v1/crypto.mjs';
import {canonicalMessagesFromMeta} from '../supabase/functions/_shared/whatsapp-core-v1.mjs';
import {parseBasketFlowRequest,latestBasketFlowRequest,CANARY_CONVERSATION} from '../vitrine/admin/whatsapp-lab/reply-parser.mjs';
globalThis.crypto??=webcrypto;
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const flow=JSON.parse(read('vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v2.json'));
assert.equal(selectCanaryEngine('3300494700136506'),'legacy-v1','published V1 retains its original endpoint protocol');
assert.equal(selectCanaryEngine(undefined),'legacy-v1','existing canary tokens without a flow ID retain V1 behavior');
assert.equal(selectCanaryEngine(DYNAMIC_V2_FLOW_ID),'basket-editor-v2','only the new DRAFT uses the item editor engine');
const dispatchedEngines=[];
await dispatchCanaryFlow({}, {flow_id:DYNAMIC_V2_FLOW_ID}, {}, {"basket-editor-v2":async()=>{dispatchedEngines.push('v2');return 'v2';},"legacy-v1":async()=>{dispatchedEngines.push('v1');return 'v1';}});
assert.deepEqual(dispatchedEngines,['v2']);
const adminFlowsSource=read('supabase/functions/admin-whatsapp-templates-v1/index.ts');
assert.match(adminFlowsSource,/flow_id:\s*String\(flowId\)/,'signed canary token identifies the selected Meta Flow for safe engine routing');
assert.match(adminFlowsSource,/FLOW_CANARY_TOKEN_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,'the initial Flow token uses a 24-hour lifetime');
assert.match(adminFlowsSource,/flowToken=await signState\([^;\n]+FLOW_CANARY_TOKEN_TTL_MS/,'canary signing uses its longer lifetime, not the short edit-state default');
assert.equal(flow.version,'7.3');assert.equal(flow.data_api_version,'3.0');
assert.equal(flow.screens.length,4,'the V2 uses one screen per product type and one reusable quantity editor');
const flowJsonText=JSON.stringify(flow);
assert.doesNotMatch(flowJsonText,/R\s*\$\s*\d/,'Flow JSON examples must not contain invented commercial prices');
assert.doesNotMatch(flowJsonText,/Arroz 5 kg|Marca 1|Marca 2/,'Flow JSON examples must not present invented product or brand names');
const totalNode=flow.screens.find(s=>s.id==='RESUMO').layout.children.find(x=>x.text?.includes('\u0024{data.valor}'));
assert.equal(totalNode?.text,'\u0024{data.valor}','Meta text interpolation must be a standalone dynamic binding');
const storefrontSource=read('supabase/functions/storefront-v2/index.ts');
assert.ok(storefrontSource.includes('select("id,name,brand,sku,'),'basket catalog reads real product brand metadata');
assert.ok(storefrontSource.includes('brand:selected.brand||""'),'basket detail exposes actual brand metadata to Flow');

const edges=Object.values(flow.routing_model).reduce((sum,next)=>sum+next.length,0);
assert.ok(edges<=10,'Meta Flow routing_model cannot exceed ten edges');
assert.equal(edges,3);
const ids=flow.screens.map(screen=>screen.id);
assert.ok(ids.every(id=>/^[A-Z_]+$/.test(id)),'screen IDs must contain only letters and underscores');
assert.equal(new Set(ids).size,ids.length);
assert.deepEqual(ids,['TAMANHO','TIPO_PRODUTO','OPCAO_EDIT','RESUMO']);
assert.equal(flow.routing_model.RESUMO.length,0);
assert.deepEqual(flow.routing_model.TAMANHO,['TIPO_PRODUTO']);
assert.deepEqual(flow.routing_model.TIPO_PRODUTO,['OPCAO_EDIT','RESUMO']);
assert.deepEqual(flow.routing_model.OPCAO_EDIT,[],'Meta supplies back navigation to the product list');
for(const [from,toList] of Object.entries(flow.routing_model)){
 for(const to of toList)assert.ok(!flow.routing_model[to]?.includes(from),`routing_model must not declare the reciprocal edge ${to}->${from}`);
}
const productList=flow.screens.find(x=>x.id==='TIPO_PRODUTO');
assert.equal(productList.layout.children.find(x=>x.type==='NavigationList')?.['list-items'],'${data.itens_lista}');
assert.equal(productList.data.itens_lista.type,'array');
assert.ok(productList.data.itens_lista.items.properties['on-click-action'],'each product choice has its own action');
const itemActionPayload=productList.data.itens_lista.items.properties['on-click-action'].properties.payload.properties;
assert.equal(itemActionPayload.indice?.type,'string','type navigation action sends a declared index');
assert.equal(itemActionPayload.pagina?.type,'string','option pagination sends a declared page');
assert.ok(productList.data.itens_lista.items.optionalProperties.start,'product rows may include a real photo');
const editor=flow.screens.find(x=>x.id==='OPCAO_EDIT');
assert.ok(editor.layout.children.some(x=>x.type==='Image'&&x.src==='${data.imagem}'));
const quantityInput=editor.layout.children.find(x=>x.type==='TextInput'&&x.name==='quantidade');
assert.equal(quantityInput?.['input-type'],'number','quantity uses the native numeric keyboard');
assert.equal(quantityInput?.['max-chars'],2,'Meta expects max-chars to be a number');
assert.equal(quantityInput?.['init-value'],'${data.quantidade}');
assert.match(quantityInput?.pattern||'',/10\|\[0-9\]/);
assert.ok(quantityInput?.['helper-text'],'quantity range and zero-removal behavior are explained');
assert.equal(flow.screens.at(-1).terminal,true);
const completePayload=flow.screens.find(s=>s.id==='RESUMO').layout.children.at(-1)['on-click-action'].payload;
assert.deepEqual(completePayload,{resultado:'solicitacao_para_atendimento',resumo:'${data.resumo}',valor:'${data.valor}',itens:'${data.itens}'});
for(const screen of flow.screens){assert.ok(screen.layout.children.length<=50);if(screen.id==='TIPO_PRODUTO')continue;assert.equal(screen.layout.children.filter(x=>x.type==='Footer').length,1);}
assert.doesNotMatch(JSON.stringify(flow),/submit_order|create_order/);
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const webp=Uint8Array.from([...Buffer.from('RIFF0000WEBP'),0,1,2,3]);
const validImageUrl='https://ssbesxgaijknwsjbsbcz.supabase.co/storage/v1/object/public/product-images/openai/grid18/v2/final/ef250a46-9b06-47d2-b31c-99c38232819f/bf8426b7-ba7c-42d5-854e-14b32d28eb90-p16.webp';
let imageFetchArgs;
const encodedImage=await loadProductImage(validImageUrl,async(...args)=>{imageFetchArgs=args;return new Response(webp,{headers:{'Content-Type':'image/webp'}})});
assert.equal(encodedImage,Buffer.from(webp).toString('base64'));
assert.equal(imageFetchArgs[1].redirect,'error','product image fetch must reject redirects');
assert.ok(imageFetchArgs[1].signal instanceof AbortSignal,'product image fetch has a hard timeout');
const transformedImageUrl=new URL(imageFetchArgs[0]);
assert.match(transformedImageUrl.pathname,/\/storage\/v1\/render\/image\/public\/product-images\//);
assert.deepEqual(Object.fromEntries(transformedImageUrl.searchParams),{width:'240',height:'190',resize:'contain',quality:'60',format:'webp'},'Supabase photos are resized before entering the Flow payload');
let imageFetchCalls=0;
const countedImageFetch=async()=>{imageFetchCalls++;return new Response(webp,{headers:{'Content-Type':'image/webp'}})};
assert.equal(await loadProductImage('https://evil.example/storage/v1/object/public/product-images/a.webp',countedImageFetch),'');
assert.equal(await loadProductImage('https://ssbesxgaijknwsjbsbcz.supabase.co/storage/v1/object/public/other-bucket/a.webp',countedImageFetch),'');
assert.equal(await loadProductImage(validImageUrl+'?width=10',countedImageFetch),'');
assert.equal(await loadProductImage('https://raw.githubusercontent.com/osvaldosereia/OTHER/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/site/img/produtos_3/a.webp',countedImageFetch),'');
assert.equal(imageFetchCalls,0,'unapproved image hosts, buckets, and repositories are rejected before fetching');
assert.equal(await loadProductImage(validImageUrl,async()=>new Response(webp,{headers:{'Content-Type':'text/html'}})),'');
assert.equal(await loadProductImage(validImageUrl,async()=>new Response(Buffer.from('not-image'),{headers:{'Content-Type':'image/webp'}})),'');
const oversized=new Uint8Array(MAX_PRODUCT_IMAGE_BYTES+1);oversized.set(Buffer.from('RIFF0000WEBP'));
assert.equal(await loadProductImage(validImageUrl,async()=>new Response(oversized,{headers:{'Content-Type':'image/webp'}})),'');
const oversizedStream=new ReadableStream({start(controller){controller.enqueue(oversized);controller.close()}});
assert.equal(await loadProductImage(validImageUrl,async()=>new Response(oversizedStream,{headers:{'Content-Type':'image/webp'}})),'','streaming body limit is enforced without Content-Length');
const githubImageUrl='https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/169a4a4ac7cdba62e21518d482fe8a9950e4f1e6/site/img/produtos_3/cadastro/1787583676839_c0f6.webp';
assert.equal(await loadProductImage(githubImageUrl,async()=>new Response(webp,{headers:{'Content-Type':'image/webp'}})),Buffer.from(webp).toString('base64'));
assert.equal(await loadProductImage(validImageUrl,async()=>{throw new Error('network timeout')}),'','image transport failures do not break the catalog');
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
const shell={ok:true,baskets:SIZE_KEYS.map((key,i)=>({id:uuid(i+1),size_key:key,starting_price_cents:17270+i*100,starting_composition_number:1}))};
const itemCount=27,basketId=shell.baskets[0].id;
const makeItems=count=>Array.from({length:count},(_,i)=>({position_id:uuid(i+100),product_id:uuid(i+1000),name:'Produto '+(i+1)+' Marca A 1 kg',brand:'Marca A',image_url:'https://ssbesxgaijknwsjbsbcz.supabase.co/storage/v1/object/public/product-images/item-'+i+'.webp',packaging:'1 kg',price_cents:100,stock_quantity:20,quantity:i===0?2:1}));
let activeItems=makeItems(itemCount),basketCalls=0,snapshotCalls=0;
const secret='A'.repeat(64);
const canaryIssuedAt=Date.now();
const canaryToken=await signState({type:'da-flow-1018-canary',sender:'+5565984491018',to:'+5565999828360',flow_id:DYNAMIC_V2_FLOW_ID,nonce:'test-canary-nonce-1234'},secret,24*60*60*1000);
const shortState=await signState({type:'basket-edit-state'},secret);
const realDateNow=Date.now;
Date.now=()=>canaryIssuedAt+8*60*60*1000;
try{
 const delayedClaims=await verifyState(canaryToken,secret);
 assert.equal(delayedClaims.flow_id,DYNAMIC_V2_FLOW_ID,'canary remains valid when the recipient opens it hours after delivery');
}finally{Date.now=realDateNow;}
const shortStateIssuedAt=Date.now();
Date.now=()=>shortStateIssuedAt+46*60*1000;
try{await assert.rejects(()=>verifyState(shortState,secret),/state_expired/,'per-screen basket state keeps the existing 45-minute expiry');}
finally{Date.now=realDateNow;}
const deps={
 async shell(){return shell},
 async basket(id,n){return {ok:true,basket:{id,composition_number:n,display_price_cents:17270+n*100,stock_quantity:10},items:activeItems.map(x=>({...x,brand:'Marca '+n}))}},
 async options(_id,_n,positions){return {ok:true,positions:positions.map(row=>{const original=activeItems.find(x=>x.position_id===row.position_id),index=activeItems.findIndex(x=>x.position_id===row.position_id);return {position_id:row.position_id,alternatives:[{product_id:original.product_id,name:original.name,brand:original.brand,image_url:original.image_url,price_cents:100,stock_quantity:20},{product_id:uuid(6000+index),name:'Produto '+(index+1)+' Marca B 1 kg',brand:'Marca B',image_url:original.image_url,price_cents:250,stock_quantity:4}]};})}},
 async quote(id,n,all){basketCalls++;assert.equal(all.length,activeItems.length);assert.equal(id,basketId);assert.equal(n,1);const items=all.map((x,i)=>{const original=activeItems[i],isAlt=x.product_id!==original.product_id;return {...original,...x,name:isAlt?'Produto '+(i+1)+' Marca B 1 kg':original.name,brand:isAlt?'Marca B':'Marca A',image_url:original.image_url,price_cents:isAlt?250:100,stock_quantity:isAlt?4:20};});return {ok:true,total_cents:items.reduce((sum,x)=>sum+x.quantity*x.price_cents,0),basket:{stock_quantity:2},items}},
 async configuration(id,n){
  const productTypes=[
   {id:uuid(7000),name:'Arroz',flow_enabled:true,flow_sort_order:1,selection_mode:'multiple',max_quantity:10},
   {id:uuid(7001),name:'Feijão',flow_enabled:true,flow_sort_order:2,selection_mode:'single',max_quantity:10}
  ];
  const positions=activeItems.map((item,index)=>{
   const type=productTypes[index<Math.ceil(activeItems.length/2)?0:1],alternativeId=uuid(6000+index);
   const base={product_id:item.product_id,name:item.name,brand:item.brand,packaging:item.packaging,image_url:item.image_url,price_cents:item.price_cents,stock_quantity:item.stock_quantity};
   const alternative={product_id:alternativeId,name:'Produto '+(index+1)+' Marca B 1 kg',brand:'Marca B',packaging:'1 kg',image_url:item.image_url,price_cents:250,stock_quantity:4};
   return {position_id:item.position_id,label:type.name+' · '+(index+1),base_quantity:item.quantity,base,type_id:type.id,type_name:type.name,editable:true,reason:'',selection_mode:type.selection_mode,max_quantity:type.max_quantity,options:[base,alternative]};
  });
  return {ok:true,basket:{id,composition_number:n,display_price_cents:17270+n*100,stock_quantity:10,hidden_adjustment_cents:0,conditional_hidden_enabled:false,conditional_hidden_product_id:null,conditional_hidden_adjustment_cents:0},product_types:productTypes,positions};
 },
 async flowQuote(id,n,submitted){
  basketCalls++;
  const config=await this.configuration(id,n),incoming=new Map((submitted||[]).map(row=>[String(row.position_id),row.selections||[]])),items=[];
  for(const position of config.positions){
   if(!position.editable){items.push({...position.base,position_id:position.position_id,quantity:position.base_quantity,fixed:true});continue;}
   const selections=incoming.has(position.position_id)?incoming.get(position.position_id):[{product_id:position.base.product_id,quantity:position.base_quantity}];
   for(const selection of selections){
    const quantity=Number(selection.quantity||0);if(quantity<=0)continue;
    const option=position.options.find(item=>String(item.product_id)===String(selection.product_id));if(option)items.push({...option,position_id:position.position_id,quantity,fixed:false});
   }
  }
  const total=items.reduce((sum,item)=>sum+Number(item.price_cents||0)*Number(item.quantity||0),0);
  return {ok:true,total_cents:total,basket:{...config.basket,display_price_cents:total,stock_quantity:4},items,extras:[]};
 },
 async snapshot(id,n,submitted){
  snapshotCalls++;
  const configuration=await this.configuration(id,n);
  return {ok:true,configuration,quote:await this.flowQuote(id,n,submitted)};
 },
 async image(url){return url?'aW1hZ2U=':''},
 signState:st=>signState(st,secret),verifyState:s=>verifyState(s,secret)
};
const legacyPage=await dispatchCanaryFlow({action:'data_exchange',screen:'COMBINACAO',data:{etapa:'combinacao',tamanho:'mini',combinacao:'1'}},{flow_id:'3300494700136506'},deps,{"basket-editor-v2":flowExchange,"legacy-v1":legacyFlowExchange});
assert.equal(legacyPage.screen,'ITENS_UM');
assert.equal(legacyPage.data.pagina,'1');
assert.ok(legacyPage.data.nome0&&legacyPage.data.marcas0?.length,'published V1 keeps the multi-product form data contract');
const legacySubmit={etapa:'itens',estado:legacyPage.data.estado,pagina:legacyPage.data.pagina};
for(let i=0;i<8;i++){legacySubmit['quant'+i]=legacyPage.data['quant'+i];legacySubmit['marca'+i]=legacyPage.data['marca'+i];}
const legacyNext=await dispatchCanaryFlow({action:'data_exchange',screen:'ITENS_UM',data:legacySubmit},{flow_id:'3300494700136506'},deps,{"basket-editor-v2":flowExchange,"legacy-v1":legacyFlowExchange});
assert.equal(legacyNext.screen,'ITENS_DOIS','the published Flow can continue to its next product page after endpoint deployment');
const init=await flowExchange({action:'INIT'},deps);
assert.equal(init.screen,'TAMANHO');assert.equal(init.data.tamanhos.length,5);
assert.match(init.data.tamanhos[0].description,/A partir de R\$/);
const firstType=await flowExchange({action:'data_exchange',screen:'TAMANHO',data:{etapa:'tamanho',tamanho:'mini'}},deps);
assert.equal(firstType.screen,'TIPO_PRODUTO');assert.equal(firstType.data.tipo_nome,'Arroz');
assert.match(firstType.data.lista_descricao,/Total atualizado R\$/);
assert.equal(firstType.data.itens_lista.length,14,'12 product options and two navigation actions fit the list');
assert.ok(firstType.data.itens_lista[0].start.image,'catalog rows include a real product thumbnail');
assert.match(firstType.data.itens_lista[0]['main-content'].metadata,/2 un/);
const openPayload=firstType.data.itens_lista[1]['on-click-action'].payload;
assert.equal(openPayload.etapa,'editar_opcao');
const detail=await flowExchange({action:'data_exchange',screen:'TIPO_PRODUTO',data:openPayload},deps);
assert.equal(detail.screen,'OPCAO_EDIT');assert.equal(detail.data.imagem,'aW1hZ2U=');assert.equal(detail.data.quantidade,'0');
const alternate=uuid(6000);assert.equal(detail.data.product_id,alternate);
const edited=await flowExchange({action:'data_exchange',screen:'OPCAO_EDIT',data:{etapa:'salvar_opcao',estado:detail.data.estado,position_id:detail.data.position_id,product_id:alternate,quantidade:'3'}},deps);
assert.equal(edited.screen,'TIPO_PRODUTO');
assert.ok(edited.data.itens_lista.find(x=>x['on-click-action']?.payload?.product_id===alternate)['main-content'].metadata.includes('3 un.'));
assert.ok(edited.data.lista_descricao.includes('Total atualizado R$'));
assert.ok(basketCalls>=2,'initial and changed selections are priced by the Flow quote contract');
assert.ok(snapshotCalls>=2,'size selection and quantity saves use the combined configuration and quote snapshot');
const stockError=await flowExchange({action:'data_exchange',screen:'OPCAO_EDIT',data:{etapa:'salvar_opcao',estado:detail.data.estado,position_id:detail.data.position_id,product_id:alternate,quantidade:'5'}},deps);
assert.equal(stockError.screen,'OPCAO_EDIT');assert.match(stockError.data.aviso,/Estoque ou opção atualizados/);
const nextOptionsPayload=firstType.data.itens_lista.find(x=>x['on-click-action']?.payload?.etapa==='pagina_opcoes')['on-click-action'].payload;
const nextOptions=await flowExchange({action:'data_exchange',screen:'TIPO_PRODUTO',data:nextOptionsPayload},deps);
assert.equal(nextOptions.screen,'TIPO_PRODUTO');assert.ok(nextOptions.data.itens_lista.length<=16);
let reviewPage=await flowExchange({action:'data_exchange',screen:'TIPO_PRODUTO',data:{etapa:'navegar_tipo',estado:edited.data.estado,indice:'1'}},deps);
assert.equal(reviewPage.data.tipo_nome,'Feijão');
while(!reviewPage.data.itens_lista.some(x=>x['on-click-action']?.payload?.etapa==='revisar')){
 const nextPage=reviewPage.data.itens_lista.find(x=>x['on-click-action']?.payload?.etapa==='pagina_opcoes');
 assert.ok(nextPage,'the final product step has a next page until all options are shown');
 reviewPage=await flowExchange({action:'data_exchange',screen:'TIPO_PRODUTO',data:nextPage['on-click-action'].payload},deps);
}
const reviewPayload=reviewPage.data.itens_lista.find(x=>x['on-click-action']?.payload?.etapa==='revisar')['on-click-action'].payload;
const summary=await flowExchange({action:'data_exchange',screen:'TIPO_PRODUTO',data:reviewPayload},deps);
assert.equal(summary.screen,'RESUMO');assert.match(summary.data.valor,/R\$/);assert.match(summary.data.itens,/3x Produto 1 Marca B/);assert.match(summary.data.itens,/cada/);
for(const count of [14,15,16,17,23,24,25,27,30]){
 activeItems=makeItems(count);
 const page=await flowExchange({action:'data_exchange',screen:'TAMANHO',data:{etapa:'tamanho',tamanho:'mini'}},deps);
 assert.equal(page.screen,'TIPO_PRODUTO');assert.ok(page.data.itens_lista.length<=16,`first product step stays within the Meta 20-row limit for ${count} positions`);
 const hasNext=page.data.itens_lista.some(x=>x['on-click-action']?.payload?.etapa==='pagina_opcoes');
 assert.ok(hasNext,`a large product type gets another option page for ${count} positions`);
 const payload=page.data.itens_lista.find(x=>x['on-click-action']?.payload?.etapa==='pagina_opcoes')['on-click-action'].payload;
 const next=await flowExchange({action:'data_exchange',screen:'TIPO_PRODUTO',data:payload},deps);
 assert.equal(next.screen,'TIPO_PRODUTO');assert.ok(next.data.itens_lista.length<=16);
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
console.log('PASS Meta dynamic Flow product steps, quantity editor, live quote, image safety, V1 compatibility, signatures and RSA/AES encryption');
