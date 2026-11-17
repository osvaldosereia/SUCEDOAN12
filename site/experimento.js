(() => {
  "use strict";

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const basketOrder = ["grande", "media", "pequena", "mini", "economica"];
  let toastTimer = 0;
  let routedHash = "";
  let routeSequence = 0;
  let suppressDetailHash = false;

  function showStoreNotice(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message || "Não foi possível abrir esta seção. Tente novamente.";
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
  }

  function sortBasketCards() {
    const host = document.getElementById("basket-grid");
    if (!host) return;
    const cards = Array.from(host.querySelectorAll(".basket-card"));
    if (cards.length < 2) return;
    const rank = (card) => {
      const title = normalize(card.querySelector(".basket-title")?.textContent);
      const index = basketOrder.findIndex((size) => title.includes(size));
      return index < 0 ? basketOrder.length : index;
    };
    const sorted = cards.slice().sort((a, b) => rank(a) - rank(b));
    if (sorted.every((card, index) => card === cards[index])) return;
    sorted.forEach((card) => host.appendChild(card));
  }

  function setActive(link) {
    document.querySelectorAll(".experiment-nav-link").forEach((item) => {
      item.classList.toggle("is-active", item === link);
      if (item === link) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  function setActiveBySection(section, key) {
    const link = Array.from(document.querySelectorAll(".experiment-nav-link"))
      .find((item) => item.dataset.experimentNav === section &&
        (!key || item.dataset.sizeKey === key));
    setActive(link || null);
  }

  function scrollToNode(node) {
    if (!node) return false;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  function closeBasketDetail() {
    const detail = document.getElementById("detail-sheet");
    if (!detail || detail.hidden) return;
    const back = detail.querySelector('[data-close="detail"]');
    if (back) {
      suppressDetailHash = true;
      try { back.click(); } finally { suppressDetailHash = false; }
    }
  }

  function setHash(hash, replace = false) {
    const clean = String(hash || "").replace(/^#/, "");
    const url = window.location.pathname + window.location.search + (clean ? "#" + clean : "");
    if (window.location.hash === (clean ? "#" + clean : "")) return;
    if (replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
  }

  function openBasket(key, sequence, attempt = 0) {
    if (sequence !== routeSequence) return;
    const wanted = normalize(key);
    const button = Array.from(document.querySelectorAll("#basket-grid [data-open-basket]"))
      .find((item) => normalize(item.dataset.openBasket || "") === wanted);
    if (button && !button.disabled) {
      button.click();
      setActiveBySection("basket", wanted);
      return;
    }
    if (attempt < 120) {
      window.setTimeout(() => openBasket(key, sequence, attempt + 1), 70);
      return;
    }
    scrollToNode(document.getElementById("catalog"));
    showStoreNotice("A cesta ainda não carregou. Tente novamente em instantes.");
  }

  function openCategory(key, sequence) {
    const normalizedKey = String(key || "").toLowerCase();
    if (normalizedKey === "mais_vendidos" || normalizedKey === "mais-vendidos") {
      setActiveBySection("popular");
      const api = window.DonaStorefrontPublicNavigation;
      const load = api && typeof api.ensureHomeCategory === "function"
        ? api.ensureHomeCategory("mais_vendidos")
        : Promise.resolve(false);
      Promise.resolve(load).then(() => {
        if (sequence !== routeSequence) return;
        const target = document.querySelector('[data-home-extra-section="mais_vendidos"]');
        scrollToNode(target || document.getElementById("home-extras"));
      });
      return;
    }
    setActive(null);
    const api = window.DonaStorefrontPublicNavigation;
    const load = api && typeof api.ensureHomeCategory === "function"
      ? api.ensureHomeCategory(normalizedKey)
      : Promise.resolve(false);
    Promise.resolve(load).then(() => {
      if (sequence !== routeSequence) return;
      const target = Array.from(document.querySelectorAll("[data-home-extra-section]"))
        .find((section) => section.dataset.homeExtraSection === normalizedKey);
      scrollToNode(target || document.getElementById("home-extras"));
    });
  }

  function routeFromHash(force = false) {
    const hash = window.location.hash.replace(/^#/, "");
    if (!force && hash === routedHash) return;
    routedHash = hash;
    const sequence = ++routeSequence;
    if (!hash || hash === "inicio") {
      closeBasketDetail();
      setActiveBySection("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (hash === "cestas" || hash === "catalog") {
      closeBasketDetail();
      setActive(null);
      scrollToNode(document.getElementById("catalog"));
      return;
    }
    if (hash.startsWith("cesta/")) {
      openBasket(hash.slice("cesta/".length), sequence);
      return;
    }
    if (hash === "mais-vendidos") {
      openCategory("mais_vendidos", sequence);
      return;
    }
    if (hash === "ofertas") {
      closeBasketDetail();
      setActiveBySection("offers");
      const api = window.DonaStorefrontPublicNavigation;
      if (api && typeof api.loadPublicOffers === "function") api.loadPublicOffers();
      scrollToNode(document.getElementById("ofertas"));
      return;
    }
    if (hash === "monte-sua-cesta") {
      closeBasketDetail();
      setActiveBySection("builder");
      scrollToNode(document.getElementById("home-extras"));
      return;
    }
    if (hash.startsWith("categoria/")) {
      closeBasketDetail();
      openCategory(hash.slice("categoria/".length), sequence);
      return;
    }
    closeBasketDetail();
  }

  function navigate(hash) {
    setHash(hash);
    routeFromHash(true);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-experiment-nav]") : null;
    if (target) {
      event.preventDefault();
      const section = target.dataset.experimentNav;
      if (section === "home") navigate("inicio");
      else if (section === "basket") navigate("cesta/" + (target.dataset.sizeKey || target.dataset.size || ""));
      else if (section === "popular") navigate("mais-vendidos");
      else if (section === "builder") navigate("monte-sua-cesta");
      else if (section === "offers") navigate("ofertas");
      return;
    }

    const basketButton = event.target instanceof Element ? event.target.closest("#basket-grid [data-open-basket]") : null;
    if (basketButton && !basketButton.disabled) {
      const key = normalize(basketButton.dataset.openBasket || "");
      if (basketOrder.includes(key)) {
        setHash("cesta/" + key);
        routedHash = "cesta/" + key;
      }
      return;
    }

    const back = event.target instanceof Element ? event.target.closest('#detail-sheet [data-close="detail"]') : null;
    if (back && !suppressDetailHash) {
      setHash("cestas", true);
      routedHash = "cestas";
    }
  });

  window.addEventListener("hashchange", () => routeFromHash());
  window.addEventListener("popstate", () => routeFromHash());

  if (document.body.dataset.testMode === "true") {
    document.addEventListener("click", (event) => {
      const guarded = event.target instanceof Element
        ? event.target.closest("#confirm-order, #lookup-button, #register-customer-button")
        : null;
      if (!guarded) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showStoreNotice("Versão de teste: pedidos e consultas de cadastro estão desativados.");
    }, true);

    document.addEventListener("submit", (event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      if (event.target.id !== "customer-registration") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showStoreNotice("Versão de teste: o cadastro não foi enviado.");
    }, true);
  }

  const basketGrid = document.getElementById("basket-grid");
  if (basketGrid && typeof MutationObserver === "function") {
    const observer = new MutationObserver(sortBasketCards);
    observer.observe(basketGrid, { childList: true });
  }
  sortBasketCards();
  if (window.location.hash) window.setTimeout(() => routeFromHash(true), 0);
})();