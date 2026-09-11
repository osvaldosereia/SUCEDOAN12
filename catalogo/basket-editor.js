(()=>{
  'use strict';
  const ENDPOINT='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/basket-storefront-v1';
  const PLACEHOLDER='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#ECECEC"/></svg>');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  let basketsCache=null;

  function token(){return (new URLSearchParams(location.search).get('c')||'').trim()}
  async function post(action,payload={}){
    const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:token(),...payload}),cache:'no-store'});
    const data=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||!data.ok)throw new Error(data.error||'Falha ao carregar a cesta');
    return data;
  }
  async function getBaskets(){
    if(Array.isArray(basketsCache))return basketsCache;
    const api=window.DA_CATALOGO_CONFIG?.api;if(!api)throw new Error('catalog_config');
    const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'open',token:token()}),cache:'no-store'});
    const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'catalog_open_failed');
    basketsCache=data.baskets||[];return basketsCache;
  }
  function toast(msg){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1900)}

  async function openEditor(basket){
    const dialog=document.getElementById('basketDialog'),content=document.getElementById('basketDialogContent');if(!dialog||!content)return;
    content.innerHTML='<div class="state">Carregando cesta...</div>';if(!dialog.open)dialog.showModal();
    try{
      const data=await post('detail',{basket_id:basket.id}),b=data.basket;
      let selection=(b.selection||[]).map(x=>({product_id:String(x.product_id),quantity:Number(x.quantity||0)}));
      let total=Number(b.price||0),busy=false;
      content.innerHTML='<div class="basket-detail basket-editor"><div class="basket-detail-hero"><img alt=""><div><h2></h2><div class="basket-total-label">Valor da cesta</div><div class="basket-detail-price"></div></div></div><div class="basket-editor-note">Use − e + para ajustar. Quantidade 0 retira o produto.</div><div class="basket-detail-list"></div><div class="basket-dialog-actions"><button class="secondary" type="button">Continuar vendo</button><button class="primary" type="button">Enviar cesta no WhatsApp</button></div></div>';
      const hero=content.querySelector('.basket-detail-hero img'),priceEl=content.querySelector('.basket-detail-price'),list=content.querySelector('.basket-detail-list'),sendBtn=content.querySelector('.primary');
      hero.src=b.image_url||PLACEHOLDER;hero.alt=clean(b.name)||'Cesta';content.querySelector('h2').textContent=/cesta/i.test(b.name)?b.name:`Cesta ${b.name}`;priceEl.textContent=money(total);
      const payload=()=>selection.map(x=>({product_id:x.product_id,quantity:Number(x.quantity||0)}));
      const qty=id=>Number(selection.find(x=>x.product_id===id)?.quantity||0);
      const sync=q=>{selection=(q.selection||selection).map(x=>({product_id:String(x.product_id),quantity:Number(x.quantity||0)}));total=Number(q.total||0);priceEl.textContent=money(total)};
      const render=()=>{
        list.innerHTML='';
        for(const row of b.items||[]){
          const id=String(row.product_id),q=qty(id),removed=q===0,min=Math.max(0,Number(row.min_quantity||0)),max=Math.max(Number(row.base_quantity||0),Number(row.max_quantity??row.stock??0)),el=document.createElement('div');
          el.className=`basket-detail-item basket-edit-row${removed?' is-removed':''}`;
          el.innerHTML='<img alt=""><div class="basket-edit-copy"><strong></strong><span class="basket-removed-label"></span></div><div class="basket-stepper"><button class="basket-minus" type="button" aria-label="Diminuir">−</button><span class="basket-qty"></span><button class="basket-plus" type="button" aria-label="Aumentar">＋</button></div>';
          const img=el.querySelector('img'),minus=el.querySelector('.basket-minus'),plus=el.querySelector('.basket-plus');img.src=row.image_url||PLACEHOLDER;img.alt=clean(row.name);el.querySelector('strong').textContent=row.name;el.querySelector('.basket-removed-label').textContent=removed?'Removido':'';el.querySelector('.basket-qty').textContent=String(q);minus.disabled=busy||q<=min;plus.disabled=busy||q>=max;
          const adjust=async delta=>{
            if(busy)return;const current=qty(id),next=Math.max(min,Math.min(max,current+delta));if(next===current){if(delta>0&&current>=max)toast('Estoque máximo deste produto atingido.');return}
            const old=selection.map(x=>({...x})),target=selection.find(x=>x.product_id===id);if(target)target.quantity=next;else selection.push({product_id:id,quantity:next});busy=true;render();
            try{const qd=await post('quote',{basket_id:b.id,selection:payload()});sync(qd)}catch(err){selection=old;toast(err.message||'Não foi possível alterar a cesta')}finally{busy=false;render()}
          };
          minus.addEventListener('click',()=>adjust(-1));plus.addEventListener('click',()=>adjust(1));list.appendChild(el);
        }
      };
      render();
      content.querySelector('.secondary').addEventListener('click',()=>dialog.close());
      sendBtn.addEventListener('click',async()=>{if(busy)return;sendBtn.disabled=true;sendBtn.textContent='Abrindo WhatsApp...';try{const result=await post('send',{basket_id:b.id,selection:payload()});location.href=result.whatsapp_url}catch(err){toast(err.message==='basket_empty'?'A cesta ficou sem produtos.':err.message||'Não foi possível enviar');sendBtn.disabled=false;sendBtn.textContent='Enviar cesta no WhatsApp'}});
    }catch(err){content.innerHTML='<div class="state">Não foi possível abrir esta cesta.</div>';toast(err.message||'Falha ao abrir a cesta')}
  }

  document.addEventListener('click',async e=>{
    const card=e.target.closest?.('.basket-card');if(!card||!document.getElementById('basketRail')?.contains(card))return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    try{const cards=[...document.querySelectorAll('#basketRail .basket-card')],index=cards.indexOf(card),baskets=await getBaskets(),basket=baskets[index];if(!basket)throw new Error('basket_not_found');await openEditor(basket)}catch(err){toast(err.message||'Não foi possível abrir a cesta')}
  },true);
})();
