import {CONFIG} from './config.js';

const AUTH_KEY='da_admin_v3_auth';
const MENU_EDGE='admin-chat-menu-v1';
const RULE_EDGE='admin-service-intelligence-simple-v1';
const TABS=['flow','rules','test'];
const MODES=[
  ['text','Texto'],
  ['reply_buttons','Chips / botões'],
  ['cta_url','Abrir link'],
  ['baskets','Mostrar cestas'],
  ['offers','Mostrar ofertas'],
  ['products','Mostrar produtos'],
  ['product_lookup','Pesquisar produto'],
  ['checkout','Abrir checkout'],
  ['silence','Não responder']
];
const FALLBACK_PRESETS=[
  {id:'basic',label:'Básico',description:'Sem IA. Mantém compra estruturada, catálogo, cestas, pagamento/entrega e checkout.',flags:{openai:false,baskets:true,products:true,offers:true,checkout:true,profile:false,commerce_info:true,external_links:false}},
  {id:'recommended',label:'Recomendado',description:'Usa IA leve somente quando necessário e mantém todas as ferramentas internas do Chat Comprar.',flags:{openai:true,baskets:true,products:true,offers:true,checkout:true,profile:true,commerce_info:true,external_links:false}},
  {id:'complete',label:'Completo',description:'Ativa todas as ferramentas permitidas, inclusive links externos.',flags:{openai:true,baskets:true,products:true,offers:true,checkout:true,profile:true,commerce_info:true,external_links:true}}
];
const FALLBACK_FEATURES=[
  {id:'openai',label:'OpenAI / IA',description:'Interpreta texto livre quando regras diretas não forem suficientes.'},
  {id:'baskets',label:'Cestas',description:'Mostra e seleciona cestas básicas.'},
  {id:'products',label:'Produtos',description:'Catálogo, categorias e pesquisa de produtos.'},
  {id:'offers',label:'Ofertas',description:'Mostra itens marcados como oferta.'},
  {id:'checkout',label:'Checkout',description:'Permite fechar o pedido.'},
  {id:'profile',label:'Cadastro do cliente',description:'Permite exibir o cadastro no menu de ajuda.'},
  {id:'commerce_info',label:'Pagamento e entrega',description:'Respostas sobre formas de pagamento e área de entrega.'},
  {id:'external_links',label:'Links externos',description:'Permite regras que abrem links fora do chat.'}
];
const $=id=>document.getElementById(id);
const clean=v=>String(v??'').replace(/\r/g,'').trim();
const lines=v=>clean(v).split('\n').map(x=>x.trim()).filter(Boolean);
const arr=v=>Array.isArray(v)?v:[];
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

let menuConfig=null,menuCanWrite=false,rules=[],selectedRule=null,runtime=null,runtimeSchema={presets:FALLBACK_PRESETS,features:FALLBACK_FEATURES,config_level:'recommended',integrations:{...FALLBACK_PRESETS[1].flags}};

