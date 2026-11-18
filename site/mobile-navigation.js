(() => {
  "use strict";

  const dialog = document.getElementById("mobile-navigation");
  const menuToggle = document.getElementById("mobile-menu-toggle");
  const menuClose = document.getElementById("mobile-menu-close");
  const headerCheckout = document.getElementById("mobile-checkout");
  const drawerCheckout = document.getElementById("mobile-navigation-checkout");
  const desktopCheckout = document.getElementById("sidebar-checkout");
  const sourceCount = document.getElementById("sidebar-checkout-count");
  const headerCount = document.getElementById("mobile-checkout-count");
  const drawerCount = document.getElementById("mobile-navigation-count");
  const basketGroup = document.getElementById("mobile-basket-menu");

  if (!dialog || !menuToggle) return;

  function setMenuState(isOpen) {
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu da loja" : "Abrir menu da loja");
  }

  function openMenu() {
    syncCurrentNavigation();
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
      dialog.setAttribute("data-fallback-open", "true");
      document.body.classList.add("mobile-navigation-fallback");
    }
    setMenuState(true);
    window.requestAnimationFrame(() => {
      if (menuClose) menuClose.focus({ preventScroll: true });
    });
  }

  function closeMenu(restoreFocus = true) {
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
      dialog.removeAttribute("data-fallback-open");
      document.body.classList.remove("mobile-navigation-fallback");
      setMenuState(false);
      if (restoreFocus) menuToggle.focus({ preventScroll: true });
    }
  }

  function openExistingCheckout() {
    closeMenu(false);
    if (desktopCheckout) desktopCheckout.click();
  }

  function syncCartCount() {
    if (!sourceCount) return;
    const visible = !sourceCount.hidden;
    const count = String(sourceCount.textContent || "0").trim() || "0";
    [headerCount, drawerCount].forEach((node) => {
      if (!node) return;
      node.textContent = count;
      node.hidden = !visible;
    });
    if (headerCheckout) {
      headerCheckout.setAttribute("aria-label", visible ? "Abrir sacola com " + count + " produtos" : "Abrir sacola");
    }
    if (drawerCheckout) {
      drawerCheckout.setAttribute("aria-label", visible ? "Abrir sacola com " + count + " produtos" : "Abrir sacola");
    }
  }

  function syncCurrentNavigation() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    let section = "home";
    let size = "";

    if (hash.indexOf("cesta/") === 0) {
      section = "basket";
      size = hash.slice("cesta/".length).toLowerCase();
      if (basketGroup) basketGroup.open = true;
    } else if (hash === "mais-vendidos") {
      section = "popular";
      if (basketGroup) basketGroup.open = false;
    } else if (hash === "monte-sua-cesta") {
      section = "builder";
      if (basketGroup) basketGroup.open = false;
    } else if (hash === "ofertas") {
      section = "offers";
      if (basketGroup) basketGroup.open = false;
    } else if (basketGroup) {
      basketGroup.open = false;
    }

    dialog.querySelectorAll("[data-experiment-nav]").forEach((link) => {
      const active = link.dataset.experimentNav === section &&
        (section !== "basket" || String(link.dataset.sizeKey || "").toLowerCase() === size);
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    const summary = dialog.querySelector(".mobile-nav-summary");
    if (summary) {
      const activeBasket = section === "basket";
      summary.classList.toggle("is-active", activeBasket);
      if (activeBasket) summary.setAttribute("aria-current", "page");
      else summary.removeAttribute("aria-current");
    }
  }

  menuToggle.addEventListener("click", openMenu);
  if (menuClose) menuClose.addEventListener("click", () => closeMenu());
  if (headerCheckout) headerCheckout.addEventListener("click", openExistingCheckout);
  if (drawerCheckout) drawerCheckout.addEventListener("click", openExistingCheckout);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeMenu();
  });
  dialog.addEventListener("close", () => {
    dialog.removeAttribute("data-fallback-open");
    document.body.classList.remove("mobile-navigation-fallback");
    setMenuState(false);
    menuToggle.focus({ preventScroll: true });
  });

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element
      ? event.target.closest("#mobile-navigation [data-experiment-nav]")
      : null;
    if (link) {
      window.setTimeout(() => {
        closeMenu(false);
        syncCurrentNavigation();
      }, 0);
    }
  });

  window.addEventListener("hashchange", syncCurrentNavigation);
  window.addEventListener("popstate", syncCurrentNavigation);

  if (sourceCount && typeof MutationObserver === "function") {
    const observer = new MutationObserver(syncCartCount);
    observer.observe(sourceCount, {
      attributes: true,
      attributeFilter: ["hidden"],
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  syncCartCount();
  syncCurrentNavigation();
})();