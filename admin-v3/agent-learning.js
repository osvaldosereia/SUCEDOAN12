(()=>{
  'use strict';
  const C=window.DA_ADMIN_V3_CONFIG||{},AUTH_KEY='da_admin_v3_auth';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const loadAuth=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
  const saveAuth=a=>localStorage.setItem(AUTH_KEY,JSON.stringify(a));
  const toast=(m,k='')=>{const h=$('toastRegion');if(!h)return;const n=document.createElement('div');n.className=`toast ${k}`.trim();n.textContent=m;h.appendChild(n);setTimeout(()=>n.remove(),k==='error'?6500:3500)};
  async function refreshAuth(auth){const r=await fetch(`${C.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth?.refresh_token})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error('Sessão expirada. Faça login novamente.');saveAuth(d);return d}
  async function api(action,payload={},retry=true){let auth=loadAuth();if(!auth?.access_token)throw new Error('Faça login no Admin principal.');const r=await fetch(`${C.supabaseUrl}/functions/v1/admin-agent-learning-v1`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({}));if(r.status===401&&retry){auth=await refreshAuth(auth);return api(action,payload,false)}if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||`Erro ${r.status}`);return d}

  let dashboard=null,items=[],selected=null;
  const labels={draft:'A revisar',reviewing:'Rascunho criado',rejected:'Rejeitado',published:'Publicado'};
  const typeLabels={knowledge:'Informação',guidance:'Orientação',procedure:'Procedimento'};
  const pct=v=>Number.isFinite(Number(v))?`${Math.round(Number(v)*100)}%`:'—';
  const dt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return '—'}};
  const proposed=x=>JSON.stringify(x?.proposed_content||{},null,2);

  function renderMetrics(){const r=dashboard?.readiness||{},rep=dashboard?.report||{};$('alMetrics').innerHTML=[
    ['Resumos',r.summary_count??rep.summaries??0],
    ['Memórias ativas',r.memory_count??rep.active_memories??0],
    ['Para revisar',r.draft_candidate_count??rep.draft_candidates??0],
    ['Fila',r.queue_length??0]
  ].map(([a,b])=>`<div class="metric"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');
    $('alRuntime').textContent=r.execution_mode||'—';$('alWriteGate').textContent=r.learning_write_enabled?'LIGADO':'DESLIGADO';$('alWriteGate').className=r.learning_write_enabled?'al-stat-good':'al-stat-off';$('alAutopublish').textContent=r.global_candidate_autopublish_enabled?'LIGADO':'DESLIGADO';$('alAutopublish').className=r.global_candidate_autopublish_enabled?'al-stat-off':'al-stat-good';$('alQueue').textContent=`${r.pgmq_enabled?'PGMQ ativo':'PGMQ indisponível'} · ${r.queue_length||0} pendente(s)`;$('alVector').textContent=r.vector_enabled?'Ligado':'Desligado';
  }
  function renderList(){const host=$('alList');if(!items.length){host.innerHTML='<div class="al-empty"><strong>Nenhum candidato nesta fila.</strong><br>O sistema não cria regras por conta própria; candidatos só aparecem quando a aprendizagem estiver autorizada.</div>';return}host.innerHTML=items.map(x=>`<article class="al-item ${selected?.id===x.id?'active':''}" data-id="${esc(x.id)}"><div class="al-item-row"><div><h3>${esc(x.title||'Sem título')}</h3><div class="al-meta"><span class="al-chip">${esc(typeLabels[x.candidate_type]||x.candidate_type)}</span><span class="al-chip ${esc(x.status)}">${esc(labels[x.status]||x.status)}</span><span class="al-chip">Confiança ${esc(pct(x.confidence))}</span><span class="al-chip">${esc(x.occurrence_count||1)} evidência(s)</span></div></div></div><div class="al-meta" style="margin-top:9px"><span>Última ocorrência: ${esc(dt(x.last_seen_at))}</span></div></article>`).join('')}
  function renderDetail(){const host=$('alDetail');if(!selected){host.innerHTML='<div class="eyebrow">Revisão humana</div><h2>Selecione um aprendizado</h2><p class="al-detail-copy">Veja o conteúdo proposto antes de decidir. Nada aqui é publicado automaticamente.</p>';return}const owner=dashboard?.user?.role==='owner',reviewable=['draft','reviewing'].includes(selected.status),promoted=selected.promoted_entity_id?`<div class="al-warning"><strong>Já virou rascunho.</strong><br>O item foi criado na Inteligência do Atendimento e ainda precisa de uma segunda revisão humana para ser publicado.</div>`:'';host.innerHTML=`<div class="eyebrow">${esc(typeLabels[selected.candidate_type]||selected.candidate_type)}</div><h2>${esc(selected.title)}</h2><p class="al-detail-copy">Confiança ${esc(pct(selected.confidence))} · ${esc(selected.occurrence_count||1)} evidência(s) · visto por último em ${esc(dt(selected.last_seen_at))}</p><div class="al-content">${esc(proposed(selected))}</div>${promoted}<label class="al-review-note"><strong>Nota da revisão</strong><textarea id="alReviewNote" placeholder="Opcional: registre por que aprovou ou rejeitou.">${esc(selected.review_note||'')}</textarea></label><div class="al-actions"><button id="alApprove" class="button primary" type="button" ${!owner||!reviewable||selected.promoted_entity_id?'disabled':''}>Criar rascunho para revisão</button><button id="alReject" class="button secondary" type="button" ${!owner||!reviewable?'disabled':''}>Rejeitar</button>${selected.promoted_entity_id?'<a class="button secondary" href="./inteligencia.html">Abrir Inteligência</a>':''}</div><div class="al-owner-only">${owner?'Somente o proprietário pode tomar a decisão. Aprovar aqui não publica.':'Visualização liberada; decisões exigem perfil de proprietário.'}</div>`;$('alApprove')?.addEventListener('click',()=>review('approve_draft'));$('alReject')?.addEventListener('click',()=>review('reject'))}

  async function loadDashboard(){dashboard=await api('dashboard');renderMetrics()}
  async function loadList(){const status=$('alStatus')?.value||'';const d=await api('list',{status,limit:150});items=d.items||[];if(selected)selected=items.find(x=>x.id===selected.id)||null;renderList();renderDetail()}
  async function review(decision){if(!selected?.id)return;const verb=decision==='approve_draft'?'criar um rascunho a partir deste candidato':'rejeitar este candidato';if(!window.confirm(`Confirma ${verb}?`))return;const note=$('alReviewNote')?.value||'';try{const d=await api('review',{id:selected.id,decision,note});toast(decision==='approve_draft'?'Rascunho criado. Ainda não foi publicado.':'Candidato rejeitado.','success');selected=null;await loadDashboard();await loadList();if(d?.result?.entity_id&&decision==='approve_draft')toast('O novo item está em rascunho na Inteligência do Atendimento.','success')}catch(e){toast(e.message||'Não foi possível revisar.','error')}}
  async function refresh(){try{await Promise.all([loadDashboard(),loadList()])}catch(e){$('alAuthWarning').classList.remove('hidden');$('alAuthWarning').textContent=e.message||'Não foi possível carregar os aprendizados.'}}

  $('alList').addEventListener('click',e=>{const n=e.target.closest('[data-id]');if(!n)return;selected=items.find(x=>x.id===n.dataset.id)||null;renderList();renderDetail()});
  $('alStatus').addEventListener('change',()=>{selected=null;loadList().catch(e=>toast(e.message,'error'))});
  $('alRefresh').addEventListener('click',refresh);
  if(!loadAuth()?.access_token){$('alAuthWarning').classList.remove('hidden')}else refresh();
})();
