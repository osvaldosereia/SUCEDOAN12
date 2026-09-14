import {api} from './api.js';
import {CONFIG} from './config.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};
const number=v=>Number(v||0).toLocaleString('pt-BR');
const checked=v=>v?'checked':'';
const image=v=>v?`<img class="thumb" src="${esc(v)}" alt="" loading="lazy" decoding="async">`:'<div class="thumb"></div>';
const productOf=job=>Array.isArray(job?.product)?job.product[0]||{}:job?.product||{};
const endpoint=`${CONFIG.supabaseUrl}/functions/v1/admin-v3-product-names`;
let filters={q:'',status:''};

const statusLabels={queued:'Na fila',processing:'Processando',applied:'Aplicado',unchanged:'Sem alteração',review:'Revisão',error:'Erro',skipped:'Mantido'};
const statusClass=status=>status==='applied'||status==='unchanged'?'ok':status==='review'||status==='processing'||status==='queued'?'warn':status==='error'?'off':'';

function toast(message,kind=''){
  const host=$('toastRegion');
  const node=document.createElement('div');
  node.className=`toast ${kind}`.trim();
  node.textContent=message;
  host.appendChild(node);
  window.setTimeout(()=>node.remove(),kind==='error'?5200:3200);
}

async function normalizationApi(action,payload={}){
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store',credentials:'omit',signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false){const error=new Error(data.detail||data.error||'Não foi possível concluir.');error.code=data.error;error.data=data;throw error}
    return data;
  }catch(error){if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');throw error}finally{window.clearTimeout(timer)}
}

function changeMarkup(job){
  const p=productOf(job);
  let finalName=job.proposed_name||p.name||job.original_name||'—';
  if(job.status==='unchanged')finalName=job.original_name||p.name||'—';
  if(job.status==='skipped')finalName=p.name||job.original_name||'—';
  return `<div class="name-normalization-change"><div class="name-normalization-before"><span>Era</span><strong>${esc(job.original_name||'—')}</strong></div><div class="name-normalization-arrow">→</div><div class="name-normalization-after"><span>Ficou</span><strong>${esc(finalName)}</strong></div></div>`;
}

function jobProductMarkup(job){
  const p=productOf(job);
  const confidence=job.confidence==null?'':` · confiança ${Math.round(Number(job.confidence)*100)}%`;
  return `<div class="name-normalization-product">${image(p.image_url)}<div><strong>${esc(p.name||job.proposed_name||job.original_name||'Produto')}</strong><div class="muted">EAN ${esc(p.gtin||'não informado')} · ${esc(p.brand||'sem marca')}${confidence}</div><div class="name-normalization-status"><span class="badge ${statusClass(job.status)}">${esc(statusLabels[job.status]||job.status||'—')}</span>${job.used_ean_lookup?'<span class="badge">EAN consultado</span>':''}</div></div></div>`;
}

function historyRow(job){
  const p=productOf(job);
  return `<article class="name-normalization-row"><div>${jobProductMarkup(job)}</div><div>${changeMarkup(job)}${job.explanation?`<div class="muted name-normalization-reason">${esc(job.explanation)}</div>`:''}</div><div class="row-actions"><button type="button" data-edit-product="${esc(job.product_id)}">Editar produto</button></div></article>`;
}

function renderReviews(rows=[]){
  const host=$('reviewList');
  if(!rows.length){host.innerHTML='<div class="empty">Nenhuma revisão pendente.</div>';return}
  host.innerHTML=rows.map(job=>{
    const p=productOf(job);
    const issues=Array.isArray(job.issues)&&job.issues.length?`<div class="muted name-normalization-reason"><strong>Conflitos:</strong> ${job.issues.map(esc).join(' · ')}</div>`:'';
    return `<article class="name-normalization-review" data-review-job="${esc(job.id)}"><div class="name-normalization-review-head"><div>${jobProductMarkup(job)}</div><button class="secondary" type="button" data-edit-product="${esc(job.product_id)}">Abrir edição do produto</button></div>${changeMarkup(job)}${job.ean_lookup_reason?`<div class="muted name-normalization-reason"><strong>Por que parou:</strong> ${esc(job.ean_lookup_reason)}</div>`:''}${issues}<label class="name-normalization-review-edit"><span>Nome que será aplicado</span><input data-review-name value="${esc(job.proposed_name||p.name||job.original_name||'')}" maxlength="180"></label><div class="name-normalization-review-actions"><button class="primary" type="button" data-review-action="approve" data-job-id="${esc(job.id)}">Aprovar</button><button class="secondary" type="button" data-review-action="edit_apply" data-job-id="${esc(job.id)}">Editar e aplicar</button><button class="secondary" type="button" data-review-action="keep" data-job-id="${esc(job.id)}">Manter nome atual</button></div></article>`;
  }).join('');
}

