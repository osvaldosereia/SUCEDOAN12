import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readAdminUiSource} from './helpers/admin-ui-source.mjs';

const source=readAdminUiSource();
const api=readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const tabsMatch=source.match(/const ORDER_STATUS_TABS=\[([\s\S]*?)\n  \];/);
assert.ok(tabsMatch,'four-stage order tabs are declared');
assert.deepEqual(
  [...tabsMatch[1].matchAll(/\{key:'([^']+)',label:'([^']+)'\}/g)].map(([,key,label])=>({key,label})),
  [
    {key:'new',label:'Novo'},
    {key:'separate',label:'Separar agora'},
    {key:'ready',label:'Pronto para entrega'},
    {key:'delivered',label:'Entregue'}
  ],
  'the four tabs stay in the approved operational order'
);
assert.match(source,/orderStatusTab:'new'/,'Pedidos opens on Novo');
assert.match(source,/state\.orderStatusTab='new'/,'direct order links use a valid tab');

const keyStart=source.indexOf('function orderStatusTabKey(');
const matchStart=source.indexOf('function orderStatusTabMatch(',keyStart);
const countsStart=source.indexOf('function orderStatusTabCounts()',matchStart);
assert.ok(keyStart!==-1&&matchStart>keyStart&&countsStart>matchStart,'status mapping and matcher exist');
const keyBody=source.slice(keyStart,matchStart);
const matchBody=source.slice(matchStart,countsStart);
const makeKey=new Function('orderV3Milestones',keyBody+';return orderStatusTabKey;');
const key=makeKey(o=>o.milestones);
const makeMatch=new Function('state','orderStatusTabKey','orderV3Milestones',matchBody+';return orderStatusTabMatch;');
const state={orderStatusTab:'new'};
const match=makeMatch(state,key,o=>o.milestones);
const order=(status,milestones)=>({id:status,status,milestones});
assert.equal(key(order('created',{confirmed:false,separated:false,delivered:false,cancelled:false})),'new');
assert.equal(key(order('storefront_received',{confirmed:false,separated:false,delivered:false,cancelled:false})),'new');
assert.equal(key(order('confirmed',{confirmed:true,separated:false,delivered:false,cancelled:false})),'separate');
assert.equal(key(order('processing',{confirmed:true,separated:false,delivered:false,cancelled:false})),'separate');
assert.equal(key(order('ready',{confirmed:true,separated:true,delivered:false,cancelled:false})),'ready');
assert.equal(key(order('ready',{confirmed:true,separated:false,delivered:false,cancelled:false})),'ready','database stage remains authoritative while fiscal details load');
assert.equal(key(order('out_for_delivery',{confirmed:true,separated:true,delivered:false,cancelled:false})),'ready');
assert.equal(key(order('delivered',{confirmed:true,separated:true,delivered:true,cancelled:false})),'delivered');
assert.equal(key(order('cancelled',{confirmed:false,separated:false,delivered:false,cancelled:true})),'cancelled');

const fresh=order('created',{confirmed:false,separated:false,delivered:false,cancelled:false});
const confirmed=order('confirmed',{confirmed:true,separated:false,delivered:false,cancelled:false});
const canceled=order('cancelled',{confirmed:false,separated:false,delivered:false,cancelled:true});
assert.equal(match(fresh),true,'new orders appear in Novo');
assert.equal(match(confirmed),false,'Novo does not include confirmed orders');
state.orderStatusTab='separate';
assert.equal(match(confirmed),true,'all confirmed orders appear in Separar agora');
state.orderStatusTab='new';
assert.equal(match(canceled),false,'canceled orders do not pollute Novo');
assert.equal(match(canceled,'new',true),true,'global search can still find canceled orders');

assert.match(source,/api\('orders',\{tab,offset,limit/,'orders load from the paginated server endpoint');
assert.match(source,/limit:5/,'the page size stays bounded to five orders');
assert.match(source,/loadOrders\(false\)/,'the next-page control appends results');
assert.match(source,/orderStatusTabMatch\(o,state\.orderStatusTab,searching\)/,'search can find an order outside the selected stage');
assert.match(source,/state\.orderHasMore/,'the view displays pagination only when more rows exist');
assert.doesNotMatch(source,/data-manual-queue-(?:add|remove)/,'the stage board does not retain the removed manual queue controls');
assert.match(api,/const allowed=\["new","separate","ready","delivered"\]/,'the Admin API accepts exactly the four board stages');
assert.match(api,/if\(!search\)\{[\s\S]*?tab==="new"[\s\S]*?tab==="separate"[\s\S]*?tab==="ready"[\s\S]*?tab==="delivered"[\s\S]*?\}else\{/,'search is global across stages, including canceled orders');
assert.match(api,/Math\.min\(5,Number\(options\?\.limit\)\|\|5\)/,'the existing server endpoint caps pages at five');

console.log('PASS: four order stages, API-aligned status transitions, global search, and bounded pagination.');
