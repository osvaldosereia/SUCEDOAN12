const AUTH_KEY='da_admin_v3_auth';
const frame=document.getElementById('testChatFrame');
const diagnostics=document.getElementById('testDiagnostics');
const newButton=document.getElementById('testNewSession');
const clearButton=document.getElementById('testClearDiagnostics');
const status=document.getElementById('testStatus');
const testTab=document.querySelector('[data-strategy-tab="test"]');
let started=false;
let events=[];

function authSession(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
function testUrl(){const id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;return `../comprar/?admin_test=1&test_id=${encodeURIComponent(id)}`}
function renderDiagnostics(){
  if(!diagnostics)return;
  if(!events.length){diagnostics.innerHTML='<div class="chat-real-test-empty">As ações do teste aparecerão aqui: rota, uso de IA, API, tempo e possíveis erros.</div>';return}
  diagnostics.innerHTML=`<div class="chat-real-test-events">${events.slice().reverse().map(e=>`<article class="chat-real-test-event ${e.error?'error':e.action==='confirm_order'&&e.ok?'success':''}"><strong>${String(e.action||'evento')}</strong><small>${e.ok===false?'Erro':`HTTP ${e.status||200}`} · ${Math.round(Number(e.ms||0))} ms${e.source?` · rota ${String(e.source)}`:''}${e.ai_used===true?' · IA usada':e.ai_used===false?' · sem IA':''}${e.mode?` · ${String(e.mode)}`:''}</small>${e.error?`<small>${String(e.error)}</small>`:''}</article>`).join('')}</div>`;
}
function addDiagnostic(data){events.push(data);if(events.length>80)events=events.slice(-80);renderDiagnostics()}
function sendAuth(){
  const session=authSession();
  if(!session?.access_token){if(status)status.textContent='Sessão do Admin indisponível. Bloqueie e entre novamente.';return}
  frame?.contentWindow?.postMessage({type:'da-admin-test-auth',access_token:session.access_token},location.origin);
  if(status)status.textContent='Teste conectado ao ambiente real em modo seguro.';
}
function startTest(){
  if(!frame)return;
  events=[];renderDiagnostics();
  started=true;
  if(status)status.textContent='Abrindo uma sessão de teste nova…';
  frame.src=testUrl();
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  const data=event.data||{};
  if(data.type==='da-admin-test-ready'){sendAuth();return}
  if(data.type==='da-admin-test-diagnostic'){addDiagnostic(data.detail||{});return}
  if(data.type==='da-admin-test-finished'){
    addDiagnostic({action:'confirm_order',ok:true,status:200,ms:data.ms||0,source:'admin_test',mode:'dry_run'});
    if(status)status.textContent='Checkout validado. Nenhum pedido real foi criado.';
  }
});
newButton?.addEventListener('click',startTest);
clearButton?.addEventListener('click',()=>{events=[];renderDiagnostics()});
testTab?.addEventListener('click',()=>{if(!started)startTest()});
frame?.addEventListener('load',()=>{if(started&&status)status.textContent='Carregando Chat Comprar…'});
renderDiagnostics();
