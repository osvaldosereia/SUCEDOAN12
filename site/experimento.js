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

  function showTestNotice(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message || "Modo de teste: nenhum pedido foi enviado.";
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

  function scrollToNode(node) {
    if (!node) return false;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  function openBasket(size) {
    const wanted = normalize(size);
    const cards = Array.from(document.querySelectorAll("#basket-grid .basket-card"));
    const card = cards.find((item) => normalize(item.querySelector(".basket-title")?.textContent).includes(wanted));
    if (!card) {
      scrollToNode(document.getElementById("catalog"));
      showTestNotice("A cesta está carregando. Tente novamente em instantes.");
      return;
    }
    const button = card.querySelector("[data-open-basket]");
    if (button && !button.disabled) button.click();
    else {
      scrollToNode(card);
      showTestNotice("A cesta ainda está carregando.");
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-experiment-nav]") : null;
    if (!target) return;
    event.preventDefault();
    setActive(target);

    const section = target.dataset.experimentNav;
    if (section === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (section === "basket") {
      openBasket(target.dataset.size || "");
      return;
    }
    if (section === "popular") {
      const popular = document.querySelector('[data-home-extra-section="mais_vendidos"]');
      scrollToNode(popular || document.getElementById("home-extras"));
      return;
    }
    if (section === "builder") scrollToNode(document.getElementById("home-extras"));
  });

  document.addEventListener("click", (event) => {
    const guarded = event.target instanceof Element
      ? event.target.closest("#confirm-order, #lookup-button, #register-customer-button")
      : null;
    if (!guarded) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showTestNotice("Versão de teste: pedidos e consultas de cadastro estão desativados.");
  }, true);

  document.addEventListener("submit", (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    if (event.target.id !== "customer-registration") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showTestNotice("Versão de teste: o cadastro não foi enviado.");
  }, true);

  const basketGrid = document.getElementById("basket-grid");
  if (basketGrid && typeof MutationObserver === "function") {
    const observer = new MutationObserver(sortBasketCards);
    observer.observe(basketGrid, { childList: true });
  }
  sortBasketCards();
})();
