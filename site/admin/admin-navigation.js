/* Exclusivamente apresentação: controla o menu móvel sem alterar a navegação funcional. */
(() => {
  "use strict";
  const toggle = document.getElementById("admin-menu-toggle");
  const sidebar = document.getElementById("admin-sidebar");
  const backdrop = document.getElementById("admin-nav-backdrop");
  const content = document.querySelector(".admin-main");
  const headerActions = document.querySelector(".admin-topbar-actions");
  if (!toggle || !sidebar || !backdrop) return;

  const mobile = window.matchMedia("(max-width: 760px)");
  let opened = false;

  function render() {
    const visible = mobile.matches && opened;
    document.body.classList.toggle("admin-menu-open", visible);
    toggle.setAttribute("aria-expanded", String(visible));
    toggle.setAttribute("aria-label", visible ? "Fechar menu" : "Abrir menu");
    backdrop.hidden = !visible;
    sidebar.inert = mobile.matches && !visible;
    if (content) content.inert = visible;
    if (headerActions) headerActions.inert = visible;
    if (!mobile.matches) opened = false;
  }

  function close() {
    opened = false;
    render();
  }

  toggle.addEventListener("click", () => {
    opened = !opened;
    render();
    if (opened) sidebar.querySelector(".nav-tab.active")?.focus();
  });
  backdrop.addEventListener("click", () => {
    close();
    toggle.focus();
  });
  sidebar.addEventListener("click", (event) => {
    if (event.target.closest(".nav-tab")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!opened || !mobile.matches) return;
    if (event.key === "Escape") {
      close();
      toggle.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...sidebar.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")]
      .filter((node) => !node.hidden && node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });
  if (mobile.addEventListener) mobile.addEventListener("change", render);
  else mobile.addListener(render);
  render();
})();
