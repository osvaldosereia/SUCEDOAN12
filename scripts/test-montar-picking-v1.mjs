import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync('montar/index.html','utf8');
const script=readFileSync('montar/app.js','utf8');
const css=readFileSync('montar/styles.css','utf8');
const migration=readFileSync('supabase/sql/20261008_montar_manual_queue_feed_v1.sql','utf8');
const admin=readFileSync('vitrine/admin/index.html','utf8');
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
assert.match(script,/url\.searchParams\.set\('separacao',id\)/,'passar ID tecnico sem alterar o numero original');
assert.match(script,/url\.searchParams\.set\('montar','1'\)/,'modo exclusivo de separacao');
assert.match(script,/!p\.total\|\|p\.pending/,'conclusao bloqueada com itens pendentes');
assert.match(migration,/o\.status in \('confirmed','processing'\)/);
assert.match(migration,/c\.completed_at is null/);
assert.match(migration,/admin_users/);
assert.match(migration,/security definer/);
assert.match(migration,/revoke all on function .* from public,anon/);
assert.doesNotMatch(migration,/\b(create trigger|update public\.orders|insert into public\.orders)\b/i);


assert.match(admin,/await manualQueueRpc\('list'\)/,'validar fila manual na entrada do Admin');
assert.match(admin,/if\(orderCustomerDataPending\(selectedOrder\)\)/,'respeitar checagem existente de dados do cliente');
assert.match(admin,/state\.orders=\[selectedOrder\]/,'a vitrine acessa somente o pedido selecionado');
assert.match(admin,/await openOrderSeparationSheet\(sharedSeparationId\)/,'abrir vitrine de separacao existente');
assert.match(admin,/html\.montar-picker-only #app\{display:none!important\}/,'ocultar menus administrativos');
assert.match(admin,/if\(close\)close\.onclick=\(\)=>location\.replace\('\/montar\/'\)/,'voltar para fila quando fechar');
assert.match(admin,/if\(document\.documentElement\.classList\.contains\('montar-picker-only'\)\)/,'voltar apos aviso da embalagem');

// Simulates a logged-in picker; verifies redirect uses canonical vitrine and
// never accesses/mutates a real order while clicking the card.
const orderId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const authToken='e30.'+payload+'.test';
const queue=[{id:orderId,order_number:'DA115',status:'confirmed',customer_name:'Cliente teste',created_at:'2026-10-08T12:00:00Z',counts:{total:1,pending:1,separated:0,missing:0},separator_key:'jose',separator_label:'José'}];
let requested=[],redirects=[];
const elements=new Map();
const el=id=>{
  if(!elements.has(id)){
    const listeners={};
    elements.set(id,{
      id,hidden:false,value:'',innerHTML:'',textContent:'',disabled:false,
      addEventListener:(type,callback)=>{listeners[type]=callback},
      trigger:(type,event={})=>listeners[type]?.(event),
      focus:()=>{},classList:{toggle:()=>{}}
    });
  }
  return elements.get(id);
};
const storage=new Map([['da_finance_access_token_v1',authToken]]);
const fetchMock=async url=>{
  const u=new URL(url);requested.push(u.pathname+u.search);
  if(u.pathname.endsWith('manual_pick_queue_feed_v1'))
    return {ok:true,status:200,json:async()=>({ok:true,orders:queue})};
  throw new Error('Do not fetch order details from montar: '+url);
};
const ctx=vm.createContext({
  console,URL,URLSearchParams,Date,atob,setTimeout,clearTimeout,setInterval:()=>0,
  navigator:{onLine:true},
  location:{origin:'https://www.donaantonia.com.br'},
  sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  fetch:fetchMock,confirm:()=>true,
  document:{hidden:false,getElementById:el,addEventListener:()=>{}},
  window:{location:{assign:url=>redirects.push(url)},addEventListener:()=>{},scrollTo:()=>{},scrollY:0}
});
new vm.Script(script).runInContext(ctx);
for(let i=0;i<80&&!el('queueList').innerHTML.includes('DA115');i++)
  await new Promise(r=>setTimeout(r,10));
assert.match(el('queueList').innerHTML,/DA115/);
assert.equal(el('queueCount').textContent,'1');
assert.match(el('queueList').innerHTML,/queue-card is-running/,'pedido em separação destacado');
assert.match(el('queueList').innerHTML,/class="queue-assignment-banner"/,'faixa grande com responsável');
assert.match(el('queueList').innerHTML,/EM SEPARAÇÃO/);
assert.match(el('queueList').innerHTML,/José/,'nome vindo da atribuição persistida');
assert.match(css,/\.queue-assignment-name\{[^}]*font-size:clamp/,'nome visível no mobile e desktop');
assert.match(css,/\.queue-card\.is-running\{/,'borda operacional de destaque');
// Teste de atualização após atribuição, sem alterar nada no Supabase.
queue[0].separator_key=null;queue[0].separator_label=null;
el('queueSearch').trigger('input');
assert.doesNotMatch(el('queueList').innerHTML,/queue-assignment-banner/,'pedido ainda sem responsável não deve aparecer em separação');
assert.match(el('queueList').innerHTML,/PRONTO PARA SEPARAR/);
queue[0].separator_key='claudio';queue[0].separator_label='Cláudio';
el('queueSearch').trigger('input');
assert.match(el('queueList').innerHTML,/Cláudio/,'atualização mostra separador escolhido');
queue[0].separator_label='<img src=x onerror=alert(1)>';
el('queueSearch').trigger('input');
assert.doesNotMatch(el('queueList').innerHTML,/<img src=x onerror=/,'nome seguro contra HTML injetado');
assert.match(el('queueList').innerHTML,/&lt;img/,'nome deve ser escapado');
queue[0].separator_key='jose';queue[0].separator_label='José';
el('queueSearch').trigger('input');
const click=id=>el('queueList').trigger('click',{target:{closest:selector=>selector==='[data-open]'?{dataset:{open:id}}:null}});
click(otherId);
assert.equal(redirects.length,0,'nao abrir pedidos fora da fila manual');
click(orderId);
assert.equal(redirects.length,1,'deve abrir a vitrine existente');
const destination=new URL(redirects[0]);
assert.equal(destination.pathname,'/vitrine/admin/');
assert.equal(destination.searchParams.get('separacao'),orderId);
assert.equal(destination.searchParams.get('montar'),'1');
assert.equal(destination.searchParams.get('order_number'),null,'nao gerar outro numero');
assert.ok(!requested.some(x=>/order_separation_get|order_separation_complete|order_separation_item_set/.test(x)),
  'o clique no cartao nao inicia, grava ou conclui separacao');
console.log('PASS /montar: fila manual, abrir vitrine canonica, isolamento e nenhum pedido alterado.');
