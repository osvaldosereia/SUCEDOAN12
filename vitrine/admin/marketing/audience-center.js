import {attendanceAuthorizedFetch,attendanceJsonApi} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const AUDIENCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-audiences-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const CSS_URL='/vitrine/admin/marketing/audience-center.css?v=marketing-audience-v1';
const reasonLabels={
  no_consent:'Sem consentimento',
  opted_out:'Pediu para não receber',
  inactive_customer:'Cliente inativo',
  invalid_phone:'Telefone inválido',
  duplicate_phone:'Telefone duplicado'
};
const stateLabels={opt_in:'Consentiu',opt_out:'Revogou',never_consented:'Nunca consentiu'};
let labelsCache=null;
let overviewCache=null;
let audienceBusy=false;
let consentBusy=false;
let activeRoot=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmtDate=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const csv=value=>String(value||'').split(/[\s,;]+/).map(item=>item.trim()).filter(Boolean);

function ensureCss(){
  if(document.querySelector('link[data-da-marketing-audience-center]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=CSS_URL;
  link.dataset.daMarketingAudienceCenter='1';
  document.head.appendChild(link);
}

function navMarkup(active){
  const item=(key,label)=>`<button type="button" class="${key===active?'active':''}" data-marketing-view="${key}">${label}</button>`;
  return `<div class="marketing-template-subnav marketing-audience-nav" data-marketing-subnav>
    ${item('overview','Visão geral')}${item('templates','Templates Meta')}${item('audiences','Públicos')}${item('consents','Consentimentos')}
    <span class="marketing-campaign-gate">Campanhas desligadas</span>
  </div>`;
}

function bindNav(root){
  root.querySelector('[data-marketing-view="overview"]')?.addEventListener('click',()=>document.querySelector('[data-tab="marketing"]')?.click());
  root.querySelector('[data-marketing-view="templates"]')?.addEventListener('click',()=>window.DAMarketingTemplateCenter?.mountTemplateView?.(root));
  root.querySelector('[data-marketing-view="audiences"]')?.addEventListener('click',()=>mountAudienceView(root));
  root.querySelector('[data-marketing-view="consents"]')?.addEventListener('click',()=>mountConsentView(root));
}

async function apiGet(action,params={}){
  const url=new URL(AUDIENCE_API);
  url.searchParams.set('action',action);
  for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`marketing_${response.status}`);error.payload=data;throw error}
  return data;
}

async function adminPost(action,body){
  const url=new URL(AUDIENCE_API);url.searchParams.set('action',action);
  const response=await attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`marketing_${response.status}`);error.payload=data;throw error}
  return data;
}

async function loadOverview(force=false){
  if(overviewCache&&!force)return overviewCache;
  overviewCache=await apiGet('overview');
  return overviewCache;
}

async function loadLabels(){
  if(labelsCache)return labelsCache;
  const data=await attendanceJsonApi('labels',{},'GET');
  labelsCache=Array.isArray(data?.items)?data.items.filter(item=>item?.is_active!==false):[];
  return labelsCache;
}

function consentOverviewCards(data){
  const counts=data?.counts||{};
  return `<div class="marketing-audience-kpis">
    <article><small>Total de clientes</small><strong>${Number(counts.total||0)}</strong></article>
    <article class="good"><small>Com consentimento</small><strong>${Number(counts.opt_in||0)}</strong></article>
    <article class="warn"><small>Revogaram</small><strong>${Number(counts.opt_out||0)}</strong></article>
    <article><small>Nunca consentiram</small><strong>${Number(counts.never_consented||0)}</strong></article>
  </div>`;
}

function audienceOverviewCards(data){
  const counts=data?.counts||{};
  return `<div class="marketing-audience-base-card">
    <div><small>Base disponível para segmentação</small><strong>${Number(counts.total||0)}</strong><span>clientes cadastrados</span></div>
    <p>Use os filtros comerciais normalmente. <span>Autorização WhatsApp confirmada: <b>${Number(counts.opt_in||0)}</b></span></p>
  </div>`;
}

