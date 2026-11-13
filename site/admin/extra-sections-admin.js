(() => {
  "use strict";

  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const CATEGORY_OPTIONS = [
    { key: "mercearia", label: "Mercearia" },
    { key: "limpeza_lavanderia", label: "Limpeza e lavanderia" },
    { key: "higiene_beleza", label: "Higiene e beleza" },
    { key: "casa_pet", label: "Casa e pet" }
  ];
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  let sections = [];
  let bound = false;
  let loading = false;

  async function adminRequest(action, values) {
    if (!supabase || !publishableKey) throw new Error("A configuração do Admin está incompleta.");
    const response = await fetch(supabase + "/functions/v1/site-admin-v1", {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth && window.DonaAdminAuth.getCode ? window.DonaAdminAuth.getCode() : "",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(Object.assign({ action }, values || {})),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const messages = {
        admin_code_invalid: "O acesso ao Admin expirou. Entre novamente.",
        extra_section_name_required: "Informe o nome da seção.",
        extra_section_terms_required: "Informe pelo menos uma palavra-chave.",
        extra_section_category_required: "Selecione pelo menos uma categoria do site.",
        extra_section_too_many_terms: "Use no máximo 20 palavras-chave.",
        extra_section_invalid_category: "Uma das categorias selecionadas não é válida."
      };
      throw new Error(messages[data.error] || data.message || "Não foi possível salvar as seções extras.");
    }
    return data;
  }

  function setStatus(message, isError) {
    const node = $("extra-section-status");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error", Boolean(isError));
    node.classList.toggle("success", Boolean(message) && !isError);
  }

  function renderCategoryOptions(selectedKeys) {
    const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys.map(String) : []);
    const host = $("extra-section-category-options");
    if (!host) return;
    host.innerHTML = CATEGORY_OPTIONS.map((item) =>
      '<label class="extra-section-category-option"><input type="checkbox" name="sales_categories" value="' + esc(item.key) + '"' +
      (selected.has(item.key) ? " checked" : "") + '><span>' + esc(item.label) + '</span></label>'
    ).join("");
  }

  function categoryLabels(keys) {
    const selected = new Set(Array.isArray(keys) ? keys.map(String) : []);
    return CATEGORY_OPTIONS.filter((item) => selected.has(item.key)).map((item) => item.label);
  }

  function renderSections() {
    const host = $("extra-section-list");
    if (!host) return;
    if (!sections.length) {
      host.innerHTML = '<p class="empty-state">Nenhuma seção cadastrada. Use “Nova seção” para criar a primeira.</p>';
      return;
    }
    host.innerHTML = sections.map((section) => {
      const terms = Array.isArray(section.search_terms) ? section.search_terms : [];
      const labels = categoryLabels(section.sales_categories);
      const isActive = section.is_active !== false;
      const configured = terms.length > 0 && labels.length > 0;
      const badge = !isActive ? "Pausada" : configured ? "Ativa" : "Configurar";
      return '<article class="extra-section-card' + (isActive ? "" : " is-inactive") + (!configured && isActive ? " needs-config" : "") + '">' +
        '<div class="extra-section-card-main"><div class="extra-section-card-heading"><h3>' + esc(section.name || "Seção sem nome") + '</h3>' +
        '<span class="extra-section-status-badge">' + badge + '</span></div>' +
        (!configured && isActive ? '<p class="extra-section-not-configured">Informe palavras-chave e categorias para mostrar esta seção no site.</p>' : '') +
        '<p><strong>Buscar:</strong> ' + esc(terms.length ? terms.join(" · ") : "palavras-chave ainda não configuradas") + '</p>' +
        '<p><strong>Categorias:</strong> ' + esc(labels.length ? labels.join(", ") : "nenhuma selecionada") + '</p></div>' +
        '<div class="extra-section-card-actions"><button class="button button-outline" type="button" data-extra-section-edit="' + esc(section.id) + '">Editar</button>' +
        '<button class="button button-outline" type="button" data-extra-section-toggle="' + esc(section.id) + '">' + (isActive ? "Pausar" : "Ativar") + '</button></div>' +
        '</article>';
    }).join("");
  }

  function resetForm() {
    const form = $("extra-section-form");
    if (!form) return;
    form.reset();
    $("extra-section-id").value = "";
    $("extra-section-active").checked = true;
    renderCategoryOptions([]);
    setStatus("", false);
    form.hidden = true;
    const button = $("save-extra-section");
    if (button) {
      button.disabled = false;
      button.textContent = "Salvar seção";
    }
  }

  function openForm(section) {
    const form = $("extra-section-form");
    if (!form) return;
    form.reset();
    $("extra-section-id").value = section ? String(section.id || "") : "";
    $("extra-section-name").value = section ? String(section.name || "") : "";
    $("extra-section-terms").value = section && Array.isArray(section.search_terms) ? section.search_terms.join("\n") : "";
    $("extra-section-active").checked = !section || section.is_active !== false;
    renderCategoryOptions(section && section.sales_categories);
    setStatus("", false);
    form.hidden = false;
    $("save-extra-section").textContent = section ? "Salvar alterações" : "Salvar seção";
    $("extra-section-name").focus();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveSection(event) {
    event.preventDefault();
    const button = $("save-extra-section");
    if (!button || button.disabled) return;
    const categories = Array.from(document.querySelectorAll('#extra-section-category-options input[name="sales_categories"]:checked'))
      .map((input) => input.value);
    const values = {
      id: $("extra-section-id").value || null,
      name: $("extra-section-name").value.trim(),
      search_terms: $("extra-section-terms").value.split(/\r?\n/).map((term) => term.trim()).filter(Boolean),
      sales_categories: categories,
      is_active: $("extra-section-active").checked
    };
    button.disabled = true;
    button.textContent = "Salvando…";
    setStatus("Salvando seção…", false);
    try {
      await adminRequest("extra_section_save", values);
      setStatus("Seção salva.", false);
      await load(true);
      resetForm();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar a seção.", true);
    } finally {
      button.disabled = false;
      button.textContent = values.id ? "Salvar alterações" : "Salvar seção";
    }
  }

  async function toggleSection(section) {
    try {
      await adminRequest("extra_section_save", {
        id: section.id,
        name: section.name,
        search_terms: Array.isArray(section.search_terms) ? section.search_terms : [],
        sales_categories: Array.isArray(section.sales_categories) ? section.sales_categories : [],
        is_active: section.is_active === false
      });
      await load(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível atualizar a seção.", true);
    }
  }

  function bind() {
    if (bound) return;
    const form = $("extra-section-form");
    if (!form) return;
    $("new-extra-section").addEventListener("click", () => openForm(null));
    $("cancel-extra-section").addEventListener("click", resetForm);
    form.addEventListener("submit", saveSection);
    $("extra-section-list").addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-extra-section-edit]");
      const toggleButton = event.target.closest("[data-extra-section-toggle]");
      const id = String((editButton || toggleButton || {}).dataset && (editButton || toggleButton).dataset.extraSectionEdit ||
        (editButton || toggleButton || {}).dataset && (editButton || toggleButton).dataset.extraSectionToggle || "");
      const section = sections.find((item) => String(item.id) === id);
      if (!section) return;
      if (editButton) openForm(section);
      else if (toggleButton && section.is_active === false &&
        (!(Array.isArray(section.search_terms) && section.search_terms.length) || !(Array.isArray(section.sales_categories) && section.sales_categories.length))) openForm(section);
      else if (toggleButton) toggleSection(section);
    });
    bound = true;
  }

  async function load(silent) {
    if (loading) return;
    const host = $("extra-section-list");
    if (!host) return;
    bind();
    loading = true;
    if (!silent) host.innerHTML = '<p class="admin-muted">Carregando seções…</p>';
    try {
      const data = await adminRequest("extra_sections_list");
      sections = Array.isArray(data.sections) ? data.sections : [];
      renderSections();
    } catch (error) {
      host.innerHTML = '<p class="form-message error">' + esc(error instanceof Error ? error.message : "Não foi possível carregar as seções.") + '</p>';
    } finally {
      loading = false;
    }
  }

  window.DonaExtraSectionsAdmin = { load };
})();