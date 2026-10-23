/* Original catalog photographs; the selected sale-lot composition supplies quantities. */
(() => {
  'use strict';
  const TOKEN_RE=/^[0-9a-f]{36}$/i;
  const TRACKING_STORE='da_marketing_tracking_v1';
  const MARKETING_CONTEXT_KEY='da_vitrine_marketing_context_v1';
  const TRACKING_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/marketing-tracking-v1';
  const WINDOW_MS=7*24*60*60*1000;
  let trackingToken='';

  function cleanToken(value){const token=String(value??'').trim().toLowerCase();return TOKEN_RE.test(token)?token:''}
  function storedToken(){
    try{
      const saved=JSON.parse(localStorage.getItem(TRACKING_STORE)||'null');
      if(!saved||Number(saved.expires_at||0)<=Date.now()){localStorage.removeItem(TRACKING_STORE);return ''}
      return cleanToken(saved.token);
    }catch{return ''}
  }
  function rememberToken(token){try{localStorage.setItem(TRACKING_STORE,JSON.stringify({token,expires_at:Date.now()+WINDOW_MS}))}catch{}}
  function syncMarketingContext(){
    if(!trackingToken)return;
    try{
      let ctx=JSON.parse(sessionStorage.getItem(MARKETING_CONTEXT_KEY)||'null');
      const fresh=ctx&&typeof ctx==='object'&&!Array.isArray(ctx)&&Date.now()-Number(ctx.captured_at||0)<=4*60*60*1000;
      if(!fresh)ctx={};
      ctx.tracking_token=trackingToken;
      ctx.captured_at=Date.now();
      sessionStorage.setItem(MARKETING_CONTEXT_KEY,JSON.stringify(ctx));
    }catch{}
  }
  async function track(action){
    if(!trackingToken)return;
    try{await fetch(`${TRACKING_API}?action=${encodeURIComponent(action)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:trackingToken}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'})}catch{}
  }

  try{
    const url=new URL(location.href),incoming=cleanToken(url.searchParams.get('mt'));
    trackingToken=incoming||storedToken();
    if(incoming){rememberToken(incoming);url.searchParams.delete('mt');history.replaceState(null,'',url.pathname+(url.search?'?'+url.searchParams.toString():'')+url.hash)}
  }catch{trackingToken=storedToken()}

  if(trackingToken){
    syncMarketingContext();
    window.setTimeout(syncMarketingContext,0);
    void track('open');
    document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('#sendWhats'):null;if(target)void track('checkout')},true);
  }
  window.DAMarketingTracking={get tracking_token(){return trackingToken},syncMarketingContext};
})();

window.BasketCarousel={
  card(b,esc,money,basketName,index=99){
    const sizePhotos={
      grande:'/img/CESTA-GRANDE-ALVINO.webp',
      media:'/img/CESTA-MEDIA-BONINI.webp',
      pequena:'/img/CESTA-PEQUENA-BONINI.webp',
      mini:'/img/CESTA-MINI-BONINI.webp',
      economica:'/img/cesta-basica-cuiaba-varzea-grande-economica.avif'
    };
    const sizeKeyOf=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const name=basketName(b.name),key=String(b.card_key||b.id);
    const sizeKey=sizeKeyOf(b.size_key||b.subcategory_name||b.name);
    const hasSizePhoto=Object.prototype.hasOwnProperty.call(sizePhotos,sizeKey);
    const sizeCard=b.size_card===true||hasSizePhoto;
    const sizeClass=sizeCard?' basket-size-card basket-size-'+esc(sizeKey):'';
    const itemCount=Math.max(0,Math.floor(Number(b.total_item_count)||0));
    const itemSummary=sizeCard&&!b.home_shell?'<div class="basket-card-item-total">'+itemCount+' itens</div>':'';const priceMarkup=b.home_shell?'':'<div class="price"><span class="basket-price-prefix">A partir de:</span><strong class="basket-price-amount">'+money(b.display_price_cents)+'</strong></div>';
    const catalogImage=String(b.image_url||'').trim();
    const safeCatalogImage=(catalogImage.startsWith('/')&&!catalogImage.startsWith('//'))||/^https:\/\//i.test(catalogImage)?catalogImage:'';
    const imagePath=sizeCard?(safeCatalogImage||sizePhotos[sizeKey]||''):'';
    const imageAttrs=index===0?'src="'+esc(imagePath)+'" loading="eager" fetchpriority="high"':'data-basket-src="'+esc(imagePath)+'" loading="lazy"';
    const image=imagePath?'<div class="basket-size-card-photo"><img '+imageAttrs+' decoding="async" alt="Cesta '+esc(name)+'"></div>':'';
    const actionLabel=sizeCard?'Ver produtos':'Personalizar';
    const actionAria=sizeCard?'Ver produtos da cesta ':'Personalizar cesta ';
    return '<article class="card basket-card'+sizeClass+'">'+image+'<div class="card-body basket-card-info"><div class="basket-card-title name">'+esc(name)+'</div>'+itemSummary+priceMarkup+'<button type="button" class="add" data-basket="'+esc(key)+'" aria-label="'+actionAria+esc(name)+'">'+actionLabel+'</button></div></article>';
  },
  prepareHome(host){
    const section=host?.closest?.('.section');if(!section)return;
    section.querySelector('.basket-category-list')?.remove();
    const heading=section.querySelector('.section-head h2');
    if(heading?.textContent?.trim()==='Cestas e Kits')heading.closest('.section-head')?.remove();
  },
  mount(host){
    this.dispose?.();if(!host)return;
    this.prepareHome(host);
    const images=host.querySelectorAll('img[data-basket-src]');
    const load=img=>{img.src=img.dataset.basketSrc;img.removeAttribute('data-basket-src')};
    // Load card photos only when their cards approach the viewport.
    const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){load(entry.target);observer.unobserve(entry.target)}},{threshold:.01}):null;
    if(observer)images.forEach(img=>observer.observe(img));else images.forEach(load);
    this.dispose=()=>observer?.disconnect();
  }
};