(() => {
  'use strict';

  const BUILD = '20260902-product-whatsapp-share-v1';
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
  gap:8px!important;
  width:100%!important;
  min-height:42px!important;
  box-sizing:border-box!important;
  margin:12px 0 8px!important;
  padding:9px 14px!important;
  border:1px solid #cfe9d6!important;
  border-radius:10px!important;
  background:#f2fbf4!important;
  color:#167a37!important;
  font:800 12px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;
  text-decoration:none!important;
  box-shadow:none!important;
  cursor:pointer!important;
  transition:background-color .15s ease,border-color .15s ease,transform .15s ease!important;
}
.cf-whatsapp-share-product:hover,
.cf-whatsapp-share-product:focus{
  background:#eaf8ed!important;
  border-color:#b9dfc2!important;
  color:#12692f!important;
  text-decoration:none!important;
}
.cf-whatsapp-share-product .fa-whatsapp{
  font-size:20px!important;
  line-height:1!important;
}
.cf-whatsapp-share-product .cf-wa-share-icon{
  display:none!important;
  width:19px!important;
  height:19px!important;
  flex:0 0 19px!important;
}
.cf-whatsapp-share-product .cf-wa-share-icon svg{
  display:block!important;
  width:19px!important;
  height:19px!important;
}
@media(max-width:767px){
  .li-whatsapp a{
    width:52px!important;
    height:52px!important;
    right:12px!important;
    bottom:78px!important;
    border-radius:50%!important;
    box-shadow:0 5px 16px rgba(18,105,47,.18)!important;
  }
  .li-whatsapp i{
    font-size:32px!important;
  }
  #cfMyArtsTrigger.cf-floating{
    left:12px!important;
    right:auto!important;
    bottom:78px!important;
    top:auto!important;
    max-width:calc(100vw - 92px)!important;
    min-height:40px!important;
    padding:7px 10px!important;
    font-size:11px!important;
    box-sizing:border-box!important;
  }
  .cf-whatsapp-share-product{
    min-height:44px!important;
    margin:12px 0 14px!important;
    font-size:12px!important;
    border-radius:11px!important;
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
      button.setAttribute('aria-label', 'Compartilhe esta caneca por WhatsApp');
      button.innerHTML = '<i class="fa fa-whatsapp" aria-hidden="true"></i><span class="cf-wa-share-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.7 7.4L3.5 20.5l1.4-4.1A8.5 8.5 0 1 1 20.5 11.8Z" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 7.7c.3-.4.6-.4.9-.2l1 1.9c.1.3.1.5-.1.7l-.7.8c.8 1.5 1.9 2.6 3.5 3.4l.8-.9c.2-.2.5-.2.7-.1l1.8.9c.3.1.4.4.3.7-.3.9-1.2 1.7-2.2 1.8-1.5.1-3.7-1.1-5.5-2.9-1.8-1.8-3.1-4-3-5.5 0-.9.8-1.4 1.5-.6Z" fill="currentColor"/></svg></span><span>Compartilhe por WhatsApp</span>';
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
      const thumbs = document.querySelector('.produto-thumbs, #carouselImagem, .miniaturas.slides');
      const anchor = thumbs?.classList?.contains('produto-thumbs') ? thumbs : thumbs?.closest('.produto-thumbs') || thumbs;
      if (anchor && button.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', button);
      else if (!anchor) document.querySelector('.conteiner-imagem, #imagemProduto')?.parentElement?.insertAdjacentElement('afterend', button);
    } else {
      const cep = document.querySelector('.cep');
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

  function refresh() {
    installStyle();
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
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`CanecaFácil · WhatsApp produto ${BUILD}`);
})();
