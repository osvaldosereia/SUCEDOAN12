import { contrastInk, getConfig, getProducts, money, norm, productArray } from './shared/api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const viewer = $('#viewer');
const toastEl = $('#toast');
const STORAGE_FAVORITES = 'canecafacil_v2_favoritos';
const STORAGE_CART = 'canecafacil_v2_carrinho';
const PERSONALIZER_BASE = 'https://donaantonia.com.br/loja-integrada/personalizar/';

const demoProducts = [
  { id:'demo-cafe', nome:'Café, boas ideias', slug:'cafe-boas-ideias', categoria:'Café', subcategoria:'Humor', fundo:'#FF6B1A', preco:24.9, ativo:true, personalizavel:true, mockup_png:'./assets/mockup-demo.svg', descricao_curta:'Uma caneca para ideias grandes e cafés maiores ainda.', ordem:1 },
  { id:'demo-treino', nome:'Descanso entre séries', slug:'descanso-entre-series', categoria:'Academia', subcategoria:'Humor', fundo:'#95DDD0', preco:24.9, ativo:true, personalizavel:true, mockup_png:'./assets/mockup-treino.svg', descricao_curta:'Para quem leva o treino a sério e o descanso mais ainda.', ordem:2 },
  { id:'demo-prof', nome:'Profissional do improviso', slug:'profissional-do-improviso', categoria:'Profissões', subcategoria:'Humor', fundo:'#F5C54D', preco:24.9, ativo:true, personalizavel:false, mockup_png:'./assets/mockup-profissoes.svg', descricao_curta:'Humor cotidiano em forma de caneca.', ordem:3 },
  { id:'demo-beach', nome:'Só mais uma partida', slug:'so-mais-uma-partida', categoria:'Beach Tennis', subcategoria:'Esportes', fundo:'#C9B9F2', preco:24.9, ativo:true, personalizavel:true, mockup_png:'./assets/mockup-beach.svg', descricao_curta:'Para quem nunca sabe quando é realmente a última.', ordem:4 },
];

const state = {
  config:{ marca:'CanecaFácil', preco_padrao:24.9 },
  products:[],
  mode:'home',
  favoriteIds:new Set(loadJson(STORAGE_FAVORITES, [])),
  cart:loadJson(STORAGE_CART, []),
  activeId:'',
  browser:{ category:'', subcategory:'', query:'', index:0, filtered:[] },
};

