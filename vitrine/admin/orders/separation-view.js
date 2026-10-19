(()=>{
  window.DonaAntoniaAdminOrderSeparationView=Object.freeze({
    create({document,escapeHtml}){
      const esc=value=>escapeHtml(value==null?'':String(value));
      return Object.freeze({
        createShell(publicCode){
          const backdrop=document.createElement('div');
          backdrop.className='orders-bottom-sheet-backdrop';
          backdrop.innerHTML='<section class="orders-bottom-sheet" role="dialog" aria-modal="true"><header class="orders-sheet-head"><div><h2>Separação do pedido'+(publicCode==='—'?'':' #'+esc(publicCode))+'</h2><p>Marque cada produto como SEPARADO ou FALTOU.</p></div><button class="orders-sheet-close" type="button" aria-label="Fechar">×</button></header><div class="orders-sheet-body"><div class="loading">Carregando produtos…</div></div><footer class="orders-sheet-foot" hidden></footer></section>';
          return backdrop;
        },
        bindInteractions({backdrop,orderId,close,onItem}){
          backdrop.querySelector('.orders-sheet-close').onclick=close;
          backdrop.onclick=event=>{
            if(event.target===backdrop){close();return}
            const button=event.target.closest?.('[data-separation-state]');
            if(!button||button.disabled||backdrop.dataset.separationBusy==='1'||!backdrop.contains(button))return;
            event.preventDefault();
            onItem(orderId,button.dataset.orderItem,button.dataset.separationState,backdrop,button);
          };
        }
      });
    }
  });
})();
