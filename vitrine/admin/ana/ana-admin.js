import {listAnaAutomationTemplates,buildAnaAutomationTemplate} from './ana-automation-library.js';
const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ana-preview-v1';
const TOKEN_KEY='da_finance_access_token_v1';
const sections=[['overview','Visão geral'],['behavior','Comportamento'],['knowledge','Conhecimento'],['triggers','Automações'],['tests','Testes e histórico']];
const automationTemplates=listAnaAutomationTemplates();
const state={host:null,role:'viewer',section:'overview',draft:null,active:null,revision:0,channels:[],labels:[],versions:[],testRuns:[],events:[],history:[],lastTest:null,busy:false,dirty:false};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tokenPayload=token=>{try{const raw=String(token).split('.')[1]||'',pad=raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4);return JSON.parse(atob(pad))}catch{return {}}};
async function token(force=false){let value=sessionStorage.getItem(TOKEN_KEY)||'';if(force||!value||Number(tokenPayload(value).exp||0)<=Math.floor(Date.now()/1000)+60){sessionStorage.removeItem(TOKEN_KEY);const response=await fetch('https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-pin-auth-v1?exchange=1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||!data?.ok||!data?.access_token)throw new Error(data?.error||'Sessão Admin indisponível');value=data.access_token;sessionStorage.setItem(TOKEN_KEY,value)}return value}
function configErrorText(code=''){
  const value=String(code||'');
  if(value.includes('priority_invalid'))return 'A prioridade deve ficar entre 0 e 100.';
  if(value.includes('match_invalid'))return 'Informe frases válidas antes de ativar a automação.';
  if(value.includes('reply_')&&value.includes('_invalid'))return 'Preencha a mensagem da ação de resposta.';
  if(value.includes('label_')&&value.includes('_invalid'))return 'Selecione uma etiqueta válida.';
  if(value.includes('multiple_terminal_actions'))return 'Use somente uma ação final: responder, transferir para humano ou continuar com a ANA.';
  if(value.includes('terminal_action_must_be_last'))return 'A ação final deve ser a última da sequência.';
  if(value.includes('condition_')&&(value.includes('_duplicate')||value.includes('_contradictory')))return 'Há condições repetidas ou contraditórias nesta automação.';
  if(value==='trigger_label_not_active')return 'Uma etiqueta usada pela automação não está mais ativa.';
  if(value==='revision_conflict')return 'O rascunho foi alterado em outra sessão. Atualize a página antes de salvar.';
  if(value==='configuration_invalid')return 'Revise os campos destacados da automação antes de salvar.';
  return value||'Não foi possível concluir a ação.';
}
async function api(action,payload={},retried=false){
  const access=await token();
  const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${access}`},body:JSON.stringify({action,...payload}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(response.status===401&&!retried){sessionStorage.removeItem(TOKEN_KEY);return api(action,payload,true)}
  if(!response.ok||data?.ok===false){
    const details=Array.isArray(data?.details)?data.details.map(configErrorText).filter(Boolean):[];
    throw new Error(details.length?details.join(' '):configErrorText(data?.error||`Falha ${response.status}`));
  }
  return data;
}
const canEdit=()=>['owner','admin','editor'].includes(state.role),isOwner=()=>state.role==='owner';
const actionsOf=item=>Array.isArray(item.actions)?item.actions:(item.action?[{type:item.action,response_text:item.response_text||'',label_id:item.label_id||''}]:[]);
const actionName=type=>({fixed_reply:'Responder mensagem',label:'Aplicar etiqueta',remove_label:'Remover etiqueta',handoff:'Transferir para humano',continue_ai:'Continuar com a ANA'}[type]||type);
const isTerminalAction=type=>['fixed_reply','handoff','continue_ai'].includes(type);
const newTriggerKey=()=>`gatilho-${Date.now()}-${(config().triggers||[]).length}`;
const blankAction=type=>type==='fixed_reply'?{type,response_text:''}:['label','remove_label'].includes(type)?{type,label_id:state.labels[0]?.id||''}:{type};
const conditionValue=(item,type)=>{const found=(item.conditions||[]).find(x=>x.type===type);return found?String(Boolean(found.value)):'any'};
function config(){return state.draft?.configuration||{behavior:{tone:'cordial',conciseness:'short',emoji:'sparingly',use_known_first_name_on_first_greeting:true},knowledge:[],triggers:[],test_cases:[]}}
function badge(text,kind='neutral'){return `<span class="ana-badge ${kind}">${esc(text)}</span>`}
function statusCard(channel){const operational=channel.capture_enabled&&channel.send_enabled&&channel.outbound_provider==='meta'&&channel.homologated_at;return `<article class="ana-card ana-channel"><div class="ana-row"><div><small>Canal WhatsApp</small><h3>${esc(channel.name||'Dona Antônia')} · ${esc(channel.phone_last4||'••••')}</h3></div>${badge(channel.ana_enabled?'ANA ativa':'ANA desligada',channel.ana_enabled?'green':'neutral')}</div><div class="ana-pills">${badge(operational?'Meta pronto':'Canal restrito',operational?'green':'amber')}${badge(channel.campaigns_enabled?'Campanhas ligadas':'Campanhas separadas',channel.campaigns_enabled?'amber':'neutral')}${badge(channel.human_send_enabled?'Humano habilitado':'Humano indisponível',channel.human_send_enabled?'green':'amber')}</div><p>Entrada ${esc(channel.inbound_provider)} · saída ${esc(channel.outbound_provider)} · atualizado ${esc(channel.updated_at?new Date(channel.updated_at).toLocaleString('pt-BR'):'—')}</p>${isOwner()?`<button class="ana-button ${channel.ana_enabled?'danger':'primary'}" data-toggle-channel="${esc(channel.id)}" data-enabled="${channel.ana_enabled?'false':'true'}">${channel.ana_enabled?'Desligar ANA neste canal':'Ligar ANA neste canal'}</button>`:''}</article>`}
function renderOverview(){const active=state.active||{};return `<div class="ana-page-head"><div><h1>ANA</h1><p>Gestão central da atendente virtual, com regras publicadas e testes sem envio.</p></div><button class="ana-button" data-action="refresh">Atualizar</button></div><div class="ana-kpis"><div class="ana-card"><small>Versão publicada</small><strong>${esc(active.version??'—')}</strong><span>${esc(active.created_at?new Date(active.created_at).toLocaleString('pt-BR'):'Nenhuma versão publicada')}</span></div><div class="ana-card"><small>Rascunho</small><strong>r${esc(state.revision)}</strong><span>${state.dirty?'Alterações não salvas':'Rascunho carregado'}</span></div><div class="ana-card"><small>Testes mais recentes</small><strong>${esc(state.testRuns[0]?.passed_count??'—')} / ${esc((state.testRuns[0]?.passed_count||0)+(state.testRuns[0]?.failed_count||0))}</strong><span>${state.testRuns[0]?.failed_count?'Há cenários que precisam de ajuste':'Execução mais recente'}</span></div></div><div class="ana-channel-grid">${state.channels.map(statusCard).join('')||'<div class="ana-card">Nenhum canal disponível.</div>'}</div><section class="ana-card ana-safety"><h2>Como a ANA decide</h2><p>Automações publicadas são verificadas primeiro. A IA usa apenas conhecimento publicado e encaminha casos incertos para uma pessoa.</p><p>A retomada humana prevalece. Preço, estoque, pedido, pagamento e prazo não podem ser inventados. Campanhas e consentimento de marketing continuam na área Marketing.</p></section>`}
function renderBehavior(){const b=config().behavior;return `<div class="ana-page-head"><div><h1>Comportamento</h1><p>Ajustes simples de estilo. As regras de segurança são protegidas.</p></div>${canEdit()?'<button class="ana-button primary" data-action="save">Salvar rascunho</button>':''}</div><section class="ana-card ana-form-grid"><label><span>Tom</span><select data-behavior="tone" ${canEdit()?'':'disabled'}><option value="cordial" ${b.tone==='cordial'?'selected':''}>Cordial e direto</option><option value="warm" ${b.tone==='warm'?'selected':''}>Acolhedor e gentil</option><option value="neutral" ${b.tone==='neutral'?'selected':''}>Neutro e profissional</option></select></label><label><span>Tamanho da resposta</span><select data-behavior="conciseness" ${canEdit()?'':'disabled'}><option value="short" ${b.conciseness==='short'?'selected':''}>Curta</option><option value="balanced" ${b.conciseness==='balanced'?'selected':''}>Equilibrada</option></select></label><label><span>Emojis</span><select data-behavior="emoji" ${canEdit()?'':'disabled'}><option value="sparingly" ${b.emoji==='sparingly'?'selected':''}>Com moderação</option><option value="never" ${b.emoji==='never'?'selected':''}>Não usar</option></select></label><label class="ana-check"><input type="checkbox" data-behavior="use_known_first_name_on_first_greeting" ${b.use_known_first_name_on_first_greeting?'checked':''} ${canEdit()?'':'disabled'}><span>Usar o primeiro nome cadastrado no primeiro cumprimento do dia</span></label></section><section class="ana-card"><h2>Regras protegidas</h2><ul><li>Não inventar dados de preço, estoque, pedido, pagamento, endereço ou entrega.</li><li>Não alterar pedido nem cadastro.</li><li>Encaminhar dúvidas sensíveis ou sem base para atendimento humano.</li><li>Se a pessoa assumir a conversa, a ANA para.</li></ul></section>`}
function renderKnowledge(){const items=config().knowledge||[];return `<div class="ana-page-head"><div><h1>Conhecimento</h1><p>Respostas curtas aprovadas; só itens publicados orientam a ANA.</p></div>${canEdit()?'<button class="ana-button" data-action="add-knowledge">Adicionar informação</button><button class="ana-button primary" data-action="save">Salvar rascunho</button>':''}</div>${items.map((item,i)=>`<article class="ana-card ana-editor-card"><div class="ana-row"><strong>Informação ${i+1}</strong>${badge(item.status==='published'?'Publicada':item.status==='archived'?'Arquivada':'Rascunho')}</div><div class="ana-form-grid"><label><span>Título</span><input data-knowledge="${i}" data-field="title" value="${esc(item.title)}" ${canEdit()?'':'disabled'}></label><label><span>Categoria</span><input data-knowledge="${i}" data-field="category" value="${esc(item.category)}" ${canEdit()?'':'disabled'}></label><label class="ana-full"><span>Resposta aprovada</span><textarea data-knowledge="${i}" data-field="content" maxlength="1600" ${canEdit()?'':'disabled'}>${esc(item.content)}</textarea></label><label><span>Status</span><select data-knowledge="${i}" data-field="status" ${canEdit()?'':'disabled'}><option value="draft" ${item.status==='draft'?'selected':''}>Rascunho</option><option value="published" ${item.status==='published'?'selected':''}>Publicada</option><option value="archived" ${item.status==='archived'?'selected':''}>Arquivada</option></select></label>${canEdit()?`<button class="ana-button danger" data-remove-knowledge="${i}">Remover do rascunho</button>`:''}</div></article>`).join('')||'<div class="ana-card">Nenhum conteúdo cadastrado ainda.</div>'}`}
function renderAutomationTemplates(){
  if(!canEdit())return '';
  return `<section class="ana-card ana-template-library">
    <div class="ana-row"><div><h2>Modelos prontos</h2><p class="ana-muted">Adicione ao rascunho, revise e teste antes de ativar. Todo modelo entra desativado.</p></div></div>
    <div class="ana-template-grid">
      ${automationTemplates.map(item=>`<button class="ana-template-card" data-add-template="${esc(item.key)}"><strong>${esc(item.title)}</strong><span>${esc(item.description)}</span></button>`).join('')}
    </div>
  </section>`;
}
function renderTriggers(){
  const items=config().triggers||[];
  const head=`<div class="ana-page-head"><div><h1>Automações</h1><p>Defina quando a regra entra, condições opcionais e o que a ANA faz em ordem.</p></div>${canEdit()?'<button class="ana-button" data-action="add-trigger">Nova automação</button><button class="ana-button primary" data-action="save">Salvar rascunho</button>':''}</div>`;
  const cards=items.map((item,i)=>{
    const acts=actionsOf(item),customerCondition=conditionValue(item,'customer_linked'),humanCondition=conditionValue(item,'human_mode');
    return `<article class="ana-card ana-editor-card">
      <div class="ana-row"><strong>${esc(item.name||`Automação ${i+1}`)}</strong><label class="ana-check compact"><input type="checkbox" data-trigger="${i}" data-field="enabled" ${item.enabled?'checked':''} ${canEdit()?'':'disabled'}><span>Ativa</span></label></div>
      <div class="ana-form-grid">
        <label><span>Nome</span><input data-trigger="${i}" data-field="name" value="${esc(item.name)}" ${canEdit()?'':'disabled'}></label>
        <label><span>Prioridade (0–100)</span><input type="number" min="0" max="100" data-trigger="${i}" data-field="priority" value="${Number(item.priority)||0}" ${canEdit()?'':'disabled'}></label>
        <label class="ana-full"><span>Quando a mensagem contiver (uma frase por linha)</span><textarea data-trigger="${i}" data-field="phrases" ${canEdit()?'':'disabled'}>${esc((item.phrases||[]).join('\n'))}</textarea></label>
        <label class="ana-full"><span>Não disparar se contiver (opcional)</span><textarea data-trigger="${i}" data-field="exclude_phrases" placeholder="Ex.: não quero comprar" ${canEdit()?'':'disabled'}>${esc((item.exclude_phrases||[]).join('\n'))}</textarea></label>
        <label><span>Correspondência</span><select data-trigger="${i}" data-field="match" ${canEdit()?'':'disabled'}><option value="phrase" ${item.match==='phrase'?'selected':''}>Contém a frase</option><option value="exact" ${item.match==='exact'?'selected':''}>Mensagem exatamente igual</option></select></label>
        <label><span>Canal</span><select data-trigger="${i}" data-field="channels" ${canEdit()?'':'disabled'}><option value="all" ${item.channels?.includes('all')?'selected':''}>0975 e 1018</option><option value="0975" ${item.channels?.includes('0975')?'selected':''}>0975</option><option value="1018" ${item.channels?.includes('1018')?'selected':''}>1018</option></select></label>
        <div class="ana-full ana-actions-box"><strong>Somente se</strong>
          <div class="ana-condition-grid">
            <label><span>Cliente</span><select data-condition-select="${i}:customer_linked" ${canEdit()?'':'disabled'}><option value="any" ${customerCondition==='any'?'selected':''}>Qualquer cliente</option><option value="true" ${customerCondition==='true'?'selected':''}>Cliente identificado no cadastro</option><option value="false" ${customerCondition==='false'?'selected':''}>Cliente ainda não identificado</option></select></label>
            <label><span>Responsável pela conversa</span><select data-condition-select="${i}:human_mode" ${canEdit()?'':'disabled'}><option value="any" ${humanCondition==='any'?'selected':''}>Qualquer estado permitido</option><option value="false" ${humanCondition==='false'?'selected':''}>ANA responsável</option></select></label>
          </div>
          <p class="ana-muted">Se uma pessoa assumir a conversa, o gate humano interrompe a ANA antes de qualquer envio.</p>
        </div>
        <div class="ana-full ana-actions-box"><strong>O que fazer</strong>
          ${acts.map((a,j)=>`<div class="ana-action-editor">
            <div class="ana-action-head"><strong>Ação ${j+1}</strong><div class="ana-action-controls">${canEdit()&&j>0?`<button class="ana-button tiny" data-move-action="${i}:${j}:-1" title="Mover para cima">↑</button>`:''}${canEdit()&&j<acts.length-1?`<button class="ana-button tiny" data-move-action="${i}:${j}:1" title="Mover para baixo">↓</button>`:''}${canEdit()&&acts.length>1?`<button class="ana-button danger tiny" data-remove-action="${i}:${j}">Remover</button>`:''}</div></div>
            <label><span>Tipo</span><select data-trigger-action="${i}:${j}" data-action-field="type" ${canEdit()?'':'disabled'}><option value="fixed_reply" ${a.type==='fixed_reply'?'selected':''}>Responder mensagem</option><option value="label" ${a.type==='label'?'selected':''}>Aplicar etiqueta</option><option value="remove_label" ${a.type==='remove_label'?'selected':''}>Remover etiqueta</option><option value="handoff" ${a.type==='handoff'?'selected':''}>Transferir para humano</option><option value="continue_ai" ${a.type==='continue_ai'?'selected':''}>Continuar com a ANA</option></select></label>
            ${a.type==='fixed_reply'?`<label><span>Mensagem</span><textarea maxlength="500" data-trigger-action="${i}:${j}" data-action-field="response_text" ${canEdit()?'':'disabled'}>${esc(a.response_text||'')}</textarea></label>`:''}
            ${['label','remove_label'].includes(a.type)?`<label><span>Etiqueta</span><select data-trigger-action="${i}:${j}" data-action-field="label_id" ${canEdit()?'':'disabled'}><option value="">Selecione…</option>${state.labels.map(label=>`<option value="${esc(label.id)}" ${a.label_id===label.id?'selected':''}>${esc(label.name)}</option>`).join('')}</select></label>`:''}
          </div>`).join('')}
          ${canEdit()&&acts.length<5?`<button class="ana-button" data-add-action="${i}">+ Adicionar ação</button>`:''}
          <p class="ana-muted">Aplicar ou remover etiquetas pode vir antes da ação final. Responder, transferir para humano ou continuar com a ANA deve ser a última ação e só pode haver uma delas.</p>
        </div>
        ${canEdit()?`<div class="ana-full ana-editor-actions"><button class="ana-button" data-duplicate-trigger="${i}">Duplicar automação</button><button class="ana-button danger" data-remove-trigger="${i}">Remover automação</button></div>`:''}
      </div>
    </article>`;
  }).join('');
  return head+renderAutomationTemplates()+(cards||'<div class="ana-card">Nenhuma automação configurada.</div>');
}
function renderTests(){const latest=state.testRuns[0]||null;const safeHistory=[...state.events,...state.history].slice(0,30);return `<div class="ana-page-head"><div><h1>Testes e histórico</h1><p>Simulador isolado: não envia WhatsApp e não altera pedidos, clientes ou consentimentos.</p></div><button class="ana-button" data-action="refresh-history">Atualizar histórico</button></div><section class="ana-card"><h2>Simular mensagem</h2><p class="ana-muted">Use somente exemplos fictícios. O resultado não pode ser enviado ao cliente.</p><div class="ana-form-grid"><label><span>Canal para teste</span><select id="anaTestChannel"><option value="0975">0975</option><option value="1018">1018</option></select></label><label class="ana-check"><input type="checkbox" id="anaTestCustomerLinked"><span>Simular cliente identificado no cadastro</span></label><label class="ana-full"><span>Mensagem sintética</span><textarea id="anaTestInput" maxlength="500" placeholder="Ex.: Oi, quero saber o horário de atendimento"></textarea></label></div><button class="ana-button primary" data-action="test" ${canEdit()?'':'disabled'}>Executar teste sem envio</button>${latest?`<div class="ana-result">Último teste: ${esc(latest.passed_count)} passaram · ${esc(latest.failed_count)} falharam · revisão r${esc(latest.draft_revision)}${latest.failed_count?' · corrija antes de publicar':''}</div>`:''}${state.lastTest?`<div class="ana-result"><strong>Resultado dos cenários</strong>${(state.lastTest.results||[]).map(item=>`<div>${item.passed?'✓':'✕'} ${esc(item.key)} · esperado ${esc(item.expected)} · obtido ${esc(item.actual)} · ${esc(item.reason)}</div>`).join('')}${state.lastTest.custom_result?`<p>${esc(state.lastTest.custom_result.outcome)} · ${esc(state.lastTest.custom_result.reason)}</p>${(state.lastTest.custom_result.trace||[]).length?`<div class="ana-trace"><strong>Caminho da decisão</strong>${state.lastTest.custom_result.trace.map((step,i)=>`<div><b>${i+1}</b> ${esc(step.step==='automation'?`Automação: ${step.trigger_key}`:step.type==='label'?'Aplicaria etiqueta':step.type==='remove_label'?'Removeria etiqueta':step.type==='fixed_reply'?'Responderia mensagem':step.type==='handoff'?'Transferiria para humano':step.type==='continue_ai'||step.type==='would_call_ai'?'Continuaria com a ANA':`IA: ${step.type}`)}</div>`).join('')}</div>`:''}${state.lastTest.custom_result.response_text?`<blockquote>${esc(state.lastTest.custom_result.response_text)}</blockquote>`:''}`:''}</div>`:''}</section><section class="ana-card"><h2>Versões publicadas</h2>${state.versions.map(v=>`<div class="ana-history-row"><span>v${esc(v.version)} · ${esc(v.change_note||'sem observação')} · ${esc(new Date(v.created_at).toLocaleString('pt-BR'))}</span>${isOwner()?`<button class="ana-button" data-rollback="${esc(v.id)}">Restaurar esta versão</button>`:''}</div>`).join('')||'<p class="ana-muted">Ainda não há histórico de versões.</p>'}</section><section class="ana-card"><h2>Atividade recente</h2>${safeHistory.map(e=>`<div class="ana-history-row"><span>${esc(e.action||e.outcome||e.reason||'ANA')} · ${esc(e.created_at?new Date(e.created_at).toLocaleString('pt-BR'):'')}</span>${e.version_id?badge(`versão ${e.version_id}`):''}</div>`).join('')||'<p class="ana-muted">Nenhum evento recente.</p>'}</section>${isOwner()?'<div class="ana-sticky-actions"><span>Publicar exige todos os testes obrigatórios aprovados.</span><button class="ana-button primary" data-action="publish" '+(!latest||latest.failed_count||latest.draft_revision!==state.revision?'disabled':'')+'>Publicar versão testada</button></div>':''}`}
function render(){if(!state.host)return;const content=state.section==='overview'?renderOverview():state.section==='behavior'?renderBehavior():state.section==='knowledge'?renderKnowledge():state.section==='triggers'?renderTriggers():renderTests();state.host.innerHTML=`<link rel="stylesheet" href="/vitrine/admin/ana/ana-admin.css?v=1"><div class="ana-shell"><nav class="ana-tabs" aria-label="Gestão da ANA">${sections.map(([key,label])=>`<button class="${state.section===key?'active':''}" data-section="${key}" aria-current="${state.section===key?'page':'false'}">${label}</button>`).join('')}</nav>${state.dirty?'<div class="ana-unsaved" role="status">Há alterações não salvas no rascunho.</div>':''}<div class="ana-body">${content}</div></div>`;bind()}
function markDirty(){state.dirty=true;render()}
function readDraft(){
  const next=structuredClone(config());
  state.host.querySelectorAll('[data-behavior]').forEach(el=>{next.behavior[el.dataset.behavior]=el.type==='checkbox'?el.checked:el.value});
  state.host.querySelectorAll('[data-knowledge]').forEach(el=>{const item=next.knowledge[Number(el.dataset.knowledge)];if(item)item[el.dataset.field]=el.value});
  state.host.querySelectorAll('[data-trigger]').forEach(el=>{
    const item=next.triggers[Number(el.dataset.trigger)];if(!item)return;const key=el.dataset.field;
    if(key==='enabled')item.enabled=el.checked;
    else if(key==='priority')item.priority=Number(el.value);
    else if(key==='phrases'||key==='exclude_phrases')item[key]=el.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    else if(key==='channels')item.channels=[el.value];
    else item[key]=el.value;
  });
  state.host.querySelectorAll('[data-condition-select]').forEach(el=>{
    const [i,type]=el.dataset.conditionSelect.split(':'),item=next.triggers[Number(i)];if(!item)return;
    item.conditions=(item.conditions||[]).filter(x=>x.type!==type);
    if(el.value!=='any')item.conditions.push({type,value:el.value==='true'});
  });
  state.host.querySelectorAll('[data-trigger-action]').forEach(el=>{
    const [i,j]=el.dataset.triggerAction.split(':').map(Number),item=next.triggers[i];if(!item)return;
    if(!Array.isArray(item.actions)){item.actions=actionsOf(item);delete item.action;delete item.response_text;delete item.label_id}
    const action=item.actions[j];if(action)action[el.dataset.actionField]=el.value;
  });
  return next;
}
async function saveDraft(){const configuration=readDraft();const result=await api('admin_save_draft',{configuration,expected_revision:state.revision,note:'Rascunho ANA salvo'});state.draft={configuration,revision:result.revision};state.revision=result.revision;state.dirty=false;state.lastTest=null;await load(false);state.section='overview';render()}
async function load(showLoading=true){if(showLoading)state.host.innerHTML='<div class="ana-loading">Carregando gestão da ANA…</div>';const data=await api('admin_load');state.role=data.role||'viewer';state.draft=data.draft||null;state.active=data.active||null;state.revision=Number(data.draft?.revision||0);state.channels=data.channels||[];state.labels=data.labels||[];state.versions=data.versions||[];state.testRuns=data.test_runs||[];state.events=data.events||[];state.dirty=false;render()}
async function loadHistory(){const data=await api('admin_history');state.history=data.history||[];state.versions=data.versions||state.versions;state.testRuns=data.test_runs||state.testRuns;state.section='tests';render()}
function showDirty(){
  state.dirty=true;
  const note=state.host.querySelector('.ana-unsaved');
  if(!note){const n=document.createElement('div');n.className='ana-unsaved';n.textContent='Há alterações não salvas no rascunho.';state.host.querySelector('.ana-body').prepend(n)}
}
function bind(){
  state.host.querySelectorAll('[data-section]').forEach(button=>button.onclick=()=>{if(state.dirty&&!confirm('Descartar alterações não salvas?'))return;state.dirty=false;state.section=button.dataset.section;render()});
  state.host.querySelectorAll('[data-behavior],[data-knowledge],[data-trigger],[data-condition-select],[data-trigger-action]').forEach(el=>el.addEventListener('change',showDirty));
  state.host.querySelectorAll('select[data-trigger-action][data-action-field="type"]').forEach(el=>el.addEventListener('change',()=>{
    const next=readDraft(),[i,j]=el.dataset.triggerAction.split(':').map(Number),item=next.triggers[i];
    if(item?.actions?.[j])item.actions[j]=blankAction(el.value);
    state.draft.configuration=next;state.dirty=true;render();
  }));
  state.host.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
    if(state.busy)return;const action=button.dataset.action;
    try{
      state.busy=true;button.disabled=true;
      if(action==='refresh'){await load()}
      else if(action==='save'){await saveDraft()}
      else if(action==='add-knowledge'){const next=readDraft();next.knowledge.push({key:`fato-${Date.now()}`,title:'',category:'geral',content:'',status:'draft',keywords:[]});state.draft.configuration=next;state.dirty=true;state.section='knowledge';render()}
      else if(action==='add-trigger'){const next=readDraft();next.triggers.push({key:newTriggerKey(),name:'Nova automação',enabled:false,priority:50,channels:['all'],match:'phrase',phrases:[],exclude_phrases:[],conditions:[],actions:[{type:'handoff'}]});state.draft.configuration=next;state.dirty=true;state.section='triggers';render()}
      else if(action==='test'){if(state.dirty)throw new Error('Salve o rascunho antes de testar.');const input=state.host.querySelector('#anaTestInput')?.value.trim()||'';if(!input)throw new Error('Digite uma mensagem sintética para testar.');const test=await api('admin_test',{input,channel:state.host.querySelector('#anaTestChannel')?.value||'0975',customer_linked:Boolean(state.host.querySelector('#anaTestCustomerLinked')?.checked),expected_revision:state.revision});state.lastTest=test;await load(false);state.section='tests';state.lastTest=test;render()}
      else if(action==='publish'){if(!confirm('Publicar a configuração testada para a ANA?'))return;const latest=state.testRuns[0];if(!latest?.id)throw new Error('Execute os testes obrigatórios antes de publicar.');await api('admin_publish',{test_run_id:latest.id,note:'Publicação pela área ANA'});await load()}
      else if(action==='refresh-history'){await loadHistory()}
    }catch(error){alert(error?.message||'Não foi possível concluir a ação.')}
    finally{state.busy=false;render()}
  });
  state.host.querySelectorAll('[data-toggle-channel]').forEach(button=>button.onclick=async()=>{const enabled=button.dataset.enabled==='true';if(!confirm(`${enabled?'Ativar':'Desligar'} a ANA apenas neste canal?`))return;try{await api('admin_set_channel',{whatsapp_account_id:button.dataset.toggleChannel,enabled});await load()}catch(error){alert(error.message)}});
  state.host.querySelectorAll('[data-remove-knowledge]').forEach(button=>button.onclick=()=>{const next=readDraft();next.knowledge.splice(Number(button.dataset.removeKnowledge),1);state.draft.configuration=next;state.dirty=true;render()});
  state.host.querySelectorAll('[data-add-action]').forEach(button=>button.onclick=()=>{
    const next=readDraft(),i=Number(button.dataset.addAction),item=next.triggers[i];if(!item)return;
    if(!Array.isArray(item.actions)){item.actions=actionsOf(item);delete item.action;delete item.response_text;delete item.label_id}
    if(item.actions.length<5){const at=item.actions.findIndex(a=>isTerminalAction(a.type));const action=blankAction('label');if(at>=0)item.actions.splice(at,0,action);else item.actions.push(action)}
    state.draft.configuration=next;state.dirty=true;render();
  });
  state.host.querySelectorAll('[data-remove-action]').forEach(button=>button.onclick=()=>{const [i,j]=button.dataset.removeAction.split(':').map(Number),next=readDraft(),item=next.triggers[i];if(Array.isArray(item?.actions)&&item.actions.length>1)item.actions.splice(j,1);state.draft.configuration=next;state.dirty=true;render()});
  state.host.querySelectorAll('[data-move-action]').forEach(button=>button.onclick=()=>{const [i,j,delta]=button.dataset.moveAction.split(':').map(Number),next=readDraft(),actions=next.triggers[i]?.actions;if(!Array.isArray(actions))return;const target=j+delta;if(target<0||target>=actions.length)return;[actions[j],actions[target]]=[actions[target],actions[j]];state.draft.configuration=next;state.dirty=true;render()});
  state.host.querySelectorAll('[data-duplicate-trigger]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.duplicateTrigger),next=readDraft(),source=next.triggers[i];if(!source)return;const copy=structuredClone(source);copy.key=newTriggerKey();copy.name=`${source.name||'Automação'} (cópia)`;copy.enabled=false;next.triggers.splice(i+1,0,copy);state.draft.configuration=next;state.dirty=true;render()});
  state.host.querySelectorAll('[data-remove-trigger]').forEach(button=>button.onclick=()=>{const next=readDraft();next.triggers.splice(Number(button.dataset.removeTrigger),1);state.draft.configuration=next;state.dirty=true;render()});
  state.host.querySelectorAll('[data-rollback]').forEach(button=>button.onclick=async()=>{if(!confirm('Restaurar esta versão e torná-la ativa?'))return;try{await api('admin_rollback',{version_id:Number(button.dataset.rollback),note:'Restauração pela área ANA'});await load()}catch(error){alert(error.message)}});
}
export async function mountAnaAdmin(host){state.host=host;try{await load()}catch(error){host.innerHTML=`<section class="ana-card ana-error"><h1>ANA</h1><p>Não foi possível carregar a gestão: ${esc(error.message)}</p><button class="ana-button primary" id="anaRetry">Tentar novamente</button></section>`;host.querySelector('#anaRetry').onclick=()=>mountAnaAdmin(host)}}
