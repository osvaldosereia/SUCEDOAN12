const ROOT_SELECTOR='#content';
const PRIMARY_MARKETING_VIEWS=['overview','strategy','templates','campaigns','audiences'];
const PRIMARY_MARKETING_LABELS={overview:'Visão geral',strategy:'Estratégia',templates:'Templates',campaigns:'Campanhas',audiences:'Públicos'};
const OVERVIEW_CARDS=[
  {key:'campaigns',label:'Campanhas',description:'Crie, agende e acompanhe campanhas do WhatsApp.'},
  {key:'templates',label:'Templates',description:'Gerencie os modelos aprovados usados nos envios.'},
  {key:'customers',label:'Clientes',description:'Acesse a base de clientes usada nos públicos.'},
  {key:'deliveries',label:'Entregas',description:'Acompanhe os pedidos que estão em rota de entrega.'}
];
const ADVANCED_FILTERS=['brand','category','product_ids','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value'];
let scheduled=false;
let consentModulePromise=null;
let templateSimpleModulePromise=null;
let recentCampaignModulePromise=null;

const text=value=>String(value?.textContent||'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function marketingRoot(){
  const root=document.querySelector(ROOT_SELECTOR);
  if(!root)return null;
  const title=text(root.querySelector('.page-head h1'));
  const hasMarketingUi=Boolean(root.querySelector('[data-marketing-subnav],.marketing-strategy-center,.marketing-template-center,.marketing-audience-center,.marketing-campaign-center,.marketing-grid'));
  return title==='Marketing'||hasMarketingUi?root:null;
}

function setText(node,value){if(node&&text(node)!==value)node.textContent=value}

function activeView(root){
  return root.querySelector('[data-marketing-subnav] [data-marketing-view].active')?.dataset?.marketingView||'overview';
}

function loadConsentModule(){
  if(window.DAMarketingAudienceCenter?.mountConsentView)return Promise.resolve(window.DAMarketingAudienceCenter);
  if(!consentModulePromise)consentModulePromise=import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1');
  return consentModulePromise;
}

function loadTemplateSimpleModule(){
  if(window.DAMarketingTemplateSimple?.enhanceTemplateCenter)return Promise.resolve(window.DAMarketingTemplateSimple);
  if(!templateSimpleModulePromise)templateSimpleModulePromise=import('/vitrine/admin/marketing/template-type-picker.js?v=marketing-template-simple-v1');
  return templateSimpleModulePromise;
}

function loadRecentCampaignModule(){
  if(window.DAMarketingCampaignListSimple?.loadRecentCampaigns)return Promise.resolve(window.DAMarketingCampaignListSimple);
  if(!recentCampaignModulePromise)recentCampaignModulePromise=import('/vitrine/admin/marketing/campaign-list-simple.js?v=marketing-campaign-list-v1');
  return recentCampaignModulePromise;
}

function ensureAdminConsentsAction(root,nav){
  let more=nav.querySelector('[data-marketing-admin-more]');
  if(!more){
    more=document.createElement('details');
    more.className='marketing-admin-more';
    more.dataset.marketingAdminMore='1';
    more.innerHTML='<summary>Mais</summary><button type="button" data-marketing-admin-consents>Consentimentos</button>';
    const gate=nav.querySelector('.marketing-campaign-gate');
    if(gate)nav.insertBefore(more,gate);else nav.appendChild(more);
    more.querySelector('[data-marketing-admin-consents]')?.addEventListener('click',async()=>{
      try{
        const module=await loadConsentModule();
        more.open=false;
        await module.mountConsentView(root);
      }catch(error){console.warn('marketing-consents-load',String(error?.message||error).slice(0,160))}
    });
  }
}

function ensurePrimaryViewButtons(root,nav){
  const gate=nav.querySelector('.marketing-campaign-gate');
  for(const view of PRIMARY_MARKETING_VIEWS){
    if(nav.querySelector(`[data-marketing-view="${view}"]`))continue;
    const button=document.createElement('button');
    button.type='button';
    button.dataset.marketingView=view;
    button.textContent=PRIMARY_MARKETING_LABELS[view];
    button.addEventListener('click',()=>openOverviewView(root,view));
    nav.insertBefore(button,gate||null);
  }
}

