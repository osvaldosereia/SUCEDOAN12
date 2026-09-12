import {CONFIG} from './config.js';

const AUTH_KEY='da_admin_v3_auth';
const RULE_EDGE='admin-service-intelligence-simple-v1';
const STRATEGY_EDGE='admin-service-strategy-v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean=v=>String(v??'').replace(/\r/g,'').trim();
const lines=v=>clean(v).split('\n').map(x=>x.trim()).filter(Boolean);
const arr=v=>Array.isArray(v)?v:[];
const dt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const pct=v=>`${(Number(v||0)*100).toFixed(1).replace('.',',')}%`;

function toast(message,kind=''){
  const host=$('toastRegion');if(!host)return;
  const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?6000:3000);
}
function loadAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
function saveAuth(session){localStorage.setItem(AUTH_KEY,JSON.stringify(session))}
function clearAuth(){localStorage.removeItem(AUTH_KEY)}
async function refreshAuth(auth){
  if(!auth?.refresh_token)throw new Error('Sessão expirada.');
  const response=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok||!data?.access_token)throw new Error('Sessão expirada. Digite o código novamente.');saveAuth(data);return data;
}
async function edgeApi(edge,action,payload={},retry=true){
  let auth=loadAuth();if(!auth?.access_token)throw new Error('Área protegida. Digite o código de acesso.');
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${edge}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  if(response.status===401&&retry){auth=await refreshAuth(auth);return edgeApi(edge,action,payload,false)}
  const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${response.status}`);return data;
}
const ruleApi=(action,payload={})=>edgeApi(RULE_EDGE,action,payload);
const strategyApi=(action,payload={})=>edgeApi(STRATEGY_EDGE,action,payload);

async function authenticatePin(pin){
  const start=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-pin-auth-v1`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({pin}),cache:'no-store',credentials:'omit'});
  const issued=await start.json().catch(()=>({}));
  if(!start.ok||!issued?.token_hash){
    if(start.status===429)throw new Error(`Muitas tentativas. Tente novamente em ${Math.max(1,Math.ceil(Number(issued.retry_after_seconds||60)/60))} min.`);
    const left=issued?.remaining_attempts;throw new Error(left===null||left===undefined?'Código inválido.':`Código inválido. Restam ${left} tentativa(s).`);
  }
  const verify=await fetch(`${CONFIG.supabaseUrl}/auth/v1/verify`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({type:issued.verification_type||'magiclink',token_hash:issued.token_hash}),cache:'no-store',credentials:'omit'});
  const session=await verify.json().catch(()=>({}));if(!verify.ok||!session?.access_token||!session?.refresh_token)throw new Error('Não consegui abrir a sessão protegida.');saveAuth(session);return session;
}

const MODES=[
  ['Respostas','text','Texto','Pronto'],['Respostas','audio_ai','Áudio com voz da IA','Pronto'],['Respostas','image','Imagem + texto','Pronto'],
  ['Interativos','reply_buttons','Botões internos de resposta','Pronto'],['Interativos','cta_url','Botão externo / abrir link','Pronto'],['Interativos','list_view','Lista só para visualizar','Pronto'],['Interativos','list_select','Lista selecionável','Pronto'],
  ['Flows e compra','basket_flow','Flow — vitrine das cestas básicas','Pronto'],['Flows e compra','registration_flow','Flow — cadastro do cliente','Configurável'],['Flows e compra','address_flow','Flow — alterar endereço','Pronto'],['Flows e compra','custom_flow','Flow — escolher outro Flow','Configurável'],['Flows e compra','product_lookup','Consultar produto / preço / estoque','Pronto'],['Flows e compra','catalog_message','Abrir catálogo do WhatsApp','Transporte pendente'],['Flows e compra','single_product','Mostrar um produto do catálogo','Transporte pendente'],['Flows e compra','product_list','Lista de produtos do catálogo','Transporte pendente'],
  ['Mídia e dados','video','Vídeo','Transporte pendente'],['Mídia e dados','document','Documento / PDF','Transporte pendente'],['Mídia e dados','location','Localização','Transporte pendente'],['Mídia e dados','contact','Contato','Transporte pendente'],
  ['Templates','template_quick_reply','Template + botões de resposta','Template aprovado'],['Templates','template_cta','Template + botão externo / telefone','Template aprovado'],['Templates','template_carousel','Carrossel no WhatsApp','Template aprovado'],['Templates','template_catalog','Template de catálogo','Template aprovado'],['Templates','template_multi_product','Template multiproduto','Template aprovado'],
  ['Controle','human','Chamar atendimento humano','Pronto'],['Controle','silence','Não responder automaticamente','Pronto']
];
const modeInfo=v=>MODES.find(x=>x[1]===v)||['',v,v,''];
const modeLabel=v=>modeInfo(v)[2];
function modeOptions(current='text'){
  let html='',group='';for(const [g,v,label,status] of MODES){if(g!==group){if(group)html+='</optgroup>';html+=`<optgroup label="${esc(g)}">`;group=g}html+=`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(label)}${status==='Pronto'?'':' · '+esc(status)}</option>`}return html+(group?'</optgroup>':'');
}
const blankStage=()=>({question:'',variations:[],answer:'',response_mode:'text',tool_config:{}});
function normalizeStages(rule={}){if(Array.isArray(rule.stages)&&rule.stages.length)return rule.stages.map(s=>({question:s.question||'',variations:arr(s.variations),answer:s.answer||'',response_mode:s.response_mode||'text',tool_config:s.tool_config&&typeof s.tool_config==='object'?s.tool_config:{}}));if(rule.question||rule.answer)return [{question:rule.question||'',variations:arr(rule.variations),answer:rule.answer||'',response_mode:rule.response_mode||'text',tool_config:rule.tool_config||{}}];return [blankStage()]}

