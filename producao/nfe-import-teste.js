(function () {
  "use strict";
  function addStyle() {
    if (document.querySelector("link[data-da-compra-rapida]")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "compra-rapida-admin-teste.css?v=2026-07-18-v4-teste";
    l.dataset.daCompraRapida = "1";
    document.head.appendChild(l);
  }
  function addScript(src, done) {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    if (done) s.onload = done;
    s.onerror = function () {
      console.error("Falha ao carregar módulo do admin:", src);
    };
    document.head.appendChild(s);
  }
  addStyle();
  addScript("nfe-import-core.js?v=20260716-8", function () {
    addScript(
      "compra-rapida-admin-teste.js?v=2026-07-18-v4-teste",
      function () {
        addScript("compra-rapida-tab.js?v=2026-07-18-producao-v5");
      },
    );
  });
})();
