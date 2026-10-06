const ROOT_SELECTOR='#content';
const PRIMARY_MARKETING_VIEWS=['templates','campaigns','audiences','consents'];
const PRIMARY_MARKETING_LABELS={templates:'Templates',campaigns:'Campanhas',audiences:'Públicos',consents:'Consentimentos'};
const ADVANCED_FILTERS=['brand','category','product_ids','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value'];
const META_STATUS_LABELS={APPROVED:'Aprovado',PENDING:'Em análise',REJECTED:'Rejeitado',IN_APPEAL:'Em recurso',FLAGGED:'Atenção',DISABLED:'Desativado',PENDING_DELETION:'Excluindo',PAUSED:'Pausado',UNKNOWN:'Não informado'};
let scheduled=false;
let defaultOpening=false;
let templateModulePromise=null;
let audienceModulePromise=null;
let campaignModulePromise=null;
let templateSimpleModulePromise=null;

const text=value=>String(value?.textContent||'').trim();

function marketingRoot(){
  const root=document.querySelector(ROOT_SELECTOR);
  if(!root)return null;
  const title=text(root.querySelector('.page-head h1'));
  const hasMarketingUi=Boolean(root.querySelector('[data-marketing-subnav],.marketing-template-center,.marketing-audience-center,.marketing-campaign-center,.marketing-strategy-center,.marketing-grid'));
  return title==='Marketing'||hasMarketingUi?root:null;
}

function setText(node,value){if(node&&text(node)!==value)node.textContent=value}

function activeView(root){
  if(root.querySelector('.marketing-template-center'))return 'templates';
  if(root.querySelector('.marketing-campaign-center'))return 'campaigns';
  if(root.querySelector('.marketing-audience-center'))return root.querySelector('[data-consent-search],[data-consent-detail]')?'consents':'audiences';
  const explicit=root.querySelector('[data-marketing-subnav] [data-marketing-view].active')?.dataset?.marketingView;
  return PRIMARY_MARKETING_VIEWS.includes(String(explicit||''))?String(explicit):'templates';
}

function loadTemplateModule(){
  if(window.DAMarketingTemplateCenter?.mountTemplateView)return Promise.resolve(window.DAMarketingTemplateCenter);
  if(!templateModulePromise)templateModulePromise=import('/vitrine/admin/marketing/template-center.js?v=marketing-template-v1');
  return templateModulePromise;
}

function loadAudienceModule(){
  if(window.DAMarketingAudienceCenter?.mountAudienceView)return Promise.resolve(window.DAMarketingAudienceCenter);
  if(!audienceModulePromise)audienceModulePromise=import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1');
  return audienceModulePromise;
}

function loadCampaignModule(){
  if(window.DAMarketingCampaignEntry?.openCampaigns)return Promise.resolve(window.DAMarketingCampaignEntry);
  if(!campaignModulePromise)campaignModulePromise=import('/vitrine/admin/marketing/campaign-entry.js?v=marketing-campaign-v1');
  return campaignModulePromise;
}

function loadTemplateSimpleModule(){
  if(window.DAMarketingTemplateSimple?.enhanceTemplateCenter)return Promise.resolve(window.DAMarketingTemplateSimple);
  if(!templateSimpleModulePromise)templateSimpleModulePromise=import('/vitrine/admin/marketing/template-type-picker.js?v=marketing-template-simple-v1');
  return templateSimpleModulePromise;
}

function setActiveNav(root,view){
  root.querySelectorAll('[data-marketing-subnav] [data-marketing-view]').forEach(button=>{
    const active=button.dataset.marketingView===view;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
}

async function openMarketingView(root,view,{create=false}={}){
  if(!PRIMARY_MARKETING_VIEWS.includes(view))view='templates';
  setActiveNav(root,view);
  try{
    if(view==='templates'){
      const module=await loadTemplateModule();
      await module?.mountTemplateView?.(root);
      if(create)queueMicrotask(()=>root.querySelector('[data-template-create]')?.click());
      return;
    }
    if(view==='campaigns'){
      const module=await loadCampaignModule();
      return module?.openCampaigns?.();
    }
    const module=await loadAudienceModule();
    if(view==='consents')return module?.mountConsentView?.(root);
    return module?.mountAudienceView?.(root);
  }catch(error){
    console.warn('marketing-view-load',String(error?.message||error).slice(0,160));
  }
}

function bindNav(root,nav){
  if(nav.dataset.marketingSimpleBound==='1')return;
  nav.dataset.marketingSimpleBound='1';
  nav.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-marketing-view]');
    if(!button||!nav.contains(button))return;
    const view=String(button.dataset.marketingView||'');
    if(!PRIMARY_MARKETING_VIEWS.includes(view))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMarketingView(root,view);
  },true);
}