function polishNav(root){
  const nav=root.querySelector('[data-marketing-subnav]');
  if(!nav)return;
  ensurePrimaryViewButtons(root,nav);
  nav.querySelectorAll('[data-marketing-view]').forEach(button=>{
    const view=String(button.dataset.marketingView||'');
    if(!PRIMARY_MARKETING_VIEWS.includes(view)){button.remove();return}
    setText(button,PRIMARY_MARKETING_LABELS[view]);
    if(button.classList.contains('active'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  ensureAdminConsentsAction(root,nav);
  const gate=nav.querySelector('.marketing-campaign-gate');
  const more=nav.querySelector('[data-marketing-admin-more]');
  const buttons=PRIMARY_MARKETING_VIEWS.map(view=>nav.querySelector(`[data-marketing-view="${view}"]`)).filter(Boolean);
  const anchor=more||gate||null;
  const children=[...nav.children];
  const anchorIndex=anchor?children.indexOf(anchor):children.length;
  const startIndex=anchorIndex-buttons.length;
  const navAlreadyOrdered=startIndex>=0&&buttons.every((button,index)=>children[startIndex+index]===button);
  if(!navAlreadyOrdered){
    for(const button of buttons)nav.insertBefore(button,anchor);
  }
  setText(gate,'Envios desativados');
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

async function openOverviewView(root,view,{create=false}={}){
  try{
    if(view==='overview')return document.querySelector('[data-tab="marketing"]')?.click();
    if(view==='strategy'){
      const module=window.DAMarketingStrategyCenter||await import('/vitrine/admin/marketing/strategy-center.js?v=marketing-strategy-v1');
      return module?.mountStrategyView?.(root);
    }
    if(view==='campaigns'){
      const entry=window.DAMarketingCampaignEntry||await import('/vitrine/admin/marketing/campaign-entry.js?v=marketing-campaign-v1');
      return entry?.openCampaigns?.();
    }
    if(view==='templates'){
      const module=window.DAMarketingTemplateCenter||await import('/vitrine/admin/marketing/template-center.js?v=marketing-template-v1');
      await module?.mountTemplateView?.(root);
      if(create)queueMicrotask(()=>root.querySelector('[data-template-create]')?.click());
      return;
    }
    if(view==='audiences'){
      const module=window.DAMarketingAudienceCenter||await import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1');
      return module?.mountAudienceView?.(root);
    }
  }catch(error){console.warn('marketing-overview-open',String(error?.message||error).slice(0,160))}
}

function ensureOverviewNav(root){
  let nav=root.querySelector('[data-marketing-subnav]');
  if(nav)return nav;
  const head=root.querySelector('.page-head');
  if(!head)return null;
  nav=document.createElement('div');
  nav.className='marketing-template-subnav marketing-overview-nav';
  nav.dataset.marketingSubnav='1';
  nav.innerHTML=PRIMARY_MARKETING_VIEWS.map(view=>`<button type="button" class="${view==='overview'?'active':''}" data-marketing-view="${view}">${PRIMARY_MARKETING_LABELS[view]}</button>`).join('')+'<span class="marketing-campaign-gate">Envios desativados</span>';
  head.insertAdjacentElement('afterend',nav);
  nav.querySelectorAll('[data-marketing-view]').forEach(button=>button.addEventListener('click',()=>openOverviewView(root,button.dataset.marketingView)));
  polishNav(root);
  return nav;
}

function overviewCardMarkup(card){
  return `<button type="button" class="marketing-overview-card" data-marketing-overview-card="${card.key}"><span>${card.label}</span><small>${card.description}</small><strong>Abrir</strong></button>`;
}

function overviewDate(value){
  if(!value)return 'Sem data';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Sem data':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

async function loadOverviewRecentCampaigns(root,dashboard){
  const list=dashboard.querySelector('[data-marketing-recent-list]');
  if(!list)return;
  try{
    const module=await loadRecentCampaignModule();
    const items=await module.loadRecentCampaigns(3);
    if(!dashboard.isConnected)return;
    if(!items.length){list.innerHTML='<span class="marketing-overview-recent-empty">Nenhuma campanha criada ainda.</span>';return}
    list.innerHTML=items.map(item=>`<button type="button" class="marketing-overview-recent-item" data-overview-open-recent="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><small>${esc(overviewDate(item.date))}</small></span><em class="state-${esc(item.status)}">${esc(item.status_label)}</em></button>`).join('');
    list.querySelectorAll('[data-overview-open-recent]').forEach(button=>button.addEventListener('click',()=>openOverviewView(root,'campaigns')));
  }catch(error){
    if(dashboard.isConnected)list.innerHTML='<span class="marketing-overview-recent-empty">Não foi possível carregar as campanhas agora.</span>';
    console.warn('marketing-overview-recent',String(error?.message||error).slice(0,160));
  }
}

function bindOverviewDashboard(root,dashboard){
  const open=view=>openOverviewView(root,view);
  dashboard.querySelector('[data-overview-new-campaign]')?.addEventListener('click',()=>open('campaigns'));
  dashboard.querySelector('[data-overview-new-template]')?.addEventListener('click',()=>openOverviewView(root,'templates',{create:true}));
  dashboard.querySelector('[data-overview-recent-campaigns]')?.addEventListener('click',()=>open('campaigns'));
  dashboard.querySelector('[data-marketing-overview-card="campaigns"]')?.addEventListener('click',()=>open('campaigns'));
  dashboard.querySelector('[data-marketing-overview-card="templates"]')?.addEventListener('click',()=>open('templates'));
  dashboard.querySelector('[data-marketing-overview-card="customers"]')?.addEventListener('click',()=>document.querySelector('[data-tab="customers"]')?.click());
  dashboard.querySelector('[data-marketing-overview-card="deliveries"]')?.addEventListener('click',()=>document.querySelector('[data-tab="orders"]')?.click());
}

function ensureOverviewDashboard(root){
  if(root.querySelector('[data-marketing-overview]'))return;
  const nav=ensureOverviewNav(root);
  if(!nav)return;
  const legacySections=[...root.querySelectorAll(':scope>section')];
  const radar=legacySections.find(section=>text(section.querySelector('.section-title'))==='Radar de Marketing');
  const refresh=root.querySelector('#refreshMarketing');
  const dashboard=document.createElement('div');
  dashboard.className='marketing-overview';
  dashboard.dataset.marketingOverview='1';
  dashboard.innerHTML=`<div class="marketing-overview-head"><div><h2>Visão geral</h2><p>Atalhos para o trabalho diário de campanhas e relacionamento.</p></div><div class="marketing-overview-actions" data-marketing-overview-actions><button type="button" class="primary" data-overview-new-campaign>Nova campanha</button><button type="button" class="secondary" data-overview-new-template>Novo template</button></div></div><div class="marketing-overview-kpis">${OVERVIEW_CARDS.map(overviewCardMarkup).join('')}</div><div class="marketing-overview-columns"><section class="marketing-overview-panel marketing-overview-recent" data-marketing-recent-campaigns><div class="marketing-overview-panel-body"><span class="marketing-overview-eyebrow">Campanhas</span><h3>Últimas campanhas</h3><div class="marketing-overview-recent-list" data-marketing-recent-list><span class="marketing-overview-recent-empty">Carregando campanhas…</span></div></div><button type="button" class="secondary" data-overview-recent-campaigns>Ver campanhas</button></section><section class="marketing-overview-panel marketing-overview-panel-secondary"><div><span class="marketing-overview-eyebrow">Radar</span><h3>Oportunidades</h3><p>O radar de ofertas continua disponível como apoio, sem ocupar o fluxo principal.</p></div></section></div>`;
  nav.insertAdjacentElement('afterend',dashboard);
  bindOverviewDashboard(root,dashboard);
  loadOverviewRecentCampaigns(root,dashboard);
  legacySections.forEach(section=>{
    if(section===radar)return;
    section.hidden=true;
    section.dataset.marketingLegacyOverview='1';
  });
  if(radar){
    const details=document.createElement('details');
    details.className='marketing-overview-radar';
    details.dataset.marketingLegacyOverview='radar';
    details.innerHTML='<summary>Ver radar de oportunidades</summary><div class="marketing-overview-radar-body"></div>';
    const body=details.querySelector('.marketing-overview-radar-body');
    if(refresh){setText(refresh,'Atualizar radar');refresh.classList.add('marketing-overview-refresh');body.appendChild(refresh)}
    body.appendChild(radar);
    dashboard.appendChild(details);
  }else if(refresh){refresh.hidden=true}
}

function polishOverview(root){
  if(activeView(root)!=='overview')return;
  const head=root.querySelector('.page-head');
  setText(head?.querySelector('p'),'Campanhas, templates, clientes e entregas em um só lugar.');
  ensureOverviewDashboard(root);
  root.querySelectorAll('.marketing-card').forEach(card=>card.classList.add('marketing-pro-card'));
}

function polishTemplates(root){
  const center=root.querySelector('.marketing-template-center');
  if(!center)return;
  const head=center.querySelector('.marketing-template-head');
  setText(head?.querySelector('h2'),'Templates');
  setText(head?.querySelector('p'),'Modelos oficiais do WhatsApp usados nas campanhas.');
  head?.querySelector('.marketing-template-head-actions')?.classList.add('marketing-pro-toolbar');
  center.querySelectorAll('[data-template-detail]').forEach(button=>setText(button,'Ver'));
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
  const view=activeView(root);
  const isConsentView=Boolean(center.querySelector('[data-consent-search],[data-consent-detail]'));
  const head=center.querySelector('.page-head');
  if(view==='audiences'&&!isConsentView){
    setText(head?.querySelector('p'),'Crie segmentos de clientes usando localização, compras, marcas e etiquetas.');
    const section=center.querySelector('.marketing-audience-section-head');
    setText(section?.querySelector('h2'),'Públicos');
    setText(section?.querySelector('p'),'Escolha quem entra no público. Detalhes técnicos ficam separados do trabalho comercial.');
    const form=center.querySelector('[data-audience-form]');
    groupAdvancedAudienceFilters(form);
    setText(form?.querySelector('[data-calculate-audience]'),'Atualizar público');
    setText(form?.querySelector('[data-clear-filters]'),'Limpar');
    setText(form?.querySelector('[data-create-campaign-from-audience]'),'Criar campanha');
  }
  if(isConsentView){
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

function polishShared(root){
  root.classList.add('marketing-pro-shell');
  polishNav(root);
  removeDuplicateMarketingHeads(root);
  removeDuplicateGateBadges(root);
  polishOverview(root);
  polishTemplates(root);
  polishAudience(root);
  polishCampaigns(root);
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

window.DAMarketingPolish={apply};
export {apply};