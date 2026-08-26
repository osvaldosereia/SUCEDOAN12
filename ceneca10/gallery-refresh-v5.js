(() => {
  'use strict';
  const BUILD = '20260826-ceneca10-gallery-refresh-v5';
  if (window.__daCeneca10GalleryRefresh === BUILD) return;
  window.__daCeneca10GalleryRefresh = BUILD;

  function refresh() {
    window.setTimeout(() => document.querySelector('#createdRefresh')?.click(), 350);
    window.setTimeout(() => document.querySelector('#modelsRefresh')?.click(), 650);
  }

  window.addEventListener('ceneca10:mug-created', refresh);
})();
