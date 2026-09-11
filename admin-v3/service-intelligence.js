(()=>{
  'use strict';
  const C=window.DA_ADMIN_V3_CONFIG||{},AUTH_KEY='da_admin_v3_auth';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=v=>String(v??'').replace(/\r/g,'').trim();
  const toast=(m,k='')=>{const h=$('toastRegion');if(!h)return;const n=document.createElement('div');n.className=`toast ${k}`.trim();n.textContent=m;h.appendChild(n);setTimeout(()=>n.remove(),k==='error'?6000:3000)};
  const loadAuth=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
  const saveAuth=a=>localStorage.setItem(AUTH_KEY,JSON.stringify(a));
  async function refreshAuth(auth){const r=await fetch(`${C.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth?.refresh_token})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error('Sessão expirada.');saveAuth(d);return d}
  async function api(action,payload={},retry=true){let auth=loadAuth();if(!auth?.access_token)throw new Error('Faça login no Admin principal.');const r=await fetch(`${C.supabaseUrl}/functions/v1/admin-service-intelligence-simple-v1`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({}));if(r.status===401&&retry){auth=await refreshAuth(auth);return api(action,payload,false)}if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||`Erro ${r.status}`);return d}

  let items=[],selected=null,dashboard=null,editingStages=[];
  const statusLabel=s=>s==='published'?'Publicado':s==='archived'?'Arquivado':'Rascunho';
  const modeLabel=m=>({text:'Responder em texto',basket_flow:'Abrir cestas / Flow',product_lookup:'Consultar produto',human:'Chamar atendimento humano',silence:'Não responder'})[m]||m;
  const blankStage=()=>({question:'',variations:[],answer:'',response_mode:'text'});
  function normalizeStages(x={}){
    if(Array.isArray(x.stages)&&x.stages.length)return x.stages.map(s=>({question:s.question||'',variations:Array.isArray(s.variations)?s.variations:[],answer:s.answer||'',response_mode:s.response_mode||'text'}));
    if(x.question||x.answer)return [{question:x.question||'',variations:x.variations||[],answer:x.answer||'',response_mode:x.response_mode||'text'}];
    return [blankStage()];
  }
  const stageHtml=(s,i)=>`<section class="si-stage" data-stage="${i}">
    <div class="si-stage-head"><strong>Etapa ${i+1}</strong>${editingStages.length>1?`<button class="button secondary small si-remove-stage" type="button" data-remove="${i}">Remover</button>`:''}</div>
    <label>Pergunta<input name="question" value="${esc(s.question||'')}" placeholder="O que o cliente pode dizer nesta etapa?"></label>
    <label>Variações da mesma pergunta<textarea name="variations" placeholder="Uma por linha">${esc((s.variations||[]).join('\n'))}</textarea><small class="si-help">A IA reconhece frases parecidas; estas variações ajudam a deixar a intenção bem amarrada.</small></label>
    <label>Resposta ou orientação<textarea name="answer" placeholder="Como a IA deve responder ou conduzir esta etapa">${esc(s.answer||'')}</textarea><small class="si-help">A IA pode deixar a frase natural e cordial, sem mudar o sentido.</small></label>
    <label>Modo de resposta<select name="response_mode">
      <option value="text" ${(s.response_mode||'text')==='text'?'selected':''}>Responder em texto</option>
      <option value="basket_flow" ${s.response_mode==='basket_flow'?'selected':''}>Abrir cestas / Flow</option>
      <option value="product_lookup" ${s.response_mode==='product_lookup'?'selected':''}>Consultar produto (preço/estoque)</option>
      <option value="human" ${s.response_mode==='human'?'selected':''}>Chamar atendimento humano</option>
      <option value="silence" ${s.response_mode==='silence'?'selected':''}>Não responder automaticamente</option>
    </select></label>
  </section>`;
  function readStages(){return [...document.querySelectorAll('.si-stage')].map(n=>({question:clean(n.querySelector('[name="question"]')?.value),variations:clean(n.querySelector('[name="variations"]')?.value).split('\n').map(x=>x.trim()).filter(Boolean),answer:clean(n.querySelector('[name="answer"]')?.value),response_mode:n.querySelector('[name="response_mode"]')?.value||'text'}))}
  function renderStages(){const host=$('siForm');if(!host)return;host.innerHTML=`<div class="si-stages">${editingStages.map(stageHtml).join('')}</div><button id="siAddStage" class="button secondary" type="button">+ Adicionar etapa</button><p class="si-simple-help">As etapas seguem esta ordem. Depois de concluir uma etapa, a conversa passa para a próxima. Se houver apenas uma, termina ali.</p>`;}
  function renderEditor(){const x=selected||{};editingStages=normalizeStages(x);$('siEditorTitle').textContent=selected?'Editar orientação':'Nova orientação';$('siStatus').textContent=statusLabel(x.status||'draft');renderStages();$('siPublish').disabled=!selected?.id||selected?.status==='published';$('siArchive').disabled=!selected?.id||selected?.status==='archived'}
  function renderList(){const host=$('siList');host.innerHTML=items.length?items.map(x=>{const stages=normalizeStages(x);return `<div class="si-item ${selected?.id===x.id?'active':''}" data-id="${esc(x.id)}"><div class="si-item-row"><strong>${esc(stages[0]?.question||'Sem pergunta')}</strong><span class="badge">${esc(statusLabel(x.status))}</span></div><small>${stages.length} etapa${stages.length===1?'':'s'} · ${esc(modeLabel(stages[0]?.response_mode||'text'))}</small></div>`}).join(''):'<div class="empty">Nenhuma orientação cadastrada ainda.</div>'}
  function renderMetrics(){const c=dashboard?.counts||{},r=dashboard?.runtime||{};$('siMetrics').innerHTML=[['IA',r.enabled?'Ativa':'Desligada'],['Modo',r.strict_mode?'Restrito':'Livre'],['Publicadas',c.published||0],['Rascunhos',c.drafts||0]].map(([a,b])=>`<div class="metric"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('')}
  async function loadDashboard(){dashboard=await api('dashboard');renderMetrics()}
  async function loadList(){const d=await api('list',{q:$('siSearch')?.value||''});items=d.items||[];if(selected)selected=items.find(x=>x.id===selected.id)||selected;renderList();renderEditor()}
  function payload(){const stages=readStages();return {id:selected?.id||undefined,stages,priority:50}}
  async function save(){try{const p=payload();if(!p.stages.length)throw new Error('Adicione pelo menos uma etapa.');for(let i=0;i<p.stages.length;i++){const s=p.stages[i];if(!s.question)throw new Error(`Informe a pergunta da Etapa ${i+1}.`);if(s.response_mode==='text'&&!s.answer)throw new Error(`Escreva a resposta da Etapa ${i+1}.`)}const d=await api('save',p);selected=d.item;toast('Salvo.','success');await loadList();await loadDashboard()}catch(e){toast(e.message,'error')}}
  async function setStatus(status){if(!selected?.id)return toast('Salve primeiro.','error');try{const d=await api('set_status',{id:selected.id,status});selected=d.item;toast(status==='published'?'Publicado para a IA.':'Arquivado.','success');await loadList();await loadDashboard()}catch(e){toast(e.message,'error')}}
  async function init(){if(!loadAuth()?.access_token){$('siAuthWarning').classList.remove('hidden');return}try{await loadDashboard();await loadList()}catch(e){$('siAuthWarning').classList.remove('hidden');$('siAuthWarning').textContent=e.message}}
  $('siList').addEventListener('click',e=>{const n=e.target.closest('[data-id]');if(!n)return;selected=items.find(x=>x.id===n.dataset.id)||null;renderList();renderEditor()});
  $('siNew').addEventListener('click',()=>{selected=null;renderList();renderEditor()});
  $('siForm').addEventListener('click',e=>{if(e.target.closest('#siAddStage')){editingStages=readStages();editingStages.push(blankStage());renderStages();return}const b=e.target.closest('[data-remove]');if(b){editingStages=readStages();editingStages.splice(Number(b.dataset.remove),1);if(!editingStages.length)editingStages=[blankStage()];renderStages()}});
  $('siSave').addEventListener('click',save);$('siPublish').addEventListener('click',()=>setStatus('published'));$('siArchive').addEventListener('click',()=>setStatus('archived'));$('siRefresh').addEventListener('click',async()=>{await loadDashboard();await loadList()});
  let timer;$('siSearch').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(loadList,220)});init();
})();