function loadJson(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; }
}
function saveFavorites(){ localStorage.setItem(STORAGE_FAVORITES, JSON.stringify([...state.favoriteIds])); }
function saveCart(){ localStorage.setItem(STORAGE_CART, JSON.stringify(state.cart)); updateCartBadge(); }
function toast(message){ if(!toastEl) return; toastEl.textContent=message; toastEl.classList.add('show'); clearTimeout(toast._timer); toast._timer=setTimeout(()=>toastEl.classList.remove('show'),1800); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(value){ return escapeHtml(value); }
function cssEscape(value){ return String(value).replace(/(["\\])/g,'\\$1'); }
function activeProducts(){ return state.products.filter(p=>p.ativo!==false); }
function visibleProducts(){ return state.mode==='favorites' ? activeProducts().filter(p=>state.favoriteIds.has(p.id)) : activeProducts(); }
function sorted(list){ return [...list].sort((a,b)=>(a.ordem||0)-(b.ordem||0)||a.nome.localeCompare(b.nome,'pt-BR')); }
function productFromUrl(){ return new URLSearchParams(location.search).get('produto') || ''; }
function productById(id){ return state.products.find(p=>p.id===id || p.slug===id); }

function setTheme(product){
  if(!product) return;
  const bg=product.fundo || '#FF6B1A';
  const ink=contrastInk(bg);
  document.documentElement.style.setProperty('--bg',bg);
  document.documentElement.style.setProperty('--ink',ink);
  document.body.style.backgroundColor=bg;
  document.body.style.color=ink;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',bg);
  $('#personalizerOverlay')?.style.setProperty('--bg',bg);
  $('#descriptionOverlay')?.style.setProperty('--product-bg',bg);
  state.activeId=product.id;
}

function sceneTemplate(product,index,total){
  const mockup=product.mockup_png || './assets/mockup-demo.svg';
  const favorite=state.favoriteIds.has(product.id);
  return `<article class="scene" id="produto-${escapeAttr(product.slug)}" data-product-id="${escapeAttr(product.id)}" style="--scene-bg:${escapeAttr(product.fundo||'#FF6B1A')};--scene-ink:${contrastInk(product.fundo||'#FF6B1A')}">
    <div class="mockup-wrap"><img class="mockup" src="${escapeAttr(mockup)}" alt="Mockup da ${escapeAttr(product.nome)}" loading="${index<2?'eager':'lazy'}" decoding="async"></div>
    <section class="scene-copy">
      <p class="eyebrow">${escapeHtml([product.categoria,product.subcategoria].filter(Boolean).join(' · '))}</p>
      <h1>${escapeHtml(product.nome)}</h1>
      <div class="scene-price-row"><p class="price">${money(product.preco)}</p><button class="info-link" data-description="${escapeAttr(product.id)}">Detalhes</button></div>
      <div class="cta-row"><button class="cta primary buy-cta" data-buy="${escapeAttr(product.id)}">Comprar</button>${product.personalizavel?`<button class="cta secondary personalize-cta" data-personalize="${escapeAttr(product.id)}">Personalizar</button>`:''}</div>
    </section>
    <aside class="scene-side" aria-label="Ações desta caneca">
      <div class="scene-actions">
        <button class="scene-action ${favorite?'favorited':''}" data-favorite="${escapeAttr(product.id)}" aria-label="${favorite?'Remover dos favoritos':'Favoritar'}"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg></button>
        <button class="scene-action" data-share="${escapeAttr(product.id)}" aria-label="Compartilhar"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.3 10.9 7.4-4.5M8.3 13.1l7.4 4.5"/></svg></button>
        <button class="scene-action" data-description="${escapeAttr(product.id)}" aria-label="Detalhes"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg></button>
      </div><span class="scene-index">${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span>
    </aside>
  </article>`;
}

function renderViewer({preserveProduct=''}={}){
  const list=sorted(visibleProducts());
  if(!list.length){ viewer.innerHTML=`<section class="empty-state"><div><h1>Nenhuma caneca aqui ainda.</h1><p>${state.mode==='favorites'?'Favorite uma caneca tocando no coração e ela aparecerá aqui.':'Cadastre a primeira caneca no Admin CanecaFácil.'}</p></div></section>`; return; }
  viewer.innerHTML=list.map((p,i)=>sceneTemplate(p,i,list.length)).join('');
  bindSceneActions(); observeScenes();
  const wanted=preserveProduct || productFromUrl();
  const target=list.find(p=>p.id===wanted || p.slug===wanted) || list[0];
  setTheme(target);
  requestAnimationFrame(()=>document.getElementById(`produto-${target.slug}`)?.scrollIntoView({block:'start'}));
}

function bindSceneActions(){
  $$('[data-favorite]',viewer).forEach(btn=>btn.addEventListener('click',()=>toggleFavorite(btn.dataset.favorite)));
  $$('[data-share]',viewer).forEach(btn=>btn.addEventListener('click',()=>shareProduct(btn.dataset.share)));
  $$('[data-buy]',viewer).forEach(btn=>btn.addEventListener('click',()=>addToCart(btn.dataset.buy)));
  $$('[data-description]',viewer).forEach(btn=>btn.addEventListener('click',()=>openDescription(btn.dataset.description)));
  $$('[data-personalize]',viewer).forEach(btn=>btn.addEventListener('click',()=>openPersonalizer(btn.dataset.personalize)));
}

function observeScenes(){
  window._cfSceneObserver?.disconnect();
  const observer=new IntersectionObserver(entries=>{
    const best=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(!best || best.intersectionRatio<.48) return;
    const product=productById(best.target.dataset.productId); if(!product) return;
    setTheme(product);
    const url=new URL(location.href); if(url.searchParams.get('produto')!==product.slug){ url.searchParams.set('produto',product.slug); history.replaceState({},'',url); }
  },{root:viewer,threshold:[.48,.62,.82]});
  $$('.scene',viewer).forEach(scene=>observer.observe(scene));
  window._cfSceneObserver=observer;
}

function scenes(){ return $$('.scene',viewer); }
function activeSceneIndex(){
  const list=scenes(); if(!list.length) return -1;
  const middle=viewer.getBoundingClientRect().top+viewer.clientHeight/2;
  let best=0,d=Infinity;
  list.forEach((scene,i)=>{ const r=scene.getBoundingClientRect(); const x=Math.abs((r.top+r.height/2)-middle); if(x<d){d=x;best=i;} });
  return best;
}
function goScene(index,behavior='smooth'){ const list=scenes(); if(!list.length)return; const safe=Math.max(0,Math.min(list.length-1,index)); list[safe]?.scrollIntoView({block:'start',behavior}); }

let touchStart=null;
viewer?.addEventListener('touchstart',event=>{
  if(event.touches.length!==1 || event.target.closest('button,a,input,textarea,select')){ touchStart=null; return; }
  const t=event.touches[0]; touchStart={x:t.clientX,y:t.clientY,index:activeSceneIndex()};
},{passive:true});
viewer?.addEventListener('touchend',event=>{
  if(!touchStart || !event.changedTouches.length) return;
  const t=event.changedTouches[0], dx=t.clientX-touchStart.x, dy=t.clientY-touchStart.y;
  if(Math.abs(dy)>=46 && Math.abs(dy)>Math.abs(dx)*1.15) goScene(touchStart.index+(dy<0?1:-1));
  touchStart=null;
},{passive:true});

function toggleFavorite(id){
  const had=state.favoriteIds.has(id); if(had)state.favoriteIds.delete(id); else state.favoriteIds.add(id); saveFavorites();
  if(state.mode==='favorites') renderViewer({preserveProduct:state.activeId}); else $$(`[data-favorite="${cssEscape(id)}"]`,viewer).forEach(btn=>btn.classList.toggle('favorited',!had));
  toast(had?'Removida dos favoritos':'Salva nos favoritos');
}
async function shareProduct(id){
  const p=productById(id); if(!p)return; const url=new URL(location.href); url.searchParams.set('produto',p.slug);
  try{ if(navigator.share) await navigator.share({title:`${p.nome} · CanecaFácil`,text:`Olha esta caneca: ${p.nome}`,url:url.toString()}); else{await navigator.clipboard.writeText(url.toString());toast('Link copiado');} }catch(e){ if(e?.name!=='AbortError')toast('Não foi possível compartilhar agora'); }
}
function addToCart(id){
  const p=productById(id); if(!p)return; const item=state.cart.find(x=>x.id===p.id&&!x.creationCode);
  if(item)item.qtd=Math.min(20,Number(item.qtd||1)+1); else state.cart.push({id:p.id,slug:p.slug,nome:p.nome,preco:p.preco,mockup_png:p.mockup_png,fundo:p.fundo,qtd:1});
  saveCart(); toast('Caneca adicionada à sacola');
}
function updateCartBadge(){ const badge=$('#cartBadge'); if(!badge)return; const n=state.cart.reduce((s,i)=>s+Math.max(1,Number(i.qtd||1)),0); badge.textContent=n>99?'99+':String(n); badge.hidden=!n; }

function openDescription(id){
  const p=productById(id), overlay=$('#descriptionOverlay'); if(!p||!overlay)return;
  overlay.style.setProperty('--product-bg',p.fundo||'#FF6B1A'); $('#descriptionCategory').textContent=[p.categoria,p.subcategoria].filter(Boolean).join(' · '); $('#descriptionName').textContent=p.nome; $('#descriptionPrice').textContent=money(p.preco); $('#descriptionText').textContent=p.descricao_curta||'Caneca de porcelana com arte CanecaFácil.'; $('#descriptionMockup').src=p.mockup_png||'./assets/mockup-demo.svg'; $('#descriptionMockup').alt=`Mockup da ${p.nome}`; $('#descriptionBuy').dataset.buySheet=p.id; overlay.hidden=false; document.body.style.overflow='hidden';
}
function openPersonalizer(id){
  const p=productById(id); if(!p)return; if(!p.personalizavel)return toast('Esta caneca não está marcada como personalizável');
  const url=new URL(PERSONALIZER_BASE); url.searchParams.set('model',p.personalizador_modelo_key||p.id); url.searchParams.set('embed','1'); url.searchParams.set('store_v2','1'); url.searchParams.set('return',location.href); $('#personalizerFrame').src=url.toString(); $('#personalizerOverlay').hidden=false; document.body.style.overflow='hidden';
}
function closeOverlay(id){ const overlay=document.getElementById(id); if(!overlay)return; overlay.hidden=true; if(id==='personalizerOverlay')$('#personalizerFrame').src='about:blank'; document.body.style.overflow=''; }

function openCart(){
  const overlay=$('#cartOverlay'), root=$('#cartItems'); if(!overlay||!root)return;
  root.innerHTML=state.cart.length?state.cart.map(item=>`<article class="cart-row"><img src="${escapeAttr(item.mockup_png||'./assets/mockup-demo.svg')}" alt=""><div><strong>${escapeHtml(item.nome)}</strong><small>${Math.max(1,Number(item.qtd||1))} × ${money(item.preco)}</small><div class="cart-qty"><button data-qty="-1" data-cart-id="${escapeAttr(item.id)}" aria-label="Diminuir">−</button><span>${Math.max(1,Number(item.qtd||1))}</span><button data-qty="1" data-cart-id="${escapeAttr(item.id)}" aria-label="Aumentar">+</button></div></div><button class="cart-remove" data-cart-remove="${escapeAttr(item.id)}" aria-label="Remover">×</button></article>`).join(''):'<p class="cart-empty">Sua sacola está vazia.</p>';
  const total=state.cart.reduce((s,i)=>s+Number(i.preco||0)*Math.max(1,Number(i.qtd||1)),0); $('#cartTotal').textContent=money(total);
  $$('[data-qty]',root).forEach(btn=>btn.addEventListener('click',()=>{ const item=state.cart.find(x=>x.id===btn.dataset.cartId); if(!item)return; item.qtd=Math.max(1,Math.min(20,Number(item.qtd||1)+Number(btn.dataset.qty))); saveCart(); openCart(); }));
  $$('[data-cart-remove]',root).forEach(btn=>btn.addEventListener('click',()=>{ state.cart=state.cart.filter(x=>x.id!==btn.dataset.cartRemove); saveCart(); openCart(); }));
  overlay.hidden=false; document.body.style.overflow='hidden';
}

function setNav(action){ $$('.nav-button').forEach(btn=>btn.classList.toggle('active',btn.dataset.action===action)); }
function handleAction(action){
  if(action==='home'){ state.mode='home'; setNav('home'); renderViewer({preserveProduct:state.activeId}); }
  else if(action==='favorites'){ state.mode='favorites'; setNav('favorites'); renderViewer(); }
  else if(action==='explore'){ setNav('explore'); openBrowser(false); }
  else if(action==='search'){ openBrowser(true); }
  else if(action==='cart') openCart();
}

function legalValue(...keys){ for(const key of keys){ const v=String(state.config?.[key]??'').trim(); if(v)return v; } return ''; }
function storeInfo(){
  return { email:legalValue('email','email_contato','contato_email'), whatsapp:legalValue('whatsapp','telefone','celular'), instagram:legalValue('instagram','instagram_url'), facebook:legalValue('facebook','facebook_url'), tiktok:legalValue('tiktok','tiktok_url'), razao:legalValue('razao_social','nome_empresarial'), cnpj:legalValue('cnpj','cpf_cnpj'), endereco:legalValue('endereco','endereco_completo') };
}
function socialUrl(kind,value){ if(!value)return''; if(/^https?:\/\//i.test(value))return value; const clean=value.replace(/^@/,'').trim(); if(kind==='whatsapp'){ const d=clean.replace(/\D/g,''); return d?`https://wa.me/${d.startsWith('55')?d:`55${d}`}`:''; } if(kind==='instagram')return`https://instagram.com/${clean}`; if(kind==='facebook')return`https://facebook.com/${clean}`; if(kind==='tiktok')return`https://tiktok.com/@${clean}`; return ''; }
function icon(kind){ const paths={whatsapp:'<path d="M20 11.6A8 8 0 0 1 8.2 18.7L4 20l1.3-4.1A8 8 0 1 1 20 11.6Z"/><path d="M8.6 8.4c.7 2.5 2.4 4.1 4.9 4.9"/>',email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',instagram:'<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><path d="M17.5 6.5h.01"/>',facebook:'<path d="M14 8h3V4h-3c-3 0-5 2-5 5v3H6v4h3v5h4v-5h3l1-4h-4V9c0-.7.3-1 1-1Z"/>',tiktok:'<path d="M14 4v10a4 4 0 1 1-4-4"/><path d="M14 4c.7 2.3 2.2 3.7 5 4"/>'}; return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind]||''}</svg>`; }

function installBrowser(){
  const overlay=$('#exploreOverlay'); if(!overlay)return; overlay.className='overlay visual-browser-overlay';
  overlay.innerHTML=`<section class="visual-browser" role="dialog" aria-modal="true" aria-label="Explorar CanecaFácil">
    <div class="browser-stage" data-browser-swipe><img id="browserImage" alt=""><div class="browser-copy"><small id="browserEyebrow"></small><h2 id="browserName"></h2><strong id="browserPrice"></strong><span class="browser-swipe-hint">arraste para trocar</span></div></div>
    <aside class="browser-panel floating-pill">
      <div class="browser-panel-head"><strong>Explorar</strong><button class="browser-close" data-browser-close aria-label="Fechar">×</button></div>
      <label class="browser-search">${icon('email').replace(/<rect[\s\S]*?<\/svg>/,'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>')}<input id="browserQuery" type="search" placeholder="Buscar caneca" autocomplete="off"></label>
      <div class="browser-filter-block"><small>Categorias</small><div id="browserCategories" class="browser-chips"></div></div>
      <div id="browserSubBlock" class="browser-filter-block" hidden><small>Subcategorias</small><div id="browserSubcategories" class="browser-chips"></div></div>
      <div class="browser-nav-row"><button data-browser-prev aria-label="Anterior">←</button><span id="browserCounter">01 / 01</span><button data-browser-next aria-label="Próxima">→</button></div>
      <button class="browser-open" data-browser-open>Ver esta caneca</button>
      <div class="browser-divider"></div>
      <section class="store-info" aria-label="Informações da loja"><div class="store-info-title"><strong>Loja & atendimento</strong><small>Informações essenciais</small></div><div id="storeSocial" class="store-social"></div>
        <details><summary>Atendimento</summary><div id="storeContact" class="store-detail-copy"></div></details>
        <details><summary>Entrega e prazos</summary><div class="store-detail-copy">Frete, prazo de produção, prazo de transporte e valor final serão informados antes da confirmação do pedido.</div></details>
        <details><summary>Formas de pagamento</summary><div class="store-detail-copy">As formas de pagamento disponíveis e o valor total da compra serão exibidos antes da conclusão do pedido.</div></details>
        <details><summary>Trocas e devoluções</summary><div class="store-detail-copy">A política completa de troca, devolução, arrependimento e regras aplicáveis a itens personalizados será apresentada antes da abertura oficial das vendas.</div></details>
        <details><summary>Privacidade e segurança</summary><div class="store-detail-copy">A política de privacidade e o tratamento dos dados pessoais usados no pedido ficarão disponíveis nesta área.</div></details>
        <details><summary>Termos e dados da empresa</summary><div id="storeLegal" class="store-detail-copy"></div></details>
      </section>
    </aside></section>`;
  $('[data-browser-close]',overlay)?.addEventListener('click',closeBrowser); $('[data-browser-prev]',overlay)?.addEventListener('click',()=>moveBrowser(-1)); $('[data-browser-next]',overlay)?.addEventListener('click',()=>moveBrowser(1)); $('[data-browser-open]',overlay)?.addEventListener('click',openBrowserCurrent); $('#browserQuery',overlay)?.addEventListener('input',e=>{state.browser.query=e.target.value;applyBrowser();});
  let swipe=null; const stage=$('[data-browser-swipe]',overlay); stage?.addEventListener('touchstart',e=>{if(e.touches.length===1)swipe={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true}); stage?.addEventListener('touchend',e=>{if(!swipe||!e.changedTouches.length)return; const dx=e.changedTouches[0].clientX-swipe.x,dy=e.changedTouches[0].clientY-swipe.y; if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)*1.05)moveBrowser(dx<0?1:-1); swipe=null;},{passive:true});
  renderStoreInfo();
}
function browserCategories(){ return [...new Set(activeProducts().map(p=>p.categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')); }
function browserSubcategories(){ return [...new Set(activeProducts().filter(p=>!state.browser.category||p.categoria===state.browser.category).map(p=>p.subcategoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')); }
function filterBrowser(){ const q=norm(state.browser.query); return sorted(activeProducts().filter(p=>(!state.browser.category||p.categoria===state.browser.category)&&(!state.browser.subcategory||p.subcategoria===state.browser.subcategory)&&(!q||norm([p.nome,p.categoria,p.subcategoria,p.descricao_curta].join(' ')).includes(q)))); }
function applyBrowser(){ state.browser.filtered=filterBrowser(); state.browser.index=0; renderBrowserFilters(); renderBrowserProduct(); }
function renderBrowserFilters(){
  const overlay=$('#exploreOverlay'); if(!overlay)return; const cats=['',...browserCategories()]; $('#browserCategories',overlay).innerHTML=cats.map(v=>`<button class="browser-chip ${state.browser.category===v?'active':''}" data-browser-cat="${escapeAttr(v)}">${escapeHtml(v||'Todas')}</button>`).join(''); $$('[data-browser-cat]',overlay).forEach(btn=>btn.addEventListener('click',()=>{state.browser.category=btn.dataset.browserCat||'';state.browser.subcategory='';applyBrowser();}));
  const subs=browserSubcategories(); $('#browserSubBlock',overlay).hidden=!state.browser.category||!subs.length; $('#browserSubcategories',overlay).innerHTML=['',...subs].map(v=>`<button class="browser-chip ${state.browser.subcategory===v?'active':''}" data-browser-sub="${escapeAttr(v)}">${escapeHtml(v||'Todas')}</button>`).join(''); $$('[data-browser-sub]',overlay).forEach(btn=>btn.addEventListener('click',()=>{state.browser.subcategory=btn.dataset.browserSub||'';applyBrowser();}));
}
function renderBrowserProduct(){
  const overlay=$('#exploreOverlay'), p=state.browser.filtered[state.browser.index]; if(!overlay)return; const visual=$('.visual-browser',overlay);
  if(!p){ visual.style.setProperty('--browser-bg','#F2F2F0');visual.style.setProperty('--browser-ink','#111');$('#browserImage',overlay).removeAttribute('src');$('#browserName',overlay).textContent='Nenhuma caneca encontrada';$('#browserEyebrow',overlay).textContent='';$('#browserPrice',overlay).textContent='';$('#browserCounter',overlay).textContent='00 / 00';$('[data-browser-open]',overlay).disabled=true;return; }
  visual.style.setProperty('--browser-bg',p.fundo||'#FF6B1A'); visual.style.setProperty('--browser-ink',contrastInk(p.fundo||'#FF6B1A')); $('#browserImage',overlay).src=p.mockup_png||'./assets/mockup-demo.svg'; $('#browserImage',overlay).alt=`Mockup da ${p.nome}`; $('#browserEyebrow',overlay).textContent=[p.categoria,p.subcategoria].filter(Boolean).join(' · '); $('#browserName',overlay).textContent=p.nome; $('#browserPrice',overlay).textContent=money(p.preco); $('#browserCounter',overlay).textContent=`${String(state.browser.index+1).padStart(2,'0')} / ${String(state.browser.filtered.length).padStart(2,'0')}`; $('[data-browser-open]',overlay).disabled=false;
}
function moveBrowser(delta){ const n=state.browser.filtered.length;if(!n)return;state.browser.index=(state.browser.index+delta+n)%n;renderBrowserProduct(); }
function openBrowser(focusSearch=false){ state.browser.filtered=filterBrowser(); const activeIndex=state.browser.filtered.findIndex(p=>p.id===state.activeId);state.browser.index=activeIndex>=0?activeIndex:0;renderBrowserFilters();renderBrowserProduct();$('#exploreOverlay').hidden=false;document.body.style.overflow='hidden';if(focusSearch)setTimeout(()=>$('#browserQuery')?.focus(),50); }
function closeBrowser(){ $('#exploreOverlay').hidden=true;document.body.style.overflow='';setNav(state.mode==='favorites'?'favorites':'home'); }
function openBrowserCurrent(){ const p=state.browser.filtered[state.browser.index];if(!p)return;closeBrowser();state.mode='home';setNav('home');renderViewer({preserveProduct:p.id}); }
function renderStoreInfo(){
  const info=storeInfo(), social=$('#storeSocial'), contact=$('#storeContact'), legal=$('#storeLegal'); if(!social||!contact||!legal)return;
  const links=[['whatsapp',socialUrl('whatsapp',info.whatsapp),'WhatsApp'],['email',info.email?`mailto:${info.email}`:'','E-mail'],['instagram',socialUrl('instagram',info.instagram),'Instagram'],['facebook',socialUrl('facebook',info.facebook),'Facebook'],['tiktok',socialUrl('tiktok',info.tiktok),'TikTok']];
  social.innerHTML=links.map(([kind,url,label])=>url?`<a href="${escapeAttr(url)}" target="_blank" rel="noopener" aria-label="${label}">${icon(kind)}</a>`:`<button type="button" data-missing-info aria-label="${label} ainda não configurado" title="Configurar no Admin">${icon(kind)}</button>`).join('');
  contact.innerHTML=`${info.whatsapp?`<div><strong>WhatsApp</strong><span>${escapeHtml(info.whatsapp)}</span></div>`:''}${info.email?`<div><strong>E-mail</strong><span>${escapeHtml(info.email)}</span></div>`:''}${!info.whatsapp&&!info.email?'<span>Os canais oficiais de atendimento serão configurados no Admin antes da abertura da loja.</span>':''}`;
  legal.innerHTML=`${info.razao?`<div><strong>Razão social</strong><span>${escapeHtml(info.razao)}</span></div>`:''}${info.cnpj?`<div><strong>CNPJ/CPF</strong><span>${escapeHtml(info.cnpj)}</span></div>`:''}${info.endereco?`<div><strong>Endereço</strong><span>${escapeHtml(info.endereco)}</span></div>`:''}${!info.razao&&!info.cnpj&&!info.endereco?'<span>Dados de identificação do fornecedor e endereço estão reservados nesta área e precisam ser preenchidos antes da publicação comercial.</span>':''}`;
  $$('[data-missing-info]',social).forEach(btn=>btn.addEventListener('click',()=>toast('Este canal será configurado no Admin')));
}

function bindStatic(){
  $$('[data-action]').forEach(btn=>{ if(btn.dataset.action==='creations')return; btn.addEventListener('click',()=>handleAction(btn.dataset.action)); });
  $$('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeOverlay(btn.dataset.close)));
  $$('.overlay').forEach(overlay=>overlay.addEventListener('click',e=>{ if(e.target===overlay && overlay.id!=='personalizerOverlay' && overlay.id!=='exploreOverlay')closeOverlay(overlay.id); }));
  $('#descriptionBuy')?.addEventListener('click',e=>{const id=e.currentTarget.dataset.buySheet;if(id){addToCart(id);closeOverlay('descriptionOverlay');}});
  window.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(!$('#exploreOverlay')?.hidden)closeBrowser(); else $$('.overlay:not([hidden])').forEach(o=>closeOverlay(o.id)); } if($('#exploreOverlay')?.hidden && !$$('.overlay:not([hidden])').length){ if(e.key==='ArrowUp'||e.key==='ArrowLeft')goScene(activeSceneIndex()-1); if(e.key==='ArrowDown'||e.key==='ArrowRight')goScene(activeSceneIndex()+1); } });
}

async function boot(){
  try{ const [config,map]=await Promise.all([getConfig().catch(()=>state.config),getProducts().catch(()=>({}))]); state.config=config||state.config; const loaded=productArray(map||{},state.config).filter(p=>p.ativo!==false); state.products=loaded.length?loaded:demoProducts; }
  catch{ state.products=demoProducts; }
  installBrowser(); bindStatic(); updateCartBadge(); renderViewer();
}

boot();