(() => {
  'use strict';

  const CUTOFF_HOUR=11;
  const originalFetch=window.fetch.bind(window);
  const originalSetTimeout=window.setTimeout.bind(window);
  let pendingAdjustment=null;
  let pendingSubmitError=null;

  function adjustmentLine(item){
    const name=String(item?.name||'Item');
    const requested=Number(item?.requested||0);
    const available=Number(item?.available||0);
    if(item?.action==='reduced'&&available>0)return `${name}: quantidade ajustada de ${requested} para ${available}.`;
    if(String(item?.reason||'').includes('composicao'))return `${name}: retirado porque a composição disponível mudou.`;
    return `${name}: retirado porque ficou sem estoque.`;
  }

  function applyStockAdjustment(saved){
    return Array.isArray(saved?.adjusted_items)?saved.adjusted_items.filter(Boolean):[];
  }

  function confirmStockAdjustment(saved){
    const items=applyStockAdjustment(saved);
    if(!items.length)return false;
    const title=document.querySelector('#sheetTitle');
    const body=document.querySelector('#sheetBody');
    const action=document.querySelector('#sheetAction');
    if(!title||!body||!action)return false;
    const previousLink=document.querySelector('.wa-fallback');
    const whatsappUrl=previousLink?.href||'https://wa.me/5565998150975';
    const total=Number(saved?.total_cents||0)/100;
    title.textContent='Pedido ajustado e recebido';
    body.innerHTML=`<div class="rule-notice warn"><strong>O estoque mudou enquanto você finalizava.</strong>${items.map(x=>`<div style="margin-top:7px">${escapeHtml(adjustmentLine(x))}</div>`).join('')}<div style="margin-top:10px"><b>Novo total: ${total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</b></div><div style="margin-top:6px">O pedido continuou normalmente com os itens disponíveis.</div></div>`;
    action.innerHTML='<div class="action-stack"><button type="button" class="primary" id="stockAdjustmentOk">OK, ir para o WhatsApp</button><button type="button" class="secondary" id="stockAdjustmentStore">Voltar à vitrine</button></div>';
    document.querySelector('#stockAdjustmentOk')?.addEventListener('click',()=>{pendingAdjustment=null;window.location.assign(whatsappUrl)});
    document.querySelector('#stockAdjustmentStore')?.addEventListener('click',()=>{pendingAdjustment=null;document.querySelector('#closeSheet')?.click()});
    return true;
  }

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function humanError(data){
    const code=String(data?.error||'');
    const items=Array.isArray(data?.adjusted_items)?data.adjusted_items:[];
    if(code==='all_items_unavailable')return items.length?items.map(adjustmentLine).join(' '):'Os itens deste pedido ficaram sem estoque neste momento. Escolha outros produtos ou fale conosco no WhatsApp.';
    if(code==='rate_limited')return 'Recebemos várias tentativas seguidas. Seu carrinho continua salvo. Aguarde alguns segundos e toque novamente em Finalizar pedido.';
    if(code==='minimum_order')return 'O total atual ficou abaixo do pedido mínimo antes da confirmação. Seu carrinho continua salvo.';
    if(code==='rate_limit_unavailable'||code==='service_unavailable')return 'O sistema de pedidos está temporariamente indisponível. Seu carrinho continua salvo para você tentar novamente.';
    if(['insufficient_stock','product_unavailable','basket_unavailable','basket_lot_unavailable','basket_lot_insufficient','basket_component_not_in_lot','basket_kit_lot_unavailable','basket_kit_lot_insufficient','basket_component_not_in_selected_kit'].includes(code))return items.length?items.map(adjustmentLine).join(' '):'A disponibilidade mudou enquanto o pedido era enviado. Toque novamente em Finalizar pedido; vamos ajustar automaticamente os itens disponíveis.';
    return `O pedido não foi enviado por causa de ${code||'uma falha de comunicação'}. Seu carrinho continua salvo.`;
  }

  window.fetch=async(...args)=>{
    const response=await originalFetch(...args);
    try{
      const requestUrl=String(args[0]?.url||args[0]||'');
      if(requestUrl.includes('/functions/v1/storefront-v2')&&requestUrl.includes('action=submit_order')){
        const data=await response.clone().json();
        if(response.ok&&data?.stock_adjustment===true&&applyStockAdjustment(data).length){
          pendingAdjustment=data;
          pendingSubmitError=null;
          originalSetTimeout(()=>confirmStockAdjustment(data),0);
        }else if(!response.ok){
          pendingSubmitError=data;
        }else{
          pendingAdjustment=null;
          pendingSubmitError=null;
        }
      }
    }catch{}
    return response;
  };

  window.setTimeout=(fn,delay,...rest)=>{
    if(Number(delay)===3000&&pendingAdjustment&&typeof fn==='function'){
      try{if(Function.prototype.toString.call(fn).includes('location.assign'))return 0}catch{}
    }
    return originalSetTimeout(fn,delay,...rest);
  };

  const observer=new MutationObserver(()=>{
    const toast=document.querySelector('#toast');
    if(!toast||!pendingSubmitError)return;
    const text=String(toast.textContent||'');
    if(text.includes('Não consegui registrar')||text.includes('O estoque mudou. Atualize a cesta'))toast.textContent=humanError(pendingSubmitError);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

  window.__DA_CHECKOUT_RESILIENCE__={CUTOFF_HOUR,applyStockAdjustment,confirmStockAdjustment};
})();
