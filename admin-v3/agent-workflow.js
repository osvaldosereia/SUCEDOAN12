(function(){
  'use strict';
  const C=window.DA_ADMIN_V3_CONFIG||{};
  const AUTH_KEY='da_admin_v3_auth';
  const state={data:null,selected:null,root:null,toolFilter:'all'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const auth=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};

  const TOOL_UI={
    wa_add_more_products:['Adicionar mais produtos à cesta','Cesta e personalização'],
    wa_add_product:['Adicionar produto ao carrinho','Cesta e personalização'],
    wa_cancel_address_flow:['Cancelar alteração de endereço','Finalização'],
    wa_confirm_order:['Confirmar pedido','Confirmação do pedido'],
    wa_create_basket_replacement:['Iniciar troca de item da cesta','Cesta e personalização'],
    wa_create_search_showcase:['Criar vitrine de produtos','Produtos e ofertas'],
    wa_finalize_basket_order:['Finalizar encomenda da cesta','Confirmação do pedido'],
    wa_find_baskets_by_items:['Encontrar cesta pelos produtos desejados','Consulta de cestas'],
    wa_get_basket_contents:['Ver produtos de uma cesta','Consulta de cestas'],
    wa_get_basket_customer_status:['Ver se o cadastro está pronto para finalizar','Finalização'],
    wa_get_basket_state:['Ver situação atual da cesta','Cesta e personalização'],
    wa_get_cart:['Ver carrinho atual','Cesta e personalização'],
    wa_get_checkout_contact:['Ver dados já conhecidos para finalizar','Finalização'],
    wa_get_policy:['Consultar regras da empresa','Informações e regras'],
    wa_get_product:['Consultar um produto','Produtos e ofertas'],
    wa_get_recommendations:['Sugerir produtos complementares','Produtos e ofertas'],
    wa_handoff_human:['Passar atendimento para uma pessoa','Atendimento humano'],
    wa_link_customer_identity:['Reconhecer cliente já cadastrado','Cadastro do cliente'],
    wa_list_baskets:['Mostrar as cestas disponíveis','Consulta de cestas'],
    wa_open_basket_storefront:['Abrir personalização da cesta','Cesta e personalização'],
    wa_prepare_basket_confirmation:['Preparar resumo final do pedido','Finalização'],
    wa_replace_product:['Trocar produto da cesta','Cesta e personalização'],
    wa_request_address_flow:['Pedir ou alterar endereço de entrega','Finalização'],
    wa_request_basket_payment:['Pedir forma de pagamento','Finalização'],
    wa_save_checkout_customer_data:['Salvar dados do cliente no checkout','Cadastro do cliente'],
    wa_search_products:['Procurar produtos no catálogo','Produtos e ofertas'],
    wa_select_basket:['Selecionar uma cesta','Consulta de cestas'],
    wa_set_delivery_locator:['Salvar localização/referência da entrega','Finalização'],
    wa_set_quantity:['Alterar quantidade de produto','Cesta e personalização'],
    wa_start_basket_checkout:['Ir da cesta para a finalização','Finalização'],
    wa_start_order_checkout:['Ir do carrinho comum para a finalização','Finalização']
  };
  const RISK_UI={
    read_only:['Só consulta','Não altera pedido nem cadastro.','safe'],
    reversible_write:['Pode alterar','Pode mudar carrinho, etapa ou cadastro, mas é reversível.','change'],
    commitment:['Confirma pedido','Use somente quando esta etapa pode realmente concluir uma encomenda.','commit']
  };

  async function rpc(fn,args={}){
    const a=auth(); if(!a?.access_token) throw new Error('Sessão do Admin indisponível.');
    const r=await fetch(`${C.supabaseUrl}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${a.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store'});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.message||d.error||`Erro ${r.status}`); return d;
  }
  const stageMap=()=>new Map((state.data?.stages||[]).map(x=>[x.stage_key,x]));
  const toolUi=t=>{const x=TOOL_UI[t.action_key]||[t.action_key,'Outras'];return {name:x[0],group:x[1]}};
  const riskUi=t=>RISK_UI[t.risk_class]||['Ação do sistema','Veja a descrição antes de liberar.','change'];

  function shell(){return `<section class="panel aw-shell" id="agentWorkflowPanel">
    <div class="aw-head"><div><div class="aw-kicker">Fluxo visual da IA</div><h2>Etapas do atendimento</h2><p>Escolha o que a IA pode fazer em cada momento. Os nomes técnicos ficam escondidos nos detalhes.</p></div><div><label class="aw-toggle"><input id="awEnabled" type="checkbox"> Motor ligado</label><div class="aw-version" id="awVersion"></div></div></div>
    <div id="awFlow" class="aw-flow"><div class="aw-empty">Carregando fluxo…</div></div>
    <div id="awEditor" class="aw-editor"></div><div id="awStatus" class="aw-status"></div>
  </section>`}
  function nodeHtml(s,i,total){const tags=[s.autonomous?'IA autônoma':'determinístico',`${(s.allowed_tools||[]).length} ferramentas`];if(s.human_on_unknown)tags.push('humano em dúvida');return `<button class="aw-node ${s.enabled?'':'aw-disabled'}" data-aw-stage="${esc(s.stage_key)}" type="button"><small>Etapa ${i+1} de ${total}</small><strong>${esc(s.name)}</strong><div class="aw-tags">${tags.map((t,j)=>`<span class="aw-tag ${j===2?'warn':''}">${esc(t)}</span>`).join('')}</div></button>${i<total-1?'<span class="aw-arrow">→</span>':''}`}
  function renderFlow(){const d=state.data||{},stages=d.stages||[];const flow=state.root.querySelector('#awFlow');flow.innerHTML=stages.map((s,i)=>nodeHtml(s,i,stages.length)).join('')||'<div class="aw-empty">Nenhuma etapa.</div>';state.root.querySelector('#awEnabled').checked=!!d.settings?.enabled;state.root.querySelector('#awVersion').textContent=`versão ${d.settings?.version||1}`;flow.querySelectorAll('[data-aw-stage]').forEach(b=>b.addEventListener('click',()=>selectStage(b.dataset.awStage)));}
  function selectStage(key){state.selected=key;state.toolFilter='all';state.root.querySelectorAll('[data-aw-stage]').forEach(x=>x.classList.toggle('active',x.dataset.awStage===key));renderEditor();}

  function toolCard(t,selected){
    const ui=toolUi(t),risk=riskUi(t),desc=String(t.description||'').trim()||'Ferramenta interna do atendimento.';
    return `<label class="aw-tool-card" data-aw-risk="${esc(t.risk_class)}" data-aw-selected="${selected?'1':'0'}">
      <input type="checkbox" data-aw-tool="${esc(t.action_key)}" ${selected?'checked':''}>
      <span class="aw-tool-copy"><strong>${esc(ui.name)}</strong><span class="aw-tool-desc">${esc(desc)}</span><span class="aw-tool-meta"><span class="aw-category">${esc(ui.group)}</span><span class="aw-risk-pill ${esc(risk[2])}">${esc(risk[0])}</span></span><details><summary>Detalhes técnicos</summary><code>${esc(t.action_key)}</code><small>${esc(risk[1])}</small></details></span>
    </label>`;
  }
  function groupedTools(tools,selectedTools){
    const groups=new Map();
    tools.forEach(t=>{const g=toolUi(t).group;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(t)});
    return [...groups.entries()].map(([g,list])=>`<section class="aw-tool-group" data-aw-group><h4>${esc(g)}</h4>${list.map(t=>toolCard(t,selectedTools.has(t.action_key))).join('')}</section>`).join('');
  }
  function applyToolFilter(){
    const root=state.root?.querySelector('#awEditor');if(!root)return;
    const q=(root.querySelector('#awToolSearch')?.value||'').trim().toLowerCase();
    root.querySelectorAll('.aw-tool-card').forEach(card=>{
      const byFilter=state.toolFilter==='all'||(state.toolFilter==='active'&&card.dataset.awSelected==='1')||(state.toolFilter==='read'&&card.dataset.awRisk==='read_only')||(state.toolFilter==='change'&&card.dataset.awRisk==='reversible_write')||(state.toolFilter==='commit'&&card.dataset.awRisk==='commitment');
      const byText=!q||card.textContent.toLowerCase().includes(q);
      card.hidden=!(byFilter&&byText);
    });
    root.querySelectorAll('[data-aw-group]').forEach(g=>g.hidden=![...g.querySelectorAll('.aw-tool-card')].some(x=>!x.hidden));
    root.querySelectorAll('[data-aw-filter]').forEach(b=>b.classList.toggle('active',b.dataset.awFilter===state.toolFilter));
    const count=[...root.querySelectorAll('[data-aw-tool]:checked')].length;const badge=root.querySelector('#awToolSelectedCount');if(badge)badge.textContent=`${count} liberada${count===1?'':'s'}`;
  }

  function renderEditor(){
    const s=stageMap().get(state.selected);if(!s)return;
    const e=state.root.querySelector('#awEditor'),tools=state.data.tools||[],stages=state.data.stages||[];const selectedTools=new Set(s.allowed_tools||[]),next=new Set(s.next_stages||[]);
    e.innerHTML=`<div class="aw-editor-title"><div><div class="aw-kicker">Configurando</div><h3>${esc(s.name)}</h3><p>Marque apenas o que a IA pode fazer neste momento do atendimento.</p></div><span id="awToolSelectedCount" class="aw-selected-count">${selectedTools.size} liberadas</span></div>
    <div class="aw-editor-grid"><div>
      <label class="aw-field"><span>Nome da etapa</span><input id="awName" type="text" value="${esc(s.name)}"></label>
      <label class="aw-field"><span>Orientação para a IA nesta etapa</span><textarea id="awInstructions">${esc(s.instructions||'')}</textarea></label>
      <div class="aw-options"><label class="aw-check"><input id="awStageEnabled" type="checkbox" ${s.enabled?'checked':''}> Etapa ativa</label><label class="aw-check"><input id="awAutonomous" type="checkbox" ${s.autonomous?'checked':''}> IA decide a melhor ação</label><label class="aw-check"><input id="awHumanUnknown" type="checkbox" ${s.human_on_unknown?'checked':''}> Em dúvida, chamar humano</label></div>
      <label class="aw-field"><span>Máximo de ofertas adicionais nesta etapa</span><input id="awMaxOffers" type="number" min="0" max="5" value="${Number(s.max_offers||0)}"></label>
      <div class="aw-field"><span>Próximas etapas permitidas</span><div class="aw-transitions">${stages.filter(x=>x.stage_key!==s.stage_key).map(x=>`<label class="aw-check"><input type="checkbox" data-aw-next="${esc(x.stage_key)}" ${next.has(x.stage_key)?'checked':''}> ${esc(x.name)}</label>`).join('')}</div></div>
    </div><div>
      <div class="aw-field aw-tools-field"><div class="aw-tools-heading"><span>O que a IA pode fazer</span><small>Você pode procurar pelo nome comum da ação.</small></div>
      <div class="aw-tool-controls"><input id="awToolSearch" type="search" placeholder="Ex.: endereço, pagamento, cesta, humano"><div class="aw-filter-row"><button type="button" data-aw-filter="all" class="active">Todas</button><button type="button" data-aw-filter="active">Liberadas</button><button type="button" data-aw-filter="read">Só consultar</button><button type="button" data-aw-filter="change">Pode alterar</button><button type="button" data-aw-filter="commit">Confirma pedido</button></div></div>
      <div class="aw-toolbox">${groupedTools(tools,selectedTools)}</div></div>
    </div></div><div class="aw-editor-actions"><button id="awCancel" class="button secondary" type="button">Fechar</button><button id="awSave" class="button primary" type="button">Salvar etapa</button></div>`;
    e.classList.add('open');e.querySelector('#awCancel').onclick=()=>e.classList.remove('open');e.querySelector('#awSave').onclick=saveStage;
    e.querySelector('#awToolSearch').addEventListener('input',applyToolFilter);
    e.querySelectorAll('[data-aw-filter]').forEach(b=>b.onclick=()=>{state.toolFilter=b.dataset.awFilter;applyToolFilter()});
    e.querySelectorAll('[data-aw-tool]').forEach(i=>i.addEventListener('change',()=>{i.closest('.aw-tool-card').dataset.awSelected=i.checked?'1':'0';applyToolFilter()}));
    applyToolFilter();
  }

  async function saveStage(){const s=stageMap().get(state.selected);if(!s)return;status('Salvando…');const tools=[...state.root.querySelectorAll('[data-aw-tool]:checked')].map(x=>x.dataset.awTool),next=[...state.root.querySelectorAll('[data-aw-next]:checked')].map(x=>x.dataset.awNext);try{await rpc('save_agent_workflow_stage_v1',{p_stage_key:s.stage_key,p_name:state.root.querySelector('#awName').value,p_instructions:state.root.querySelector('#awInstructions').value,p_allowed_tools:tools,p_next_stages:next,p_enabled:state.root.querySelector('#awStageEnabled').checked,p_autonomous:state.root.querySelector('#awAutonomous').checked,p_max_offers:Number(state.root.querySelector('#awMaxOffers').value||0),p_human_on_unknown:state.root.querySelector('#awHumanUnknown').checked});await load();selectStage(s.stage_key);status('Salvo. A IA já usa esta configuração nos próximos atendimentos.','ok')}catch(err){status(err.message||String(err),'error')}}
  async function toggleEngine(){const input=state.root.querySelector('#awEnabled');input.disabled=true;status(input.checked?'Ligando motor…':'Desligando motor…');try{await rpc('set_agent_workflow_enabled_v1',{p_enabled:input.checked});await load();status(input.checked?'Motor de etapas ligado.':'Motor de etapas desligado.','ok')}catch(err){input.checked=!input.checked;status(err.message||String(err),'error')}finally{input.disabled=false}}
  function status(msg,kind=''){const el=state.root?.querySelector('#awStatus');if(!el)return;el.className=`aw-status ${kind}`;el.textContent=msg||''}
  async function load(){try{state.data=await rpc('get_agent_workflow_admin_v1');renderFlow();if(state.selected&&stageMap().has(state.selected))renderEditor();else state.root.querySelector('#awEditor').classList.remove('open')}catch(err){status(err.message||String(err),'error');state.root.querySelector('#awFlow').innerHTML='<div class="aw-empty">Não foi possível carregar o fluxo.</div>'}}
  function mount(){const shellEl=document.querySelector('.si-shell');if(!shellEl||document.getElementById('agentWorkflowPanel'))return;const host=document.createElement('div');host.innerHTML=shell();state.root=host.firstElementChild;const intro=document.querySelector('.si-intro');(intro||shellEl.firstElementChild)?.insertAdjacentElement('afterend',state.root);state.root.querySelector('#awEnabled').addEventListener('change',toggleEngine);load();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  window.DAAgentWorkflow={mount,reload:load};
})();