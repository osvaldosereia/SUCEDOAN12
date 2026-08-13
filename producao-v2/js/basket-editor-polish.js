import './basket-instagram-admin.js';

(() => {
  'use strict';

  const STYLE_ID = 'basketEditorPolishV2Styles';
  let scheduled = false;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #collectionEditor.basket-editor-expanded{
        width:min(1380px,calc(100vw - 24px))!important;
        max-width:none!important;
      }
      #collectionEditor.basket-editor-expanded .collection-editor-body{
        gap:18px!important;
        padding:18px!important;
      }
      #collectionEditor.basket-editor-expanded .collection-composition{
        padding:18px!important;
        border-radius:14px!important;
      }
      #collectionEditor.basket-editor-expanded .collection-section-head h3{
        font-size:17px!important;
      }
      #collectionEditor.basket-editor-expanded .collection-section-head p{
        font-size:11px!important;
        line-height:1.5!important;
      }
      #collectionEditor.basket-mode-expanded .collection-composition #collectionItems.basket-products-grid{
        grid-template-columns:repeat(5,minmax(0,1fr))!important;
        gap:14px!important;
        margin-top:14px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-card{
        min-height:500px!important;
        gap:11px!important;
        padding:12px!important;
        border-radius:14px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-image{
        min-height:150px!important;
        border-radius:11px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-image img{
        padding:8px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-info{
        min-height:88px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-info>span{
        font-size:9px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-info>strong{
        min-height:48px!important;
        margin-top:5px!important;
        font-size:12px!important;
        line-height:1.42!important;
        -webkit-line-clamp:3!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-info>small{
        margin-top:5px!important;
        font-size:9px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-stock{
        min-height:30px!important;
        gap:6px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-stock .badge,
      #collectionEditor.basket-mode-expanded .basket-substitute-chip{
        min-height:25px!important;
        padding:0 8px!important;
        font-size:9px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-quantity{
        grid-template-columns:1fr 66px!important;
        gap:9px!important;
        font-size:10px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-quantity input{
        min-height:40px!important;
        padding:7px!important;
        font-size:13px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-actions{
        gap:7px!important;
      }
      #collectionEditor.basket-mode-expanded .basket-product-actions .button{
        min-height:38px!important;
        padding:0 8px!important;
        border-radius:8px!important;
        font-size:9px!important;
        line-height:1.15!important;
      }
      #collectionEditor.basket-mode-expanded .collection-product-search{
        margin-top:16px!important;
      }
      #collectionEditor.basket-mode-expanded .collection-product-search input{
        min-height:44px!important;
        font-size:12px!important;
      }
      @media(max-width:1220px){
        #collectionEditor.basket-mode-expanded .collection-composition #collectionItems.basket-products-grid{
          grid-template-columns:repeat(4,minmax(0,1fr))!important;
        }
      }
      @media(max-width:960px){
        #collectionEditor.basket-mode-expanded .collection-composition #collectionItems.basket-products-grid{
          grid-template-columns:repeat(3,minmax(0,1fr))!important;
        }
      }
      @media(max-width:680px){
        #collectionEditor.basket-editor-expanded{
          width:100%!important;
        }
        #collectionEditor.basket-mode-expanded .collection-composition #collectionItems.basket-products-grid{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
        }
      }
      @media(max-width:430px){
        #collectionEditor.basket-mode-expanded .collection-composition #collectionItems.basket-products-grid{
          grid-template-columns:1fr!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function hideLegacyImageField() {
    const form = document.getElementById('collectionForm');
    if (!form) return;

    const input = form.querySelector('[data-collection-field="imagem"]');
    if (input && input.type !== 'hidden') {
      const label = input.closest('label');
      input.type = 'hidden';
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      input.classList.add('collection-image-value');
      form.appendChild(input);
      label?.remove();
    }

    const coverText = form.querySelector('.ux-collection-cover span');
    if (coverText) {
      coverText.textContent = 'A capa cadastrada é preservada. Não é necessário editar URL ou caminho manualmente.';
    }

    const formHeadHelp = document.querySelector('#collectionEditor .ux-collection-form-head span');
    if (formHeadHelp) {
      formHeadHelp.textContent = 'Nome, código, preço e demais dados principais da cesta.';
    }
  }

  function apply() {
    installStyles();
    const editor = document.getElementById('collectionEditor');
    if (!editor) return;

    const module = window.__adminV2CollectionsModule;
    const typeText = document.getElementById('collectionEditorType')?.textContent || '';
    const isBasket = module?.type === 'basket' || /cesta/i.test(typeText);

    editor.classList.add('basket-editor-expanded');
    editor.classList.toggle('basket-mode-expanded', Boolean(isBasket));
    hideLegacyImageField();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-route="baskets"], [data-collection-edit], #collectionCreate')) {
      setTimeout(schedule, 40);
      setTimeout(schedule, 300);
    }
  }, true);
  window.addEventListener('admin-v2-route-ready', event => {
    if (event.detail?.route === 'baskets') setTimeout(schedule, 40);
  });

  const editor = document.getElementById('collectionEditor');
  if (editor) {
    new MutationObserver(schedule).observe(editor, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