function renderRounds(runs=[],jobs=[]){
  const host=$('roundsList');
  if(!runs.length){host.innerHTML='<div class="empty">Nenhuma rodada registrada ainda.</div>';return}
  host.innerHTML=runs.map((run,index)=>{
    const batchId=run?.metadata?.batch_response_id||'';
    const roundJobs=batchId?jobs.filter(job=>job?.response_snapshot?.batch_response_id===batchId):[];
    const tokens=Number(run.batch_total_tokens||0)+Number(run.ean_total_tokens||0);
    const status=run.finished_at?'Concluída':'Em processamento';
    return `<article class="name-normalization-round"><header class="name-normalization-round-head"><div><h3>Rodada ${esc(String(runs.length-index))} · ${date(run.started_at)}</h3><div class="muted">${esc(run.model||'modelo não informado')} · ${esc(status)} · ${esc(run.ean_lookups||0)} consulta(s) por EAN</div><div class="name-normalization-tokens">${number(tokens)} tokens registrados</div></div><div class="name-normalization-round-stats"><span class="badge ok">${esc(run.applied||0)} aplicados</span><span class="badge">${esc(run.unchanged||0)} sem alteração</span><span class="badge warn">${esc(run.review||0)} revisão</span>${Number(run.failed||0)>0?`<span class="badge off">${esc(run.failed)} erro(s)</span>`:''}</div></header><div class="name-normalization-round-body">${roundJobs.length?roundJobs.map(historyRow).join(''):'<div class="name-normalization-empty">${run.finished_at?'Os itens desta rodada não estão mais entre os 120 ajustes recentes.':'A rodada ainda não terminou. Clique em Atualizar depois para ver os resultados.'}</div>'}</div></article>`;
  }).join('');
}

function renderHistory(rows=[]){
  const host=$('historyList');
  $('historySummary').textContent=filters.q||filters.status?`Filtro atual: ${filters.q||'todos os nomes'}${filters.status?` · ${statusLabels[filters.status]||filters.status}`:''}.`:'Últimos ajustes da automação, sem atualização automática.';
  host.innerHTML=rows.length?rows.map(historyRow).join(''):'<div class="empty">Nenhum registro encontrado.</div>';
}

function renderStats(counts={}){
  $('statTotal').textContent=number(counts.total_products);
  $('statApplied').textContent=number(counts.applied);
  $('statReview').textContent=number(counts.review);
  $('statQueued').textContent=number(Number(counts.queued||0)+Number(counts.untracked||0));
  $('statUnchanged').textContent=number(counts.unchanged);
  $('statError').textContent=number(counts.error);
  $('statSkipped').textContent=number(counts.skipped);
  $('statProcessing').textContent=number(counts.processing);
}

async function loadData(){
  const button=$('refreshData');
  button.disabled=true;button.textContent='Atualizando…';
  try{
    const data=await normalizationApi('product_name_normalization',{q:filters.q,status:filters.status,limit:80});
    renderStats(data.counts||{});
    renderReviews(data.review_jobs||[]);
    renderRounds(data.runs||[],data.recent_jobs||[]);
    renderHistory(data.jobs||[]);
    $('lastUpdated').textContent=`Atualizado manualmente em ${date(data.generated_at)}. Nenhuma atualização automática está ativa nesta tela.`;
  }catch(error){toast(error.message,'error')}
  finally{button.disabled=false;button.textContent='Atualizar'}
}

async function processNow(button){
  button.disabled=true;button.textContent='Solicitando…';
  try{
    const data=await normalizationApi('product_name_normalization_process_now');
    const dispatch=data.dispatch||{};
    if(dispatch.dispatched===false)toast(dispatch.reason==='queue_empty'?'Não há produtos pendentes para processar.':`Não foi possível iniciar: ${dispatch.reason||'sem detalhe'}.`,'error');
    else toast('Rodada solicitada. Clique em Atualizar para consultar os resultados.','success');
  }catch(error){toast(error.message,'error')}
  finally{button.disabled=false;button.textContent='Processar agora'}
}

async function reviewJob(jobId,decision,button){
  const card=button.closest('[data-review-job]');
  const name=card?.querySelector('[data-review-name]')?.value.trim()||'';
  if(decision==='keep'&&!confirm('Manter o nome atual e encerrar esta revisão?'))return;
  if(decision==='edit_apply'&&!name){toast('Digite o nome que deseja aplicar.','error');return}
  button.disabled=true;
  try{
    await normalizationApi('product_name_normalization_review',{job_id:jobId,decision,name});
    toast(decision==='keep'?'Nome atual mantido.':'Nome aprovado e aplicado.','success');
    await loadData();
  }catch(error){
    if(error.code==='product_name_changed')toast(`O produto foi alterado depois da revisão. Nome atual: ${error.data?.current_name||'consulte o produto'}.`,'error');
    else toast(error.message,'error');
  }finally{button.disabled=false}
}

