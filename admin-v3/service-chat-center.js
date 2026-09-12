import {CONFIG} from './config.js';

const AUTH_KEY='da_admin_v3_auth';
const MENU_EDGE='admin-chat-menu-v1';
const RULE_EDGE='admin-service-intelligence-simple-v1';
const STRATEGY_EDGE='admin-service-strategy-v1';
const TAB_KEYS=['rules','chat','intelligence','history','evolution'];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const arr=v=>Array.isArray(v)?v:[];
const clamp=(v,min,max,fallback)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback};

let menuConfig=null,menuCanWrite=false,menuLoaded=false,menuLoading=false;
let intelligenceLoaded=false,intelligenceLoading=false;

function auth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
function saveAuth(value){localStorage.setItem(AUTH_KEY,JSON.stringify(value))}
async function refreshAuth(current){
  if(!current?.refresh_token)throw new Error('Sessão expirada.');
  const response=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:current.refresh_token}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.access_token)throw new Error('Sessão expirada. Digite o código novamente.');
  saveAuth(data);return data;
}
async function api(edge,action,payload={},retry=true){
  let session=auth();if(!session?.access_token)throw new Error('Área protegida. Digite o código de acesso.');
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${edge}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  if(response.status===401&&retry){session=await refreshAuth(session);return api(edge,action,payload,false)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${response.status}`);
  return data;
}
function toast(message,kind=''){
  const host=$('toastRegion');if(!host)return;
  const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?6000:3000);
}
function syncTabs(name){
  document.querySelectorAll('[data-strategy-tab]').forEach(button=>button.classList.toggle('active',button.dataset.strategyTab===name));
  for(const key of TAB_KEYS){const node=$(`tab${key[0].toUpperCase()+key.slice(1)}`);if(node)node.classList.toggle('active',key===name)}
}

const builtinKinds=new Set(['baskets','offers','products','payment','delivery','profile']);
const kindLabel={baskets:'Cestas',offers:'Ofertas',products:'Produtos',payment:'Pagamento',delivery:'Entregas',profile:'Cadastro',text:'Resposta de texto'};
function normalizeMenuItems(items){
  return arr(items).map((x,i)=>({id:clean(x.id)||`item-${i+1}`,kind:clean(x.kind)||'text',label:clean(x.label)||'Opção',enabled:x.enabled!==false,sort_order:Number.isFinite(Number(x.sort_order))?Number(x.sort_order):(i+1)*10,response_text:clean(x.response_text)})).sort((a,b)=>a.sort_order-b.sort_order);
}
function menuItemHtml(item,index){
  const editable=!['baskets','offers','products'].includes(item.kind),removable=!builtinKinds.has(item.kind);
  return `<article class="chat-center-menu-item" data-menu-item data-id="${esc(item.id)}" data-kind="${esc(item.kind)}">
    <div class="chat-center-menu-head">
      <label class="chat-center-switch"><input data-field="enabled" type="checkbox" ${item.enabled?'checked':''}><span>Ativo</span></label>
      <input data-field="label" maxlength="80" value="${esc(item.label)}" aria-label="Nome da opção">
      <span class="strategy-chip">${esc(kindLabel[item.kind]||item.kind)}</span>
      <div class="chat-center-row-actions"><button class="secondary" type="button" data-move="up">↑</button><button class="secondary" type="button" data-move="down">↓</button>${removable?'<button class="secondary" type="button" data-remove>Excluir</button>':''}</div>
    </div>
    ${editable?`<label>Resposta no chat<textarea data-field="response_text" maxlength="600">${esc(item.response_text||'')}</textarea></label>`:'<div class="strategy-help">Conteúdo dinâmico: usa automaticamente as cestas/produtos reais do Supabase.</div>'}
  </article>`;
}
function readMenuItems(){
  return [...document.querySelectorAll('#chatMenuItems [data-menu-item]')].map((row,index)=>({id:row.dataset.id||`item-${index+1}`,kind:row.dataset.kind||'text',enabled:row.querySelector('[data-field="enabled"]')?.checked!==false,label:clean(row.querySelector('[data-field="label"]')?.value)||'Opção',sort_order:(index+1)*10,response_text:clean(row.querySelector('[data-field="response_text"]')?.value)}));
}
function renderMenuPreview(){
  const prompt=$('chatMenuPromptPreview'),avatar=$('chatMenuAvatarPreview'),list=$('chatMenuPreviewList');
  if(prompt)prompt.textContent=clean($('chatMenuPrompt')?.value)||'Quer ajuda?';
  if(list){const items=readMenuItems().filter(x=>x.enabled);list.innerHTML=items.map(x=>`<div>${esc(x.label)}</div>`).join('')||'<div>Menu oculto</div>'}
  if(avatar){const url=clean($('chatMenuAvatar')?.value);avatar.innerHTML=url?`<img src="${esc(url)}" alt="Dona Antônia" onerror="this.parentElement.textContent='DA'">`:'DA'}
}
function renderChatTab(){
  const host=$('chatConfigRoot');if(!host||!menuConfig)return;
  const items=normalizeMenuItems(menuConfig.menu_items);
  host.innerHTML=`<div class="chat-center-grid">
    <section class="panel"><div class="strategy-panel-head"><div><div class="eyebrow">Menu do Chat</div><h2>Atalho “Quer ajuda?”</h2><p>Controle o menu flutuante sem alterar o código do chat.</p></div></div>
      <div class="chat-center-form">
        <label class="chat-center-switch"><input id="chatMenuEnabled" type="checkbox" ${menuConfig.enabled!==false?'checked':''}><span>Mostrar botão flutuante no chat</span></label>
        <label>Frase acima da personagem<input id="chatMenuPrompt" maxlength="60" value="${esc(menuConfig.prompt_text||'Quer ajuda?')}"></label>
        <label>Imagem/personagem<input id="chatMenuAvatar" maxlength="500" value="${esc(menuConfig.avatar_url||'')}" placeholder="/img/avatar.png ou https://..."></label>
        <div class="strategy-panel-head"><div><strong>Opções</strong><div class="strategy-help">Cestas, ofertas e produtos usam os dados reais. As respostas de texto são editáveis.</div></div><button id="chatMenuAddText" class="secondary" type="button">+ Nova resposta</button></div>
        <div id="chatMenuItems" class="chat-center-menu-list">${items.map(menuItemHtml).join('')}</div>
        <div class="strategy-editor-actions"><button id="chatMenuReload" class="secondary" type="button">Recarregar</button><button id="chatMenuSave" class="primary" type="button" ${menuCanWrite?'':'disabled'}>Salvar Menu do Chat</button></div>
      </div>
    </section>
    <aside class="panel chat-center-preview"><div class="eyebrow">Prévia</div><h3>Como aparece para o cliente</h3><div class="chat-center-phone"><div class="chat-center-preview-title">Conversa com Dona Antônia</div><div id="chatMenuPreviewList" class="chat-center-preview-list"></div><div class="chat-center-helper"><span id="chatMenuPromptPreview"></span><div id="chatMenuAvatarPreview" class="chat-center-avatar">DA</div></div></div></aside>
  </div>
  <section class="panel"><div class="strategy-panel-head"><div><div class="eyebrow">Checkout</div><h2>Proteções fixas do chat</h2><p>Estas regras ficam visíveis aqui, mas não podem ser desligadas por engano.</p></div></div>
    <div class="chat-center-safety-grid">
      <article><strong>Confirmação pelo WhatsApp</strong><span>Acesso direto pelo site não revela cadastro/endereço salvo até confirmar o número pelo próprio WhatsApp.</span></article>
      <article><strong>Confirmação do endereço</strong><span>O cliente precisa escolher ou informar explicitamente o endereço antes de concluir cada pedido.</span></article>
      <article><strong>Novo endereço salvo</strong><span>Quando o cliente usa outro endereço, ele é salvo no cadastro para as próximas compras.</span></article>
      <article><strong>Retorno ao WhatsApp</strong><span>Após concluir o pedido, o cliente volta ao WhatsApp com a identificação do pedido pronta.</span></article>
    </div>
  </section>`;
  bindMenuEditor();renderMenuPreview();
}
function bindMenuEditor(){
  ['chatMenuEnabled','chatMenuPrompt','chatMenuAvatar'].forEach(id=>{$(id)?.addEventListener('input',renderMenuPreview);$(id)?.addEventListener('change',renderMenuPreview)});
  $('chatMenuItems')?.addEventListener('input',renderMenuPreview);$('chatMenuItems')?.addEventListener('change',renderMenuPreview);
  $('chatMenuItems')?.addEventListener('click',event=>{const row=event.target.closest('[data-menu-item]');if(!row)return;if(event.target.closest('[data-remove]')){row.remove();renderMenuPreview();return}const move=event.target.closest('[data-move]');if(!move)return;if(move.dataset.move==='up'&&row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);if(move.dataset.move==='down'&&row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);renderMenuPreview()});
  $('chatMenuAddText').onclick=()=>{const host=$('chatMenuItems'),i=host.querySelectorAll('[data-menu-item]').length;host.insertAdjacentHTML('beforeend',menuItemHtml({id:`custom-${Date.now()}`,kind:'text',label:'Nova opção',enabled:true,sort_order:(i+1)*10,response_text:'Escreva aqui a resposta que aparecerá no chat.'},i));renderMenuPreview()};
  $('chatMenuReload').onclick=()=>loadChat(true);
  $('chatMenuSave').onclick=saveMenu;
}
async function loadChat(force=false){
  if(menuLoading||(!force&&menuLoaded))return;menuLoading=true;const host=$('chatConfigRoot');if(host)host.innerHTML='<div class="strategy-empty">Carregando configurações do chat…</div>';
  try{const data=await api(MENU_EDGE,'get');menuConfig=data.config||{};menuCanWrite=data.can_write!==false;menuLoaded=true;renderChatTab()}catch(error){if(host)host.innerHTML=`<div class="strategy-empty">${esc(error.message)}</div>`}finally{menuLoading=false}
}
async function saveMenu(){
  const button=$('chatMenuSave');if(button)button.disabled=true;
  try{const data=await api(MENU_EDGE,'save',{enabled:$('chatMenuEnabled')?.checked!==false,prompt_text:clean($('chatMenuPrompt')?.value)||'Quer ajuda?',avatar_url:clean($('chatMenuAvatar')?.value),menu_items:readMenuItems()});menuConfig=data.config;toast('Menu do Chat salvo.','success');renderChatTab()}catch(error){toast(error.message,'error')}finally{if($('chatMenuSave'))$('chatMenuSave').disabled=!menuCanWrite}
}

function boolRow(id,title,description,value){return `<label class="chat-center-setting"><span><strong>${esc(title)}</strong><small>${esc(description)}</small></span><input id="${id}" type="checkbox" ${value?'checked':''}></label>`}
function globalAutomationHtml(strategy){
  const a=strategy?.metrics?.runtime?.automation||{};const live=Boolean(a.ai_enabled&&a.conversation_worker_enabled&&a.conversation_worker_dispatch_enabled&&a.whatsapp_auto_reply_enabled);
  return `<div class="chat-center-global ${live?'live':'safe'}"><strong>${live?'Atendimento automático global ativo':'Envio automático global bloqueado'}</strong><span>${live?'As respostas podem ser enviadas automaticamente aos clientes.':'Você pode preparar regras e inteligência aqui sem ligar o atendimento automático. Os gates globais continuam fora desta tela por segurança.'}</span></div>`;
}
function renderIntelligence(runtime={},strategy={}){
  const host=$('intelligenceConfigRoot');if(!host)return;
  host.innerHTML=`${globalAutomationHtml(strategy)}<form id="intelligenceForm" class="panel chat-center-intelligence">
    <div class="strategy-panel-head"><div><div class="eyebrow">Inteligência</div><h2>Como interpretar e responder</h2><p>Controles simples do motor de regras. Alterar aqui não liga os gates globais do WhatsApp.</p></div></div>
    ${boolRow('runtimeEnabled','Motor de regras habilitado','Permite que este conjunto de regras seja considerado quando o worker estiver ativo.',runtime.enabled!==false)}
    ${boolRow('runtimeStrict','Modo restrito','A IA só trabalha dentro das regras e informações permitidas.',runtime.strict_mode!==false)}
    ${boolRow('runtimeClassifier','IA para entender a intenção','Ajuda a escolher a regra correta quando a frase do cliente varia.',runtime.classifier_ai_enabled!==false)}
    ${boolRow('runtimeGenerative','IA para naturalizar a resposta','Permite formular a resposta com linguagem natural sem inventar fatos.',runtime.generative_ai_enabled!==false)}
    ${boolRow('runtimeHumanize','Humanizar todas as respostas','Deixa as respostas menos mecânicas quando a IA estiver disponível.',runtime.humanize_all_replies!==false)}
    <details class="chat-center-advanced"><summary>Configurações avançadas</summary><div class="chat-center-fields">
      <label>Mensagens recentes consideradas<input id="runtimeHistory" type="number" min="0" max="8" step="1" value="${esc(runtime.max_history_messages??4)}"><small>0 a 8. Quanto menor, menor custo e menos contexto.</small></label>
      <label>Regras comparadas por mensagem<input id="runtimeCandidates" type="number" min="1" max="10" step="1" value="${esc(runtime.max_candidate_rules??5)}"><small>1 a 10 regras candidatas.</small></label>
      <label>Sensibilidade para reconhecer intenção<input id="runtimeSimilarity" type="number" min="0" max="1" step="0.05" value="${esc(runtime.similarity_threshold??0.5)}"><small>0 é permissivo; 1 exige correspondência muito alta.</small></label>
      <label>Quando não souber<select id="runtimeFallback"><option value="human" ${runtime.fallback_mode==='human'?'selected':''}>Chamar humano</option><option value="silence" ${runtime.fallback_mode==='silence'?'selected':''}>Não responder automaticamente</option></select></label>
    </div></details>
    <div class="strategy-editor-actions"><button id="intelligenceReload" class="secondary" type="button">Recarregar</button><button class="primary" type="submit">Salvar inteligência</button></div>
  </form>`;
  $('intelligenceReload').onclick=()=>loadIntelligence(true);
  $('intelligenceForm').addEventListener('submit',saveIntelligence);
}
async function loadIntelligence(force=false){
  if(intelligenceLoading||(!force&&intelligenceLoaded))return;intelligenceLoading=true;const host=$('intelligenceConfigRoot');if(host)host.innerHTML='<div class="strategy-empty">Carregando inteligência…</div>';
  try{const [rule,strategy]=await Promise.all([api(RULE_EDGE,'dashboard'),api(STRATEGY_EDGE,'dashboard').catch(()=>({}))]);intelligenceLoaded=true;renderIntelligence(rule.runtime||{},strategy)}catch(error){if(host)host.innerHTML=`<div class="strategy-empty">${esc(error.message)}</div>`}finally{intelligenceLoading=false}
}
async function saveIntelligence(event){
  event.preventDefault();const submit=event.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;
  try{const payload={enabled:$('runtimeEnabled')?.checked!==false,strict_mode:$('runtimeStrict')?.checked!==false,classifier_ai_enabled:$('runtimeClassifier')?.checked!==false,generative_ai_enabled:$('runtimeGenerative')?.checked!==false,humanize_all_replies:$('runtimeHumanize')?.checked!==false,max_history_messages:clamp($('runtimeHistory')?.value,0,8,4),max_candidate_rules:clamp($('runtimeCandidates')?.value,1,10,5),similarity_threshold:clamp($('runtimeSimilarity')?.value,0,1,0.5),fallback_mode:$('runtimeFallback')?.value==='silence'?'silence':'human'};const data=await api(RULE_EDGE,'runtime_save',payload);toast('Configuração da inteligência salva.','success');renderIntelligence(data.runtime||payload,(await api(STRATEGY_EDGE,'dashboard').catch(()=>({}))))}catch(error){toast(error.message,'error')}finally{submit.disabled=false}
}

function onTab(name){syncTabs(name);if(name==='chat')loadChat().catch(error=>toast(error.message,'error'));if(name==='intelligence')loadIntelligence().catch(error=>toast(error.message,'error'))}
document.querySelectorAll('[data-strategy-tab]').forEach(button=>button.addEventListener('click',()=>onTab(button.dataset.strategyTab)));
$('strategyRefresh')?.addEventListener('click',()=>{menuLoaded=false;intelligenceLoaded=false;const active=document.querySelector('[data-strategy-tab].active')?.dataset.strategyTab;if(active==='chat')setTimeout(()=>loadChat(true),50);if(active==='intelligence')setTimeout(()=>loadIntelligence(true),50)});
