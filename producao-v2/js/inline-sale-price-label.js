(() => {
  'use strict';

  const enhance = () => {
    const table = document.querySelector('[data-view="products"] .data-table');
    if (!table) return;

    const priceHeader = table.querySelector('thead th:nth-child(3)');
    if (priceHeader && priceHeader.textContent.trim() !== 'Preço de venda') {
      priceHeader.textContent = 'Preço de venda';
    }

    table.querySelectorAll('input[data-inline-field="preco"]').forEach(input => {
      input.setAttribute('aria-label', 'Preço de venda');
      input.setAttribute('title', 'Edite o preço de venda e clique em Salvar');
      input.setAttribute('placeholder', '0,00');
      input.classList.add('inline-sale-price-visible');

      const cell = input.closest('.inline-price-cell');
      if (cell && !cell.querySelector('.inline-sale-price-caption')) {
        const caption = document.createElement('small');
        caption.className = 'inline-sale-price-caption';
        caption.textContent = 'Venda (R$)';
        cell.insertBefore(caption, input);
      }
    });
  };

  const style = document.createElement('style');
  style.textContent = `
    .inline-price-cell .inline-sale-price-caption{
      color:#72500b;
      font-size:9px;
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:.035em;
    }
    .inline-product-input.inline-sale-price-visible{
      min-width:108px;
      border-color:#d2b461;
      background:#fffdf5;
      color:#181a18;
      font-size:12px;
      font-weight:900;
    }
    .inline-product-input.inline-sale-price-visible:focus{
      border-color:#956814;
      box-shadow:0 0 0 3px rgba(149,104,20,.15);
    }
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(enhance);
  const start = () => {
    enhance();
    const productsView = document.querySelector('[data-view="products"]');
    if (productsView) observer.observe(productsView, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.addEventListener('admin-v2-route', enhance);
})();
