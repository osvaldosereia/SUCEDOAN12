const app=document.getElementById('app');

const normalize=value=>String(value||'').trim().toLocaleLowerCase('pt-BR');
const numberFrom=value=>Number(String(value||'0').replace(/[^0-9,-]/g,'').replace(',','.'))||0;

const PRIORITIES=Object.freeze([
  {match:'sem estoque',label:'Produtos sem estoque',description:'Revise antes de oferecer ao cliente.',route:'products',tone:'danger'},
  {match:'sem foto',label:'Produtos sem foto',description:'Complete o catálogo para melhorar a compra.',route:'products',tone:'warning'},
  {match:'pedidos recentes',label:'Pedidos recentes',description:'Confira os pedidos recebidos e próximos passos.',route:'orders',tone:'info'}
]);
const SHORTCUTS=Object.freeze([
  {route:'orders',label:'Pedidos',description:'Recebidos, impressão e PDF.'},
  {route:'products',label:'Produtos',description:'Preço, estoque, foto e cadastro.'},
  {route:'baskets',label:'Cestas',description:'Composição, preço e destaque.'},
  {route:'customers',label:'Clientes',description:'Histórico e relacionamento.'},
  {route:'storefront',label:'Vitrine',description:'Ordem e destaques do Comprar.'}
]);

function dashboardActive(){return !location.hash||location.hash==='#dashboard'}
function metricCards(){return [...app.querySelectorAll('.stats-grid .stat-card')]}
function findMetric(match){
  const card=metricCards().find(node=>normalize(node.querySelector('span')?.textContent)===match);
  return card?numberFrom(card.querySelector('strong')?.textContent):0;
}
function navigate(route){
  const button=document.querySelector(`[data-route="${CSS.escape(route)}"]`);
  if(button){button.click();return}
  location.hash=`#${route}`;
}
function buttonMarkup(item,kind='priority'){
  if(kind==='shortcut')return `<button type="button" class="da-dashboard-shortcut" data-priority-route="${item.route}"><strong>${item.label}</strong><small>${item.description}</small><b>Abrir →</b></button>`;
  return `<button type="button" class="da-dashboard-priority" data-priority-route="${item.route}" data-tone="${item.tone}"><span>${item.label}</span><strong>${item.value}</strong><small>${item.description}</small><b>Abrir →</b></button>`;
}
function render(){
  if(!app||!dashboardActive()||app.querySelector('[data-dashboard-priorities-v2]'))return;
  const stats=app.querySelector('.stats-grid');
  if(!stats)return;
  const items=PRIORITIES.map(item=>({...item,value:findMetric(item.match)})).filter(item=>item.value>0);
  const section=document.createElement('section');
  section.className='panel da-dashboard-priorities';
  section.dataset.dashboardPrioritiesV2='';
  section.innerHTML=`<div class="da-dashboard-priorities-head"><div><span class="da-eyebrow">Central de trabalho</span><h2>Precisa da sua atenção</h2><p class="muted">Prioridades calculadas somente com os dados reais já carregados nesta tela.</p></div><span class="badge ${items.length?'':'ok'}">${items.length?`${items.length} ponto(s)`:'Tudo em ordem'}</span></div>${items.length?`<div class="da-dashboard-priority-grid">${items.map(item=>buttonMarkup(item)).join('')}</div>`:'<div class="empty" role="status">Nenhuma prioridade básica detectada neste resumo. Continue acompanhando pedidos e estoque normalmente.</div>'}<div class="da-dashboard-shortcuts"><div><span class="da-eyebrow">Acesso rápido</span><h3>Operação</h3></div><div class="da-dashboard-shortcut-grid">${SHORTCUTS.map(item=>buttonMarkup(item,'shortcut')).join('')}</div></div>`;
  stats.before(section);
  section.addEventListener('click',event=>{
    const target=event.target.closest('[data-priority-route]');
    if(target)navigate(target.dataset.priorityRoute);
  });
}

let queued=false;
function schedule(){
  if(queued)return;queued=true;
  queueMicrotask(()=>{queued=false;render()});
}
if(app)new MutationObserver(schedule).observe(app,{childList:true});
window.addEventListener('hashchange',schedule);
schedule();