function toast(message,kind=''){
  const host=$('toastRegion');if(!host)return;
  const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?6000:3000);
}
function loadAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
function saveAuth(session){localStorage.setItem(AUTH_KEY,JSON.stringify(session))}
function clearAuth(){localStorage.removeItem(AUTH_KEY)}
async function refreshAuth(current){
  if(!current?.refresh_token)throw new Error('Sessão expirada.');
  const r=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:current.refresh_token}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error('Sessão expirada. Digite o código novamente.');saveAuth(d);return d;
}
async function api(edge,action,payload={},retry=true){
  let session=loadAuth();if(!session?.access_token)throw new Error('Área protegida. Digite o código de acesso.');
  const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${edge}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  if(r.status===401&&retry){session=await refreshAuth(session);return api(edge,action,payload,false)}
  const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||`Erro ${r.status}`);return d;
}
const menuApi=(action,payload={})=>api(MENU_EDGE,action,payload);
const ruleApi=(action,payload={})=>api(RULE_EDGE,action,payload);
async function authenticatePin(pin){
  const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-pin-auth-v1`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({pin}),cache:'no-store'});
  const issued=await r.json().catch(()=>({}));if(!r.ok||!issued?.token_hash)throw new Error(issued?.error==='rate_limited'?'Muitas tentativas. Tente novamente depois.':'Código inválido.');
  const verify=await fetch(`${CONFIG.supabaseUrl}/auth/v1/verify`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({type:issued.verification_type||'magiclink',token_hash:issued.token_hash}),cache:'no-store'});
  const session=await verify.json().catch(()=>({}));if(!verify.ok||!session?.access_token)throw new Error('Não consegui abrir a sessão protegida.');saveAuth(session);return session;
}
function showLogin(message=''){$('strategyApp').classList.add('hidden');$('loginGate').classList.remove('hidden');$('strategyLoginStatus').textContent=message;setTimeout(()=>$('strategyPin')?.focus(),50)}
function showApp(){$('loginGate').classList.add('hidden');$('strategyApp').classList.remove('hidden')}
function setTab(name){
  if(!TABS.includes(name))name='flow';
  document.querySelectorAll('[data-strategy-tab]').forEach(b=>b.classList.toggle('active',b.dataset.strategyTab===name));
  for(const key of TABS){$(`tab${key[0].toUpperCase()+key.slice(1)}`)?.classList.toggle('active',key===name)}
}

const KIND_LABEL={baskets:'Cestas',offers:'Ofertas',products:'Produtos',payment:'Pagamento',delivery:'Entregas',profile:'Cadastro',text:'Texto'};
function normalizeMenu(items){return arr(items).map((x,i)=>({id:clean(x.id)||`item-${i+1}`,kind:clean(x.kind)||'text',label:clean(x.label)||'Opção',enabled:x.enabled!==false,sort_order:Number(x.sort_order)||(i+1)*10,response_text:clean(x.response_text)})).sort((a,b)=>a.sort_order-b.sort_order)}
function menuRow(item){const dynamic=['baskets','offers','products'].includes(item.kind);const removable=item.kind==='text';return `<article class="chat-center-menu-item" data-menu-item data-id="${esc(item.id)}" data-kind="${esc(item.kind)}"><div class="chat-center-menu-head"><label class="chat-center-switch"><input data-field="enabled" type="checkbox" ${item.enabled?'checked':''}><span>Ativo</span></label><input data-field="label" maxlength="80" value="${esc(item.label)}"><span class="strategy-chip">${esc(KIND_LABEL[item.kind]||item.kind)}</span><div class="chat-center-row-actions"><button class="secondary" type="button" data-move="up">↑</button><button class="secondary" type="button" data-move="down">↓</button>${removable?'<button class="secondary" type="button" data-remove>Excluir</button>':''}</div></div>${dynamic?'<div class="strategy-help">Conteúdo dinâmico: usa dados reais do catálogo.</div>':`<label>Resposta no chat<textarea data-field="response_text" maxlength="600">${esc(item.response_text||'')}</textarea></label>`}</article>`}
function readMenu(){return [...document.querySelectorAll('[data-menu-item]')].map((row,i)=>({id:row.dataset.id||`item-${i+1}`,kind:row.dataset.kind||'text',enabled:row.querySelector('[data-field="enabled"]')?.checked!==false,label:clean(row.querySelector('[data-field="label"]')?.value)||'Opção',sort_order:(i+1)*10,response_text:clean(row.querySelector('[data-field="response_text"]')?.value)}))}
function renderFlow(){
  const host=$('flowRoot');if(!host||!menuConfig)return;const items=normalizeMenu(menuConfig.menu_items);
  host.innerHTML=`<div class="chat-center-grid"><section class="panel"><div class="strategy-panel-head"><div><div class="eyebrow">Menu de ajuda</div><h2>Atalhos rápidos</h2></div><button id="menuAddText" class="secondary" type="button">+ Texto</button></div><div class="chat-center-form"><label class="chat-center-switch"><input id="menuEnabled" type="checkbox" ${menuConfig.enabled!==false?'checked':''}><span>Mostrar menu</span></label><label>Chamada<input id="menuPrompt" maxlength="60" value="${esc(menuConfig.prompt_text||'Quer ajuda?')}"></label><label>Imagem/personagem<input id="menuAvatar" maxlength="500" value="${esc(menuConfig.avatar_url||'')}"></label><div id="menuItems" class="chat-center-menu-list">${items.map(menuRow).join('')}</div><div class="strategy-editor-actions"><button id="menuSave" class="primary" type="button" ${menuCanWrite?'':'disabled'}>Salvar fluxo</button></div></div></section><aside class="panel"><div class="eyebrow">Prévia</div><h3 id="menuPreviewPrompt">${esc(menuConfig.prompt_text||'Quer ajuda?')}</h3><div id="menuPreview">${items.filter(x=>x.enabled).map(x=>`<div class="strategy-chip">${esc(x.label)}</div>`).join('')}</div></aside></div>`;
  const preview=()=>{$('menuPreviewPrompt').textContent=clean($('menuPrompt')?.value)||'Quer ajuda?';$('menuPreview').innerHTML=readMenu().filter(x=>x.enabled).map(x=>`<div class="strategy-chip">${esc(x.label)}</div>`).join('')};
  $('menuItems').addEventListener('input',preview);$('menuItems').addEventListener('change',preview);$('menuPrompt').addEventListener('input',preview);
  $('menuItems').addEventListener('click',e=>{const row=e.target.closest('[data-menu-item]');if(!row)return;if(e.target.closest('[data-remove]')){row.remove();return preview()}const move=e.target.closest('[data-move]');if(!move)return;if(move.dataset.move==='up'&&row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);if(move.dataset.move==='down'&&row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);preview()});
  $('menuAddText').onclick=()=>{$('menuItems').insertAdjacentHTML('beforeend',menuRow({id:`custom-${Date.now()}`,kind:'text',label:'Nova opção',enabled:true,response_text:'Escreva a resposta aqui.'}));preview()};
  $('menuSave').onclick=saveFlow;
}
async function loadFlow(){const d=await menuApi('get');menuConfig=d.config||{};menuCanWrite=d.can_write!==false;renderFlow()}
async function saveFlow(){const b=$('menuSave');if(b)b.disabled=true;try{const d=await menuApi('save',{enabled:$('menuEnabled')?.checked!==false,prompt_text:clean($('menuPrompt')?.value)||'Quer ajuda?',avatar_url:clean($('menuAvatar')?.value),menu_items:readMenu()});menuConfig=d.config;toast('Fluxo salvo.','success');renderFlow()}catch(e){toast(e.message,'error')}finally{if($('menuSave'))$('menuSave').disabled=!menuCanWrite}}

function modeOptions(current='text'){return MODES.map(([id,label])=>`<option value="${id}" ${id===current?'selected':''}>${esc(label)}</option>`).join('')}
function toolFields(mode,cfg={}){
  if(mode==='reply_buttons')return `<label>Opções<textarea data-tool="buttons" placeholder="Uma opção por linha">${esc(arr(cfg.buttons).map(x=>typeof x==='string'?x:(x.label||x.value||'')).join('\n'))}</textarea></label>`;
  if(mode==='cta_url')return `<label>Texto do botão<input data-tool="label" value="${esc(cfg.label||'Abrir')}"></label><label>Link HTTPS<input data-tool="url" value="${esc(cfg.url||'')}"></label>`;
  if(mode==='products')return `<label>Categoria<select data-tool="category"><option value="">Todas</option>${[['mercearia','Mercearia'],['limpeza_lavanderia','Limpeza'],['higiene_beleza','Higiene e beleza'],['casa_pet','Casa e Pet']].map(([v,l])=>`<option value="${v}" ${cfg.category===v?'selected':''}>${l}</option>`).join('')}</select></label>`;
  return '';
}
function stageOf(rule={}){return arr(rule.stages)[0]||{question:rule.question||'',variations:arr(rule.variations),answer:rule.answer||'',response_mode:rule.response_mode||'text',tool_config:rule.tool_config||{}}}
function renderRuleList(){const q=clean($('ruleSearch')?.value).toLowerCase(),host=$('ruleList');const list=rules.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));host.innerHTML=list.length?list.map(r=>{const s=stageOf(r);return `<article class="strategy-rule-item ${selectedRule?.id===r.id?'active':''}" data-rule-id="${r.id}"><div class="strategy-rule-item-head"><strong>${esc(s.question||'Sem pergunta')}</strong><span class="strategy-status-pill">${esc(r.status||'draft')}</span></div><small>${esc(MODES.find(x=>x[0]===s.response_mode)?.[1]||s.response_mode)}</small></article>`}).join(''):'<div class="strategy-empty">Nenhuma regra.</div>'}
function presetDefinitions(){return arr(runtimeSchema?.presets).length?runtimeSchema.presets:FALLBACK_PRESETS}
function featureDefinitions(){return arr(runtimeSchema?.features).length?runtimeSchema.features:FALLBACK_FEATURES}
function baseRuntimeFlags(){return runtimeSchema?.integrations&&typeof runtimeSchema.integrations==='object'?runtimeSchema.integrations:(runtime?.integration_flags&&typeof runtime.integration_flags==='object'?runtime.integration_flags:FALLBACK_PRESETS[1].flags)}
function readRuntimeIntegrations(){const flags={};document.querySelectorAll('[data-runtime-feature]').forEach(input=>{flags[input.dataset.runtimeFeature]=input.checked!==false});return flags}
function matchingPreset(flags){return presetDefinitions().find(p=>Object.keys(p.flags||{}).every(key=>Boolean(flags[key])===Boolean(p.flags[key])))||null}
function syncRuntimePresetIndicator(){const select=$('runtimeLevel');if(!select)return;const flags=readRuntimeIntegrations(),match=matchingPreset(flags),existing=select.querySelector('option[value="custom"]');if(match){existing?.remove();select.value=match.id;$('runtimePresetStatus').textContent=match.label;$('runtimePresetHelp').textContent=match.description||''}else{if(!existing)select.insertAdjacentHTML('beforeend','<option value="custom" disabled>Personalizado</option>');select.value='custom';$('runtimePresetStatus').textContent='Personalizado';$('runtimePresetHelp').textContent='Você alterou uma ou mais integrações manualmente.'}}
function applyRuntimePreset(level){const preset=presetDefinitions().find(x=>x.id===level);if(!preset)return;for(const [key,value] of Object.entries(preset.flags||{})){const input=document.querySelector(`[data-runtime-feature="${key}"]`);if(input)input.checked=value!==false}syncRuntimePresetIndicator()}
function renderRuntime(){const r=runtime||{},presets=presetDefinitions(),features=featureDefinitions(),flags={...baseRuntimeFlags()},current=runtimeSchema?.config_level||r.config_level||'recommended',options=presets.map(p=>`<option value="${esc(p.id)}" ${current===p.id?'selected':''}>${esc(p.label)}</option>`).join(''),customOption=current==='custom'?'<option value="custom" selected disabled>Personalizado</option>':'';$('ruleRuntime').innerHTML=`<div class="strategy-panel-head"><div><div class="eyebrow">Motor do Chat Comprar</div><h3>Nível das respostas inteligentes</h3><p>Escolha um nível pronto ou ligue/desligue cada integração manualmente.</p></div><span id="runtimePresetStatus" class="strategy-status-pill">${esc(current==='custom'?'Personalizado':(presets.find(x=>x.id===current)?.label||'Recomendado'))}</span></div><div class="chat-center-fields"><label>Nível<select id="runtimeLevel">${options}${customOption}</select></label><div id="runtimePresetHelp" class="strategy-help">${esc(current==='custom'?'Você alterou uma ou mais integrações manualmente.':(presets.find(x=>x.id===current)?.description||''))}</div><label class="chat-center-switch"><input id="runtimeEnabled" type="checkbox" ${r.enabled!==false?'checked':''}><span>Respostas inteligentes ativas</span></label><label>Sensibilidade<input id="runtimeSimilarity" type="number" min="0" max="1" step="0.05" value="${Number(r.similarity_threshold??0.3)}"></label></div><div class="strategy-panel-head"><div><div class="eyebrow">Controles individuais</div><h3>Integrações e ferramentas</h3><p>Você pode sobrescrever o nível escolhido. O sistema passa a indicar “Personalizado”.</p></div></div><div class="chat-center-fields">${features.map(f=>`<label class="chat-center-switch"><input type="checkbox" data-runtime-feature="${esc(f.id)}" ${flags[f.id]!==false?'checked':''}><span><strong>${esc(f.label)}</strong><small class="strategy-help">${esc(f.description||'')}</small></span></label>`).join('')}</div><div class="strategy-editor-actions"><button id="runtimeSave" class="secondary" type="button">Salvar inteligência</button></div>`;$('runtimeLevel').onchange=e=>applyRuntimePreset(e.target.value);document.querySelectorAll('[data-runtime-feature]').forEach(input=>input.addEventListener('change',syncRuntimePresetIndicator));$('runtimeSave').onclick=saveRuntime;syncRuntimePresetIndicator()}
function renderRuleEditor(){const s=stageOf(selectedRule||{}),host=$('ruleEditor');$('ruleEditorTitle').textContent=selectedRule?'Editar regra':'Nova regra';$('ruleStatus').textContent=selectedRule?.status||'Rascunho';host.innerHTML=`<label>Pergunta / intenção<input id="ruleQuestion" value="${esc(s.question||'')}" placeholder="Ex.: Vocês têm leite?"></label><label>Variações<textarea id="ruleVariations" placeholder="Uma por linha">${esc(arr(s.variations).join('\n'))}</textarea></label><label>Resposta curta<textarea id="ruleAnswer" placeholder="Resposta que aparece antes da ação">${esc(s.answer||'')}</textarea></label><label>Ação<select id="ruleMode">${modeOptions(s.response_mode||'text')}</select></label><div id="ruleTools">${toolFields(s.response_mode||'text',s.tool_config||{})}</div>`;$('ruleMode').onchange=()=>{$('ruleTools').innerHTML=toolFields($('ruleMode').value,{})};$('rulePublish').disabled=!selectedRule?.id||selectedRule?.status==='published';$('ruleArchive').disabled=!selectedRule?.id||selectedRule?.status==='archived'}
function readTool(){const mode=$('ruleMode').value,cfg={};if(mode==='reply_buttons')cfg.buttons=lines(document.querySelector('[data-tool="buttons"]')?.value).slice(0,8).map(label=>({label,value:label}));if(mode==='cta_url'){cfg.label=clean(document.querySelector('[data-tool="label"]')?.value)||'Abrir';cfg.url=clean(document.querySelector('[data-tool="url"]')?.value)}if(mode==='products')cfg.category=clean(document.querySelector('[data-tool="category"]')?.value);return cfg}
async function loadRules(){const [dash,list]=await Promise.all([ruleApi('dashboard'),ruleApi('list')]);runtime=dash.runtime||{};runtimeSchema=dash.intelligence_config||{...runtimeSchema,config_level:runtime.config_level||'recommended',integrations:runtime.integration_flags||runtimeSchema.integrations};rules=arr(list.items);if(selectedRule?.id)selectedRule=rules.find(x=>x.id===selectedRule.id)||null;$('ruleMetrics').innerHTML=`<article class="strategy-metric"><span>Publicadas</span><strong>${dash.counts?.published||0}</strong></article><article class="strategy-metric"><span>Rascunhos</span><strong>${dash.counts?.drafts||0}</strong></article><article class="strategy-metric"><span>Fallback</span><strong>Menu do chat</strong></article>`;renderRuntime();renderRuleList();renderRuleEditor()}
async function saveRuntime(){try{const integrations=readRuntimeIntegrations(),matched=matchingPreset(integrations),d=await ruleApi('runtime_save',{enabled:$('runtimeEnabled')?.checked!==false,config_level:matched?.id||'custom',integrations,strict_mode:true,classifier_ai_enabled:integrations.openai!==false,generative_ai_enabled:integrations.openai!==false,humanize_all_replies:false,max_history_messages:2,max_candidate_rules:5,similarity_threshold:Number($('runtimeSimilarity')?.value||0.3),fallback_mode:'silence'});runtime=d.runtime;runtimeSchema=d.intelligence_config||runtimeSchema;renderRuntime();toast('Inteligência salva.','success')}catch(e){toast(e.message,'error')}}
async function saveRule(){const question=clean($('ruleQuestion').value);if(!question)throw new Error('Informe a pergunta/intenção.');const stage={question,variations:lines($('ruleVariations').value),answer:clean($('ruleAnswer').value),response_mode:$('ruleMode').value,tool_config:readTool()};const d=await ruleApi('save',{id:selectedRule?.id||undefined,stages:[stage],priority:Number(selectedRule?.priority||50)});selectedRule=d.item;await loadRules();toast('Regra salva.','success');return selectedRule}
async function setRuleStatus(status){const item=await saveRule();await ruleApi('set_status',{id:item.id,status});await loadRules();toast(status==='published'?'Regra publicada.':'Regra arquivada.','success')}

async function runTest(event){event.preventDefault();const message=clean($('testMessage').value);if(!message)return;const b=$('testRun');b.disabled=true;$('testResult').innerHTML='<div class="strategy-empty">Analisando…</div>';try{const d=await ruleApi('simulate',{message});const r=d.result||{};$('testResult').classList.remove('strategy-empty');$('testResult').innerHTML=`<div class="strategy-metrics"><article class="strategy-metric"><span>Rota</span><strong>${esc(r.source||'fallback')}</strong></article><article class="strategy-metric"><span>IA usada</span><strong>${r.ai_used?'Sim':'Não'}</strong></article><article class="strategy-metric"><span>Ação</span><strong>${esc(r.mode||r.ui?.type||'none')}</strong></article></div><section class="panel"><strong>Resposta</strong><p>${esc(r.reply||'(sem texto)')}</p><strong>Interface</strong><pre>${esc(JSON.stringify(r.ui||{},null,2))}</pre>${r.rule_question?`<p class="strategy-help">Regra: ${esc(r.rule_question)}</p>`:''}</section>`}catch(e){$('testResult').innerHTML=`<div class="strategy-empty">${esc(e.message)}</div>`}finally{b.disabled=false}}

async function boot(){showApp();await Promise.all([loadFlow(),loadRules()])}
$('strategyLoginForm').addEventListener('submit',async e=>{e.preventDefault();const pin=String($('strategyPin').value||'').replace(/\D/g,'').slice(0,6);if(pin.length!==6)return toast('Digite os 6 números.','error');try{await authenticatePin(pin);await boot()}catch(err){showLogin(err.message)}});
$('strategyPin').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
$('strategyLogout').addEventListener('click',()=>{clearAuth();showLogin('Área bloqueada.')});
$('strategyRefresh').addEventListener('click',()=>Promise.all([loadFlow(),loadRules()]).then(()=>toast('Atualizado.','success')).catch(e=>toast(e.message,'error')));
document.querySelectorAll('[data-strategy-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.strategyTab)));
$('ruleSearch').addEventListener('input',renderRuleList);
$('ruleNew').addEventListener('click',()=>{selectedRule=null;renderRuleList();renderRuleEditor()});
$('ruleList').addEventListener('click',e=>{const item=e.target.closest('[data-rule-id]');if(!item)return;selectedRule=rules.find(x=>x.id===item.dataset.ruleId)||null;renderRuleList();renderRuleEditor()});
$('ruleSave').addEventListener('click',()=>saveRule().catch(e=>toast(e.message,'error')));
$('rulePublish').addEventListener('click',()=>setRuleStatus('published').catch(e=>toast(e.message,'error')));
$('ruleArchive').addEventListener('click',()=>setRuleStatus('archived').catch(e=>toast(e.message,'error')));
$('testForm').addEventListener('submit',runTest);
if(loadAuth()?.access_token||loadAuth()?.refresh_token)boot().catch(e=>{clearAuth();showLogin(e.message)});else showLogin();