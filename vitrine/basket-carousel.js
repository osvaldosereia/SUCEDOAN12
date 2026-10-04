/* Original catalog photographs; the selected sale-lot composition supplies quantities. */
window.BasketCarousel={
  card(b,esc,money,basketName){
    const items=Array.isArray(b.carousel_items)?b.carousel_items:[];
    const name=basketName(b.name),region='basket-products-'+b.id;
    const photos=items.map((p,i)=>{
      const quantity=Number(p.quantity),label=Number.isInteger(quantity)?String(quantity):quantity.toLocaleString('pt-BR');
      const url=/^(https?:\/\/|\/(?!\/))/i.test(String(p.image_url||''))?p.image_url:'';
      return '<div class="basket-product" title="'+esc(p.name)+'"><span class="basket-quantity">'+esc(label)+' un.</span>'+(url?'<img data-product-index="'+i+'" data-basket-src="'+esc(url)+'" width="108" height="138" decoding="async" alt="'+esc(p.name)+'">':'<span class="basket-photo-missing">'+esc(p.name)+'</span>')+'</div>';
    }).join('');
    return '<article class="card basket-card"><div class="basket-carousel"><div class="basket-product-strip" id="'+esc(region)+'" tabindex="0" role="region" aria-label="Produtos da '+esc(name)+'">'+(photos||'<span class="basket-photo-missing">Confira os produtos em Ver cesta</span>')+'</div><div class="basket-scroll-track" role="scrollbar" tabindex="0" aria-label="Percorrer produtos da '+esc(name)+'" aria-controls="'+esc(region)+'" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="basket-scroll-thumb"></span></div></div><div class="card-body basket-card-info"><div class="name">'+esc(name)+'</div><button type="button" class="add" data-basket="'+esc(b.id)+'" aria-label="Ver cesta '+esc(name)+'">Ver cesta</button><div class="price">'+money(b.display_price_cents)+'</div></div></article>';
  },
  mount(host){
    this.dispose?.();if(!host)return;
    const abort=new AbortController(),signal=abort.signal;
    const images=host.querySelectorAll('img[data-basket-src]');
    const load=img=>{img.src=img.dataset.basketSrc;img.removeAttribute('data-basket-src')};
    // Viewport intersection also respects the horizontal clipping of each carousel.
    // Native lazy loading alone may eagerly fetch far outside a horizontal strip.
    const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){load(entry.target);observer.unobserve(entry.target)}},{threshold:.01}):null;
    if(observer)images.forEach(img=>observer.observe(img));else images.forEach(load);
    const updates=[];
    host.querySelectorAll('.basket-carousel').forEach(carousel=>{
      const strip=carousel.querySelector('.basket-product-strip'),track=carousel.querySelector('.basket-scroll-track'),thumb=track.firstElementChild;
      const update=()=>{
        const max=strip.scrollWidth-strip.clientWidth,width=Math.max(24,track.clientWidth*strip.clientWidth/Math.max(1,strip.scrollWidth)),left=max>0?(track.clientWidth-width)*strip.scrollLeft/max:0;
        track.setAttribute('aria-disabled',String(max<=1));track.tabIndex=max>1?0:-1;
        thumb.style.width=width+'px';thumb.style.transform='translateX('+left+'px)';track.setAttribute('aria-valuenow',String(max>0?Math.round(strip.scrollLeft/max*100):0));
      };updates.push(update);
      strip.addEventListener('scroll',update,{passive:true,signal});
      const key=e=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
        e.preventDefault();const max=strip.scrollWidth-strip.clientWidth;
        strip.scrollLeft=e.key==='Home'?0:e.key==='End'?max:strip.scrollLeft+(e.key==='ArrowLeft'?-1:1)*Math.max(108,strip.clientWidth*.7);
      };strip.addEventListener('keydown',key,{signal});track.addEventListener('keydown',key,{signal});
      let drag=null;
      track.addEventListener('pointerdown',e=>{
        if(e.button!==0)return;e.preventDefault();track.focus();
        const rect=track.getBoundingClientRect(),t=thumb.getBoundingClientRect();
        const offset=e.target===thumb?e.clientX-t.left:t.width/2;
        drag={offset};track.setPointerCapture(e.pointerId);
        const range=rect.width-t.width;strip.scrollLeft=range>0?Math.max(0,Math.min(range,e.clientX-rect.left-offset))/range*(strip.scrollWidth-strip.clientWidth):0;update();
      },{signal});
      track.addEventListener('pointermove',e=>{if(!drag)return;const rect=track.getBoundingClientRect(),range=rect.width-thumb.getBoundingClientRect().width;strip.scrollLeft=range>0?Math.max(0,Math.min(range,e.clientX-rect.left-drag.offset))/range*(strip.scrollWidth-strip.clientWidth):0;update()},{signal});
      const end=()=>{drag=null};track.addEventListener('pointerup',end,{signal});track.addEventListener('pointercancel',end,{signal});track.addEventListener('lostpointercapture',end,{signal});
      update();
    });
    const resize='ResizeObserver'in window?new ResizeObserver(()=>updates.forEach(fn=>fn())):null;
    if(resize)host.querySelectorAll('.basket-product-strip').forEach(x=>resize.observe(x));
    else window.addEventListener('resize',()=>updates.forEach(fn=>fn()),{signal});
    this.dispose=()=>{observer?.disconnect();resize?.disconnect();abort.abort()};
  }
};
