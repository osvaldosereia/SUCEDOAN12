import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync('vitrine/admin/index.html','utf8')+'\n'+readFileSync('vitrine/admin/admin-runtime.js','utf8')+'\n'+readFileSync('vitrine/admin/orders/list-controller.js','utf8')+'\n'+readFileSync('vitrine/admin/orders/card-view.js','utf8');
const part=readFileSync('vitrine/admin/runtime-parts/16-orders-operations.part.js','utf8');
const listView=readFileSync('vitrine/admin/orders/list-view.js','utf8');
const sql=readFileSync('supabase/sql/20261008_order_manual_separation_queue_v1.sql','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
for(const [i,source] of scripts.entries())new Script(source,{filename:'admin-inline-'+i+'.js'});

assert.match(html,/orderStatusTab:'new'/);
assert.deepEqual([...listView.matchAll(/\{key:'([^']+)',label:'([^']+)'\}/g)].map(([,key,label])=>[key,label]),[
  ['new','Novo'],['separate','Separar agora'],['ready','Pronto para entrega'],['delivered','Entregue']
]);
assert.doesNotMatch(html,/data-manual-queue-(?:add|remove)/,'manual selection controls are no longer part of the order board');
assert.match(html,/manualQueueRpc\(enable\?'add':'remove',orderId\)/);
assert.match(html,/data-v3-separation/);
assert.match(html,/function openOrderSeparationSheet\(id\)/);
assert.match(sql,/p_action = 'add'/);
assert.match(sql,/v_status is distinct from 'confirmed'/);
assert.match(sql,/on conflict \(order_id\) do nothing/);
assert.match(sql,/v_role = 'viewer'/);
assert.match(sql,/enable row level security/);
assert.match(sql,/from public, anon, authenticated/);
assert.doesNotMatch(sql,/create\s+trigger\b/i);
assert.doesNotMatch(sql,/update\s+public\.orders\b/i);
assert.doesNotMatch(sql,/update\s+public\.order_items\b/i);

const begin=part.indexOf('function orderStatusTabKey(');
const end=part.indexOf('  orderCardView=window.',begin);
assert.ok(begin!==-1&&end>begin);
const funcBody=part.slice(begin,end);
const makeMatch=new Function('orderList','orderCardModel',funcBody+';return orderStatusTabMatch;');
const state={orderStatusTab:'separate'};
const key=o=>o.cancelled?'cancelled':o.delivered?'delivered':o.separated?'ready':o.confirmed?'separate':'new';
const match=makeMatch({state},{orderListBucketKey:key});
const order={id:'order-1',status:'confirmed',confirmed:true,separated:false,delivered:false,cancelled:false};
assert.equal(match(order),true,'todo pedido confirmado aparece em Separar agora sem inclusão manual');
assert.equal(match({...order,id:'order-2'}),true,'outros pedidos confirmados também aparecem em Separar agora');
assert.equal(match({...order,separated:true},'separate'),false,'pedido separado sai de Separar agora');
assert.equal(match({...order,separated:true},'ready'),true,'pedido separado entra em Pronto para entrega');
assert.equal(match({...order,delivered:true},'delivered'),true,'entrega confirmada entra em Entregue');
assert.equal(match({...order,cancelled:true},'separate'),false,'cancelado não entra em etapa operacional');
assert.equal(match(order,'new'),false,'pedido confirmado não aparece em Novo');

console.log('PASS: quatro etapas, confirmação automática na lista, fila manual fora da UI e RPC seguro.');
