import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const lotId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
const tables={admin_users:[{user_id:userId,is_active:true,role:'operator'}],basket_stock_lots:[{id:lotId,status:'ready',lot_kind:'food',basket_id:lotId}],basket_templates:[{id:lotId,name:'Cesta',uses_hygiene_kit:false}],basket_stock_lot_items:[{lot_id:lotId,product_id:'rice',quantity_per_basket:3,product:{name:'Arroz',image_url:'https://ssbesxgaijknwsjbsbcz.supabase.co/a.webp'}}],basket_lot_images:[]};
const calls=[],uploads=[],pending=[];let paid=0,beforeUpdate=null;
class Query{
 constructor(table){this.table=table;this.filters=[];this.op='select';this.one=false}
 select(){return this}eq(k,v){this.filters.push(r=>r[k]===v);return this}in(k,vs){this.filters.push(r=>vs.includes(r[k]));return this}gt(k,v){this.filters.push(r=>r[k]>v);return this}order(k,options){this.sortKey=k;this.desc=options?.ascending===false;return this}limit(n){this.max=n;return this}maybeSingle(){this.one=true;return this}single(){this.one=true;return this}
 insert(value){this.op='insert';this.value=value;return this}update(value){this.op='update';this.value=value;return this}
 then(resolve,reject){return Promise.resolve().then(()=>{
   calls.push({table:this.table,op:this.op});if(this.op==='update'&&beforeUpdate){const hook=beforeUpdate;beforeUpdate=null;hook()}
   let rows=(tables[this.table]||[]).filter(r=>this.filters.every(f=>f(r)));
   if(this.sortKey)rows.sort((a,b)=>(a[this.sortKey]>b[this.sortKey]?1:a[this.sortKey]<b[this.sortKey]?-1:0)*(this.desc?-1:1));if(this.max)rows=rows.slice(0,this.max);
   if(this.op==='insert'){if(tables[this.table].some(r=>r.composition_key===this.value.composition_key))return {error:{code:'23505'}};const row={id:crypto.randomUUID(),attempts:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...this.value};tables[this.table].push(row);rows=[row]}
   if(this.op==='update'){for(const r of rows)Object.assign(r,this.value)}
   return {data:this.one?(rows[0]?structuredClone(rows[0]):null):structuredClone(rows),error:null};
 }).then(resolve,reject)}
}
const sb={auth:{getUser:async token=>token==='valid'?{data:{user:{id:userId}}}:{error:{},data:{}}},from:t=>new Query(t),rpc:async()=>({data:'test-key'}),storage:{from:()=>({upload:async(path)=>{uploads.push(path);return {data:{path},error:null}},getPublicUrl:path=>({data:{publicUrl:'https://ssbesxgaijknwsjbsbcz.supabase.co/'+path}})})}};
let handler;
const context={sb,crypto:globalThis.crypto,URL,Request,Response,TextEncoder,Uint8Array,DataView,AbortSignal,atob,btoa,Date,EdgeRuntime:{waitUntil:p=>pending.push(p)},Deno:{env:{get:()=> 'test-key'},serve:fn=>handler=fn},fetch:async(url,options)=>{
 if(url.startsWith('https://ssbesxgaijknwsjbsbcz.supabase.co/'))return new Response('photo',{headers:{'content-type':'image/webp'}});
 assert.equal(url,'https://api.openai.com/v1/images/edits');const payload=JSON.parse(options.body);
 assert.equal(payload.model,'gpt-image-2.5-sunburst');assert.equal(payload.quality,'high');assert.equal(payload.n,1);
 assert.equal(payload.images.length,1);assert.ok(payload.images[0].image_url.startsWith('data:image/webp;base64,'));
 assert.match(payload.prompt,/3 un\./);assert.match(payload.prompt,/physical proportions/);assert.match(payload.prompt,/labels/);
 paid++;return new Response(JSON.stringify({data:[{b64_json:btoa('scene')}]}),{status:200});}};
