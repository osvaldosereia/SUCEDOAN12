import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {flowExchange,parseQty,assertBasket,SIZE_KEYS,ITEM_SCREENS} from '../supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs';
import {signState,verifyState,hmac,verifyAppSignature,decryptMetaPayload,encryptMetaResponse} from '../supabase/functions/whatsapp-1018-basket-flow-v1/crypto.mjs';
globalThis.crypto??=webcrypto;
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const flow=JSON.parse(read('vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v1.json'));
assert.equal(flow.version,'7.3');assert.equal(flow.data_api_version,'3.0');
assert.equal(flow.screens.length,9);

const edges=Object.values(flow.routing_model).reduce((sum,next)=>sum+next.length,0);
assert.ok(edges<=10,'Meta Flow routing_model cannot exceed ten edges');
assert.equal(edges,8);
const ids=flow.screens.map(screen=>screen.id);
assert.ok(ids.every(id=>/^[A-Z_]+$/.test(id)),'screen IDs must contain only letters and underscores');
assert.equal(new Set(ids).size,ids.length);
assert.deepEqual(ids,['TAMANHO','COMBINACAO',...ITEM_SCREENS,'RESUMO']);
assert.equal(flow.routing_model.RESUMO.length,0);
assert.ok(ids.slice(0,-1).every(id=>flow.routing_model[id].length===1),'strict forward-only chain');

assert.equal(flow.screens.at(-1).terminal,true);
for(const s of flow.screens){assert.ok(s.layout.children.length<=50);assert.equal(s.layout.children.filter(x=>x.type==='Footer').length,1);}
for(let i=1;i<=6;i++){
 const screen=flow.screens.find(x=>x.id===ITEM_SCREENS[i-1]);
 assert.ok(screen);assert.equal(screen.layout.children.filter(c=>c.type==='Dropdown').length,10);
 assert.ok(screen.layout.children.filter(c=>c.type==='Dropdown'&&c.label==='Quantidade').length===5);
 assert.equal(screen.layout.children.at(-1)['on-click-action'].name,'data_exchange');
}
assert.equal(flow.screens.find(x=>x.id==='TAMANHO').layout.children.at(-1)['on-click-action'].name,'data_exchange');
assert.equal(flow.screens.at(-1).layout.children.at(-1)['on-click-action'].name,'complete');
assert.doesNotMatch(JSON.stringify(flow),/submit_order|create_order/);
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const shell={ok:true,baskets:SIZE_KEYS.map((key,i)=>({id:uuid(i+1),size_key:key}))};
const itemCount=27,basketId=shell.baskets[0].id,items=Array.from({length:itemCount},(_,i)=>({position_id:uuid(i+100),product_id:uuid(i+1000),name:'Produto '+(i+1)+' Marca A 1 kg',quantity:i===0?2:1}));
const secret='A'.repeat(64);
const deps={
 async shell(){return shell},
 async basket(id,n){return {ok:true,basket:{id,composition_number:n,display_price_cents:17270+n*100,stock_quantity:10},items:items.map(x=>({...x}))}},
 async options(_id,_n,positions){return {ok:true,positions:positions.map(row=>({position_id:row.position_id,alternatives:[{product_id:items.find(x=>x.position_id===row.position_id).product_id,name:'Marca A 1 kg',stock_quantity:20},{product_id:uuid(6000+items.findIndex(x=>x.position_id===row.position_id)),name:'Marca B 1 kg',stock_quantity:20}]}))}},
 async quote(id,n,all){assert.equal(all.length,itemCount);assert.equal(id,basketId);assert.equal(n,1);return {ok:true,total_cents:17000+all.reduce((sum,x)=>sum+x.quantity*10,0),basket:{stock_quantity:2},items:all.map((x,i)=>({...x,name:'Produto '+(i+1)+' 1 kg'}))}},
 signState:st=>signState(st,secret),verifyState:s=>verifyState(s,secret)
};
const init=await flowExchange({action:'INIT'},deps);
assert.equal(init.screen,'TAMANHO');assert.equal(init.data.tamanhos.length,5);
const combos=await flowExchange({action:'data_exchange',screen:'TAMANHO',data:{etapa:'tamanho',tamanho:'mini'}},deps);
assert.equal(combos.screen,'COMBINACAO');assert.equal(combos.data.opcoes.length,3);assert.match(combos.data.opcoes[0].description,/R\$/);
const first=await flowExchange({action:'data_exchange',screen:'COMBINACAO',data:{etapa:'combinacao',tamanho:'mini',combinacao:'1'}},deps);
assert.equal(first.screen,ITEM_SCREENS[0]);assert.equal(first.data.vis0,true);
assert.equal(first.data.marca0,items[0].product_id);
let stage=first;
for(let page=1;page<=6;page++){
 const d={etapa:'itens',estado:stage.data.estado,pagina:String(page)};
 for(let j=0;j<5;j++){d['marca'+j]=stage.data['marca'+j];d['quant'+j]=stage.data['quant'+j];}
 if(page===1){d.quant0='0';d.marca1=uuid(6001);}
 const res=await flowExchange({action:'data_exchange',screen:ITEM_SCREENS[page-1],data:d},deps);
 if(page<6)assert.equal(res.screen,ITEM_SCREENS[page]);
 else{assert.equal(res.screen,'RESUMO');assert.match(res.data.valor,/R\$/);assert.ok(res.data.itens.includes('Produto'));}
 stage=res;
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
console.log('PASS Meta dynamic Flow 9 screens/30 slot capacity, 27 products, choices, brands, quantities, quote, signatures and RSA/AES encryption');
