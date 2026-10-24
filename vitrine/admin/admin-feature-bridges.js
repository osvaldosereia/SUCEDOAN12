(() => {
  'use strict';

  const FEATURES = [
    {
      marker: 'data-orders-visual-v1',
      src: '/vitrine/admin/orders-visual-v1.js?v=20261005-1'
    },
    {
      marker: 'data-store-ops-panel-v1',
      src: '/vitrine/admin/store-baskets-ops-overview.js?v=20261006-1'
    },
    {
      marker: 'data-product-basket-cutover-v1',
      src: '/vitrine/admin/product-basket-link-cutover.js?v=20261006-1'
    },
    {
      marker: 'data-baskets-operational-polish-v1',
      src: '/vitrine/admin/baskets-operational-polish.js?v=20261006-1'
    }
  ];

  for (const feature of FEATURES) {
    if (document.querySelector('script[' + feature.marker + ']')) continue;
    const script = document.createElement('script');
    script.src = feature.src;
    script.async = false;
    script.setAttribute(feature.marker, '');
    document.head.appendChild(script);
  }
})();