function audienceForm(labels){
  const labelOptions=labels.map(label=>`<option value="${esc(label.id)}">${esc(label.name)}</option>`).join('');
  return `<form class="marketing-audience-filters" data-audience-form>
    <label class="wide"><span>Cliente</span><input name="search" placeholder="Nome ou telefone"></label>
    <label><span>Cidade</span><input name="city" placeholder="Ex.: Cuiabá"></label>
    <label><span>Bairro</span><input name="neighborhood" placeholder="Bairro"></label>
    <label><span>Etiquetas do Atendimento</span><select name="label_ids" multiple size="4">${labelOptions}</select></label>
    <label class="wide"><span>Produtos específicos</span><input name="product_ids" placeholder="IDs dos produtos separados por vírgula (opcional)"><small>Use este filtro avançado quando já souber os produtos; marca e categoria abaixo são mais rápidas no dia a dia.</small></label>
    <label><span>Marca comprada</span><input name="brand" placeholder="Marca"></label>
    <label><span>Categoria comprada</span><input name="category" placeholder="Categoria"></label>
    <label><span>Comprou depois de</span><input type="date" name="last_purchase_after"></label>
    <label><span>Comprou antes de</span><input type="date" name="last_purchase_before"></label>
    <label><span>Sem comprar há pelo menos</span><div class="marketing-audience-number"><input type="number" min="0" name="inactive_days" placeholder="30"><em>dias</em></div></label>
    <label><span>Mín. de compras</span><input type="number" min="0" name="min_order_count"></label>
    <label><span>Máx. de compras</span><input type="number" min="0" name="max_order_count"></label>
    <label><span>Valor histórico mín.</span><input type="number" min="0" step="0.01" name="min_lifetime_value"></label>
    <label><span>Valor histórico máx.</span><input type="number" min="0" step="0.01" name="max_lifetime_value"></label>
    <div class="marketing-audience-form-actions wide">
      <button type="button" class="secondary" data-clear-filters>Limpar filtros</button>
      <button type="submit" class="primary" data-calculate-audience aria-busy="false">Calcular público</button>
    </div>
  </form>`;
}

function collectFilters(form){
  const filters={};
  const textNames=['search','city','neighborhood','brand','category','last_purchase_after','last_purchase_before'];
  for(const name of textNames){const value=String(form.elements[name]?.value||'').trim();if(value)filters[name]=value}
  const numericNames=['inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value'];
  for(const name of numericNames){const raw=String(form.elements[name]?.value||'').trim();if(raw!=='')filters[name]=Number(raw)}
  const labels=[...form.querySelectorAll('select[name="label_ids"] option:checked')].map(option=>option.value).filter(Boolean);
  if(labels.length)filters.label_ids=labels;
  const products=csv(form.elements.product_ids?.value);
  if(products.length)filters.product_ids=products;
  return filters;
}

