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

  let items=[],selected=null,dashboard=null;
  const statusLabel=s=>s==='published'?'Publicado':s==='archived'?'Arquivado':'Rascunho';
  const modeLabel=m=>({text:'Responder em texto',basket_flow:'Abrir cestas / Flow',product_lookup:'Consultar produto',human:'Chamar atendimento humano',silence:'Não responder'})[m]||m;
  const field=(label,name,value='',kind='input',help='')=>`<label>${esc(label)}${kind==='textarea'?`<textarea name="${name}">${esc(value)}</textarea>`:`<input name="${name}" value="${esc(value)}">`}${help?`<small class="si-help">${esc(help)}</small>`:''}</label>`;

  function formHtml(x={}){
    const mode=x.response_mode||'text';
    return field('Pergunta','question',x.question||'','textarea','Escreva a pergunta ou intenção principal do cliente.')+
      field('Variações da mesma pergunta','variations',(x.variations||[]).join('\n'),'textarea','Uma por linha. Ex.: “qual o valor das cestas?”, “quanto custa a cesta?”, “preço das cestas”.')+
      field('Resposta ou orientação','answer',x.answer||'','textarea','A IA pode escrever algo próximo disso para soar natural, mas não pode mudar o sentido nem inventar fatos.')+
      `<label>Modo de resposta<select name="response_mode">
        <option value="text" ${mode==='text'?'selected':''}>Responder em texto</option>
        <option value="basket_flow" ${mode==='basket_flow'?'selected':''}>Abrir cestas / Flow</option>
        <option value="product_lookup" ${mode==='product_lookup'?'selected':''}>Consultar produto (preço/estoque)</option>
        <option value="human" ${mode==='human'?'selected':''}>Chamar atendimento humano</option>
        <option value="silence" ${mode==='silence'?'selected':''}>Não responder automaticamente</option>
      </select><small class="si-help">A ferramenta limita o que a IA pode fazer quando reconhecer esta intenção.</small></label>`;
  }

  function renderEditor(){const x=selected||{};$('siEditorTitle').textContent=selected?'Editar orientação':'Nova orientação';$('siStatus').textContent=statusLabel(x.status||'draft');$('siForm').innerHTML=formHtml(x);$('siPublish').disabled=!selected?.id||selected?.status==='published';$('siArchive').disabled=!selected?.id||selected?.status==='archived'}
  function renderList(){const host=$('siList');host.innerHTML=items.length?items.map(x=>`<div class="si-item ${selected?.id===x.id?'active':''}" data-id="${esc(x.id)}"><div class="si-item-row"><strong>${esc(x.question||'Sem pergunta')}</strong><span class="badge">${esc(statusLabel(x.status))}</span></div><small>${esc(modeLabel(x.response_mode))}${x.variations?.length?` · ${x.variations.length} variação(ões)`:''}</small></div>`).join(''):'<div class="empty">Nenhuma orientação cadastrada ainda.</div>'}
  function renderMetrics(){const c=dashboard?.counts||{},r=dashboard?.runtime||{};$('siMetrics').innerHTML=[['IA',r.enabled?'Ativa':'Desligada'],['Modo',r.strict_mode?'Restrito':'Livre'],['Publicadas',c.published||0],['Rascunhos',c.drafts||0]].map(([a,b])=>`<div class="metric"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('')}

  async function loadDashboard(){dashboard=await api('dashboard');renderMetrics()}
  async function loadList(){const d=await api('list',{q:$('siSearch')?.value||''});items=d.items||[];if(selected)selected=items.find(x=>x.id===selected.id)||selected;renderList();renderEditor()}
  function payload(){const f=new FormData($('siForm')),o=Object.fromEntries(f.entries());if(selected?.id)o.id=selected.id;o.variations=clean(o.variations).split('\n').map(x=>x.trim()).filter(Boolean);o.priority=50;return o}

  async function save(){try{const p=payload();if(!clean(p.question))throw new Error('Informe a pergunta principal.');if(p.response_mode==='text'&&!clean(p.answer))throw new Error('Escreva a resposta.');const d=await api('save',p);selected=d.item;toast('Salvo.','success');await loadList();await loadDashboard()}catch(e){toast(e.message,'error')}}
  async function setStatus(status){if(!selected?.id)return toast('Salve primeiro.','error');try{const d=await api('set_status',{id:selected.id,status});selected=d.item;toast(status==='published'?'Publicado para a IA.':'Arquivado.','success');await loadList();await loadDashboard()}catch(e){toast(e.message,'error')}}

  async function init(){if(!loadAuth()?.access_token){$('siAuthWarning').classList.remove('hidden');return}try{await loadDashboard();await loadList()}catch(e){$('siAuthWarning').classList.remove('hidden');$('siAuthWarning').textContent=e.message}}
  $('siList').addEventListener('click',e=>{const n=e.target.closest('[data-id]');if(!n)return;selected=items.find(x=>x.id===n.dataset.id)||null;renderList();renderEditor()});
  $('siNew').addEventListener('click',()=>{selected=null;renderList();renderEditor()});
  $('siSave').addEventListener('click',save);
  $('siPublish').addEventListener('click',()=>setStatus('published'));
  $('siArchive').addEventListener('click',()=>setStatus('archived'));
  $('siRefresh').addEventListener('click',async()=>{await loadDashboard();await loadList()});
  let timer;$('siSearch').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(loadList,220)});
  init();
})();