import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync('vitrine/admin/index.html','utf8');
const sql=readFileSync('supabase/sql/20261008_order_manual_separation_queue_v1.sql','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
for(const [i,source] of scripts.entries())new Script(source,{filename:'admin-inline-'+i+'.js'});

assert.match(html,/orderStatusTab:'manual'/);
assert.match(html,/const ORDER_STATUS_TABS=\[\s*\{key:'manual',label:'SEPARAR AGORA'\}/);
assert.doesNotMatch(html,/\{key:'all',label:'Todos'\}/);
assert.match(html,/data-manual-queue-\+'\(manualSelected\?'remove':'add'\)/);
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

const begin=html.indexOf('function orderStatusTabMatch(');
const end=html.indexOf('function orderStatusTabCounts()',begin);
assert.ok(begin!==-1&&end>begin);
const funcBody=html.slice(begin,end);
const makeMatch=new Function('state','orderV3Milestones','orderStatusTabKey',funcBody+';return orderStatusTabMatch;');
const state={orderStatusTab:'manual',manualQueueIds:new Set()};
const milestones=o=>({confirmed:o.confirmed,separated:o.separated,delivered:o.delivered,cancelled:o.cancelled});
const key=o=>o.confirmed?'confirmed':'received';
const match=makeMatch(state,milestones,key);
const order={id:'order-1',status:'confirmed',confirmed:true,separated:false,delivered:false,cancelled:false};
assert.equal(match(order),false,'nenhum pedido entra automaticamente');
state.manualQueueIds.add('order-1');
assert.equal(match(order),true,'pedido adicionado manualmente aparece');
assert.equal(match({...order,separated:true}),false,'pedido ja separado sai da fila visual');
assert.equal(match({...order,delivered:true}),false,'pedido entregue nao fica na fila visual');
assert.equal(match({...order,cancelled:true}),false,'pedido cancelado nao fica na fila visual');
assert.equal(match({...order,status:'out_for_delivery'}),false,'entrega nao fica na fila visual');
assert.equal(match({...order,id:'order-2'}),false,'outro pedido confirmado nao entra na fila');
assert.equal(match(order,'confirmed'),true,'filtro Confirmados original e preservado');
state.manualQueueIds.delete('order-1');
assert.equal(match(order),false,'retirada manual e respeitada');

console.log('PASS: aba manual, inclusao explicita, isolamento operacional, RPC seguro, sintaxe JS e filtros.');
