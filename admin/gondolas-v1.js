import {CONFIG} from './runtime-config.js';

const app=document.getElementById('gondolaApp');
const toastRegion=document.getElementById('toastRegion');
const state={current:null,last:null,lastKind:'',lastEan:'',lastAt:0,scanTimer:null,loading:false};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const digits=value=>String(value??'').replace(/\D/g,'');

function toast(message,kind=''){
  if(!toastRegion)return;
  const node=document.createElement('div');
  node.className=`toast ${kind}`.trim();
  node.textContent=message;
  toastRegion.appendChild(node);
  setTimeout(()=>node.remove(),kind==='error'?5200:2600);
}

function labelError(code,fallback='Não foi possível concluir.'){
  const labels={
    gondola_exists:'Já existe uma gôndola com esse nome.',
    gondola_name_required:'Informe o nome da gôndola.',
    gondola_not_found:'Gôndola não encontrada.',
    gondola_inactive:'Esta gôndola está desativada.',
    gondola_inactive_or_not_found:'Esta gôndola está desativada ou não existe.',
    product_not_found:'Produto não encontrado.',
    invalid_ean:'Leia um EAN válido.'
  };
  return labels[code]||fallback||code;
}

async function api(action,payload={}){
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-gondolas-v1`,{
    method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({action,...payload}),cache:'no-store',credentials:'omit'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false){const error=new Error(labelError(data.error,data.detail));error.code=data.error||'';throw error}
  return data;
}

function loading(label='Carregando…'){if(app)app.innerHTML=`<div class="loading"><span class="spinner"></span><p>${esc(label)}</p></div>`}

function focusScan(){setTimeout(()=>{const input=app?.querySelector('[data-gondola-scan]');if(input&&!input.disabled){try{input.focus({preventScroll:true})}catch{input.focus()}}},0)}

function gondolaCard(g){
  return `<article class="gondola-card ${g.active?'':'is-inactive'}">
    <div class="gondola-card-head"><div><h3>${esc(g.gondola_code)}</h3><small>${g.active?'Ativa':'Desativada'}</small></div></div>
    <div class="gondola-actions">
      <button class="primary" type="button" data-open-gondola="${esc(g.id)}" ${g.active?'':'disabled'}>Abrir</button>
      <button class="secondary" type="button" data-rename-gondola="${esc(g.id)}" data-name="${esc(g.gondola_code)}">Renomear</button>
      <button class="secondary" type="button" data-toggle-gondola="${esc(g.id)}" data-active="${g.active?'1':'0'}">${g.active?'Desativar':'Ativar'}</button>
    </div>
  </article>`;
}

async function renderList(){
  state.current=null;state.last=null;state.lastKind='';
  loading('Carregando gôndolas…');
  try{
    const data=await api('list_gondolas');
    const rows=data.gondolas||[];
    app.innerHTML=`<div class="gondola-head"><div><h1>Gôndolas</h1><p class="muted">Crie uma gôndola, abra e leia os EANs dos produtos.</p></div><button class="primary" type="button" data-new-gondola>Nova gôndola</button></div>
      <section class="panel">${rows.length?`<div class="gondola-list">${rows.map(gondolaCard).join('')}</div>`:'<div class="gondola-empty">Nenhuma gôndola cadastrada. Clique em Nova gôndola para começar.</div>'}</section>`;
  }catch(error){app.innerHTML=`<div class="gondola-head"><div><h1>Gôndolas</h1></div></div><section class="panel empty">${esc(error.message)}</section>`}
}

function productRow(p){
  return `<div class="gondola-product" data-gondola-product="${esc(p.id)}"><div class="gondola-product-main">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy">`:'<span class="thumb-placeholder"></span>'}<div><strong>${esc(p.name||'Produto')}</strong><small>EAN ${esc(p.gtin||'—')}</small></div></div><button class="secondary" type="button" data-remove-product="${esc(p.id)}">Remover</button></div>`;
}

function lastMarkup(){
  if(!state.last)return '<div class="gondola-last"><strong>Pronto para leitura</strong><span>Passe o primeiro EAN.</span></div>';
  return `<div class="gondola-last ${esc(state.lastKind)}"><strong>${esc(state.last.title)}</strong><span>${esc(state.last.detail||'')}</span></div>`;
}