function ensurePrimaryViewButtons(root,nav){
  const gate=nav.querySelector('.marketing-campaign-gate');
  for(const view of PRIMARY_MARKETING_VIEWS){
    if(nav.querySelector(`[data-marketing-view="${view}"]`))continue;
    const button=document.createElement('button');
    button.type='button';
    button.dataset.marketingView=view;
    button.textContent=PRIMARY_MARKETING_LABELS[view];
    nav.insertBefore(button,gate||null);
  }
}

function polishNav(root){
  const nav=root.querySelector('[data-marketing-subnav]');
  if(!nav)return;
  nav.querySelectorAll('details').forEach(details=>details.remove());
  ensurePrimaryViewButtons(root,nav);
  const view=activeView(root);
  nav.querySelectorAll('[data-marketing-view]').forEach(button=>{
    const key=String(button.dataset.marketingView||'');
    if(!PRIMARY_MARKETING_VIEWS.includes(key)){button.remove();return}
    setText(button,PRIMARY_MARKETING_LABELS[key]);
    const active=key===view;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  const gate=nav.querySelector('.marketing-campaign-gate');
  const buttons=PRIMARY_MARKETING_VIEWS.map(key=>nav.querySelector(`[data-marketing-view="${key}"]`)).filter(Boolean);
  const anchor=gate||null;
  const children=[...nav.children];
  const anchorIndex=anchor?children.indexOf(anchor):children.length;
  const startIndex=anchorIndex-buttons.length;
  const navAlreadyOrdered=startIndex>=0&&buttons.every((button,index)=>children[startIndex+index]===button);
  if(!navAlreadyOrdered){
    for(const button of buttons)nav.insertBefore(button,anchor);
  }
  setText(gate,'Envios desativados');
  bindNav(root,nav);
}

function ensureMarketingNav(root){
  let nav=root.querySelector('[data-marketing-subnav]');
  if(nav){polishNav(root);return nav}
  const head=root.querySelector('.page-head');
  if(!head)return null;
  nav=document.createElement('div');
  nav.className='marketing-template-subnav';
  nav.dataset.marketingSubnav='1';
  nav.innerHTML=PRIMARY_MARKETING_VIEWS.map(view=>`<button type="button" class="${view==='templates'?'active':''}" data-marketing-view="${view}">${PRIMARY_MARKETING_LABELS[view]}</button>`).join('')+'<span class="marketing-campaign-gate">Envios desativados</span>';
  head.insertAdjacentElement('afterend',nav);
  polishNav(root);
  return nav;
}

function removeDuplicateMarketingHeads(root){
  const heads=[...root.querySelectorAll('.page-head')].filter(head=>text(head.querySelector('h1'))==='Marketing');
  heads.slice(1).forEach(head=>head.remove());
}

function removeDuplicateGateBadges(root){
  const gates=[...root.querySelectorAll('.marketing-campaign-gate')];
  if(gates.length<2)return;
  const primary=root.querySelector('[data-marketing-subnav] .marketing-campaign-gate')||gates[0];
  gates.forEach(gate=>{if(gate!==primary)gate.remove()});
}

function metaStatusLabel(value){
  const key=String(value||'UNKNOWN').trim().toUpperCase();
  return META_STATUS_LABELS[key]||'Não informado';
}

function polishTemplates(root){
  const center=root.querySelector('.marketing-template-center');
  if(!center)return;
  const head=center.querySelector('.marketing-template-head');
  setText(head?.querySelector('h2'),'Templates de mensagem');
  setText(head?.querySelector('p'),'Crie, edite e acompanhe seus modelos do WhatsApp.');
  head?.querySelector('.marketing-template-head-actions')?.classList.add('marketing-pro-toolbar');
  const sync=center.querySelector('[data-template-sync]');
  if(sync&&(!sync.dataset.syncState||sync.dataset.syncState==='idle'))setText(sync,'Sincronizar com Meta');
  center.querySelectorAll('[data-template-detail]').forEach(button=>setText(button,'Ver'));
  center.querySelectorAll('.marketing-template-pill').forEach(pill=>{
    const raw=String(pill.dataset.metaStatus||text(pill)||'UNKNOWN').trim().toUpperCase();
    if(!pill.dataset.metaStatus)pill.dataset.metaStatus=raw;
    setText(pill,metaStatusLabel(raw));
  });
  const status=center.querySelector('[data-template-center-status]');
  if(status&&text(status).startsWith('Carregando templates'))setText(status,'Carregando modelos…');
  loadTemplateSimpleModule().then(module=>module.enhanceTemplateCenter(root)).catch(error=>console.warn('marketing-template-simple-load',String(error?.message||error).slice(0,160)));
}

function groupAdvancedAudienceFilters(form){
  if(!form||form.querySelector('[data-marketing-pro-advanced]'))return;
  const nodes=[];
  for(const name of ADVANCED_FILTERS){
    const field=form.querySelector(`[name="${name}"]`);
    const label=field?.closest('label');
    if(label&&!nodes.includes(label))nodes.push(label);
  }
  if(!nodes.length)return;
  const details=document.createElement('details');
  details.className='marketing-pro-advanced';
  details.dataset.marketingProAdvanced='1';
  details.innerHTML='<summary>Mais filtros</summary><div class="marketing-pro-advanced-body"></div>';
  const body=details.querySelector('.marketing-pro-advanced-body');
  nodes.forEach(node=>body.appendChild(node));
  const actions=form.querySelector('.marketing-audience-form-actions');
  if(actions)form.insertBefore(details,actions);else form.appendChild(details);
}

function polishAudience(root){
  const center=root.querySelector('.marketing-audience-center');
  if(!center)return;
  const isConsentView=Boolean(center.querySelector('[data-consent-search],[data-consent-detail]'));
  const head=center.querySelector('.page-head');
  if(!isConsentView){
    setText(head?.querySelector('p'),'Crie segmentos de clientes usando localização, compras, marcas e etiquetas.');
    const section=center.querySelector('.marketing-audience-section-head');
    setText(section?.querySelector('h2'),'Públicos');
    setText(section?.querySelector('p'),'Escolha quem entra no público. Detalhes técnicos ficam separados do trabalho comercial.');
    const form=center.querySelector('[data-audience-form]');
    groupAdvancedAudienceFilters(form);
    setText(form?.querySelector('[data-calculate-audience]'),'Atualizar público');
    setText(form?.querySelector('[data-clear-filters]'),'Limpar');
    setText(form?.querySelector('[data-create-campaign-from-audience]'),'Criar campanha');
  }else{
    setText(head?.querySelector('p'),'Histórico de autorização para mensagens de marketing.');
    const section=center.querySelector('.marketing-audience-section-head');
    setText(section?.querySelector('h2'),'Consentimentos');
    setText(section?.querySelector('p'),'Consulte o estado atual e o histórico de cada cliente.');
  }
}

function replaceLabel(root,from,to){
  root.querySelectorAll('label>span').forEach(node=>{if(text(node)===from)setText(node,to)});
}

function polishCampaigns(root){
  const center=root.querySelector('.marketing-campaign-center');
  if(!center)return;
  const head=center.querySelector('.page-head');
  setText(head?.querySelector('p'),'Crie, revise e acompanhe campanhas do WhatsApp.');
  center.querySelectorAll('.marketing-campaign-card').forEach(card=>card.classList.add('marketing-pro-campaign-row'));
  const editor=center.querySelector('[data-campaign-editor]');
  if(!editor)return;
  editor.querySelectorAll('h4').forEach(node=>{if(text(node)==='Deep link')setText(node,'Destino do botão')});
  replaceLabel(editor,'Campanha/slug','Campanha');
  replaceLabel(editor,'Valor histórico mín.','Valor mínimo comprado');
  replaceLabel(editor,'Valor histórico máx.','Valor máximo comprado');
  replaceLabel(editor,'Sem comprar há X dias','Sem comprar há pelo menos');
  setText(editor.querySelector('[data-campaign-save]'),'Salvar');
  setText(editor.querySelector('[data-campaign-snapshot-button]'),'Congelar público');
  setText(editor.querySelector('[data-campaign-ready]'),'Enviar para revisão');
  setText(editor.querySelector('[data-campaign-return-draft]'),'Voltar ao rascunho');
  setText(editor.querySelector('[data-campaign-approve]'),'Aprovar');
  setText(editor.querySelector('[data-campaign-internal-test]'),'Preparar teste');
  setText(editor.querySelector('.marketing-campaign-safety'),'Envios desativados. Revise a campanha e o público antes de liberar a execução.');
}

function maybeOpenDefaultTemplates(root){
  if(defaultOpening)return;
  if(root.querySelector('.marketing-template-center,.marketing-audience-center,.marketing-campaign-center'))return;
  defaultOpening=true;
  Promise.resolve(openMarketingView(root,'templates')).finally(()=>{defaultOpening=false});
}

function polishShared(root){
  root.classList.add('marketing-pro-shell');
  removeDuplicateMarketingHeads(root);
  ensureMarketingNav(root);
  removeDuplicateGateBadges(root);
  polishNav(root);
  polishTemplates(root);
  polishAudience(root);
  polishCampaigns(root);
  maybeOpenDefaultTemplates(root);
}

function apply(){
  scheduled=false;
  const root=marketingRoot();
  if(root)polishShared(root);
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(apply);
}

const observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
schedule();

window.DAMarketingPolish={apply,openMarketingView};
export {apply,openMarketingView};
