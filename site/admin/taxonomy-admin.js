(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const apiBase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const apikey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const kinds = [
    { id: "category", label: "Categorias" },
    { id: "subcategory", label: "Subcategorias" },
    { id: "brand", label: "Marcas" },
    { id: "gondola", label: "Gôndolas" },
  ];
  const state = { terms: [], kind: "category", selected: null, loading: false, saving: false };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const code = () => window.DonaAdminAuth?.getCode?.() || "";
  const notify = (message) => window.DonaAdminProductBridge?.toast?.(message);

  async function api(payload = null) {
    if (!apiBase || !apikey) throw new Error("Configuração do painel incompleta.");
    const response = await fetch(apiBase + "/functions/v1/site-product-taxonomy-v1", {
      method: payload ? "POST" : "GET",
      cache: "no-store",
      headers: { apikey, "x-admin-code": code(), ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw new Error(result.error || "Não foi possível atualizar as classificações.");
    return result;
  }
  const categoryName = (term) => state.terms.find(c => c.kind === "category" && c.id === term.parent_id)?.name || "Sem categoria";
  const sorted = (items) => [...items].sort((a,b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  function status(message, error = false) {
    const node = $("taxonomy-status");
    node.textContent = message;
    node.dataset.error = error ? "true" : "false";
  }
  function refreshSuggestions() {
    const form = $("product-form");
    if (!form) return;
    const fields = { category: "category", subcategory: "subcategory", brand: "brand", gondola: "gondola" };
    for (const [field,kind] of Object.entries(fields)) {
      const input = form.elements.namedItem(field);
      if (!input) continue;
      const id = "taxonomy-options-" + field;
      let list = $(id);
      if (!list) {
        list = document.createElement("datalist");
        list.id = id;
        form.appendChild(list);
        input.setAttribute("list", id);
      }
      const currentCategory = String(form.elements.category.value || "").trim().toLocaleLowerCase("pt-BR");
      let terms = state.terms.filter(term => term.kind === kind);
      if (kind === "subcategory" && currentCategory) {
        terms = terms.filter(term => categoryName(term).toLocaleLowerCase("pt-BR") === currentCategory);
      }
      const names = [...new Set(sorted(terms).map(x => x.name))];
      list.replaceChildren(...names.map(name => {
        const option = document.createElement("option");
        option.value = name;
        return option;
      }));
    }
  }
  function render() {
    for (const button of document.querySelectorAll("[data-taxonomy-kind]")) {
      const selected = button.dataset.taxonomyKind === state.kind;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    }
    const termList = $("taxonomy-list");
    const query = String($("taxonomy-search").value || "").trim().toLocaleLowerCase("pt-BR");
    const terms = sorted(state.terms.filter(t => t.kind === state.kind && (
      t.name.toLocaleLowerCase("pt-BR").includes(query) ||
      (state.kind === "subcategory" && categoryName(t).toLocaleLowerCase("pt-BR").includes(query))
    )));
    $("taxonomy-total").textContent = terms.length + " registros";
    if (!terms.length) {
      termList.innerHTML = '<p class="admin-muted">Nenhum registro encontrado. Clique em Adicionar para criar.</p>';
      return;
    }
    termList.innerHTML = terms.map(t => {
      const inUse = Number(t.usage_count || 0);
      const children = Number(t.child_count || 0);
      const cannotDelete = inUse || children;
      const subtitle = state.kind === "subcategory" ? "<small>" + escape(categoryName(t)) + "</small>" : "";
      return '<article class="taxonomy-item">' +
        '<div class="taxonomy-item-name"><strong>' + escape(t.name) + '</strong>' + subtitle +
        '<small>' + inUse + ' produto' + (inUse === 1 ? "" : "s") + (children ? ' · ' + children + ' subcategorias' : '') + '</small></div>' +
        '<div class="taxonomy-item-actions"><button class="button button-outline" type="button" data-taxonomy-edit="' + escape(t.id) + '">Editar</button>' +
        '<button class="taxonomy-delete" type="button" data-taxonomy-delete="' + escape(t.id) + '"' +
        (cannotDelete ? ' disabled title="Renomeie ou libere os vínculos antes de excluir"' : '') + '>Excluir</button></div>' +
        '</article>';
    }).join("");
  }
  async function load(silent = false) {
    if (state.loading) return;
    state.loading = true;
    if (!silent) status("Carregando classificações…");
    try {
      const result = await api();
      state.terms = result.terms || [];
      render();
      refreshSuggestions();
      if (!silent) status("");
    } catch (error) {
      status(error.message || "Erro ao carregar classificações.", true);
    } finally {
      state.loading = false;
    }
  }
  function updateParentSelect() {
    const select = $("taxonomy-parent");
    const selected = state.selected?.parent_id || "";
    select.replaceChildren(new Option("Sem categoria vinculada", ""));
    for (const cat of sorted(state.terms.filter(t => t.kind === "category"))) {
      select.add(new Option(cat.name, cat.id));
    }
    select.value = selected;
  }
  function edit(term = null) {
    state.selected = term;
    const form = $("taxonomy-form");
    form.hidden = false;
    $("taxonomy-form-title").textContent = term ? "Editar " + term.name : "Adicionar " + kinds.find(k => k.id === state.kind).label.toLocaleLowerCase("pt-BR");
    $("taxonomy-name").value = term?.name || "";
    $("taxonomy-name").maxLength = 100;
    $("taxonomy-parent-wrap").hidden = state.kind !== "subcategory";
    updateParentSelect();
    $("taxonomy-parent").disabled = Boolean(term);
    $("taxonomy-parent-help").hidden = !term || state.kind !== "subcategory";
    $("taxonomy-save").textContent = term ? "Salvar nome" : "Adicionar";
    status("");
    $("taxonomy-name").focus();
    form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function closeEditor() {
    state.selected = null;
    $("taxonomy-form").hidden = true;
    status("");
  }
  async function save(event) {
    event.preventDefault();
    if (state.saving) return;
    const name = $("taxonomy-name").value.trim();
    if (!name) return status("Informe um nome.", true);
    const editing = Boolean(state.selected);
    const body = editing
      ? { action: "rename", id: state.selected.id, name }
      : { action: "create", kind: state.kind, name, parent_id: state.kind === "subcategory" ? ($("taxonomy-parent").value || null) : null };
    state.saving = true;
    $("taxonomy-save").disabled = true;
    status("Salvando…");
    try {
      const result = await api(body);
      closeEditor();
      await load(true);
      await window.DonaCatalogAdmin?.loadProducts?.(true);
      const affected = Number(result.result?.affected || 0);
      notify(editing ? "Classificação atualizada. " + affected + " produto(s) ajustado(s)." : "Classificação criada.");
      status(editing ? "Nome atualizado nos produtos vinculados (" + affected + ")." : "Classificação adicionada.");
    } catch (error) {
      status(error.message || "Falha ao salvar.", true);
    } finally {
      state.saving = false;
      $("taxonomy-save").disabled = false;
    }
  }
  async function remove(id) {
    const term = state.terms.find(x => x.id === id);
    if (!term || Number(term.usage_count) || Number(term.child_count)) return;
    if (!window.confirm('Excluir "' + term.name + '"? Essa ação não remove produtos.')) return;
    status("Excluindo…");
    try {
      await api({ action: "delete", id });
      await load(true);
      status("Classificação excluída.");
      notify("Classificação excluída.");
    } catch (error) {
      status(error.message || "Falha ao excluir.", true);
    }
  }
  const dialog = $("taxonomy-dialog");
  $("manage-product-taxonomy").addEventListener("click", () => {
    closeEditor();
    dialog.showModal();
    load();
  });
  $("taxonomy-close").addEventListener("click", () => dialog.close());
  $("taxonomy-new").addEventListener("click", () => edit(null));
  $("taxonomy-cancel").addEventListener("click", closeEditor);
  $("taxonomy-form").addEventListener("submit", save);
  $("taxonomy-search").addEventListener("input", render);
  $("taxonomy-list").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.taxonomyEdit) edit(state.terms.find(x => x.id === button.dataset.taxonomyEdit));
    if (button.dataset.taxonomyDelete) remove(button.dataset.taxonomyDelete);
  });
  for (const button of document.querySelectorAll("[data-taxonomy-kind]")) {
    button.addEventListener("click", () => {
      state.kind = button.dataset.taxonomyKind;
      $("taxonomy-search").value = "";
      closeEditor();
      render();
    });
  }
  $("product-form").elements.category.addEventListener("input", refreshSuggestions);
  $("product-dialog").addEventListener("close", refreshSuggestions);
  // Atualiza também quando o editor de produtos é aberto pela primeira vez.
  $("product-dialog").addEventListener("toggle", refreshSuggestions);
  refreshSuggestions();
  window.DonaProductTaxonomyAdmin = { load };
})();
