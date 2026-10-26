(() => {
  'use strict';
  const src = '/vitrine/admin/orders-visual-v1.js?v=20261005-1';
  if (document.querySelector('script[data-orders-visual-v1]')) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = false;
  script.dataset.ordersVisualV1 = '';
  document.head.append(script);
})();
