(() => {
  'use strict';

  const BUILD = '20260903-canecafacil-ui-runtime-v2-compact-mobile-menu';
  if (window.__CF_UI_RUNTIME__ === BUILD) return;
  window.__CF_UI_RUNTIME__ = BUILD;

  const MOBILE = window.matchMedia('(max-width: 767px)');
  const text = value => String(value ?? '').trim();

  function isProductPage() {
    return document.body?.classList?.contains('pagina-produto') || Boolean(document.querySelector('#imagemProduto, .produto-thumbs, .acoes-produto'));
  }

  function installStyle() {
    if (document.getElementById('cfUiRuntimeStyleV2')) return;
    document.getElementById('cfUiRuntimeStyle')?.remove();

    const style = document.createElement('style');
    style.id = 'cfUiRuntimeStyleV2';
    style.textContent = `
/* compartilhamento / flutuantes */
.cf-whatsapp-share-product{
  display:flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;
  width:100%!important;min-height:46px!important;box-sizing:border-box!important;margin:12px 0 10px!important;
  padding:10px 16px!important;border:1px solid #bfe4c8!important;border-radius:10px!important;
  background:#f1fbf3!important;color:#147438!important;font-family:"Roboto",Arial,sans-serif!important;
  font-size:13px!important;line-height:1.15!important;font-weight:500!important;text-decoration:none!important;
  box-shadow:0 2px 8px rgba(25,110,54,.05)!important;
}
.cf-whatsapp-share-product:hover,.cf-whatsapp-share-product:focus{
  background:#e8f8ec!important;border-color:#a7d9b3!important;color:#10662f!important;text-decoration:none!important;
}
.cf-whatsapp-share-product .fa-whatsapp{font-size:22px!important;line-height:1!important}
.cf-whatsapp-share-product .cf-wa-share-icon{display:none!important;width:21px!important;height:21px!important;flex:0 0 21px!important}
.cf-whatsapp-share-product .cf-wa-share-icon svg{display:block!important;width:21px!important;height:21px!important}

@media(min-width:768px){.li-whatsapp a{right:20px!important;bottom:154px!important}}

#cfMobileFloatingDock{display:none}
@media(max-width:767px){
  #cfMobileFloatingDock{
    position:fixed!important;left:50%!important;right:auto!important;bottom:max(12px,env(safe-area-inset-bottom))!important;
    transform:translateX(-50%)!important;display:flex!important;align-items:center!important;justify-content:center!important;
    gap:8px!important;width:max-content!important;max-width:calc(100vw - 20px)!important;z-index:99998!important;pointer-events:none!important;
  }
  #cfMobileFloatingDock>*{pointer-events:auto!important}
  #cfMobileFloatingDock #cfMyArtsTrigger{
    position:static!important;inset:auto!important;transform:none!important;margin:0!important;min-height:42px!important;height:42px!important;
    max-width:calc(100vw - 76px)!important;padding:7px 11px!important;box-sizing:border-box!important;white-space:nowrap!important;
  }
  #cfMobileFloatingDock .li-whatsapp{position:static!important;inset:auto!important;width:auto!important;height:auto!important;margin:0!important;padding:0!important}
  #cfMobileFloatingDock .li-whatsapp a{
    position:static!important;inset:auto!important;display:flex!important;align-items:center!important;justify-content:center!important;
    width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;margin:0!important;border-radius:50%!important;
    box-shadow:0 4px 13px rgba(18,105,47,.18)!important;
  }
  #cfMobileFloatingDock .li-whatsapp i{font-size:25px!important;line-height:1!important}
  .cf-whatsapp-share-product{min-height:47px!important;margin:10px 0 14px!important;padding:10px 14px!important;font-size:13px!important}
}

/* página de produto */
body.pagina-produto .principal .preco-produto .preco-promocional,
body.pagina-produto .acoes-produto .preco-promocional,
body.pagina-produto .preco-produto .preco-promocional{font-size:32px!important;line-height:1.05!important;font-weight:500!important}
body.pagina-produto .cf-native-personalizer .form-head h2{font-weight:500!important}
@media(max-width:767px){
  body.pagina-produto .principal .preco-produto .preco-promocional,
  body.pagina-produto .acoes-produto .preco-promocional,
  body.pagina-produto .preco-produto .preco-promocional{font-size:35px!important;line-height:1.04!important}
}

/* topo mobile */
@media(max-width:767px){
  #cabecalho .rastreio-content,#cabecalho .contato-content,#cabecalho .minha-conta .dropdown-menu{
    box-sizing:border-box!important;background:#fff!important;color:#262626!important;border:1px solid #e2e2e2!important;
    border-radius:11px!important;box-shadow:0 10px 28px rgba(0,0,0,.14)!important;font-family:"Roboto",Arial,sans-serif!important;
  }
  #cabecalho .rastreio-content{padding:14px!important;min-width:245px!important;max-width:calc(100vw - 24px)!important}
  #cabecalho .rastreio-content p,#cabecalho .rastreio-content label,#cabecalho .rastreio-content span,
  #cabecalho .contato-content,#cabecalho .contato-content span,#cabecalho .minha-conta .dropdown-menu a{
    color:#292929!important;-webkit-text-fill-color:#292929!important;text-shadow:none!important;
  }
  #cabecalho .rastreio-content p{margin:0 0 9px!important;font-size:12.5px!important;line-height:1.35!important;font-weight:400!important}
  #cabecalho .rastreio-content input,#cabecalho .rastreio-content #OrderTracking{
    display:block!important;width:100%!important;min-height:40px!important;height:40px!important;box-sizing:border-box!important;
    margin:0 0 9px!important;padding:8px 10px!important;background:#fff!important;color:#222!important;-webkit-text-fill-color:#222!important;
    caret-color:#222!important;border:1px solid #d5d5d5!important;border-radius:8px!important;box-shadow:none!important;font-size:14px!important;font-weight:300!important;
  }
  #cabecalho .rastreio-content .rastreio,#cabecalho .rastreio-content button.rastreio{
    display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;min-height:40px!important;
    margin:0!important;padding:8px 12px!important;border:1px solid #f47621!important;border-radius:8px!important;background:#f47621!important;
    color:#fff!important;-webkit-text-fill-color:#fff!important;font-size:12px!important;font-weight:500!important;
  }
  #cabecalho .contato-content{padding:12px 14px!important;min-width:180px!important;max-width:calc(100vw - 24px)!important}

  /* menu de categorias: uma única faixa horizontal, sem setas e sem espaço vazio */
  #delimitadorBarra{
    display:block!important;width:100%!important;height:0!important;min-height:0!important;max-height:0!important;
    margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;
  }
  #delimitadorBarra + .menu.superior,.menu.superior{
    position:relative!important;display:block!important;float:none!important;clear:both!important;width:100%!important;max-width:100%!important;
    height:52px!important;min-height:52px!important;max-height:52px!important;margin:0!important;padding:0!important;overflow:hidden!important;
    background:#fff!important;border:0!important;border-top:1px solid #ededed!important;border-bottom:1px solid #ededed!important;
    box-shadow:none!important;box-sizing:border-box!important;
  }
  .menu.superior:before,.menu.superior:after,
  .menu.superior>ul.nivel-um:before,.menu.superior>ul.nivel-um:after{content:none!important;display:none!important}
  .menu.superior>a,.menu.superior>.seta-esquerda,.menu.superior>.seta-direita,
  .menu.superior>.prev,.menu.superior>.next,.menu.superior>[class*="arrow"],.menu.superior>[class*="seta"]{display:none!important}

  .menu.superior>ul.nivel-um{
    position:static!important;display:flex!important;flex-flow:row nowrap!important;align-items:center!important;gap:8px!important;
    width:100%!important;max-width:100%!important;height:50px!important;min-height:50px!important;max-height:50px!important;
    margin:0!important;padding:6px 10px!important;box-sizing:border-box!important;overflow-x:auto!important;overflow-y:hidden!important;
    transform:none!important;left:auto!important;right:auto!important;top:auto!important;white-space:nowrap!important;
    -webkit-overflow-scrolling:touch!important;scrollbar-width:none!important;overscroll-behavior-x:contain!important;
  }
  .menu.superior>ul.nivel-um::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}

  .menu.superior>ul.nivel-um>li{
    position:relative!important;display:block!important;flex:0 0 auto!important;float:none!important;width:auto!important;min-width:0!important;
    height:38px!important;min-height:38px!important;max-height:38px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;
  }
  .menu.superior>ul.nivel-um>li>ul.nivel-dois{display:none!important;height:0!important;min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
  .menu.superior>ul.nivel-um>li>a{
    position:static!important;display:flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:0!important;
    height:38px!important;min-height:38px!important;max-height:38px!important;margin:0!important;padding:0 14px!important;box-sizing:border-box!important;
    background:#f7f7f7!important;border:1px solid #e7e7e7!important;border-radius:999px!important;color:#303030!important;text-decoration:none!important;
    box-shadow:none!important;transform:none!important;
  }
  .menu.superior>ul.nivel-um>li>a>strong.titulo{
    display:block!important;float:none!important;width:auto!important;min-width:0!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;
    background:transparent!important;border:0!important;color:#303030!important;-webkit-text-fill-color:#303030!important;
    font-family:"Roboto",Arial,sans-serif!important;font-size:12.5px!important;line-height:1!important;font-weight:400!important;text-transform:none!important;white-space:nowrap!important;
  }
  .menu.superior>ul.nivel-um>li>a>i.icon-chevron-down{display:none!important}
}
`;
    document.head.appendChild(style);
  }

  function canonicalUrl() {
    const canonical = text(document.querySelector('link[rel="canonical"]')?.href);
    if (canonical) return canonical;
    try {
      const url = new URL(location.href);
      ['recomendacao_id','email_ref','produtos_recomendados','utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(key => url.searchParams.delete(key));
      url.hash = '';
      return url.href;
    } catch { return location.href.split('#')[0]; }
  }

  function productName() {
    return text(document.querySelector('h1.nome-produto[itemprop="name"], h1.nome-produto, h1[itemprop="name"], .produto h1')?.textContent)
      || text(document.title).replace(/\s*[-|]\s*Caneca F[aá]cil.*$/i, '');
  }

  function shareHref() {
    const name = productName() || 'Caneca personalizada';
    return `https://wa.me/?text=${encodeURIComponent(`Olha esta caneca da Caneca Fácil ☕\n${name}\n${canonicalUrl()}`)}`;
  }

  function shareButton() {
    let button = document.getElementById('cfWhatsappShareProduct');
    if (!button) {
      button = document.createElement('a');
      button.id = 'cfWhatsappShareProduct';
      button.className = 'cf-whatsapp-share-product';
      button.target = '_blank';
      button.rel = 'noopener noreferrer';
      button.innerHTML = '<i class="fa fa-whatsapp" aria-hidden="true"></i><span class="cf-wa-share-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.7 7.4L3.5 20.5l1.4-4.1A8.5 8.5 0 1 1 20.5 11.8Z" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 7.7c.3-.4.6-.4.9-.2l1 1.9c.1.3.1.5-.1.7l-.7.8c.8 1.5 1.9 2.6 3.5 3.4l.8-.9c.2-.2.5-.2.7-.1l1.8.9c.3.1.4.4.3.7-.3.9-1.2 1.7-2.2 1.8-1.5.1-3.7-1.1-5.5-2.9-1.8-1.8-3.1-4-3-5.5 0-.9.8-1.4 1.5-.6Z" fill="currentColor"/></svg></span><span>Compartilhar no WhatsApp</span>';
      document.body.appendChild(button);
    }
    const label = button.querySelector('span:not(.cf-wa-share-icon)');
    if (label) label.textContent = 'Compartilhar no WhatsApp';
    button.setAttribute('aria-label', 'Compartilhar no WhatsApp');
    button.href = shareHref();
    return button;
  }

  function hideNativeWhatsappShare() {
    document.querySelectorAll('.produto-compartilhar a').forEach(link => {
      const href = text(link.getAttribute('href')).toLowerCase();
      if (!href.includes('whatsapp') && !href.includes('wa.me')) return;
      link.closest('li')?.style.setProperty('display', 'none', 'important');
    });
  }

  function positionShareButton() {
    if (!isProductPage()) return;
    const button = shareButton();
    if (MOBILE.matches) {
      const anchor = document.querySelector('.produto-compartilhar') || document.querySelector('.produto-thumbs');
      if (anchor && button.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', button);
    } else {
      const cep = document.querySelector('#formCalcularCep')?.closest('.cep') || document.querySelector('.cep');
      if (cep && button.previousElementSibling !== cep) cep.insertAdjacentElement('afterend', button);
    }
  }

  function ensureFallbackIcon() {
    const button = document.getElementById('cfWhatsappShareProduct');
    if (!button) return;
    const icon = button.querySelector('.fa-whatsapp');
    const fallback = button.querySelector('.cf-wa-share-icon');
    if (!icon || !fallback) return;
    if (!/FontAwesome|Font Awesome/i.test(getComputedStyle(icon).fontFamily || '')) {
      icon.style.display = 'none';
      fallback.style.setProperty('display', 'block', 'important');
    }
  }

  function placeholder(id, node) {
    let mark = document.getElementById(id);
    if (!mark && node?.parentNode) {
      mark = document.createElement('span');
      mark.id = id;
      mark.hidden = true;
      node.parentNode.insertBefore(mark, node);
    }
    return mark;
  }

  function ensureMobileDock() {
    if (!MOBILE.matches) return restoreDesktopFloating();
    const myMugs = document.getElementById('cfMyArtsTrigger');
    const whatsapp = document.querySelector('.li-whatsapp');
    if (!myMugs || !whatsapp) return;
    placeholder('cfMyMugsDockPlaceholder', myMugs);
    placeholder('cfWhatsappDockPlaceholder', whatsapp);
    let dock = document.getElementById('cfMobileFloatingDock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'cfMobileFloatingDock';
      dock.setAttribute('aria-label', 'Ações rápidas');
      document.body.appendChild(dock);
    }
    if (myMugs.parentNode !== dock) dock.appendChild(myMugs);
    if (whatsapp.parentNode !== dock) dock.appendChild(whatsapp);
  }

  function restoreDesktopFloating() {
    const dock = document.getElementById('cfMobileFloatingDock');
    const myMugs = document.getElementById('cfMyArtsTrigger');
    const whatsapp = dock?.querySelector('.li-whatsapp') || document.querySelector('.li-whatsapp');
    const myMark = document.getElementById('cfMyMugsDockPlaceholder');
    const waMark = document.getElementById('cfWhatsappDockPlaceholder');
    if (myMugs && myMark?.parentNode && myMugs.parentNode === dock) myMark.insertAdjacentElement('afterend', myMugs);
    if (whatsapp && waMark?.parentNode && whatsapp.parentNode === dock) waMark.insertAdjacentElement('afterend', whatsapp);
    if (dock && !dock.children.length) dock.remove();
  }

  function galleryLinks() {
    return [...document.querySelectorAll('.produto-thumbs .miniaturas a[data-imagem-grande]')];
  }

  function activeIndex(links) {
    const active = links.findIndex(link => link.closest('li')?.classList.contains('active'));
    if (active >= 0) return active;
    const current = text(document.querySelector('#imagemProduto')?.src);
    if (!current) return 0;
    const found = links.findIndex(link => text(link.getAttribute('data-imagem-grande')) === current);
    return found >= 0 ? found : 0;
  }

  function goGallery(step) {
    const links = galleryLinks();
    if (links.length < 2) return;
    const next = (activeIndex(links) + step + links.length) % links.length;
    try { links[next].click(); } catch {}
  }

  function installSwipe() {
    if (!MOBILE.matches || !isProductPage()) return;
    const stage = document.querySelector('.conteiner-imagem') || document.querySelector('#imagemProduto')?.parentElement;
    if (!stage || stage.dataset.cfSwipeGallery === BUILD) return;
    stage.dataset.cfSwipeGallery = BUILD;
    let startX = 0, startY = 0, startedAt = 0;
    stage.addEventListener('touchstart', event => {
      const touch = event.touches?.[0];
      if (!touch) return;
      startX = touch.clientX; startY = touch.clientY; startedAt = Date.now();
    }, { passive:true });
    stage.addEventListener('touchend', event => {
      const touch = event.changedTouches?.[0];
      if (!touch || !startedAt) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const elapsed = Date.now() - startedAt;
      startedAt = 0;
      if (elapsed > 900 || Math.abs(dx) < 46 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      goGallery(dx < 0 ? 1 : -1);
    }, { passive:true });
  }

  function refresh() {
    installStyle();
    ensureMobileDock();
    if (!isProductPage()) return;
    hideNativeWhatsappShare();
    positionShareButton();
    installSwipe();
    setTimeout(ensureFallbackIcon, 60);
  }

  if (typeof MOBILE.addEventListener === 'function') MOBILE.addEventListener('change', refresh);
  else if (typeof MOBILE.addListener === 'function') MOBILE.addListener(refresh);

  const start = () => {
    refresh();
    [500, 1600, 3200].forEach(delay => setTimeout(refresh, delay));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`CanecaFácil · UI estável ${BUILD}`);
})();