function renderAudienceResult(root,data){
  const panel=root.querySelector('[data-audience-result]');if(!panel)return;
  const reasonEntries=Object.entries(data?.exclusion_reasons||{}).filter(([,count])=>Number(count)>0);
  const items=Array.isArray(data?.items)?data.items:[];
  panel.innerHTML=`<div class="marketing-audience-result-head">
    <article class="marketing-audience-segment-total"><small>Clientes no público</small><strong>${Number(data?.found_count||0)}</strong><span>Resultado dos filtros comerciais aplicados.</span></article>
    <details class="marketing-audience-send-checks">
      <summary>Verificações técnicas de envio</summary>
      <div class="marketing-audience-send-checks-body">
        <span>Aptos pelas regras atuais <b>${Number(data?.eligible_count||0)}</b></span>
        <span>Com alguma pendência <b>${Number(data?.excluded_count||0)}</b></span>
        ${reasonEntries.map(([reason,count])=>`<span>${esc(reasonLabels[reason]||reason)} <b>${Number(count)}</b></span>`).join('')}
      </div>
      <p>Estas verificações são mantidas para a futura etapa de envio e não impedem montar, analisar ou salvar o público comercial.</p>
    </details>
  </div>
  <div class="marketing-audience-table-wrap"><table class="marketing-audience-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>Local</th><th>Compras</th><th>Última compra</th></tr></thead><tbody>
    ${items.length?items.map(item=>`<tr><td><strong>${esc(item.name||'Cliente')}</strong></td><td>${esc(item.masked_phone||'—')}</td><td>${esc([item.city,item.neighborhood].filter(Boolean).join(' · ')||'—')}</td><td>${Number(item.order_count||0)}<small>${money(item.lifetime_value)}</small></td><td>${esc(fmtDate(item.last_purchase_at))}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Nenhum cliente encontrado com estes filtros.</td></tr>'}
  </tbody></table></div>
  <p class="marketing-audience-note">As verificações de envio são aplicadas depois, na campanha. Aqui o foco é montar e analisar o público.</p>`;
}

function setButtonBusy(button,busy,label){
  if(!button)return;
  button.disabled=busy;
  button.setAttribute('aria-busy',busy?'true':'false');
  if(busy){button.dataset.idleLabel=button.dataset.idleLabel||button.textContent;button.textContent=label}
  else if(button.dataset.idleLabel){button.textContent=button.dataset.idleLabel}
}

async function mountAudienceView(root=document.querySelector('#content')){
  if(!root)return;
  ensureCss();activeRoot=root;
  root.innerHTML=`<div class="marketing-audience-center">
    <div class="page-head"><div><h1>Marketing</h1><p>Monte públicos comerciais usando toda a sua base de clientes.</p></div><span class="marketing-campaign-gate">Campanhas desligadas</span></div>
    ${navMarkup('audiences')}
    <section class="marketing-audience-section"><div class="marketing-audience-section-head"><div><h2>Públicos</h2><p>Filtre por perfil de compra, localização e atendimento. As verificações de envio são aplicadas depois, na campanha.</p></div></div>
      <div data-audience-overview class="marketing-audience-loading">Carregando visão geral…</div>
      <div data-audience-form-host></div>
      <div data-audience-status class="marketing-audience-status" role="status" aria-live="polite"></div>
      <div data-audience-result></div>
    </section>
  </div>`;
  bindNav(root);
  try{
    const [overview,labels]=await Promise.all([loadOverview(),loadLabels()]);
    if(activeRoot!==root)return;
    root.querySelector('[data-audience-overview]').innerHTML=audienceOverviewCards(overview);
    root.querySelector('[data-audience-form-host]').innerHTML=audienceForm(labels);
    const form=root.querySelector('[data-audience-form]');
    form.querySelector('[data-clear-filters]')?.addEventListener('click',()=>{form.reset();root.querySelector('[data-audience-result]').innerHTML='';root.querySelector('[data-audience-status]').textContent='Filtros limpos.'});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(audienceBusy)return;
      const button=form.querySelector('[data-calculate-audience]'),status=root.querySelector('[data-audience-status]');
      try{
        audienceBusy=true;setButtonBusy(button,true,'Calculando…');status.textContent='Calculando público no servidor…';
        const data=await adminPost('preview',{filters:collectFilters(form),limit:50,offset:0});
        if(activeRoot!==root)return;
        renderAudienceResult(root,data);status.textContent=`Cálculo concluído: ${Number(data.found_count||0)} cliente(s) encontrado(s).`;
      }catch(error){if(activeRoot===root)status.textContent=`Não foi possível calcular o público: ${String(error?.message||error)}`}
      finally{audienceBusy=false;if(activeRoot===root)setButtonBusy(button,false,'')}
    });
  }catch(error){if(activeRoot===root)root.querySelector('[data-audience-overview]').innerHTML=`<div class="marketing-audience-error">Não foi possível carregar: ${esc(error?.message||error)}</div>`}
}

function consentSearchMarkup(){
  return `<div class="marketing-consent-search"><label><span>Localizar cliente</span><input data-consent-search placeholder="Nome ou telefone"></label><button type="button" data-consent-search-button aria-busy="false">Buscar</button></div><div data-consent-search-status class="marketing-audience-status" role="status"></div><div data-consent-search-results></div>`;
}

function renderConsentSearchResults(root,data){
  const host=root.querySelector('[data-consent-search-results]');if(!host)return;
  const items=Array.isArray(data?.items)?data.items:[];
  host.innerHTML=items.length?`<div class="marketing-consent-cards">${items.map(item=>`<button type="button" class="marketing-consent-card" data-customer-id="${esc(item.customer_id)}"><span><strong>${esc(item.name||'Cliente')}</strong><small>${esc(item.masked_phone||'—')}</small></span><span class="marketing-audience-pill ${item.consent_state==='opt_in'?'good':item.consent_state==='opt_out'?'bad':'neutral'}">${esc(stateLabels[item.consent_state]||item.consent_state||'—')}</span></button>`).join('')}</div>`:'<div class="marketing-audience-empty">Nenhum cliente encontrado.</div>';
  host.querySelectorAll('[data-customer-id]').forEach(button=>button.addEventListener('click',()=>loadConsentDetail(root,button.dataset.customerId)));
}

function consentDialogMarkup(mode,customer){
  if(mode==='opt_in')return `<form data-consent-form data-mode="opt_in"><p>Registre somente quando houver evidência clara de que o cliente autorizou ofertas da Dona Antônia pelo WhatsApp.</p><label><span>Versão do texto de consentimento</span><input name="consent_text_version" required placeholder="ex.: checkout-ofertas-v1"></label><label><span>Texto apresentado/aceito</span><textarea name="consent_text_snapshot" required rows="5" placeholder="Copie o texto que o cliente viu e aceitou."></textarea></label><div class="marketing-consent-dialog-actions"><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary" aria-busy="false">Registrar consentimento</button></div></form>`;
  return `<form data-consent-form data-mode="opt_out"><p>O bloqueio passa a valer para públicos futuros assim que for registrado.</p><label><span>Motivo</span><select name="reason_code" required><option value="">Selecione</option><option value="customer_request">Pedido do cliente</option><option value="admin_correction">Correção de cadastro</option><option value="preference_update">Atualização de preferência</option></select></label><label><span>Observação (opcional)</span><textarea name="note" rows="3"></textarea></label><div class="marketing-consent-dialog-actions"><button type="button" data-cancel>Cancelar</button><button type="submit" class="danger" aria-busy="false">Registrar revogação</button></div></form>`;
}

