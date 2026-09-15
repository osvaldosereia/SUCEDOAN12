(()=>{
  'use strict';
  const PURCHASE_KINDS=new Set(['baskets','offers','products']);
  const PURCHASE_SELECTOR='[data-menu-item][data-kind="baskets"],[data-menu-item][data-kind="offers"],[data-menu-item][data-kind="products"]';
  const replacements=[
    ['Admin V3','Admin'],
    ['Menu de ajuda','Perguntas rápidas do cliente'],
    ['Atalhos rápidos','Dúvidas frequentes'],
    ['Mostrar menu','Mostrar perguntas rápidas'],
    ['Salvar fluxo','Salvar perguntas']
  ];
  let scheduled=false;

  function rewriteText(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){let next=node.nodeValue||'';for(const [from,to] of replacements)next=next.split(from).join(to);if(next!==node.nodeValue)node.nodeValue=next}
  }
  function hidePurchaseRows(){
    document.querySelectorAll(PURCHASE_SELECTOR).forEach(row=>{row.hidden=true;row.setAttribute('aria-hidden','true')});
    const rows=[...document.querySelectorAll('[data-menu-item]')];
    const enabledRows=rows.filter(row=>row.querySelector('[data-field="enabled"]')?.checked!==false);
    const preview=[...document.querySelectorAll('#menuPreview .strategy-chip')];
    preview.forEach((chip,index)=>chip.classList.toggle('hidden',PURCHASE_KINDS.has(enabledRows[index]?.dataset.kind||'')));
    const panel=document.querySelector('#flowRoot .panel');
    if(panel&&!panel.querySelector('[data-canonical-quick-note]')){
      const note=document.createElement('p');note.dataset.canonicalQuickNote='1';note.className='strategy-help';note.textContent='Cestas, Ofertas e Produtos fazem parte do fluxo principal de compra e não aparecem nesta lista de dúvidas.';
      panel.querySelector('.strategy-panel-head')?.insertAdjacentElement('afterend',note);
    }
  }
  function apply(){scheduled=false;document.title=document.title.replaceAll('Admin V3','Admin');rewriteText(document);hidePurchaseRows()}
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(apply)}
  const start=()=>{apply();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
