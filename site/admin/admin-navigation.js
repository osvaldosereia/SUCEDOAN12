/* Exclusivamente apresentação: controla o menu móvel sem alterar a navegação funcional. */
(() => {
  "use strict";
  const toggle = document.getElementById("admin-menu-toggle");
  const sidebar = document.getElementById("admin-sidebar");
  const backdrop = document.getElementById("admin-nav-backdrop");
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
    if (event.key === "Escape" && opened) {
      close();
      toggle.focus();
    }
  });
  if (mobile.addEventListener) mobile.addEventListener("change", render);
  else mobile.addListener(render);
  render();
})();