function openConsentDialog(root,mode,customer){
  const dialog=document.createElement('dialog');dialog.className='marketing-consent-dialog';
  dialog.innerHTML=`<div class="marketing-consent-dialog-head"><strong>${mode==='opt_in'?'Registrar consentimento':'Registrar revogação'} · ${esc(customer?.name||'Cliente')}</strong><button type="button" data-close aria-label="Fechar">×</button></div><div class="marketing-consent-dialog-body">${consentDialogMarkup(mode,customer)}</div>`;
  document.body.appendChild(dialog);dialog.showModal();
  const close=()=>{dialog.close();dialog.remove()};dialog.querySelector('[data-close]')?.addEventListener('click',close);dialog.querySelector('[data-cancel]')?.addEventListener('click',close);
  const form=dialog.querySelector('[data-consent-form]');
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(consentBusy)return;
    const button=form.querySelector('button[type="submit"]');
    const confirmed=confirm(mode==='opt_in'?'Confirmar que existe evidência válida deste consentimento?':'Confirmar a revogação das ofertas para este cliente?');
    if(!confirmed)return;
    try{
      consentBusy=true;setButtonBusy(button,true,'Salvando…');
      const body={customer_id:customer.id,decision:mode,source_ref:'marketing_admin_ui',metadata:{}};
      if(mode==='opt_in'){
        body.consent_text_version=String(form.elements.consent_text_version.value||'').trim();
        body.consent_text_snapshot=String(form.elements.consent_text_snapshot.value||'').trim();
      }else{
        body.metadata.reason_code=String(form.elements.reason_code.value||'').trim();
        const note=String(form.elements.note.value||'').trim();if(note)body.metadata.note=note;
      }
      await adminPost('record_consent',body);
      close();overviewCache=null;await loadConsentDetail(root,customer.id,true);
    }catch(error){alert(`Não foi possível registrar: ${String(error?.message||error)}`)}
    finally{consentBusy=false;if(document.body.contains(button))setButtonBusy(button,false,'')}
  });
}

