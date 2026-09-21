// R9 — operational presentation/safety only. pedidos-v2.js remains functional authority.
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
    document.getElementById('filterForm')?.insertAdjacentElement('afterend',flow);
  }

  // Capture guard only prevents accidental repeated clicks. It never calls APIs or changes order state.
  const guardedSelector='[data-print-full-order],[data-pdf-order],[data-print-order],[data-print-separation-order],[data-order-id],#refreshOrders,#prevPage,#nextPage,#filterForm button[type="submit"]';
  const cooldown=new WeakMap();
  document.addEventListener('click',event=>{
    const button=event.target.closest?.(guardedSelector);
    if(!button)return;
    const now=Date.now();
    if((cooldown.get(button)||0)>now){event.preventDefault();event.stopImmediatePropagation();return;}
    cooldown.set(button,now+900);
    button.setAttribute('aria-busy','true');
    const wasDisabled=Boolean(button.disabled);
    if('disabled' in button)button.disabled=true;
    window.setTimeout(()=>{
      button.removeAttribute('aria-busy');
      if('disabled' in button&&!wasDisabled)button.disabled=false;
      cooldown.delete(button);
    },900);
  },true);
})();
