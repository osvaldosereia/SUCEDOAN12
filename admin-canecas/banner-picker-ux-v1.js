(()=>{
  'use strict';

  const BUILD='20260830-banner-picker-ux-v1';
  const ROOT_SELECTOR='#banners';
  const selectedCache=new Map();
  let scheduled=false;

  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const root=()=>document.querySelector(ROOT_SELECTOR);
  const cards=()=>[...(root()?.querySelectorAll('[data-banner-product]')||[])];
  const cardByKey=key=>cards().find(card=>card.dataset.bannerProduct===key);

  function injectStyles(){
    if(document.getElementById('bannerPickerUxStyles'))return;
    const style=document.createElement('style');
    style.id='bannerPickerUxStyles';
    style.textContent=`
      .banner-selected-carousel{display:grid;gap:8px;border:1px solid #dce2e7;background:#f8fafb;border-radius:14px;padding:10px 10px 9px;margin-bottom:2px}
      .banner-selected-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .banner-selected-head>div:first-child{display:flex;align-items:baseline;gap:7px;min-width:0}
      .banner-selected-head b{font-size:12px;color:#1b2026}.banner-selected-head small{font-size:10px;color:#747c85}
      .banner-selected-nav{display:flex;gap:5px}.banner-selected-nav button{width:29px;height:29px;border:1px solid #dbe0e5;border-radius:9px;background:#fff;color:#313840;cursor:pointer;font-weight:900;line-height:1}
      .banner-selected-nav button:hover{border-color:#22b7b9;color:#16888a}
      .banner-selected-track{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;padding:1px 1px 5px;scrollbar-width:thin;overscroll-behavior-x:contain}
      .banner-selected-item{position:relative;flex:0 0 92px;border:1px solid #dfe4e8;border-radius:12px;background:#fff;padding:6px;box-sizing:border-box;box-shadow:0 2px 8px rgba(18,24,33,.04)}
      .banner-selected-item img{display:block;width:78px;height:70px;object-fit:contain;border-radius:8px;background:#f4f6f7}
      .banner-selected-item .no-img{width:78px;height:70px;display:grid;place-items:center;border-radius:8px;background:#f0f2f4;color:#9299a1;font-size:9px}
      .banner-selected-item b{display:block;margin-top:5px;font-size:9px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#20252b}
      .banner-selected-item small{display:block;font-size:8px;color:#818891;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
      .banner-selected-remove{position:absolute;right:3px;top:3px;width:23px;height:23px;border:0;border-radius:999px;background:#fff;color:#a33131;box-shadow:0 2px 8px rgba(0,0,0,.16);font-size:15px;font-weight:900;cursor:pointer;display:grid;place-items:center;padding:0}
      .banner-selected-remove:hover{background:#fff0f0}
      .banner-selected-empty{padding:8px 4px;color:#7d858e;font-size:11px}
      @media(max-width:620px){.banner-selected-item{flex-basis:82px}.banner-selected-item img,.banner-selected-item .no-img{width:68px;height:62px}}
    `;
    document.head.appendChild(style);
  }

  function dataFromCard(card){
    if(!card)return null;
    const key=card.dataset.bannerProduct||'';
    if(!key)return null;
    return {
      key,
      img:card.querySelector('img')?.currentSrc||card.querySelector('img')?.src||'',
      name:card.querySelector('span b')?.textContent?.trim()||key,
      sku:card.querySelector('span small')?.textContent?.trim()||''
    };
  }

  function syncVisibleSelection(){
    cards().forEach(card=>{
      const item=dataFromCard(card);if(!item)return;
      if(card.classList.contains('selected')||card.getAttribute('aria-pressed')==='true')selectedCache.set(item.key,item);
      else if(selectedCache.has(item.key))selectedCache.delete(item.key);
    });
  }

  function selectedCarouselHtml(){
    const items=[...selectedCache.values()];
    return `<div class="banner-selected-head"><div><b>Canecas selecionadas</b><small>${items.length} selecionada${items.length===1?'':'s'}</small></div><div class="banner-selected-nav"><button type="button" data-selected-scroll="left" aria-label="Anterior">‹</button><button type="button" data-selected-scroll="right" aria-label="Próximas">›</button></div></div><div class="banner-selected-track">${items.length?items.map(item=>`<article class="banner-selected-item" data-selected-key="${esc(item.key)}">${item.img?`<img src="${esc(item.img)}" alt="${esc(item.name)}">`:'<div class="no-img">Sem foto</div>'}<button type="button" class="banner-selected-remove" data-selected-remove="${esc(item.key)}" title="Remover esta caneca" aria-label="Remover ${esc(item.name)}">×</button><b title="${esc(item.name)}">${esc(item.name)}</b><small>${esc(item.sku)}</small></article>`).join(''):'<div class="banner-selected-empty">As canecas escolhidas aparecerão aqui para você conferir e remover rapidamente.</div>'}</div>`;
  }

  function bindCarousel(box){
    const track=box.querySelector('.banner-selected-track');
    box.querySelectorAll('[data-selected-scroll]').forEach(btn=>btn.onclick=()=>track?.scrollBy({left:btn.dataset.selectedScroll==='left'?-310:310,behavior:'smooth'}));
    box.querySelectorAll('[data-selected-remove]').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();removeSelected(btn.dataset.selectedRemove)});
  }

  function ensureCarousel(){
    const picker=root()?.querySelector('.banner-product-picker');
    const tools=picker?.querySelector('.banner-product-tools');
    if(!picker||!tools)return;
    let box=picker.querySelector('.banner-selected-carousel');
    if(!box){box=document.createElement('div');box.className='banner-selected-carousel';picker.insertBefore(box,tools)}
    const signature=[...selectedCache.values()].map(item=>`${item.key}|${item.img}|${item.name}|${item.sku}`).join('||')||'__empty__';
    if(box.dataset.signature===signature)return;
    box.dataset.signature=signature;
    box.innerHTML=selectedCarouselHtml();
    bindCarousel(box);
  }

  function restoreListPosition(scrollTop,scrollLeft,pageX,pageY){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const grid=root()?.querySelector('.banner-product-grid');
      if(grid){grid.scrollTop=scrollTop;grid.scrollLeft=scrollLeft}
      if(Number.isFinite(pageY))window.scrollTo(pageX,pageY);
      scheduleEnhance();
    }));
  }

  function wrapProductCards(){
    cards().forEach(card=>{
      if(card.dataset.bannerUxBound==='1')return;
      card.dataset.bannerUxBound='1';
      const original=card.onclick;
      card.onclick=function(ev){
        const grid=card.closest('.banner-product-grid');
        const scrollTop=grid?.scrollTop||0,scrollLeft=grid?.scrollLeft||0,pageX=window.scrollX,pageY=window.scrollY;
        const beforeSelected=card.classList.contains('selected')||card.getAttribute('aria-pressed')==='true';
        const item=dataFromCard(card);
        if(item){if(beforeSelected)selectedCache.delete(item.key);else selectedCache.set(item.key,item)}
        const result=original?.call(this,ev);
        restoreListPosition(scrollTop,scrollLeft,pageX,pageY);
        return result;
      };
    });
  }

  function removeSelected(key){
    if(!key)return;
    const visible=cardByKey(key);
    if(visible&&(visible.classList.contains('selected')||visible.getAttribute('aria-pressed')==='true')){visible.click();return}

    const item=selectedCache.get(key);
    const search=root()?.querySelector('#bnProductSearch');
    if(!item||!search){selectedCache.delete(key);ensureCarousel();return}
    const oldQuery=search.value;
    const lookup=item.sku||item.name||key;
    search.value=lookup;
    search.dispatchEvent(new Event('input',{bubbles:true}));
    setTimeout(()=>{
      const card=cardByKey(key);
      if(card&&(card.classList.contains('selected')||card.getAttribute('aria-pressed')==='true'))card.click();
      else selectedCache.delete(key);
      setTimeout(()=>{
        const current=root()?.querySelector('#bnProductSearch');
        if(current){current.value=oldQuery;current.dispatchEvent(new Event('input',{bubbles:true}))}
        scheduleEnhance();
      },80);
    },80);
  }

  function enhance(){
    scheduled=false;
    if(!location.hash.includes('banners')||!root())return;
    syncVisibleSelection();
    wrapProductCards();
    ensureCarousel();
    document.documentElement.dataset.bannerPickerUx=BUILD;
  }

  function scheduleEnhance(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance)}

  injectStyles();
  const observer=new MutationObserver(scheduleEnhance);
  const boot=()=>{const r=root();if(!r)return setTimeout(boot,120);observer.observe(r,{childList:true,subtree:true});scheduleEnhance()};
  boot();
  window.addEventListener('admin-canecas:route',e=>{if(e.detail?.route==='banners')setTimeout(scheduleEnhance,0)});
})();