async function loadConsentDetail(root,customerId,force=false){
  const host=root.querySelector('[data-consent-detail]');if(!host)return;
  host.innerHTML='<div class="marketing-audience-loading">Carregando histórico…</div>';
  try{
    const data=await apiGet('consent_history',{customer_id:customerId});if(activeRoot!==root)return;
    const customer=data.customer||{},items=Array.isArray(data.items)?data.items:[];
    host.innerHTML=`<section class="marketing-consent-detail"><div class="marketing-consent-detail-head"><div><h3>${esc(customer.name||'Cliente')}</h3><p>${esc(customer.phone_e164||'—')}</p></div><span class="marketing-audience-pill ${customer.consent_state==='opt_in'?'good':customer.consent_state==='opt_out'?'bad':'neutral'}">${esc(stateLabels[customer.consent_state]||customer.consent_state||'—')}</span></div>
      <div class="marketing-consent-meta"><span><small>Estado atual</small><strong>${esc(stateLabels[customer.consent_state]||'—')}</strong></span><span><small>Última atualização</small><strong>${esc(fmtDate(customer.marketing_consent_updated_at))}</strong></span></div>
      <div class="marketing-consent-actions"><button type="button" data-record-opt-in>Registrar consentimento</button><button type="button" class="danger" data-record-opt-out>Registrar revogação</button></div>
      <h4>Histórico</h4><div class="marketing-consent-history">${items.length?items.map(item=>`<article><span class="marketing-audience-pill ${item.decision==='opt_in'?'good':'bad'}">${item.decision==='opt_in'?'Consentiu':'Revogou'}</span><div><strong>${esc(item.source||'—')}</strong><small>${esc(fmtDate(item.occurred_at))}${item.consent_text_version?` · ${esc(item.consent_text_version)}`:''}</small>${item.metadata?.reason_code?`<em>Motivo: ${esc(item.metadata.reason_code)}</em>`:''}</div></article>`).join(''):'<div class="marketing-audience-empty">Ainda não há evento histórico registrado.</div>'}</div>
    </section>`;
    const model={id:customerId,...customer};
    host.querySelector('[data-record-opt-in]')?.addEventListener('click',()=>openConsentDialog(root,'opt_in',model));
    host.querySelector('[data-record-opt-out]')?.addEventListener('click',()=>openConsentDialog(root,'opt_out',model));
  }catch(error){if(activeRoot===root)host.innerHTML=`<div class="marketing-audience-error">Não foi possível carregar o histórico: ${esc(error?.message||error)}</div>`}
}

async function mountConsentView(root=document.querySelector('#content')){
  if(!root)return;
  ensureCss();activeRoot=root;
  root.innerHTML=`<div class="marketing-audience-center">
    <div class="page-head"><div><h1>Marketing</h1><p>Consentimentos auditáveis e preferências de contato.</p></div><span class="marketing-campaign-gate">Campanhas desligadas</span></div>
    ${navMarkup('consents')}
    <section class="marketing-audience-section"><div class="marketing-audience-section-head"><div><h2>Consentimentos</h2><p>Consulte o estado atual e o histórico antes de qualquer uso comercial.</p></div></div>
      <div data-consent-overview class="marketing-audience-loading">Carregando visão geral…</div>
      ${consentSearchMarkup()}
      <div data-consent-detail></div>
    </section>
  </div>`;
  bindNav(root);
  try{const overview=await loadOverview();if(activeRoot===root)root.querySelector('[data-consent-overview]').innerHTML=consentOverviewCards(overview)}catch(error){if(activeRoot===root)root.querySelector('[data-consent-overview]').innerHTML=`<div class="marketing-audience-error">Não foi possível carregar: ${esc(error?.message||error)}</div>`}
  const input=root.querySelector('[data-consent-search]'),button=root.querySelector('[data-consent-search-button]'),status=root.querySelector('[data-consent-search-status]');
  const search=async()=>{
    if(consentBusy)return;const query=String(input.value||'').trim();if(query.length<2){status.textContent='Digite pelo menos 2 caracteres.';return}
    try{consentBusy=true;setButtonBusy(button,true,'Carregando…');status.textContent='Buscando clientes…';const data=await adminPost('preview',{filters:{search:query},limit:20,offset:0});if(activeRoot!==root)return;renderConsentSearchResults(root,data);status.textContent=`${Number(data.found_count||0)} cliente(s) encontrado(s).`}
    catch(error){if(activeRoot===root)status.textContent=`Falha na busca: ${String(error?.message||error)}`}
    finally{consentBusy=false;if(activeRoot===root)setButtonBusy(button,false,'')}
  };
  button.addEventListener('click',search);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search()}});
}

ensureCss();
export {mountAudienceView,mountConsentView};
window.DAMarketingAudienceCenter={mountAudienceView,mountConsentView};
