(() => {
  "use strict";

  const root = document.documentElement;
  const screen = document.getElementById("storefront-maintenance-screen");
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";

  async function checkAvailability() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    let isEnabled = false;
    try {
      if (!screen || !supabase || !publishableKey) return;
      const endpoint = new URL(supabase + "/functions/v1/site-maintenance-v1");
      endpoint.searchParams.set("action", "status");
      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: { apikey: publishableKey },
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      isEnabled = data.ok === true && data.enabled === true;
      if (!isEnabled) return;

      document.title = "Site em manutenção | Dona Antônia";
      let robots = document.querySelector('meta[name="robots"]');
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex,nofollow";
      const title = document.getElementById("storefront-maintenance-title");
      const copy = document.getElementById("storefront-maintenance-copy");
      if (title) title.textContent = "Estamos fazendo alguns ajustes";
      if (copy) copy.textContent = "A loja volta em breve. Obrigado pela compreensão.";
      screen.hidden = false;
      root.classList.remove("storefront-maintenance-checking");
      root.classList.add("storefront-maintenance-active");
    } catch (_) {
      // Fail open: a status lookup problem must not take the shop offline.
    } finally {
      window.clearTimeout(timeout);
      if (!isEnabled || !root.classList.contains("storefront-maintenance-active")) {
        root.classList.remove("storefront-maintenance-checking");
        if (screen) screen.hidden = true;
      }
    }
  }

  void checkAvailability();
})();
