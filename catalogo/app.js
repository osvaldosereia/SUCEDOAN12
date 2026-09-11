(()=>{
  'use strict';
  const C=window.DA_CATALOGO_CONFIG||{};
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let token=(params.get('c')||params.get('t')||params.get('token')||'').trim();
  const initialQuery=(params.get('q')||'').trim();
  let state={session:null,items:[],cart:null,whatsappUrl:'',filter:initialQuery};
  const tokenOk=v=>/^[a-f0-9]{64}$/i.test(String(v||''));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const toast=msg=>{const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800)};
  async function api(action,payload={}){
    const r=await fetch(C.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...payload}),cache:'no-store'});
    const data=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||!data.ok)throw new Error(data.detail||data.error||'Falha no catálogo');
    return data;
  }
  function rememberToken(next){
    if(!tokenOk(next))return;
    token=next;
    params.set('c',token);
    params.delete('t');params.delete('token');
    const qs=params.toString();
    history.replaceState(null,'',`${location.pathname}${qs?'?'+qs:''}${location.hash||''}`);
  }
  function filtered(){
    const q=text(state.filter).toLowerCase();if(!q)return state.items;
    return state.items.filter(x=>{const p=x.product||{};return [p.name,p.brand,p.category,p.packaging].some(v=>text(v).toLowerCase().includes(q))});
  }
  function totals(){
    let count=0,total=0;
    state.items.forEach(x=>{const q=Number(x.quantity||0),price=Number(x.product?.price||0);count+=q;total+=q*price});
    $('selectedCount').textContent=`${count} ${count===1?'item':'itens'}`;
    $('countBadge').textContent=String(count);
    $('selectedTotal').textContent=state.cart?.total!=null?money(state.cart.total):money(total);
    $('stickyBar').classList.remove('hidden');
  }
  function render(){
    const host=$('productGrid');host.innerHTML='';
    const list=filtered();
    if(!list.length){$('stateBox').textContent=state.items.length?'Nenhum produto encontrado.':'Nenhum produto disponível.';$('stateBox').classList.remove('hidden');host.classList.add('hidden');totals();return}
    $('stateBox').classList.add('hidden');host.classList.remove('hidden');
    for(const item of list){
      const p=item.product||{},frag=$('productTemplate').content.cloneNode(true),card=frag.querySelector('.product');
      card.dataset.id=item.product_id;
      const img=frag.querySelector('.product-image');
      img.src=p.image_url||'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="#ECECEC"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#80868b" font-family="Arial" font-size="28">sem foto</text></svg>');
      img.alt=text(p.name)||'Produto';img.loading='lazy';img.decoding='async';
      frag.querySelector('.product-name').textContent=text(p.name)||'Produto';
      const meta=[text(p.packaging),text(p.brand)].filter(Boolean).join(' · ');
      const metaEl=frag.querySelector('.product-meta');metaEl.textContent=meta;if(!meta)metaEl.hidden=true;
      frag.querySelector('.product-price').textContent=money(p.price);
      const qty=Number(item.quantity||0),qtyEl=frag.querySelector('.qty'),minus=frag.querySelector('.minus'),plus=frag.querySelector('.plus');
      qtyEl.textContent=String(qty);minus.disabled=qty<=0;
      minus.addEventListener('click',()=>change(item,-1,card));
      plus.addEventListener('click',()=>change(item,1,card));
      host.appendChild(frag);
    }
    totals();
  }
  async function change(item,delta,card){
    const current=Number(item.quantity||0),next=Math.max(0,Math.min(999,current+delta));if(next===current)return;
    card.classList.add('busy');
    try{
      const data=await api('set_quantity',{product_id:item.product_id,quantity:next});item.quantity=next;if(data.cart)state.cart=data.cart;render();
    }catch(e){toast(e.message||'Não foi possível alterar');card.classList.remove('busy')}
  }
  function applyOpen(data){
    if(data.token)rememberToken(data.token);
    state.session=data.session;state.items=data.items||[];state.cart=data.cart||null;state.whatsappUrl=data.whatsapp_url||'';
    const sessionTitle=text(data.session?.title);
    $('catalogTitle').textContent=initialQuery?`Resultados para “${initialQuery}”`:(sessionTitle&&sessionTitle.toLowerCase()!=='vitrine dona antônia'?sessionTitle:'Produtos');
    $('searchInput').value=initialQuery;
    render();
  }
  async function open(){
    try{
      const data=tokenOk(token)?await api('open'):await api('open_public',{query:initialQuery});
      applyOpen(data);
    }catch(e){
      $('stateBox').textContent=e.message==='catalog_unavailable'?'Esta vitrine expirou ou não está mais disponível.':'Não foi possível abrir esta vitrine.';
    }
  }
  $('searchInput').addEventListener('input',e=>{state.filter=e.target.value;render()});
  $('whatsappButton').addEventListener('click',async()=>{
    try{const data=await api('return_whatsapp');location.href=data.whatsapp_url||state.whatsappUrl||'https://wa.me/5565984491018'}catch{location.href=state.whatsappUrl||'https://wa.me/5565984491018'}
  });
  open();
})();
