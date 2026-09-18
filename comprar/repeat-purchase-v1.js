(()=>{
  'use strict';
  const app=window.DA_COMPRAR_APP;
  if(!app)return;
  const {state,customerApi,money,escapeHtml}=app;
  let busy=false,previewCache=null;

  const formatDate=value=>{
    if(!value)return '';
    const d=new Date(value);
    return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR');
  };
  const eligible=()=>!!state.customer?.id&&!state.selectedBasket&&app.cartCount?.(state.cart||{})===0&&!!document.querySelector('.start-stage');
  const removeCard=()=>document.querySelectorAll('.repeat-purchase-card').forEach(node=>node.remove());

  function ensureChip(preview){
    const host=document.querySelector('.start-stage .start-chips');
    const stage=host?.closest('.start-stage');
    if(!host||!stage||stage.querySelector('[data-repeat-last-purchase]'))return;
    const wrap=document.createElement('div');
    wrap.className='repeat-purchase-entry';
    const button=document.createElement('button');
    button.type='button';
    button.className='chip repeat-purchase-chip';
    button.dataset.repeatLastPurchase='1';
    button.textContent='Repetir última compra';
    button.onclick=()=>showPreview(preview);
    wrap.appendChild(button);
    stage.insertBefore(wrap,host);
  }

  async function loadPreview(){
    if(!eligible())return null;
    try{
      const data=await customerApi('repeat_last_purchase_preview');
      if(data?.preview?.available){
        previewCache=data.preview;
        ensureChip(data.preview);
      }
      return data?.preview||null;
    }catch{return null}
  }

  function renderAddons(preview){
    const items=Array.isArray(preview?.addons)?preview.addons:[];
    if(!items.length)return '';
    const rows=items.slice(0,5).map(item=>{
      const qty=Number(item.repeat_quantity??item.historical_quantity??0);
      const status=item.available===false?'Indisponível hoje':item.adjusted===true?('Quantidade ajustada para '+qty):(qty+'×');
      return '<div class="repeat-purchase-item '+(item.available===false?'unavailable':'')+'"><span>'+escapeHtml(item.name||'Produto')+'</span><small>'+escapeHtml(status)+'</small></div>';
    }).join('');
    const more=items.length>5?'<div class="repeat-purchase-more">+ '+(items.length-5)+' outro(s) produto(s)</div>':'';
    return '<div class="repeat-purchase-items">'+rows+more+'</div>';
  }

  async function showPreview(initial){
    if(busy)return;
    busy=true;
    try{
      app.userDecision?.('Quero repetir minha última compra',{className:'decision repeat-purchase-decision'});
      const fresh=await customerApi('repeat_last_purchase_preview').catch(()=>null);
      const preview=fresh?.preview?.available?fresh.preview:(initial||previewCache);
      if(!preview?.available){
        app.assistantMessage?.('Não consegui recuperar sua última compra agora. Você pode começar uma compra nova normalmente.');
        return;
      }
      previewCache=preview;
      customerApi('track_behavior',{event_type:'repeat_purchase_open',event_data:{
        source:'repeat_last_purchase',
        unavailable_count:Number(preview.unavailable_addon_count||0),
        adjusted_count:Number(preview.adjusted_addon_count||0),
        customized:preview.basket_customization_detected===true
      }}).catch(()=>null);
      removeCard();
      app.assistantMessage?.('Encontrei sua última compra. Confira antes de repetir:');
      const timeline=document.getElementById('timeline');
      if(!timeline)return;
      const warnings=[];
      if(Number(preview.unavailable_addon_count||0)>0)warnings.push(preview.unavailable_addon_count+' produto(s) extra(s) indisponível(is) hoje');
      if(Number(preview.adjusted_addon_count||0)>0)warnings.push('algumas quantidades foram ajustadas ao estoque/limite atual');
      if(preview.basket_customization_detected)warnings.push('algumas alterações antigas da cesta precisam ser conferidas');
      const card=document.createElement('section');
      card.className='repeat-purchase-card';
      card.innerHTML=
        '<div class="repeat-purchase-head">'+
          (preview.basket?.image_url?'<img src="'+escapeHtml(preview.basket.image_url)+'" alt="" loading="lazy">':'')+
          '<div><small>Última compra '+(formatDate(preview.ordered_at)?'· '+escapeHtml(formatDate(preview.ordered_at)):'')+'</small>'+
          '<strong>'+escapeHtml(preview.basket?.name||'Cesta básica')+'</strong></div>'+
        '</div>'+
        '<div class="repeat-purchase-values">'+
          '<div><span>Valor anterior</span><b>'+money(preview.historical_total||0)+'</b></div>'+
          '<div><span>Estimativa hoje</span><b>'+money(preview.current_estimate||0)+'</b></div>'+
        '</div>'+
        renderAddons(preview)+
        (warnings.length?'<div class="repeat-purchase-warning">⚠ '+escapeHtml(warnings.join(' · '))+'</div>':'')+
        '<p class="repeat-purchase-note">A compra será remontada com cesta, preços, estoque e regras disponíveis hoje. Você poderá revisar tudo antes de finalizar.</p>'+
        '<div class="repeat-purchase-actions">'+
          '<button type="button" class="secondary" data-repeat-cancel>Comprar diferente</button>'+
          '<button type="button" class="primary" data-repeat-confirm>Repetir esta compra</button>'+
        '</div>';
      timeline.appendChild(card);
      app.scrollTo?.(card,{block:'center'});
      card.querySelector('[data-repeat-cancel]').onclick=()=>{
        card.remove();
        app.assistantMessage?.('Tudo bem. Escolha abaixo como quer começar sua compra.');
      };
      card.querySelector('[data-repeat-confirm]').onclick=event=>applyRepeat(event.currentTarget,card);
    }finally{busy=false}
  }

  async function applyRepeat(button,card){
    if(button?.dataset.busy==='1')return;
    button.dataset.busy='1';
    button.disabled=true;
    button.textContent='Montando compra…';
    try{
      const data=await customerApi('repeat_last_purchase_apply');
      const result=data?.repeat||{};
      const notes=[];
      if(Number(result.skipped_addons||0)>0)notes.push(result.skipped_addons+' extra(s) não puderam ser adicionados');
      if(Number(result.substitutions_skipped||0)>0)notes.push('substituições antigas precisam ser refeitas');
      app.assistantMessage?.('Pronto 😊 Remontei sua compra com os dados de hoje.'+(notes.length?' '+notes.join(' · '):''));
      card?.remove();
      setTimeout(()=>location.reload(),450);
    }catch(error){
      button.dataset.busy='0';
      button.disabled=false;
      button.textContent='Repetir esta compra';
      app.toast?.(error?.message||'Não consegui repetir a compra.');
    }
  }

  const originalStart=app.start?.bind(app);
  if(originalStart){
    app.start=async(...args)=>{
      const result=await originalStart(...args);
      await loadPreview();
      return result;
    };
  }

  app.repeatLastPurchase={loadPreview,showPreview,getCache:()=>previewCache};
})();