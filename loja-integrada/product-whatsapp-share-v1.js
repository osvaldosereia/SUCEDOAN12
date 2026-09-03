(() => {
  'use strict';

  const BUILD = '20260903-product-whatsapp-share-v2-mobile-dock';
  if (window.__CF_PRODUCT_WHATSAPP_SHARE__ === BUILD) return;
  window.__CF_PRODUCT_WHATSAPP_SHARE__ = BUILD;

  const MOBILE = window.matchMedia('(max-width: 767px)');
  const text = value => String(value ?? '').trim();

  function isProductPage() {
    return document.body?.classList?.contains('pagina-produto') || Boolean(document.querySelector('#imagemProduto, h1.nome-produto[itemprop="name"], #formCalcularCep'));
  }

  function installStyle() {
    let style = document.getElementById('cfProductWhatsappShareStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfProductWhatsappShareStyle';
      document.head.appendChild(style);
    }

    style.textContent = `
.cf-whatsapp-share-product{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:9px!important;
  width:100%!important;
  min-height:46px!important;
  box-sizing:border-box!important;
  margin:12px 0 10px!important;
  padding:10px 16px!important;
  border:1px solid #bfe4c8!important;
  border-radius:10px!important;
  background:#f1fbf3!important;
  color:#147438!important;
  font-family:"Roboto",Arial,sans-serif!important;
  font-size:13px!important;
  line-height:1.15!important;
  font-weight:500!important;
  text-decoration:none!important;
  box-shadow:0 2px 8px rgba(25,110,54,.05)!important;
  cursor:pointer!important;
  transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease!important;
}
.cf-whatsapp-share-product:hover,
.cf-whatsapp-share-product:focus{
  background:#e8f8ec!important;
  border-color:#a7d9b3!important;
  color:#10662f!important;
  box-shadow:0 4px 12px rgba(25,110,54,.08)!important;
  text-decoration:none!important;
}
.cf-whatsapp-share-product .fa-whatsapp{
  font-size:22px!important;
  line-height:1!important;
}
.cf-whatsapp-share-product .cf-wa-share-icon{
  display:none!important;
  width:21px!important;
  height:21px!important;
  flex:0 0 21px!important;
}
.cf-whatsapp-share-product .cf-wa-share-icon svg{
  display:block!important;
  width:21px!important;
  height:21px!important;
}

/* Desktop: deixa o WhatsApp de atendimento acima do botão nativo "Topo". */
@media(min-width:768px){
  .li-whatsapp a{
    right:20px!important;
    bottom:154px!important;
  }
}

/* Dock mobile: Minhas Canecas + WhatsApp lado a lado e centralizados. */
#cfMobileFloatingDock{display:none}
@media(max-width:767px){
  #cfMobileFloatingDock{
    position:fixed!important;
    left:50%!important;
    right:auto!important;
    bottom:14px!important;
    transform:translateX(-50%)!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    gap:9px!important;
    width:max-content!important;
    max-width:calc(100vw - 20px)!important;
    z-index:99998!important;
    pointer-events:none!important;
  }
  #cfMobileFloatingDock > *{pointer-events:auto!important}
  #cfMobileFloatingDock #cfMyArtsTrigger{
    position:static!important;
    inset:auto!important;
    transform:none!important;
    margin:0!important;
    min-height:42px!important;
    height:42px!important;
    max-width:calc(100vw - 82px)!important;
    padding:7px 11px!important;
    font-size:11px!important;
    box-sizing:border-box!important;
    white-space:nowrap!important;
  }
  #cfMobileFloatingDock .li-whatsapp{
    position:static!important;
    inset:auto!important;
    width:auto!important;
    height:auto!important;
    margin:0!important;
    padding:0!important;
  }
  #cfMobileFloatingDock .li-whatsapp a{
    position:static!important;
    inset:auto!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    width:44px!important;
    height:44px!important;
    min-width:44px!important;
    min-height:44px!important;
    margin:0!important;
    border-radius:50%!important;
    box-shadow:0 4px 13px rgba(18,105,47,.18)!important;
  }
  #cfMobileFloatingDock .li-whatsapp i{
    font-size:27px!important;
    line-height:1!important;
  }

  /* O ícone minúsculo nativo é substituído pelo nosso botão horizontal. */
  .produto-compartilhar li.visible-phone:has(a[href*="whatsapp"]),
  .produto-compartilhar li.visible-phone:has(a[href*="wa.me"]){
    display:none!important;
  }
  .cf-whatsapp-share-product{
    min-height:47px!important;
    margin:10px 0 14px!important;
    padding:10px 14px!important;
    font-size:13px!important;
    border-radius:10px!important;
  }
}
`;
  }

  function canonicalUrl() {
    const canonical = text(document.querySelector('link[rel="canonical"]')?.href);
    if (canonical) return canonical;
    try {
      const url = new URL(location.href);
      ['recomendacao_id','email_ref','produtos_recomendados','utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(key => url.searchParams.delete(key));
      url.hash = '';
      return url.href;
    } catch {
      return location.href.split('#')[0];
    }
  }

  function productName() {
    return text(document.querySelector('h1.nome-produto[itemprop="name"], h1.nome-produto, h1[itemprop="name"], .produto h1')?.textContent) || text(document.title).replace(/\s*[-|]\s*Caneca F[aá]cil.*$/i, '');
  }

  function shareHref() {
    const name = productName() || 'Caneca personalizada';
    const message = `Olha esta caneca da Caneca Fácil ☕\n${name}\n${canonicalUrl()}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  function shareButton() {
    let button = document.getElementById('cfWhatsappShareProduct');
    if (!button) {
      button = document.createElement('a');
      button.id = 'cfWhatsappShareProduct';
      button.className = 'cf-whatsapp-share-product';
      button.target = '_blank';
      button.rel = 'noopener noreferrer';
      button.setAttribute('aria-label', 'Compartilhar esta caneca no WhatsApp');
      button.innerHTML = '<i class="fa fa-whatsapp" aria-hidden="true"></i><span class="cf-wa-share-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.7 7.4L3.5 20.5l1.4-4.1A8.5 8.5 0 1 1 20.5 11.8Z" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 7.7c.3-.4.6-.4.9-.2l1 1.9c.1.3.1.5-.1.7l-.7.8c.8 1.5 1.9 2.6 3.5 3.4l.8-.9c.2-.2.5-.2.7-.1l1.8.9c.3.1.4.4.3.7-.3.9-1.2 1.7-2.2 1.8-1.5.1-3.7-1.1-5.5-2.9-1.8-1.8-3.1-4-3-5.5 0-.9.8-1.4 1.5-.6Z" fill="currentColor"/></svg></span><span>Compartilhar esta caneca no WhatsApp</span>';
      document.body.appendChild(button);
    }
    button.href = shareHref();
    return button;
  }

  function positionShareButton() {
    if (!isProductPage()) return;
    installStyle();
    const button = shareButton();

    if (MOBILE.matches) {
      const nativeShare = document.querySelector('.produto-compartilhar');
      const thumbs = document.querySelector('.produto-thumbs, #carouselImagem, .miniaturas.slides');
      const thumbsAnchor = thumbs?.classList?.contains('produto-thumbs') ? thumbs : thumbs?.closest('.produto-thumbs') || thumbs;
      const anchor = nativeShare || thumbsAnchor;
      if (anchor && button.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', button);
      else if (!anchor) document.querySelector('.conteiner-imagem, #imagemProduto')?.parentElement?.insertAdjacentElement('afterend', button);
    } else {
      const cep = document.querySelector('.principal .cep, .acoes-produto ~ .cep, #formCalcularCep')?.closest?.('.cep') || document.querySelector('.cep');
      if (cep && button.previousElementSibling !== cep) cep.insertAdjacentElement('afterend', button);
      else if (!cep) document.querySelector('#formCalcularCep')?.insertAdjacentElement('afterend', button);
    }
  }

  function ensureWhatsappFallbackIcon() {
    const button = document.getElementById('cfWhatsappShareProduct');
    if (!button) return;
    const fontIcon = button.querySelector('.fa-whatsapp');
    const fallback = button.querySelector('.cf-wa-share-icon');
    if (!fontIcon || !fallback) return;
    const fontFamily = getComputedStyle(fontIcon).fontFamily || '';
    if (!/FontAwesome|Font Awesome/i.test(fontFamily)) {
      fontIcon.style.display = 'none';
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
    const myMugs = document.getElementById('cfMyArtsTrigger');
    const whatsapp = document.querySelector('#cfMobileFloatingDock .li-whatsapp') || document.querySelector('.li-whatsapp');
    const myMark = document.getElementById('cfMyMugsDockPlaceholder');
    const waMark = document.getElementById('cfWhatsappDockPlaceholder');
    if (myMugs && myMark?.parentNode && myMugs.parentNode?.id === 'cfMobileFloatingDock') myMark.insertAdjacentElement('afterend', myMugs);
    if (whatsapp && waMark?.parentNode && whatsapp.parentNode?.id === 'cfMobileFloatingDock') waMark.insertAdjacentElement('afterend', whatsapp);
    const dock = document.getElementById('cfMobileFloatingDock');
    if (dock && !dock.children.length) dock.remove();
  }

  function refresh() {
    installStyle();
    ensureMobileDock();
    if (isProductPage()) {
      positionShareButton();
      setTimeout(ensureWhatsappFallbackIcon, 50);
    }
  }

  if (typeof MOBILE.addEventListener === 'function') MOBILE.addEventListener('change', refresh);
  else if (typeof MOBILE.addListener === 'function') MOBILE.addListener(refresh);

  const start = () => {
    refresh();
    setTimeout(refresh, 500);
    setTimeout(refresh, 1500);
    setTimeout(refresh, 3000);
    setTimeout(refresh, 5000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`CanecaFácil · WhatsApp produto ${BUILD}`);
})();
