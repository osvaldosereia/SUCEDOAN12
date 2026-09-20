const app=document.getElementById('app');

const normalize=value=>String(value||'').trim().toLocaleLowerCase('pt-BR');
const numberFrom=value=>Number(String(value||'0').replace(/[^0-9,-]/g,'').replace(',','.'))||0;

const PRIORITIES=Object.freeze([
  {match:'sem estoque',label:'Produtos sem estoque',description:'Revise antes de oferecer ao cliente.',route:'products',tone:'danger'},
  {match:'sem foto',label:'Produtos sem foto',description:'Complete o catálogo para melhorar a compra.',route:'products',tone:'warning'},
  {match:'pedidos recentes',label:'Pedidos recentes',description:'Confira os pedidos recebidos e próximos passos.',route:'orders',tone:'info'}
]);

function dashboardActive(){return !location.hash||location.hash==='#dashboard'}
function findMetric(match){
  const cards=[...app.querySelectorAll('.stats-grid .stat-card')];
  const card=cards.find(node=>normalize(node.querySelector('span')?.textContent)===match);
  return card?numberFrom(card.querySelector('strong')?.textContent):0;
}
function navigate(route){
  const button=document.querySelector(`[data-route="${CSS.escape(route)}"]`);
  if(button){button.click();return}
  location.hash=`#${route}`;
}
function render(){
  if(!app||!dashboardActive()||app.querySelector('[data-dashboard-priorities-v2]'))return;
  const stats=app.querySelector('.stats-grid');
  if(!stats)return;
  const items=PRIORITIES.map(item=>({...item,value:findMetric(item.match)})).filter(item=>item.value>0);
  const section=document.createElement('section');
  section.className='panel da-dashboard-priorities';
  section.dataset.dashboardPrioritiesV2='';
  section.innerHTML=`<div class="da-dashboard-priorities-head"><div><span class="da-eyebrow">Central de trabalho</span><h2>Precisa da sua atenção</h2><p class="muted">Atalhos criados a partir dos dados que já estão carregados no Admin.</p></div><span class="badge ${items.length?'':'ok'}">${items.length?`${items.length} ponto(s)`:'Tudo em ordem'}</span></div>${items.length?`<div class="da-dashboard-priority-grid">${items.map(item=>`<button type="button" class="da-dashboard-priority" data-priority-route="${item.route}" data-tone="${item.tone}"><span>${item.label}</span><strong>${item.value}</strong><small>${item.description}</small><b>Abrir →</b></button>`).join('')}</div>`:'<div class="empty" role="status">Nenhuma prioridade básica detectada neste resumo. Continue acompanhando pedidos e estoque normalmente.</div>'}`;
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
