const APP_ID='adminBasketsV2Summary';

function enhance(){
  const app=document.getElementById('app');
  if(!app||location.hash!=='#baskets')return;
  const table=app.querySelector('.data-table');
  if(!table||document.getElementById(APP_ID))return;
  const rows=[...table.querySelectorAll('tbody tr')];
  const stats=rows.reduce((acc,row)=>{
    const cells=row.querySelectorAll('td');
    const status=cells[3]?.textContent?.trim()||'';
    const featured=cells[4]?.textContent?.trim()||'';
    acc.total++;
    if(status==='Ativa')acc.active++;
    if(featured==='Sim')acc.featured++;
    return acc;
  },{total:0,active:0,featured:0});
  const section=document.createElement('section');
  section.id=APP_ID;
  section.className='da-baskets-summary';
  section.setAttribute('aria-label','Resumo das cestas');
  section.innerHTML=`<article><span>Total</span><strong>${stats.total}</strong></article><article><span>Ativas</span><strong>${stats.active}</strong></article><article><span>Destaques</span><strong>${stats.featured}</strong></article><p>Preço da cesta é comercial e próprio. A composição pode ser editada sem expor preço individual dos componentes ao cliente.</p>`;
  table.closest('.panel')?.before(section);
  rows.forEach(row=>{
    const cells=row.querySelectorAll('td');
    ['Cesta','Preço','Itens','Status','Destaque','Ações'].forEach((label,i)=>cells[i]?.setAttribute('data-label',label));
  });
}

const observer=new MutationObserver(enhance);
observer.observe(document.getElementById('app'),{childList:true,subtree:true});
window.addEventListener('hashchange',enhance);
enhance();