let ruleItems=[],selectedRule=null,editingStages=[blankStage()],ruleResources={flows:[],live_modes:[]},ruleDashboard=null;
let historyState={page:1,q:'',total:0,selectedId:null,loaded:false};
let evolutionState={dashboard:null,snapshots:[],changes:[],loaded:false};

const field=(label,key,value='',placeholder='')=>`<label>${esc(label)}<input data-cfg="${esc(key)}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;
const area=(label,key,value='',placeholder='',help='')=>`<label>${esc(label)}<textarea data-cfg="${esc(key)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>${help?`<small class="strategy-help">${esc(help)}</small>`:''}</label>`;
function flowSelect(value='',includeMissing=false){let options='<option value="">Escolha um Flow</option>';for(const f of arr(ruleResources.flows)){options+=`<option value="${esc(f.slug)}" ${f.slug===value?'selected':''}>${esc(f.slug)} · ${esc(f.status)}${f.provider_id?'':' · sem ID Meta'}</option>`}if(includeMissing&&!arr(ruleResources.flows).some(f=>f.slug==='flow-cadastro-v1'))options+=`<option value="flow-cadastro-v1" ${value==='flow-cadastro-v1'?'selected':''}>flow-cadastro-v1 · ainda não publicado</option>`;return `<label>Flow<select data-cfg="flow_slug">${options}</select></label>`}
function toolFields(mode,cfg={}){
  const note=t=>`<div class="strategy-resource-note">${esc(t)}</div>`;
  if(mode==='reply_buttons')return area('Botões','buttons',arr(cfg.buttons).map(x=>typeof x==='string'?x:(x.label||'')).join('\n'),'Um botão por linha','Até 3 botões. O clique pode alimentar a próxima etapa.');
  if(mode==='cta_url')return field('Texto do botão','label',cfg.label||'Abrir','Ex.: Ver pedido')+field('Link HTTPS','url',cfg.url||'','https://...');
  if(mode==='list_view')return area('Itens da lista','items',arr(cfg.items).map(x=>typeof x==='string'?x:(x.title||'')).join('\n'),'Um item por linha');
  if(mode==='list_select')return field('Texto do botão da lista','button_label',cfg.button_label||'Escolher','Ex.: Escolher')+area('Opções','rows',arr(cfg.rows).map(x=>`${x.title||''}${x.description?' | '+x.description:''}`).join('\n'),'Título | descrição','Uma opção por linha.');
  if(mode==='basket_flow')return note('Abre o Flow de cestas básicas. A compra/personalização continua no Flow/vitrine externa.');
  if(mode==='registration_flow')return flowSelect(cfg.flow_slug||'flow-cadastro-v1',true)+note('Só publique quando o Flow de cadastro estiver disponível na Meta.');
  if(mode==='address_flow')return note('Abre o Flow de alteração de endereço já configurado.');
  if(mode==='custom_flow')return flowSelect(cfg.flow_slug||'',false)+field('Texto do botão do Flow','cta',cfg.cta||'Continuar','Ex.: Cadastrar');
  if(mode==='product_lookup')return note('A IA identifica o produto e consulta preço/estoque no banco oficial.');
  if(mode==='catalog_message')return field('SKU para miniatura (opcional)','thumbnail_sku',cfg.thumbnail_sku||'','SKU');
  if(mode==='single_product')return field('SKU do produto no catálogo Meta','sku',cfg.sku||'','SKU');
  if(mode==='product_list')return area('SKUs dos produtos','skus',arr(cfg.skus).join('\n'),'Um SKU por linha');
  if(['image','video','document'].includes(mode))return field(mode==='image'?'URL da imagem':mode==='video'?'URL do vídeo':'URL do documento','url',cfg.url||'','https://...')+(mode==='document'?field('Nome do arquivo','filename',cfg.filename||'','arquivo.pdf'):'');
  if(mode==='audio_ai')return note('A resposta escrita será enviada em áudio pela voz configurada quando o transporte de áudio estiver ativo.');
  if(mode==='location')return field('Nome do local','name',cfg.name||'','Dona Antônia')+field('Endereço','address',cfg.address||'','Rua...')+field('Latitude','latitude',cfg.latitude||'','-15.000')+field('Longitude','longitude',cfg.longitude||'','-56.000');
  if(mode==='contact')return field('Nome do contato','name',cfg.name||'','Dona Antônia')+field('Telefone','phone',cfg.phone||'','+55...');
  if(mode.startsWith('template_')){let html=field('Nome do template aprovado','template_name',cfg.template_name||'','nome_do_template')+field('Idioma','language',cfg.language||'pt_BR','pt_BR');if(mode==='template_carousel')html+=area('Cards / variáveis','cards',arr(cfg.cards).join('\n'),'Um card por linha');if(mode==='template_multi_product')html+=area('SKUs','skus',arr(cfg.skus).join('\n'),'Um SKU por linha');return html+note('Template precisa estar aprovado e pode ter cobrança/regras próprias da Meta.');}
  if(mode==='human')return note('Interrompe a automação desta intenção e encaminha para atendimento humano.');
  if(mode==='silence')return note('Reconhece a intenção e não envia resposta automática.');
  return '';
}
function stageHtml(stage,index){const mode=stage.response_mode||'text',info=modeInfo(mode);return `<section class="strategy-stage" data-stage="${index}"><div class="strategy-stage-head"><div><strong>Etapa ${index+1}</strong> <span class="strategy-help">${esc(info[3])}</span></div>${editingStages.length>1?`<button class="secondary" type="button" data-remove-stage="${index}">Remover</button>`:''}</div><label>Pergunta / intenção<input name="question" value="${esc(stage.question||'')}" placeholder="O que o cliente pode dizer?"></label><label>Variações da mesma intenção<textarea name="variations" placeholder="Uma por linha">${esc(arr(stage.variations).join('\n'))}</textarea></label><label>Resposta ou orientação<textarea name="answer" placeholder="O que deve responder ou fazer">${esc(stage.answer||'')}</textarea><small class="strategy-help">A IA pode deixar a frase natural, mas não pode inventar fatos.</small></label><label>Modo de resposta<select name="response_mode">${modeOptions(mode)}</select></label><div class="strategy-tool-config">${toolFields(mode,stage.tool_config||{})}</div></section>`}
function readToolConfig(node,mode){
  const get=k=>clean(node.querySelector(`[data-cfg="${k}"]`)?.value);const cfg={};
  if(mode==='reply_buttons')cfg.buttons=lines(get('buttons')).slice(0,3).map(label=>({label,value:label}));
  else if(mode==='cta_url'){cfg.label=get('label');cfg.url=get('url')}
  else if(mode==='list_view')cfg.items=lines(get('items')).map(title=>({title}));
  else if(mode==='list_select'){cfg.button_label=get('button_label')||'Escolher';cfg.rows=lines(get('rows')).slice(0,10).map(row=>{const [title,...rest]=row.split('|');return {title:clean(title),description:clean(rest.join('|'))}}).filter(x=>x.title)}
  else if(['registration_flow','custom_flow'].includes(mode)){cfg.flow_slug=get('flow_slug');if(mode==='custom_flow')cfg.cta=get('cta')||'Continuar'}
  else if(mode==='catalog_message')cfg.thumbnail_sku=get('thumbnail_sku');
  else if(mode==='single_product')cfg.sku=get('sku');
  else if(mode==='product_list')cfg.skus=lines(get('skus'));
  else if(['image','video','document'].includes(mode)){cfg.url=get('url');if(mode==='document')cfg.filename=get('filename')}
  else if(mode==='location'){for(const k of ['name','address','latitude','longitude'])cfg[k]=get(k)}
  else if(mode==='contact'){cfg.name=get('name');cfg.phone=get('phone')}
  else if(mode.startsWith('template_')){cfg.template_name=get('template_name');cfg.language=get('language')||'pt_BR';if(mode==='template_carousel')cfg.cards=lines(get('cards'));if(mode==='template_multi_product')cfg.skus=lines(get('skus'))}
  return cfg;
}
function syncStagesFromDom(){editingStages=[...document.querySelectorAll('.strategy-stage')].map(node=>{const mode=node.querySelector('[name="response_mode"]')?.value||'text';return {question:clean(node.querySelector('[name="question"]')?.value),variations:lines(node.querySelector('[name="variations"]')?.value),answer:clean(node.querySelector('[name="answer"]')?.value),response_mode:mode,tool_config:readToolConfig(node,mode)}})}
function renderRuleEditor(){
  const host=$('ruleEditor');if(!host)return;editingStages=normalizeStages(selectedRule||{});$('ruleEditorTitle').textContent=selectedRule?'Editar orientação':'Nova orientação';$('ruleStatus').textContent=selectedRule?.status==='published'?'Publicado':selectedRule?.status==='archived'?'Arquivado':'Rascunho';
  host.innerHTML=`<div class="strategy-stage-list">${editingStages.map(stageHtml).join('')}</div><button id="ruleAddStage" class="secondary" type="button">+ Adicionar etapa</button><p class="strategy-help">Uma conversa pode avançar por várias etapas: texto → botões → Flow → lista, por exemplo.</p>`;
  $('rulePublish').disabled=!selectedRule?.id||selectedRule?.status==='published';$('ruleArchive').disabled=!selectedRule?.id||selectedRule?.status==='archived';
}
function renderRuleList(){
  const q=clean($('ruleSearch')?.value).toLowerCase();const filtered=ruleItems.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));const host=$('ruleList');
  host.innerHTML=filtered.length?filtered.map(rule=>{const stages=normalizeStages(rule);return `<article class="strategy-rule-item ${selectedRule?.id===rule.id?'active':''}" data-rule-id="${esc(rule.id)}"><div class="strategy-rule-item-head"><strong>${esc(stages[0]?.question||'Sem pergunta')}</strong><span class="strategy-status-pill">${esc(rule.status==='published'?'Publicado':rule.status==='archived'?'Arquivado':'Rascunho')}</span></div><small>${stages.length} etapa${stages.length===1?'':'s'} · ${esc(modeLabel(stages[0]?.response_mode||'text'))}</small></article>`}).join(''):'<div class="strategy-empty">Nenhuma orientação encontrada.</div>';
}
function renderRuleMetrics(){const c=ruleDashboard?.counts||{},r=ruleDashboard?.runtime||{};$('ruleMetrics').innerHTML=[['Regras publicadas',c.published||0],['Rascunhos',c.drafts||0],['Modo',r.strict_mode?'Restrito':'Livre'],['Humanização',r.humanize_all_replies?'Ligada':'Desligada']].map(([a,b])=>`<article class="strategy-metric"><span>${esc(a)}</span><strong>${esc(b)}</strong></article>`).join('')}
async function loadRules(){
  const [dash,res,list]=await Promise.all([ruleApi('dashboard'),ruleApi('resources').catch(()=>({flows:[],live_modes:[]})),ruleApi('list')]);ruleDashboard=dash;ruleResources=res;ruleItems=arr(list.items);if(selectedRule?.id)selectedRule=ruleItems.find(x=>x.id===selectedRule.id)||null;renderRuleMetrics();renderRuleList();renderRuleEditor();
}
async function annotateLatestRuleChange(ruleId){
  const reason=clean($('changeReason')?.value),expected=clean($('changeExpected')?.value);if(!reason&&!expected)return;
  try{const log=await strategyApi('change_log',{limit:30});const change=arr(log.items).find(x=>x.entity_type==='service_simple_rules'&&x.entity_id===ruleId);if(change)await strategyApi('annotate_change',{id:change.id,reason,expected_result:expected,review_status:'pending'})}catch(error){toast(`Regra salva, mas a anotação não foi registrada: ${error.message}`,'error')}
}
async function saveRule(){
  syncStagesFromDom();const stages=editingStages.filter(s=>s.question);if(!stages.length)throw new Error('Informe ao menos uma pergunta/intenção.');
  const payload={id:selectedRule?.id||undefined,stages,priority:Number(selectedRule?.priority??50)};const data=await ruleApi('save',payload);selectedRule=data.item;await annotateLatestRuleChange(selectedRule.id);$('changeReason').value='';$('changeExpected').value='';toast('Orientação salva.','success');await loadRules();return selectedRule;
}
async function setRuleStatus(status){const rule=await saveRule();await ruleApi('set_status',{id:rule.id,status});await annotateLatestRuleChange(rule.id);toast(status==='published'?'Orientação publicada.':'Orientação arquivada.','success');await loadRules()}

