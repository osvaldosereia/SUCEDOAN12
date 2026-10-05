const ROOT_SELECTOR='#content';
const ADVANCED_FILTERS=['product_ids','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value'];
let scheduled=false;

const text=value=>String(value?.textContent||'').trim();

function marketingRoot(){
  const root=document.querySelector(ROOT_SELECTOR);
  if(!root)return null;
  const title=text(root.querySelector('.page-head h1'));
  const hasMarketingUi=Boolean(root.querySelector('[data-marketing-subnav],.marketing-template-center,.marketing-audience-center,.marketing-campaign-center,.marketing-grid'));
  return title==='Marketing'||hasMarketingUi?root:null;
}

function setText(node,value){if(node&&text(node)!==value)node.textContent=value}

function activeView(root){
  return root.querySelector('[data-marketing-subnav] [data-marketing-view].active')?.dataset?.marketingView||'overview';
}

function polishNav(root){
  const nav=root.querySelector('[data-marketing-subnav]');
  if(!nav)return;
  const labels={overview:'Visão geral',templates:'Templates',audiences:'Públicos',campaigns:'Campanhas',consents:'Consentimentos'};
  nav.querySelectorAll('[data-marketing-view]').forEach(button=>{
    const label=labels[button.dataset.marketingView];
    if(label)setText(button,label);
    if(button.classList.contains('active'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  setText(nav.querySelector('.marketing-campaign-gate'),'Envios desativados');
}

function polishOverview(root){
  if(activeView(root)!=='overview')return;
  const head=root.querySelector('.page-head');
  setText(head?.querySelector('p'),'Campanhas, públicos e templates do WhatsApp em um só lugar.');
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
  details.innerHTML='<summary>Filtros avançados</summary><div class="marketing-pro-advanced-body"></div>';
  const body=details.querySelector('.marketing-pro-advanced-body');
  nodes.forEach(node=>body.appendChild(node));
  const actions=form.querySelector('.marketing-audience-form-actions');
  if(actions)form.insertBefore(details,actions);else form.appendChild(details);
}

function polishAudience(root){
  const center=root.querySelector('.marketing-audience-center');
  if(!center)return;
  const view=activeView(root);
  const head=center.querySelector('.page-head');
  if(view==='audiences'){
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
  if(view==='consents'){
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
