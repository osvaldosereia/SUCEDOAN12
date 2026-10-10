import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const code=source.slice(source.indexOf('async function stockReadiness('),source.indexOf('async function mapOrders('));
const products=Array.from({length:260},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,name:'Product '+i,is_active:true}));
const items=products.map(p=>({order_id:'order',product_id:p.id,quantity:1,metadata:{}}));
// Simulate the gateway's request-size limit at the network boundary.
const db={from:table=>{let ids=[],start=0,end=999;return {select(){return this},in(column,values){if(['id','product_id'].includes(column))ids=values;return this},not(){return this},order(){return this},range(a,b){start=a;end=b;return this},then(resolve,reject){if(ids.length>80)return Promise.reject(new Error('gateway rejected oversized URL')).then(resolve,reject);return Promise.resolve({data:table==='order_items'?items.slice(start,end+1):table==='products'?products.filter(p=>ids.includes(p.id)):[]}).then(resolve,reject)}}}};
const sandbox={db,Map,Set,Date,meta:v=>v||{},effectiveStockMap:async()=>new Map(products.map(p=>[p.id,2])),stockAuthority:async()=> 'bling'};
vm.runInNewContext(stripTypeScriptTypes(code)+';this.stockReadiness=stockReadiness;',sandbox);
const result=await sandbox.stockReadiness(['order']);
assert.equal(result.get('order').ok,true);
assert.equal(result.get('order').demand_lines,260,'all product demands survive batching');
assert.equal(result.get('order').shortage_count,0);
console.log('Admin readiness with 260 distinct products: OK');
