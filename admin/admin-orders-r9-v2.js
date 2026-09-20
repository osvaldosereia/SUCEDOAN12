// R9 — operational presentation only. pedidos-v2.js remains functional authority.
(() => {
  'use strict';
  const labels=['Pedido','Data','Cliente','Telefone','Total','Pagamento','Status','Ações'];
  const rows=document.getElementById('orderRows');
  const enhance=()=>{
    if(!rows)return;
    rows.querySelectorAll('tr').forEach(row=>row.querySelectorAll(':scope > td').forEach((cell,i)=>{
      if(labels[i]) cell.dataset.label=labels[i];
    }));
  };
  if(rows){new MutationObserver(enhance).observe(rows,{childList:true,subtree:true});enhance();}
  const main=document.querySelector('.orders-page');
  if(main&&!document.getElementById('r9OrderFlow')){
    const flow=document.createElement('section');
    flow.id='r9OrderFlow';flow.className='panel r9-order-flow';
    flow.innerHTML='<div><strong>Fluxo operacional</strong><span>Referência visual; o status real continua vindo do pedido.</span></div><ol aria-label="Etapas do pedido"><li>Recebido</li><li>Separação</li><li>Conferência</li><li>Pronto</li><li>Rota</li><li>Entregue</li></ol>';
    const toolbar=document.getElementById('filterForm');
    toolbar?.insertAdjacentElement('afterend',flow);
  }
})();