vm.createContext(context);
const core=stripTypeScriptTypes(fs.readFileSync('supabase/functions/basket-lot-image-v1/core.ts','utf8'),{mode:'strip'}).replaceAll('export ','');
const source=fs.readFileSync('supabase/functions/basket-lot-image-v1/index.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^const sb=.*;\r?\n/m,'');
vm.runInContext(core+'\n'+stripTypeScriptTypes(source,{mode:'strip'}),context);
const request=async(body,token='valid')=>{const r=await handler(new Request('https://example.com',{method:'POST',headers:{authorization:token?'Bearer '+token:'','content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};
assert.equal((await request({event:'start',lot_id:lotId},'')).status,401);assert.equal(paid,0);
tables.admin_users[0].role='viewer';assert.equal((await request({event:'start',lot_id:lotId})).status,403);tables.admin_users[0].role='operator';
tables.basket_stock_lots[0].status='draft';assert.equal((await request({event:'start',lot_id:lotId})).body.error,'lot_not_mounted');tables.basket_stock_lots[0].status='ready';
const started=await request({event:'start',lot_id:lotId});assert.equal(started.status,202);await Promise.all(pending);
const job=tables.basket_lot_images[0];assert.equal(job.status,'scene_ready');assert.equal(job.manifest[0].quantity,3);
assert.equal((await request({event:'start',lot_id:lotId})).body.reused,true);assert.equal(paid,1,'retomar não deve cobrar uma segunda geração');
assert.equal((await request({event:'publish',job_id:job.id})).body.error,'preview_required');
assert.equal((await request({event:'save_preview',job_id:job.id,width:768,image_base64:btoa('invalid')})).body.error,'invalid_webp_or_size');
const finalImage=fs.readFileSync('scripts/fixtures/basket-image-768.webp').toString('base64');
const saves=await Promise.all([request({event:'save_preview',job_id:job.id,width:768,image_base64:finalImage}),request({event:'save_preview',job_id:job.id,width:768,image_base64:finalImage})]);
assert.equal(saves.filter(r=>r.status===200).length,1,'duas abas não podem aceitar duas prévias para o mesmo job');
assert.equal(new Set(uploads.filter(p=>p.startsWith('final/'))).size,2,'uploads concorrentes precisam de URLs imutáveis diferentes');
job.status='preview';job.image_url='https://ssbesxgaijknwsjbsbcz.supabase.co/approved.webp';
tables.basket_stock_lot_items[0].quantity_per_basket=2;
assert.equal((await request({event:'publish',job_id:job.id})).body.error,'composition_changed');
tables.basket_stock_lot_items[0].quantity_per_basket=3;
assert.equal((await request({event:'publish',job_id:job.id})).body.job.status,'published');
job.status='generating';job.attempts=1;job.updated_at=new Date(Date.now()-300000).toISOString();
beforeUpdate=()=>{job.attempts=2;job.updated_at=new Date().toISOString()};
const recovered=await request({event:'status',job_id:job.id});
assert.equal(recovered.body.job.status,'generating','consulta atrasada não pode falhar nova tentativa');assert.equal(recovered.body.job.attempts,2);
job.status='published';job.attempts=1;
const replacement=await request({event:'start',lot_id:lotId,regenerate:true});assert.equal(replacement.status,202);await Promise.all(pending);
assert.notEqual(replacement.body.job.id,job.id);assert.equal(job.status,'published','preservar a foto publicada enquanto gera substituta');
const candidate=tables.basket_lot_images.at(-1);assert.equal(candidate.status,'scene_ready');assert.equal(candidate.attempts,2);assert.equal(paid,2);
assert.equal((await request({event:'save_preview',job_id:candidate.id,width:768,image_base64:finalImage})).status,200,'nova candidata usa a mesma composição válida');
assert.equal((await request({event:'start',lot_id:lotId})).body.reused,true);assert.equal(paid,2);
assert.equal((await request({event:'start',lot_id:lotId,regenerate:true})).status,202);await Promise.all(pending);tables.basket_lot_images.at(-1).status='preview';
assert.equal((await request({event:'start',lot_id:lotId,regenerate:true})).body.error,'generation_attempt_limit');assert.equal(paid,3);
assert.ok(calls.every(c=>c.op==='select'||c.table==='basket_lot_images'),'a automação não pode escrever nos lotes, produtos ou estoque');
console.log('Basket image service: auth, explicit charge, reuse, stale approval and no stock writes passed');