function metricCards(metrics={}){const automation=metrics?.runtime?.automation||{},workerOn=Boolean(automation.ai_enabled&&automation.conversation_worker_enabled&&automation.conversation_worker_dispatch_enabled&&automation.whatsapp_auto_reply_enabled);return [['Conversas 7 dias',metrics.conversations||0],['Mensagens recebidas',metrics.messages_inbound||0],['Respostas automáticas',metrics.automated_replies||0],['Cobertura medida',workerOn?pct(metrics.coverage_ratio):'Aguardando teste'],['Repasses humanos',metrics.human_handoffs||0],['Sem orientação',metrics.uncovered_intents||0]].map(([label,value])=>`<article class="strategy-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('')}
function updateRuntimeBadge(metrics={}){const a=metrics?.runtime?.automation||{},on=Boolean(a.ai_enabled&&a.conversation_worker_enabled&&a.conversation_worker_dispatch_enabled&&a.whatsapp_auto_reply_enabled);const badge=$('runtimeBadge');badge.textContent=on?'Atendimento automático ativo':'Automação desligada · configuração segura';badge.classList.toggle('on',on);badge.classList.toggle('off',!on)}

function renderConversationList(items=[]){const host=$('conversationList');host.innerHTML=items.length?items.map(c=>`<article class="strategy-conversation-item ${historyState.selectedId===c.id?'active':''}" data-conversation-id="${esc(c.id)}"><div class="strategy-conversation-title"><strong>${esc(c.customer_name||'Cliente sem nome')}</strong><span class="strategy-chip">${esc(c.phone_masked||'—')}</span></div><p>${esc(c.last_message||'Sem texto recente')}</p><div class="strategy-conversation-meta"><span>${dt(c.last_inbound_at||c.updated_at)}</span><span>${esc(c.channel||c.source||'WhatsApp')}</span><span>${c.inbound_count||0} recebidas · ${c.outbound_count||0} enviadas</span>${c.human_required?'<span>Humano</span>':''}</div></article>`).join(''):'<div class="strategy-empty">Nenhuma conversa encontrada neste período.</div>'}
function renderHistoryPagination(){const host=$('historyPagination'),pages=Math.max(1,Math.ceil(historyState.total/30));host.innerHTML=pages<=1?'':`<button class="secondary" type="button" data-history-page="${historyState.page-1}" ${historyState.page<=1?'disabled':''}>Anterior</button><span>Página ${historyState.page} de ${pages}</span><button class="secondary" type="button" data-history-page="${historyState.page+1}" ${historyState.page>=pages?'disabled':''}>Próxima</button>`}
async function loadHistory(){
  $('conversationList').innerHTML='<div class="strategy-empty">Carregando conversas…</div>';const data=await strategyApi('conversations_7d',{page:historyState.page,limit:30,q:historyState.q});historyState.total=Number(data.total||0);historyState.loaded=true;$('historySummary').textContent=`${historyState.total} conversa(s) com atividade nos últimos 7 dias.`;renderConversationList(arr(data.items));renderHistoryPagination();
}
async function loadConversationDetail(id){
  historyState.selectedId=id;renderConversationList([...document.querySelectorAll('[data-conversation-id]')].map(()=>null).filter(Boolean));$('conversationDetail').innerHTML='<div class="strategy-empty">Carregando conversa…</div>';
  const data=await strategyApi('conversation_detail',{id});const c=data.conversation||{},customer=data.customer||{};const handoffs=arr(data.handoffs),events=arr(data.events),messages=arr(data.messages);
  const eventChips=[...handoffs.map(h=>`Humano: ${h.reason||'sem motivo'}`),...events.slice(-8).map(e=>e.action_type)].filter(Boolean);
  $('conversationDetail').innerHTML=`<div class="strategy-conversation-header"><div class="eyebrow">Conversa</div><h3>${esc(customer.name||'Cliente sem nome')}</h3><div class="meta"><span>${esc(c.wa_contact_e164||customer.primary_whatsapp_e164||'Sem telefone')}</span><span>${esc(c.mode||'—')}</span><span>${esc(c.status||'—')}</span><span>última entrada ${dt(c.last_inbound_at)}</span></div>${c.context_summary?`<p>${esc(c.context_summary)}</p>`:''}</div>${eventChips.length?`<div class="strategy-event-strip">${eventChips.map(x=>`<span class="strategy-chip">${esc(x)}</span>`).join('')}</div>`:''}<div class="strategy-message-list">${messages.length?messages.map(m=>`<div class="strategy-message ${m.direction==='outbound'?'outbound':'inbound'}">${esc(clean(m.body_text||m.transcript)||`[${m.message_type||'mensagem'}]`)}<small>${m.direction==='outbound'?'Dona Antônia':'Cliente'} · ${dt(m.created_at)}${m.delivery_status?` · ${esc(m.delivery_status)}`:''}</small></div>`).join(''):'<div class="strategy-empty">Sem mensagens registradas nos últimos 7 dias.</div>'}</div>`;
  document.querySelectorAll('[data-conversation-id]').forEach(n=>n.classList.toggle('active',n.dataset.conversationId===id));
}

function renderAnalysis(snapshot,metrics){
  const host=$('latestAnalysis');if(!snapshot){host.innerHTML=`<div class="strategy-empty">Ainda não há snapshot. As métricas atuais já estão disponíveis acima; gere a primeira análise para criar o baseline.</div>`;return}
  const findings=arr(snapshot.findings),recs=arr(snapshot.recommendations);host.innerHTML=`<div class="strategy-help">Gerada em ${dt(snapshot.created_at)}</div>${findings.map(x=>`<article class="strategy-finding ${esc(x.severity||'info')}"><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></article>`).join('')}${recs.length?`<h4>Próximos ajustes sugeridos</h4>${recs.map(x=>`<article class="strategy-recommendation"><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></article>`).join('')}`:''}${snapshot.analysis_note?`<p class="strategy-help">${esc(snapshot.analysis_note)}</p>`:''}`;
}
function renderSnapshots(items=[]){const host=$('snapshotList');host.innerHTML=items.length?items.map((s,i)=>`<article class="strategy-snapshot"><strong>${i===0?'Atual':'Anterior'} · ${dt(s.created_at)}</strong><small>${s.metrics?.conversations||0} conversas · ${s.metrics?.messages_inbound||0} entradas · ${s.metrics?.automated_replies||0} automáticas · ${s.metrics?.uncovered_intents||0} sem orientação</small></article>`).join(''):'<div class="strategy-empty">Nenhum snapshot registrado.</div>'}
function changeSummary(change){const after=change.after_data||{},before=change.before_data||{};if(change.operation==='BASELINE')return 'Baseline inicial da estratégia';const q=after.question||before.question;const status=after.status&&after.status!==before.status?`${before.status||'—'} → ${after.status}`:'';const mode=after.response_mode&&after.response_mode!==before.response_mode?`${before.response_mode||'—'} → ${after.response_mode}`:'';return [q,status,mode].filter(Boolean).join(' · ')||`${change.operation} em ${change.entity_type}`}
function renderChangeLog(items=[]){const host=$('changeLog');host.innerHTML=items.length?items.map(c=>`<article class="strategy-change"><div><strong>${dt(c.created_at)}</strong><small class="strategy-help">${esc(c.operation)}</small></div><div><code>${esc(c.entity_type)}</code></div><div class="strategy-change-copy"><strong>${esc(changeSummary(c))}</strong><small>${esc(c.reason||'Sem motivo anotado ainda')}${c.expected_result?` · Esperado: ${esc(c.expected_result)}`:''}${c.observed_result?` · Observado: ${esc(c.observed_result)}`:''}</small></div><button class="secondary" type="button" data-edit-change="${esc(c.id)}">Revisar</button></article>`).join(''):'<div class="strategy-empty">Nenhum ajuste registrado ainda.</div>'}
async function loadEvolution(){
  const [dash,snaps,changes]=await Promise.all([strategyApi('dashboard'),strategyApi('snapshots',{limit:20}),strategyApi('change_log',{limit:100})]);evolutionState={dashboard:dash,snapshots:arr(snaps.items),changes:arr(changes.items),loaded:true};const metrics=dash.metrics||{};updateRuntimeBadge(metrics);$('strategyMetrics').innerHTML=metricCards(metrics);renderAnalysis(dash.latest_snapshot,metrics);renderSnapshots(evolutionState.snapshots);renderChangeLog(evolutionState.changes);
}
function openChangeDialog(id){const change=evolutionState.changes.find(x=>x.id===id);if(!change)return;const body=$('changeDialogBody');body.innerHTML=`<div class="strategy-dialog-shell"><div class="strategy-panel-head"><div><div class="eyebrow">Revisão do ajuste</div><h3>${esc(changeSummary(change))}</h3></div><button class="secondary" type="button" data-close-change>Fechar</button></div><input type="hidden" name="id" value="${esc(change.id)}"><label>Motivo<textarea name="reason">${esc(change.reason||'')}</textarea></label><label>Resultado esperado<textarea name="expected_result">${esc(change.expected_result||'')}</textarea></label><label>Resultado observado<textarea name="observed_result">${esc(change.observed_result||'')}</textarea></label><label>Status<select name="review_status"><option value="pending" ${change.review_status==='pending'?'selected':''}>Pendente</option><option value="kept" ${change.review_status==='kept'?'selected':''}>Manter</option><option value="adjusted" ${change.review_status==='adjusted'?'selected':''}>Ajustado novamente</option><option value="reverted" ${change.review_status==='reverted'?'selected':''}>Revertido</option><option value="baseline" ${change.review_status==='baseline'?'selected':''}>Baseline</option></select></label><div class="strategy-dialog-actions"><button class="secondary" type="button" data-close-change>Cancelar</button><button class="primary" type="submit">Salvar revisão</button></div></div>`;$('changeDialog').showModal()}

function setTab(name){document.querySelectorAll('[data-strategy-tab]').forEach(b=>b.classList.toggle('active',b.dataset.strategyTab===name));for(const key of ['rules','history','evolution'])$(`tab${key[0].toUpperCase()+key.slice(1)}`).classList.toggle('active',key===name);if(name==='history'&&!historyState.loaded)loadHistory().catch(e=>toast(e.message,'error'));if(name==='evolution'&&!evolutionState.loaded)loadEvolution().catch(e=>toast(e.message,'error'))}
async function bootProtected(){
  $('loginGate').classList.add('hidden');$('strategyApp').classList.remove('hidden');
  try{const [strategy]=await Promise.all([strategyApi('dashboard'),loadRules()]);updateRuntimeBadge(strategy.metrics||{});evolutionState.dashboard=strategy}catch(error){if(/sessão|token|invalid_user|missing_token/i.test(error.message)){clearAuth();showLogin(error.message);return}throw error}
}
function showLogin(message=''){$('strategyApp').classList.add('hidden');$('loginGate').classList.remove('hidden');const status=$('strategyLoginStatus');status.textContent=message;status.className=`strategy-login-status ${message?'error':''}`;setTimeout(()=>$('strategyPin')?.focus(),60)}

$('strategyLoginForm').addEventListener('submit',async event=>{event.preventDefault();const pin=$('strategyPin'),button=$('strategyLoginButton'),status=$('strategyLoginStatus');const value=String(pin.value||'').replace(/\D/g,'').slice(0,6);pin.value=value;if(value.length!==6){status.textContent='Digite os 6 números.';status.className='strategy-login-status error';return}button.disabled=true;pin.disabled=true;status.textContent='Abrindo área protegida…';status.className='strategy-login-status';try{await authenticatePin(value);status.textContent='Acesso liberado.';status.className='strategy-login-status ok';await bootProtected()}catch(error){status.textContent=error.message;status.className='strategy-login-status error';button.disabled=false;pin.disabled=false;pin.select()}});
$('strategyPin').addEventListener('input',event=>{event.target.value=event.target.value.replace(/\D/g,'').slice(0,6)});
$('strategyLogout').addEventListener('click',()=>{clearAuth();showLogin('Área bloqueada. Digite o código para abrir novamente.')});
$('strategyRefresh').addEventListener('click',async()=>{try{historyState.loaded=false;evolutionState.loaded=false;await loadRules();const active=document.querySelector('[data-strategy-tab].active')?.dataset.strategyTab||'rules';if(active==='history')await loadHistory();if(active==='evolution')await loadEvolution();toast('Dados atualizados.','success')}catch(e){toast(e.message,'error')}});
document.querySelectorAll('[data-strategy-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.strategyTab)));
$('ruleSearch').addEventListener('input',renderRuleList);
$('ruleNew').addEventListener('click',()=>{selectedRule=null;editingStages=[blankStage()];$('changeReason').value='';$('changeExpected').value='';renderRuleList();renderRuleEditor()});
$('ruleList').addEventListener('click',event=>{const item=event.target.closest('[data-rule-id]');if(!item)return;selectedRule=ruleItems.find(x=>x.id===item.dataset.ruleId)||null;editingStages=normalizeStages(selectedRule||{});$('changeReason').value='';$('changeExpected').value='';renderRuleList();renderRuleEditor()});
$('ruleEditor').addEventListener('click',event=>{if(event.target.id==='ruleAddStage'){syncStagesFromDom();editingStages.push(blankStage());const keep=selectedRule;selectedRule={...(selectedRule||{}),stages:editingStages};renderRuleEditor();selectedRule=keep;return}const remove=event.target.closest('[data-remove-stage]');if(remove){syncStagesFromDom();editingStages.splice(Number(remove.dataset.removeStage),1);const keep=selectedRule;selectedRule={...(selectedRule||{}),stages:editingStages};renderRuleEditor();selectedRule=keep}});
$('ruleEditor').addEventListener('change',event=>{if(event.target.matches('[name="response_mode"]')){syncStagesFromDom();const keep=selectedRule;selectedRule={...(selectedRule||{}),stages:editingStages};renderRuleEditor();selectedRule=keep}});
$('ruleSave').addEventListener('click',()=>saveRule().catch(e=>toast(e.message,'error')));
$('rulePublish').addEventListener('click',()=>setRuleStatus('published').catch(e=>toast(e.message,'error')));
$('ruleArchive').addEventListener('click',()=>setRuleStatus('archived').catch(e=>toast(e.message,'error')));
$('historySearchForm').addEventListener('submit',event=>{event.preventDefault();historyState.q=clean($('historySearch').value);historyState.page=1;loadHistory().catch(e=>toast(e.message,'error'))});
$('conversationList').addEventListener('click',event=>{const item=event.target.closest('[data-conversation-id]');if(item)loadConversationDetail(item.dataset.conversationId).catch(e=>toast(e.message,'error'))});
$('historyPagination').addEventListener('click',event=>{const button=event.target.closest('[data-history-page]');if(!button||button.disabled)return;historyState.page=Number(button.dataset.historyPage)||1;loadHistory().catch(e=>toast(e.message,'error'))});
$('generateSnapshot').addEventListener('click',async()=>{const button=$('generateSnapshot');button.disabled=true;try{const note=evolutionState.snapshots.length?'Nova rodada de análise de 7 dias após os ajustes registrados.':'Baseline inicial da estratégia antes do teste controlado do novo atendimento.';await strategyApi('generate_snapshot',{note});toast('Análise registrada.','success');await loadEvolution()}catch(e){toast(e.message,'error')}finally{button.disabled=false}});
$('changeLog').addEventListener('click',event=>{const button=event.target.closest('[data-edit-change]');if(button)openChangeDialog(button.dataset.editChange)});
$('changeDialog').addEventListener('click',event=>{if(event.target.closest('[data-close-change]'))$('changeDialog').close()});
$('changeDialogForm').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget),payload=Object.fromEntries(form.entries());try{await strategyApi('annotate_change',payload);$('changeDialog').close();toast('Revisão registrada.','success');await loadEvolution()}catch(e){toast(e.message,'error')}});

if(loadAuth()?.access_token||loadAuth()?.refresh_token)bootProtected().catch(e=>{toast(e.message,'error');showLogin(e.message)});else showLogin();
