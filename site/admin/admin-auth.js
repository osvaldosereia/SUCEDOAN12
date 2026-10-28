(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const REMEMBERED_ACCESS_KEY = "dona-antonia-admin-access-v1";
  const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const SESSION_RENEW_MS = 12 * 60 * 60 * 1000;
  const $ = (id) => document.getElementById(id);

  function readRememberedAccess() {
    try {
      const raw = window.localStorage.getItem(REMEMBERED_ACCESS_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const expiresAt = Number(saved && saved.expiresAt);
      if (!saved || typeof saved.accessCode !== "string" || !saved.accessCode ||
          !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        window.localStorage.removeItem(REMEMBERED_ACCESS_KEY);
        return null;
      }
      return { code: saved.accessCode, savedAt: Number(saved.savedAt) || 0 };
    } catch (_) {
      return null;
    }
  }

  function saveRememberedAccess(code) {
    const now = Date.now();
    try {
      window.localStorage.setItem(REMEMBERED_ACCESS_KEY, JSON.stringify({
        accessCode: code,
        savedAt: now,
        expiresAt: now + SESSION_TTL_MS,
      }));
      savedAt = now;
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearRememberedAccess() {
    try {
      window.localStorage.removeItem(REMEMBERED_ACCESS_KEY);
    } catch (_) {
      // The current tab can still be signed out if browser storage is unavailable.
    }
  }

  const rememberedAccess = readRememberedAccess();
  let activeCode = rememberedAccess ? rememberedAccess.code : "";
  let rememberAccess = Boolean(rememberedAccess);
  let savedAt = rememberedAccess ? rememberedAccess.savedAt : 0;

  window.DonaAdminAuth = {
    getCode: () => {
      if (rememberAccess && activeCode && Date.now() - savedAt >= SESSION_RENEW_MS) {
        rememberAccess = saveRememberedAccess(activeCode);
      }
      return activeCode;
    },
  };

  async function verifyAccessCode(code) {
    if (!supabaseUrl || !publishableKey) throw new Error("A configuração do admin está incompleta.");
    const url = new URL(supabaseUrl + "/functions/v1/site-admin-v1");
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

  async function restoreRememberedAccess() {
    if (!activeCode) return;
    const button = $("admin-login-button");
    const message = $("admin-login-message");
    button.disabled = true;
    button.textContent = "Restaurando…";
    message.textContent = "Conferindo o acesso salvo…";
    try {
      await verifyAccessCode(activeCode);
      saveRememberedAccess(activeCode);
      $("admin-login").hidden = true;
      $("admin-app").hidden = false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      if (errorMessage === "Código de acesso inválido.") {
        activeCode = "";
        rememberAccess = false;
        clearRememberedAccess();
        message.textContent = "O acesso salvo expirou. Digite o código novamente.";
      } else {
        message.textContent = "Não foi possível confirmar o acesso salvo. Confira a conexão e tente novamente.";
      }
    } finally {
      button.disabled = false;
      button.textContent = "Acessar admin";
    }
  }

  $("admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("admin-access-code");
    const button = $("admin-login-button");
    const message = $("admin-login-message");
    const rememberCheckbox = $("admin-remember-login");
    const code = input.value;
    const shouldRemember = Boolean(rememberCheckbox && rememberCheckbox.checked);
    button.disabled = true;
    button.textContent = "Validando…";
    message.textContent = "";
    activeCode = "";
    rememberAccess = false;
    try {
      await verifyAccessCode(code);
      activeCode = code;
      rememberAccess = shouldRemember;
      if (shouldRemember) {
        if (!saveRememberedAccess(code)) {
          rememberAccess = false;
          rememberCheckbox.checked = false;
        }
      } else {
        clearRememberedAccess();
      }
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
    rememberAccess = false;
    clearRememberedAccess();
    window.location.reload();
  });

  restoreRememberedAccess();
})();