const productDialog=$('productDialog');
const productEditorBody=$('productEditorBody');
function closeProductEditor(){if(productDialog.open)productDialog.close();productEditorBody.innerHTML=''}
async function openProductEditor(id){
  try{
    const data=await api('product',{id}),p=data.product;
    productEditorBody.innerHTML=`<form id="nameProductEditorForm" class="editor-shell" data-id="${esc(id)}"><div class="editor-head"><div><h2>Editar produto</h2><div class="muted name-normalization-editor-status">Alterações feitas aqui usam o mesmo cadastro de Produtos do Admin V3.</div></div><button class="close-dialog" type="button" data-close-product-editor>×</button></div><div class="form-grid"><label class="field wide"><span>Nome</span><input name="name" value="${esc(p.name||'')}" required></label><label class="field"><span>EAN</span><input name="gtin" value="${esc(p.gtin||'')}"></label><label class="field"><span>SKU</span><input name="sku" value="${esc(p.sku||'')}"></label><label class="field"><span>Preço de venda</span><input name="price" type="number" step="0.01" min="0" value="${esc(p.price??'')}"></label><label class="field"><span>Custo</span><input name="cost" type="number" step="0.01" min="0" value="${esc(p.cost??'')}"></label><label class="field"><span>Estoque</span><input name="stock" type="number" step="1" min="0" value="${esc(p.stock??0)}"></label><label class="field"><span>Categoria</span><input name="category" value="${esc(p.category||'')}"></label><label class="field"><span>Marca</span><input name="brand" value="${esc(p.brand||'')}"></label><label class="field"><span>Embalagem</span><input name="packaging" value="${esc(p.packaging||'')}"></label><label class="field wide"><span>URL da imagem</span><input name="image_url" value="${esc(p.image_url||'')}"></label><label class="field wide"><span>Descrição</span><textarea name="description_short">${esc(p.description_short||'')}</textarea></label><div class="wide check-row"><label class="check"><input name="is_active" type="checkbox" ${checked(p.is_active)}> Ativo</label><label class="check"><input name="is_offer" type="checkbox" ${checked(p.is_offer)}> Oferta</label><label class="check"><input name="storefront_featured" type="checkbox" ${checked(p.storefront_featured)}> Destaque na vitrine</label></div></div><div class="form-actions"><button class="secondary" type="button" data-close-product-editor>Cancelar</button><button class="primary" type="submit">Salvar produto</button></div></form>`;
    if(!productDialog.open)productDialog.showModal();
  }catch(error){toast(error.message,'error')}
}

function formDataObject(form){return Object.fromEntries(new FormData(form).entries())}

$('refreshData').addEventListener('click',loadData);
$('runNow').addEventListener('click',e=>processNow(e.currentTarget));
$('normalizationFilterForm').addEventListener('submit',async e=>{e.preventDefault();const d=formDataObject(e.currentTarget);filters={q:String(d.q||'').trim(),status:String(d.status||'').trim()};await loadData()});

document.addEventListener('click',async e=>{
  const target=e.target.closest('button');if(!target)return;
  if(target.matches('[data-edit-product]')){await openProductEditor(target.dataset.editProduct);return}
  if(target.matches('[data-review-action]')){await reviewJob(target.dataset.jobId,target.dataset.reviewAction,target);return}
  if(target.matches('[data-close-product-editor]')){closeProductEditor();return}
});

productEditorBody.addEventListener('submit',async e=>{
  const form=e.target;if(form.id!=='nameProductEditorForm')return;e.preventDefault();
  const d=formDataObject(form),id=form.dataset.id;
  const patch={name:d.name,gtin:d.gtin,sku:d.sku,price:d.price,cost:d.cost,stock:d.stock,category:d.category,brand:d.brand,packaging:d.packaging,image_url:d.image_url,description_short:d.description_short,is_active:form.elements.is_active.checked,is_offer:form.elements.is_offer.checked,storefront_featured:form.elements.storefront_featured.checked};
  try{await api('save_product',{id,patch});closeProductEditor();toast('Produto salvo. Clique em Atualizar para recarregar a gestão de nomes.','success')}catch(error){toast(error.message,'error')}
});

productDialog.addEventListener('click',e=>{if(e.target===productDialog)closeProductEditor()});
const sidebar=$('sidebar'),sidebarBackdrop=$('sidebarBackdrop');
const closeMenu=()=>{sidebar.classList.remove('open');sidebarBackdrop.classList.add('hidden')};
$('menuButton').addEventListener('click',()=>{const open=sidebar.classList.toggle('open');sidebarBackdrop.classList.toggle('hidden',!open)});
sidebarBackdrop.addEventListener('click',closeMenu);

loadData();
