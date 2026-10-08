import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync('montar/index.html','utf8');
const script=readFileSync('montar/app.js','utf8');
const css=readFileSync('montar/styles.css','utf8');
const migration=readFileSync('supabase/sql/20261008_montar_manual_queue_feed_v1.sql','utf8');
new vm.Script(script,{filename:'montar/app.js'});

assert.match(page,/<title>Separação de pedidos \| Dona Antônia<\/title>/);
assert.doesNotMatch(page,/<nav\b|href="\/vitrine\/admin\/"/i,'tela sem navegacao administrativa');
assert.match(page,/id="queueView"/);
assert.match(page,/id="detailView"/);
assert.match(page,/id="packageModal"/);
assert.match(page,/id="pin" type="password"/);
assert.match(css,/min-height:52px/,'toques grandes');
assert.match(css,/@media\(max-width:760px\)/,'responsive');
assert.match(script,/manual_pick_queue_feed_v1/);
for(const endpoint of ['order_separation_get','order_separation_assign','order_separation_item_set','order_separation_complete'])
  assert.ok(script.includes("'"+endpoint+"'"),endpoint+' deve usar backend ja existente');
assert.doesNotMatch(script,/api\(['"]orders['"]/,'a lista nao deve consultar todos os pedidos');
assert.doesNotMatch(script,/pin:\s*['"]\d+/,'nenhum PIN fixo no novo frontend');
assert.match(script,/queue\.some\(o=>o\.id===id\)/,'bloquear abertura de pedido fora da fila');
assert.match(script,/savedCode=originalNumber\(detail\)/,'nunca gerar outro codigo ao concluir');
assert.match(script,/!p\.total\|\|p\.pending/,'conclusao bloqueada com itens pendentes');
assert.match(migration,/o\.status in \('confirmed','processing'\)/);
assert.match(migration,/c\.completed_at is null/);
assert.match(migration,/admin_users/);
assert.match(migration,/security definer/);
assert.match(migration,/revoke all on function .* from public,anon/);
assert.doesNotMatch(migration,/\b(create trigger|update public\.orders|insert into public\.orders)\b/i);

// Browser interaction with mocked network: only explicitly queued orders are visible.
// No production order is mutated during this test.
const orderId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const itemId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const authToken='e30.'+payload+'.test';
let queued=[{id:orderId,order_number:'DA115',status:'confirmed',customer_name:'Cliente teste',created_at:'2026-10-08T12:00:00Z',counts:{total:1,pending:1,separated:0,missing:0},separator_key:'jose',separator_label:'José'}];
let picked=false,completed=false,writes=[],requested=[],details=0;
const elements=new Map();
const el=id=>{
  if(!elements.has(id)){
    const listeners={};
    elements.set(id,{id,hidden:false,value:'',innerHTML:'',textContent:'',disabled:false,
      listeners,addEventListener:(type,cb)=>{listeners[type]=cb},
      focus:()=>{},classList:{toggle:()=>{}},
      trigger:(type,arg={})=>listeners[type]?.(arg)});
  }
  return elements.get(id);
};
const storage=new Map([['da_finance_access_token_v1',authToken]]);
const response=data=>({ok:true,status:200,json:async()=>data});
const apiFetch=async(url,options={})=>{
  const u=new URL(url);requested.push(u.pathname);
  if(u.pathname.endsWith('manual_pick_queue_feed_v1'))return response({ok:true,orders:queued});
  const endpoint=u.searchParams.get('action');
  if(endpoint==='order_separation_get'){
    details++;
    return response({ok:true,separation:{ok:true,order_id:orderId,order_number:'DA115',customer_name:'Cliente teste',status:'confirmed',order_updated_at:'2026-10-08T12:00:0'+(picked?'1':'0')+'Z',
      final_total:100,items:[{order_item_id:itemId,name:'Arroz teste',quantity:2,state:picked?'separated':'pending',kind:'product'}],
      assignment:{separator_key:'jose',separator_label:'José'},
      counts:{total:1,pending:picked?0:1,separated:picked?1:0,missing:0},
      completion:completed?{completed_at:'2026-10-08T12:30:00Z'}:null}});
  }
  if(endpoint==='order_separation_item_set'){
    const body=JSON.parse(options.body);assert.equal(body.order_id,orderId);
    assert.equal(body.order_item_id,itemId);
    writes.push(endpoint);picked=true;return response({ok:true,order_updated_at:'2026-10-08T12:00:01Z'});
  }
  if(endpoint==='order_separation_complete'){
    assert.equal(JSON.parse(options.body).order_id,orderId);
    writes.push(endpoint);completed=true;queued=[];return response({ok:true});
  }
  throw new Error('Unexpected API '+url);
};
const ctx=vm.createContext({
  console,URL,Date,atob,setTimeout,clearTimeout,
  setInterval:()=>0,navigator:{onLine:true},
  location:{origin:'https://www.donaantonia.com.br'},
  sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  fetch:apiFetch,confirm:()=>true,
  document:{hidden:false,getElementById:el,addEventListener:()=>{}},
  window:{addEventListener:()=>{},scrollTo:()=>{},scrollY:0}
});
new vm.Script(script).runInContext(ctx);
const spin=async predicate=>{
  for(let i=0;i<80;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}
  throw new Error('Timeout waiting for UI change');
};
await spin(()=>el('queueList').innerHTML.includes('DA115'));
assert.equal(el('queueCount').textContent,'1');
assert.ok(!el('queueList').innerHTML.includes(otherId),'somente pedidos selecionados');
const open = id => ({target:{closest:sel=>sel==='[data-open]'?{dataset:{open:id}}:null}});
el('queueList').trigger('click',open(otherId));
assert.equal(details,0,'pedido externo nao pode ser aberto');
el('queueList').trigger('click',open(orderId));
await spin(()=>details===1 && el('itemsList').innerHTML.includes('Arroz teste'));
assert.equal(el('completeBtn').disabled,true,'nao concluir antes de todos os itens');
const itemEvent={target:{closest:sel=>sel==='[data-item][data-state]'?{dataset:{item:itemId,state:'separated'}}:null}};
el('detailContent').trigger('click',itemEvent);
await spin(()=>picked && details>=2 && el('completeBtn').disabled===false);
assert.deepEqual(writes,['order_separation_item_set']);
el('completeBtn').trigger('click');
await spin(()=>completed && el('packageModal').hidden===false);
assert.equal(el('packageCode').textContent,'DA115','numero imutavel na embalagem');
el('packageOk').trigger('click');
await spin(()=>el('queueCount').textContent==='0');
assert.deepEqual(writes,['order_separation_item_set','order_separation_complete']);
assert.ok(!requested.some(x=>x.endsWith('/orders')),'nao carrega historico do admin');
console.log('PASS /montar: sintaxe, segurança, fila exclusiva, isolamento, marcação, conclusão e código original.');
