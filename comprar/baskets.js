(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;
  const {state,money,escapeHtml,image,stage,scrollTo,toast,setCart,api,basketStorefrontApi}=app;
  let previewState=null;

  function previewBasketTotal(basket){
    let total=Number(basket?.price??basket?.base_price??0);
    for(const item of basket?.items||[]){
      const base=Math.max(0,Number(item.base_quantity??item.quantity??0));
      const current=Math.max(0,Number(item.quantity??0));
      if(current<base)total-=(base-current)*Number(item.remove_unit_delta??item.price??0);
      else if(current>base)total+=(current-base)*Number(item.add_unit_delta??item.price??0);
    }
    return Math.max(0,total);
  }

  function basketPolicy(item){
    const quantity=Math.max(0,Math.trunc(Number(item.quantity||0)));
    const min=Math.max(0,Math.trunc(Number(item.min_quantity??(item.removable?0:quantity))));
    const max=Math.max(min,Math.trunc(Number(item.max_quantity??Math.max(quantity,99))));
    return {quantity,min,max,editable:item.quantity_editable!==false};
  }

  function clearBasketConversation(){
    document.querySelectorAll('.basket-picker-message,.basket-preview-message,.basket-confirm-message,.basket-confirm-decision').forEach(el=>el.remove());
  }

  function renderPicker(){
    document.querySelectorAll('.stage.basket-picker-stage,.stage.basket-preview-stage,.stage.selected-basket-stage,.stage.selected-basket-expanded').forEach(el=>el.remove());
    document.querySelectorAll('.basket-picker-message,.basket-preview-message').forEach(el=>el.remove());
    app.assistantMessage('Escolha a cesta que combina melhor com você.',{className:'basket-picker-message'});
    const section=stage(1,'Escolha sua cesta','','basket-picker-stage');
    if(!section)return;
    const grid=document.createElement('div');grid.className='basket-grid';section.appendChild(grid);
    const list=state.baskets||[];
    for(const basket of list){
      const card=document.createElement('article');card.className='basket-mini';
      card.appendChild(image(basket.image_url,basket.name));
      card.insertAdjacentHTML('beforeend',`<h3>${escapeHtml(basket.name||'Cesta')}</h3><strong>${money(basket.base_price)}</strong>`);
      const button=document.createElement('button');button.type='button';button.textContent='Ver produtos';button.onclick=()=>previewBasket(basket,button);card.appendChild(button);grid.appendChild(card);
    }
    if(!list.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhuma cesta disponível agora.';section.appendChild(empty)}
    scrollTo(section,{block:'start'});
  }

  async function previewBasket(basket,button){
    if(button?.dataset.busy==='1')return;
    if(button){button.dataset.busy='1';button.disabled=true;button.textContent='Abrindo…'}
    try{
      const detail=await basketStorefrontApi('detail',{basket_id:basket.id});
      const data=detail.basket||{};
      const items=(data.items||[]).map(item=>({...item,quantity:Math.max(0,Math.trunc(Number(item.quantity||0)))}));
      previewState={basket:{...basket,...data},items};
      document.querySelector('.stage.basket-picker-stage')?.remove();
      document.querySelector('.basket-picker-message')?.remove();
      document.querySelector('.stage.basket-preview-stage')?.remove();
      document.querySelector('.basket-preview-message')?.remove();
      app.assistantMessage('Confira os produtos desta cesta. Você pode ajustar as quantidades antes de escolher.',{className:'basket-preview-message'});
      const section=stage(1,'Confira esta cesta','','basket-preview-stage');if(!section)return;
      const inner=document.createElement('div');inner.className='stage-inner';section.appendChild(inner);
      const hero=document.createElement('div');hero.className='basket-hero';hero.appendChild(image(data.image_url||basket.image_url,data.name||basket.name));
      const copy=document.createElement('div');copy.innerHTML=`<h2>${escapeHtml(data.name||basket.name||'Cesta')}</h2><div class="value" data-preview-total>${money(previewBasketTotal({...data,items}))}</div>`;hero.appendChild(copy);inner.appendChild(hero);
      const list=document.createElement('div');list.className='basket-list';inner.appendChild(list);
      const total=copy.querySelector('[data-preview-total]');const refreshTotal=()=>{if(total)total.textContent=money(previewBasketTotal({...data,items}))};
      for(const item of items){
        const row=document.createElement('div');row.className='basket-row';row.appendChild(image(item.image_url,item.name));
        const info=document.createElement('div'),label=document.createElement('small');info.innerHTML=`<h3>${escapeHtml(item.name||'Produto')}</h3>`;info.appendChild(label);row.appendChild(info);
        const ctrl=document.createElement('div');ctrl.className='qty';const minus=document.createElement('button'),num=document.createElement('span'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';
        const refresh=()=>{const {quantity,min,max,editable}=basketPolicy(item);num.textContent=String(quantity);label.textContent=quantity===0?'Retirado':quantity===1?'1 unidade':`${quantity} unidades`;minus.disabled=!editable||quantity<=min;plus.disabled=!editable||quantity>=max;refreshTotal()};
        minus.onclick=()=>{const p=basketPolicy(item);if(!p.editable||p.quantity<=p.min)return;item.quantity=Math.max(p.min,p.quantity-1);refresh()};
        plus.onclick=()=>{const p=basketPolicy(item);if(!p.editable||p.quantity>=p.max)return;item.quantity=Math.min(p.max,p.quantity+1);refresh()};
        ctrl.append(minus,num,plus);row.appendChild(ctrl);list.appendChild(row);refresh();
      }
      const actions=document.createElement('div');actions.className='actions basket-preview-actions';
      const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Voltar às cestas';back.onclick=()=>{previewState=null;section.remove();document.querySelector('.basket-preview-message')?.remove();renderPicker()};
      const choose=document.createElement('button');choose.type='button';choose.className='primary';choose.textContent='Quero esta cesta';choose.onclick=()=>chooseBasket(previewState,choose);
      actions.append(back,choose);inner.appendChild(actions);scrollTo(section,{block:'start'});
    }catch(error){toast(error.message)}
    finally{if(button){button.dataset.busy='0';button.disabled=false;button.textContent='Ver produtos'}}
  }

  async function chooseBasket(selection,button){
    if(!selection?.basket?.id||button?.dataset.busy==='1')return;
    if(button){button.dataset.busy='1';button.disabled=true;button.textContent='Adicionando…'}
    try{
      const data=await api('start_basket',{basket_id:selection.basket.id});
      let cart=data.cart||state.cart;
      const actualItems=Array.isArray(data.items)?data.items:[];
      const desired=new Map(selection.items.map(item=>[String(item.product_id),item]));
      for(const actual of actualItems){
        const wanted=desired.get(String(actual.product_id));if(!wanted)continue;
        const quantity=Math.max(0,Math.trunc(Number(wanted.quantity||0)));if(quantity===Math.max(0,Math.trunc(Number(actual.quantity||0))))continue;
        const changed=await api('set_basket_quantity',{product_id:actual.product_id,quantity});if(changed.cart)cart=changed.cart;actual.quantity=quantity;
      }
      state.selectedBasket={...selection.basket,selected_total:Number(cart?.total??cart?.commercial_total??selection.basket.base_price??0)};
      state.basketItems=actualItems.map(actual=>{const policy=desired.get(String(actual.product_id))||{};return {...actual,...policy,product:actual.product||policy.product||null,name:policy.name||actual.name}});
      setCart(cart||{items:[],total:0});previewState=null;
      document.querySelectorAll('.stage.basket-picker-stage,.stage.basket-preview-stage,.stage.selected-basket-stage,.stage.selected-basket-expanded,.stage.products-entry-stage,.stage.products-stage,.upsell-strip').forEach(el=>el.remove());
      clearBasketConversation();
      app.userDecision(`Quero ${state.selectedBasket.name||'esta cesta'}`,{className:'basket-confirm-decision'});
      app.assistantMessage('Certo! Sua cesta já está no pedido. Quer acrescentar alguma coisa?',{className:'basket-confirm-message'});
      const summary=renderSelectedBasketSummary();
      try{await state.modules.upsell?.renderAfterBasket?.(summary)}catch{}
      state.modules.products?.renderEntry?.({auto:true});
      if(summary)scrollTo(summary,{block:'center'});
    }catch(error){toast(error.message)}
    finally{if(button){button.dataset.busy='0';button.disabled=false;button.textContent='Quero esta cesta'}}
  }

  function basketItemCount(){return (state.basketItems||[]).reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)),0)}

  function renderSelectedBasketSummary(){
    const basket=state.selectedBasket;if(!basket)return null;
    document.querySelectorAll('.stage.selected-basket-stage,.stage.selected-basket-expanded').forEach(el=>el.remove());
    const section=stage(1,'Sua cesta','','selected-basket-stage');if(!section)return null;section.classList.add('basket-summary-host');
    const count=basketItemCount(),value=Number(basket.selected_total??basket.base_price??0);
    const summary=app.compactToolSummary({className:'basket-compact-summary',title:basket.name||'Sua cesta',meta:`${count} ${count===1?'item':'itens'} · ${money(value)}`,actions:[{label:'Ver composição',onClick:expandSelectedBasket},{label:'Alterar',onClick:()=>{section.remove();renderPicker()}}]});
    section.appendChild(summary);return section;
  }

  function expandSelectedBasket(){
    const basket=state.selectedBasket;if(!basket)return null;
    document.querySelector('.stage.selected-basket-expanded')?.remove();
    const section=stage(1,'Composição da cesta','','selected-basket-expanded');if(!section)return null;
    const inner=document.createElement('div');inner.className='stage-inner';section.appendChild(inner);
    const hero=document.createElement('div');hero.className='basket-hero';hero.appendChild(image(basket.image_url,basket.name));
    const copy=document.createElement('div');copy.innerHTML=`<h2>${escapeHtml(basket.name||'Sua cesta')}</h2><div class="value" data-cart-total>${money(state.cart?.total??state.cart?.commercial_total??basket.base_price)}</div>`;hero.appendChild(copy);inner.appendChild(hero);
    const list=document.createElement('div');list.className='basket-list';inner.appendChild(list);
    for(const item of state.basketItems||[]){
      const product=item.product||item;const row=document.createElement('div');row.className='basket-row';row.appendChild(image(product.image_url||item.image_url,product.name||item.name));
      const info=document.createElement('div'),label=document.createElement('small');info.innerHTML=`<h3>${escapeHtml(product.name||item.name||'Produto')}</h3>`;info.appendChild(label);row.appendChild(info);
      const ctrl=document.createElement('div');ctrl.className='qty';const minus=document.createElement('button'),num=document.createElement('span'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';
      const refresh=()=>{const p=basketPolicy(item);num.textContent=String(p.quantity);label.textContent=p.quantity===0?'Retirado':p.quantity===1?'1 unidade':`${p.quantity} unidades`;minus.disabled=!p.editable||p.quantity<=p.min;plus.disabled=!p.editable||p.quantity>=p.max};
      const change=async delta=>{const p=basketPolicy(item),next=Math.min(p.max,Math.max(p.min,p.quantity+delta));if(next===p.quantity)return;minus.disabled=plus.disabled=true;try{const changed=await api('set_basket_quantity',{product_id:item.product_id,quantity:next});item.quantity=next;if(changed.cart)setCart(changed.cart);refresh()}catch(error){toast(error.message);refresh()}};
      minus.onclick=()=>change(-1);plus.onclick=()=>change(1);ctrl.append(minus,num,plus);row.appendChild(ctrl);list.appendChild(row);refresh();
    }
    const actions=document.createElement('div');actions.className='actions';const collapse=document.createElement('button');collapse.type='button';collapse.className='secondary';collapse.textContent='Recolher composição';collapse.onclick=()=>section.remove();const changeBasket=document.createElement('button');changeBasket.type='button';changeBasket.className='secondary';changeBasket.textContent='Trocar cesta';changeBasket.onclick=()=>{section.remove();renderPicker()};actions.append(collapse,changeBasket);inner.appendChild(actions);scrollTo(section,{block:'start'});return section;
  }

  function renderSelectedBasket(){return renderSelectedBasketSummary()}

  async function restoreFromOpen(data){
    const basketId=String(data?.cart?.basket_id||state.cart?.basket_id||'');if(!basketId)return renderPicker();
    state.selectedBasket=(state.baskets||[]).find(b=>String(b.id)===basketId)||{id:basketId,name:'Sua cesta'};
    let policies=[];try{const detail=await basketStorefrontApi('detail',{basket_id:basketId});policies=detail?.basket?.items||[];if(detail?.basket)state.selectedBasket={...state.selectedBasket,...detail.basket}}catch{}
    const policyMap=new Map(policies.map(item=>[String(item.product_id),item]));state.basketItems=(state.cart?.items||[]).filter(item=>item.source!=='addon').map(item=>({...item,...(policyMap.get(String(item.product_id))||{})}));
    state.selectedBasket.selected_total=Number(state.selectedBasket.base_price??state.cart?.total??state.cart?.commercial_total??0);
    app.assistantMessage('Seu pedido está aberto. Você pode continuar de onde parou.',{className:'basket-confirm-message'});
    const summary=renderSelectedBasketSummary();state.modules.products?.renderEntry?.({auto:true});if(summary)scrollTo(summary,{block:'center'});
  }

  app.registerModule('baskets',{renderPicker,previewBasket,chooseBasket,renderSelectedBasket,renderSelectedBasketSummary,expandSelectedBasket,restoreFromOpen});
})();