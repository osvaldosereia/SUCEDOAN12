(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  let activeCode = "";

  window.DonaAdminAuth = {
    getCode: () => activeCode,
  };

  async function verifyAccessCode(code) {
    if (!supabaseUrl || !publishableKey) throw new Error("A configuração do admin está incompleta.");
    const url = new URL(`${supabaseUrl}/functions/v1/site-admin-v1`);
    url.searchParams.set("action", "baskets");
    const response = await fetch(url.toString(), {
      headers: { apikey: publishableKey, "x-admin-code": code },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (data.error === "admin_auth_not_configured") {
      throw new Error("O código de acesso ainda não foi configurado no servidor.");
    }
    if (response.status === 401 || data.error === "admin_code_invalid") {
      throw new Error("Código de acesso inválido.");
    }
    if (!response.ok || data.ok === false) throw new Error("Não foi possível validar o código agora.");
  }

  $("admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("admin-access-code");
    const button = $("admin-login-button");
    const message = $("admin-login-message");
    const code = input.value;
    button.disabled = true;
    button.textContent = "Validando…";
    message.textContent = "";
    try {
      await verifyAccessCode(code);
      activeCode = code;
      input.value = "";
      $("admin-login").hidden = true;
      $("admin-app").hidden = false;
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "Não foi possível validar o código agora.";
      input.focus();
      input.select();
    } finally {
      button.disabled = false;
      button.textContent = "Acessar admin";
    }
  });

  $("admin-logout").addEventListener("click", () => {
    activeCode = "";
    window.location.reload();
  });
})();