function renderCurrent(data){
  state.current=data;
  const g=data.gondola,products=data.products||[];
  app.innerHTML=`<div class="gondola-reader">
    <div class="gondola-reader-top"><div class="gondola-reader-title"><h1>${esc(g.gondola_code)}</h1><div class="gondola-count">${products.length} produto${products.length===1?'':'s'} nesta gôndola</div></div><button class="secondary" type="button" data-back-gondolas>Voltar às gôndolas</button></div>
    <section class="panel gondola-scan-panel"><label class="field"><span>Leitura rápida de EAN</span><input class="gondola-scan-input" data-gondola-scan inputmode="numeric" autocomplete="off" placeholder="Leia o código de barras" ${g.active?'':'disabled'}></label>${lastMarkup()}</section>
    <section class="panel"><h2>Produtos desta gôndola</h2><div class="gondola-products">${products.length?products.map(productRow).join(''):'<div class="gondola-empty">Nenhum produto vinculado ainda.</div>'}</div></section>
  </div>`;
  focusScan();
}

async function openGondola(id){
  loading('Abrindo gôndola…');
  try{const data=await api('get_gondola',{id});state.last=null;state.lastKind='';renderCurrent(data)}catch(error){toast(error.message,'error');await renderList()}
}

async function refreshCurrent(){
  if(!state.current?.gondola?.id)return;
  try{const data=await api('get_gondola',{id:state.current.gondola.id});renderCurrent(data)}catch(error){toast(error.message,'error')}
}

async function captureEan(raw){
  const input=app?.querySelector('[data-gondola-scan]');
  const ean=digits(raw);
  if(input)input.value='';
  clearTimeout(state.scanTimer);
  if(!ean){focusScan();return}
  const now=Date.now();
  if(ean===state.lastEan&&now-state.lastAt<300){focusScan();return}
  state.lastEan=ean;state.lastAt=now;
  if(!state.current?.gondola?.id){focusScan();return}
  try{
    const data=await api('scan_ean',{gondola_id:state.current.gondola.id,ean});
    const name=data.product?.name||`EAN ${ean}`;
    if(data.status==='already'){
      state.lastKind='warn';state.last={title:`${name} já está nesta gôndola`,detail:`EAN ${ean}`};
    }else if(data.status==='moved'){
      state.lastKind='ok';state.last={title:`${name} movido para ${data.gondola.gondola_code}`,detail:`Antes: ${data.previous_gondola||'sem gôndola'} · EAN ${ean}`};
    }else{
      state.lastKind='ok';state.last={title:`${name} → ${data.gondola.gondola_code}`,detail:`EAN ${ean}`};
    }
    await refreshCurrent();
  }catch(error){
    state.lastKind='error';state.last={title:error.code==='product_not_found'?'Produto não encontrado':error.message,detail:`EAN ${ean}`};
    const card=app?.querySelector('.gondola-last');if(card)card.outerHTML=lastMarkup();
    focusScan();
  }
}

app?.addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.matches('[data-new-gondola]')){
    const name=prompt('Nome da nova gôndola:','Gôndola ');if(!name?.trim())return;
    try{const data=await api('create_gondola',{name:name.trim()});toast('Gôndola criada.','success');await openGondola(data.gondola.id)}catch(error){toast(error.message,'error')}
    return;
  }
  if(target.matches('[data-open-gondola]')){await openGondola(target.dataset.openGondola);return}
  if(target.matches('[data-back-gondolas]')){await renderList();return}
  if(target.matches('[data-rename-gondola]')){
    const current=target.dataset.name||'';const name=prompt('Novo nome da gôndola:',current);if(!name?.trim()||name.trim()===current)return;
    try{await api('rename_gondola',{id:target.dataset.renameGondola,name:name.trim()});toast('Gôndola renomeada.','success');await renderList()}catch(error){toast(error.message,'error')}
    return;
  }
  if(target.matches('[data-toggle-gondola]')){
    const active=target.dataset.active!=='1';
    try{await api('set_gondola_active',{id:target.dataset.toggleGondola,active});toast(active?'Gôndola ativada.':'Gôndola desativada.','success');await renderList()}catch(error){toast(error.message,'error')}
    return;
  }
  if(target.matches('[data-remove-product]')){
    try{await api('remove_product',{product_id:target.dataset.removeProduct});toast('Produto removido da gôndola.','success');await refreshCurrent()}catch(error){toast(error.message,'error')}
  }
});

app?.addEventListener('keydown',event=>{
  const input=event.target.closest('[data-gondola-scan]');if(!input)return;
  if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();captureEan(input.value)}
});

app?.addEventListener('input',event=>{
  const input=event.target.closest('[data-gondola-scan]');if(!input)return;
  clearTimeout(state.scanTimer);
  if(digits(input.value).length>=8)state.scanTimer=setTimeout(()=>captureEan(input.value),70);
});

window.addEventListener('pageshow',()=>focusScan());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)focusScan()});
renderList();
