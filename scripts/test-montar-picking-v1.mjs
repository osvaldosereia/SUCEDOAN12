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
assert.match(script,/queue\.some\(o=>o\.id===id&&o\.completed!==true\)/,'bloquear abertura de pedido fora da fila ou concluido');
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
assert.match(admin,/const originalPublicCode=orderDisplayCode\(order\)/,'titulo da vitrine usa codigo do checkout');
assert.match(script,/value\?\.public_code\s*\|\|\s*value\?\.order_public_code/,'fila usa somente codigo publico');
assert.doesNotMatch(script,/String\(value\?\.order_number\s*\|\|/,'nao usar numero interno como fallback');
const publicFeed=readFileSync('supabase/sql/20261008_montar_feed_public_code_v1.sql','utf8');
assert.match(publicFeed,/'public_code',p\.public_code/,'feed retorna codigo publico existente');
assert.match(publicFeed,/left join public\.order_public_snapshots_v1 p on p\.order_id=o\.id/,'origem do codigo publica e persistente');
const itemSql=readFileSync('supabase/sql/20261008_fix_item_separator_key_check_v1.sql','utf8');
assert.match(itemSql,/changed_by_separator_key is null or changed_by_separator_key = any/,'item check preservado');
assert.match(itemSql,/array\['jose','claudio','claudenil','kelly','jovenil'\]/,'identificadores suportados pela vitrine e pelo historico');
assert.doesNotMatch(itemSql,/update\s+public\.orders|update\s+public\.order_items/i,'migration nao reescreve pedidos ou itens');

assert.match(admin,/html\.montar-picker-only #app\{display:none!important\}/,'ocultar menus administrativos');
assert.match(admin,/if\(close\)close\.onclick=\(\)=>location\.replace\('\/montar\/'\)/,'voltar para fila quando fechar');
assert.match(admin,/if\(document\.documentElement\.classList\.contains\('montar-picker-only'\)\)/,'voltar apos aviso da embalagem');

// Simulates a logged-in picker; verifies redirect uses canonical vitrine and
// never accesses/mutates a real order while clicking the card.
const orderId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const authToken='e30.'+payload+'.test';
const queue=[{id:orderId,order_number:'DA-261008-AAAAAAAA',public_code:'DA115',status:'confirmed',customer_name:'Cliente teste',created_at:'2026-10-08T12:00:00Z',counts:{total:1,pending:1,separated:0,missing:0},separator_key:'jose',separator_label:'José'}];
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
assert.doesNotMatch(el('queueList').innerHTML,/DA-261008-AAAAAAAA/,'numero interno NUNCA exibido no card');
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

const newSql=readFileSync('supabase/sql/20261008_montar_feed_completed_cards_v1.sql','utf8');
const completionSql=readFileSync('supabase/sql/20261008_fix_completion_separator_key_check_v1.sql','utf8');
assert.match(completionSql,/array\['jose','claudio','claudenil','kelly','jovenil'\]/,'conclusao aceita separador atual e historico');
assert.match(newSql,/c\.completed_at is not null/,'apenas conclusoes persistidas');
assert.match(newSql,/o\.status='ready'/,'pedido pronto continua no card de separado');
assert.match(newSql,/'completed',c\.completed_at is not null/,'flag de conclusao nao deriva da contagem');
assert.match(script,/o\.completed===true&&Boolean\(o\.completed_at\)/,'nao confundir conferido com concluido');
assert.match(admin,/if\(result\?\.status!=='ready'\)throw new Error\('separation_completion_unconfirmed'\)/,'API deve confirmar ready');
assert.match(admin,/if\(persisted\)/,'erro apos sucesso nao desmarca conclusao');
assert.match(admin,/orders-sheet-completion-error/,'erro de conclusao visivel na vitrine');
assert.match(admin,/location\.replace\('\/montar\/\?concluido='\+encodeURIComponent\(orderId\)\)/,'retorno identificado ao /montar');
assert.match(admin,/overlay\.__pickerReturnTimer=setTimeout/,'retorno automatico apos aviso de embalagem');
// 27/27 significa conferido, mas so completar API pode marcar concluido.
queue[0].counts={total:27,pending:0,separated:27,missing:0};
queue.push({
 id:otherId,order_number:'INTERNAL-OTHER',public_code:'DA516',status:'ready',
 created_at:'2026-10-08T12:01:00Z',customer_name:'Concluido teste',
 completed:true,completed_at:'2026-10-08T14:20:00Z',
 completed_separator_key:'claudio',completed_separator_label:'Cláudio',
 counts:{total:5,pending:0,separated:5,missing:0}
});
ctx.location.search='?concluido='+otherId;
el('reloadBtn').trigger('click');
for(let i=0;i<80&&!el('queueList').innerHTML.includes('DA516');i++)
  await new Promise(r=>setTimeout(r,10));
assert.equal(el('queueCount').textContent,'2');
assert.match(el('queueList').innerHTML,/PEDIDO JÁ SEPARADO POR/);
assert.match(el('queueList').innerHTML,/Cláudio/);
assert.match(el('queueList').innerHTML,/DA516/);
assert.doesNotMatch(el('queueList').innerHTML,/INTERNAL-OTHER/);
assert.match(el('queueCompletionNotice').textContent,/PEDIDO #DA516 JÁ SEPARADO POR Cláudio/);
const previousCount=redirects.length;
click(otherId);
assert.equal(redirects.length,previousCount,'pedido concluido nao pode ser reaberto para separacao');
assert.match(el('queueList').innerHTML,/DA115/);
assert.match(el('queueList').innerHTML,/CONTINUAR SEPARAÇÃO/,'27 de 27 sem conclusao permanece em separacao');

console.log('PASS /montar: fila manual, abrir vitrine canonica, isolamento e nenhum pedido alterado.');
