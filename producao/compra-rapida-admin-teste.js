(function () {
  "use strict";
  const VERSION = "2026-07-18-producao-v4-teste",
    FIREBASE_NODE = "config_compra_rapida_teste",
    GITHUB_PATH = "site/compra-rapida-teste.json";
  let config = null,
    selectedSection = "",
    selectedItem = "",
    dirty = false,
    pickerItem = "",
    pickerQuery = "",
    pickerCategory = "";
  const bridge = window.__DA_NFE_BRIDGE__ || {};
  const state = bridge.state || {};
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );
  const norm = (v) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const slug = (v) =>
    norm(v)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  const num = (v) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const productId = (p) =>
    String(
      p?.codigo || p?.id || p?.firebaseKey || p?.gtin || p?.ean || "",
    ).trim();
  const productKey = (p) =>
    String(p?.firebaseKey || p?.id || p?.codigo || "").trim();
  const productName = (p) =>
    String(
      p?.nome || p?.name || p?.descricao || p?.codigo || "Produto sem nome",
    ).trim();
  const productImage = (p) => {
    try {
      return bridge.getImg
        ? bridge.getImg(p)
        : String(p?.url_imagem || p?.imagem || p?.image || p?.img || "");
    } catch {
      return String(p?.url_imagem || p?.imagem || p?.image || p?.img || "");
    }
  };
  const productPrice = (p) => num(p?.preco ?? p?.price);
  const productStock = (p) =>
    Math.max(0, Math.floor(num(p?.estoque ?? p?.stock)));
  const activeProduct = (p) => {
    const s = String(p?.situacao ?? p?.status ?? "A").toLowerCase();
    return (
      !["i", "inativo", "false", "0", "excluido", "excluído"].includes(s) &&
      p?.ativo !== false &&
      productPrice(p) > 0 &&
      productStock(p) > 0
    );
  };
  function toast(message, type = "ok") {
    if (bridge.setStatus)
      bridge.setStatus(message, type === "err" ? "err" : "ok");
    let el = $("#qrAdminToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "qrAdminToast";
      el.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:180;padding:12px 15px;border-radius:12px;background:#111;color:#fff;font-size:12px;font-weight:850;box-shadow:0 18px 48px rgba(0,0,0,.24)";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.background = type === "err" ? "#9f1239" : "#166534";
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 3200);
  }
  function markDirty() {
    dirty = true;
    $("#qrDirty")?.classList.add("show");
    const status = $("#qrStatus");
    if (status) {
      status.textContent = "Alterações não salvas";
      status.className = "qr-status";
    }
  }
  function cleanConfig(raw) {
    const c = raw && typeof raw === "object" ? clone(raw) : {};
    c.version = String(c.version || VERSION);
    c.updatedAt = String(c.updatedAt || new Date().toISOString());
    c.titulo = String(c.titulo || "Compra Rápida");
    c.subtitulo = String(
      c.subtitulo || "Monte sua compra do mês em poucos minutos.",
    );
    c.ativo = c.ativo !== false;
    delete c.perfilPadrao;
    delete c.perfis;
    c.configuracao = {
      ...(c.configuracao || {}),
      firebasePath: FIREBASE_NODE,
      maxOpcoesVisiveis: Math.max(
        1,
        num(c.configuracao?.maxOpcoesVisiveis) || 5,
      ),
    };
    c.secoes = (Array.isArray(c.secoes) ? c.secoes : []).map((section, si) => {
      const cleanSection = {
        ...section,
        id: String(section.id || `setor-${si + 1}`),
        titulo: String(section.titulo || `Setor ${si + 1}`),
        descricao: String(section.descricao || ""),
        ordem: num(section.ordem) || si + 1,
        ativo: section.ativo !== false,
      };
      cleanSection.itens = (
        Array.isArray(section.itens) ? section.itens : []
      ).map((item, ii) => {
        const cleanItem = {
          ...item,
          id: String(item.id || `item-${si + 1}-${ii + 1}`),
          titulo: String(item.titulo || `Item ${ii + 1}`),
          descricao: String(item.descricao || ""),
          ordem: num(item.ordem) || ii + 1,
          ativo: item.ativo !== false,
          essencial: item.essencial === true,
          produtoPadraoId: String(item.produtoPadraoId || ""),
          produtos: Array.isArray(item.produtos) ? item.produtos : [],
        };
        delete cleanItem.quantidadesSugeridas;
        return cleanItem;
      });
      return cleanSection;
    });
    return c;
  }
  function snapshotProduct(p) {
    return {
      id: productId(p),
      firebaseKey: productKey(p),
      nome: productName(p),
      preco: productPrice(p),
      estoque: productStock(p),
      imagem: productImage(p),
      marca: String(p?.marca || ""),
      categoria: String(p?.categoria || ""),
      subcategoria: String(p?.subcategoria || ""),
      ean: String(p?.gtin || p?.ean || ""),
    };
  }
  function firebaseBase() {
    return String(
      state.settings?.firebaseUrl ||
        "https://cedar-chemist-310801-default-rtdb.firebaseio.com",
    ).replace(/\/+$/, "");
  }
  async function fetchJson(url) {
    const r = await fetch(
      `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  async function loadConfig() {
    const status = $("#qrStatus");
    if (status) {
      status.textContent = "Carregando...";
      status.className = "qr-status";
    }
    let source = "Firebase";
    try {
      config = cleanConfig(
        await fetchJson(`${firebaseBase()}/${FIREBASE_NODE}.json`),
      );
      if (!config.secoes.length) throw new Error("vazio");
    } catch {
      source = "JSON do site";
      config = cleanConfig(await fetchJson("../site/compra-rapida.json"));
    }
    selectedSection = config.secoes[0]?.id || "";
    selectedItem = config.secoes[0]?.itens?.[0]?.id || "";
    dirty = false;
    render();
    const currentStatus = $("#qrStatus");
    if (currentStatus) {
      currentStatus.textContent = `Carregado de ${source}`;
      currentStatus.className = "qr-status ok";
    }
  }
  function allProducts() {
    return (Array.isArray(state.produtos) ? state.produtos : []).filter(
      activeProduct,
    );
  }
  function sectionById(id) {
    return config?.secoes?.find((s) => String(s.id) === String(id)) || null;
  }
  function itemById(id) {
    for (const s of config?.secoes || []) {
      const i = (s.itens || []).find((x) => String(x.id) === String(id));
      if (i) return { section: s, item: i };
    }
    return null;
  }
  function ensureUniqueId(value, type, current) {
    const base = slug(value) || `${type}-${Date.now()}`;
    let id = base,
      n = 2;
    const used = new Set(
      type === "setor"
        ? (config.secoes || []).filter((s) => s !== current).map((s) => s.id)
        : (config.secoes || [])
            .flatMap((s) => s.itens || [])
            .filter((i) => i !== current)
            .map((i) => i.id),
    );
    while (used.has(id)) id = `${base}-${n++}`;
    return id;
  }
  function treeHtml() {
    return (config.secoes || [])
      .sort((a, b) => a.ordem - b.ordem)
      .map(
        (s) =>
          `<article class="qr-section ${selectedSection === s.id ? "active" : ""}"><div class="qr-section-head"><button class="qr-section-title" data-qr="select-section" data-id="${esc(s.id)}"><strong>${esc(s.titulo)}</strong><small>${(s.itens || []).length} itens · ${s.ativo !== false ? "ativo" : "oculto"}</small></button><div class="qr-tree-actions"><button class="qr-icon-btn" data-qr="add-item" data-id="${esc(s.id)}" title="Adicionar item">＋</button><button class="qr-icon-btn" data-qr="move-section" data-id="${esc(s.id)}" data-dir="-1" title="Subir">↑</button><button class="qr-icon-btn" data-qr="move-section" data-id="${esc(s.id)}" data-dir="1" title="Descer">↓</button></div></div><div class="qr-items">${
            (s.itens || [])
              .sort((a, b) => a.ordem - b.ordem)
              .map(
                (i) =>
                  `<div class="qr-item ${selectedItem === i.id ? "active" : ""}"><button class="qr-item-main" data-qr="select-item" data-section="${esc(s.id)}" data-id="${esc(i.id)}"><strong>${esc(i.titulo)}</strong><small>${(i.produtos || []).length} opções · ${i.essencial ? "essencial" : "opcional"}</small></button><div class="qr-tree-actions"><button class="qr-icon-btn" data-qr="move-item" data-section="${esc(s.id)}" data-id="${esc(i.id)}" data-dir="-1">↑</button><button class="qr-icon-btn" data-qr="move-item" data-section="${esc(s.id)}" data-id="${esc(i.id)}" data-dir="1">↓</button></div></div>`,
              )
              .join("") || '<div class="tiny">Nenhum item neste setor.</div>'
          }</div></article>`,
      )
      .join("");
  }
  function optionHtml(p, index, item) {
    const id = String(p.id || p.codigo || p.firebaseKey || "");
    return `<article class="qr-option ${String(item.produtoPadraoId) === id ? "default" : ""}"><img src="${esc(p.imagem || "")}" alt=""><div><strong>${esc(p.nome || id)}</strong><small>${esc(p.marca || "")} · ${Number(p.estoque || 0)} em estoque · ${Number(p.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small>${String(item.produtoPadraoId) === id ? '<span class="chip green" style="margin-top:5px">Padrão</span>' : ""}</div><div class="qr-option-actions"><button data-qr="default-product" data-index="${index}" title="Definir padrão">★</button><button data-qr="move-product" data-index="${index}" data-dir="-1">↑</button><button data-qr="move-product" data-index="${index}" data-dir="1">↓</button><button data-qr="remove-product" data-index="${index}" title="Remover">×</button></div></article>`;
  }
  function editorHtml() {
    const found = selectedItem ? itemById(selectedItem) : null;
    if (found) {
      const { item } = found;
      return `<div class="qr-admin-card qr-admin-pad"><div class="qr-editor-head"><div><h3>Editar item</h3><p>Defina os produtos e a ordem de exibição. Cada produto terá seu próprio seletor de quantidade no site.</p></div><button class="btn red" data-qr="delete-item">Excluir item</button></div><div class="qr-editor-grid"><div class="field"><label>Nome do item</label><input class="input" id="qrItemTitle" value="${esc(item.titulo)}"></div><div class="field"><label>Identificador</label><input class="input" id="qrItemId" value="${esc(item.id)}"></div><div class="field qr-span-2"><label>Descrição</label><input class="input" id="qrItemDescription" value="${esc(item.descricao)}"></div><div class="field"><label>Ordem</label><input class="input" id="qrItemOrder" type="number" min="1" value="${item.ordem}"></div><div class="qr-checks"><label><input id="qrItemActive" type="checkbox" ${item.ativo !== false ? "checked" : ""}> Ativo</label><label><input id="qrItemEssential" type="checkbox" ${item.essencial ? "checked" : ""}> Essencial</label></div></div></div><div class="qr-admin-card qr-admin-pad" style="margin-top:14px"><div class="qr-editor-head"><div><h3>Produtos disponíveis</h3><p>Use o catálogo já carregado no admin, com as mesmas imagens e dados do Firebase.</p></div><button class="btn green" data-qr="open-picker">＋ Adicionar produtos</button></div><div class="qr-options">${(item.produtos || []).map((p, i) => optionHtml(p, i, item)).join("") || '<div class="qr-empty">Nenhum produto adicionado.</div>'}</div></div>`;
    }
    const section = sectionById(selectedSection);
    if (section)
      return `<div class="qr-admin-card qr-admin-pad"><div class="qr-editor-head"><div><h3>Editar setor</h3><p>Organize a seção que será exibida na Compra Rápida.</p></div><button class="btn red" data-qr="delete-section">Excluir setor</button></div><div class="qr-editor-grid"><div class="field"><label>Nome</label><input class="input" id="qrSectionTitle" value="${esc(section.titulo)}"></div><div class="field"><label>Identificador</label><input class="input" id="qrSectionId" value="${esc(section.id)}"></div><div class="field qr-span-2"><label>Descrição</label><input class="input" id="qrSectionDescription" value="${esc(section.descricao)}"></div><div class="field"><label>Ordem</label><input class="input" id="qrSectionOrder" type="number" min="1" value="${section.ordem}"></div><div class="qr-checks"><label><input id="qrSectionActive" type="checkbox" ${section.ativo !== false ? "checked" : ""}> Setor ativo no site</label></div></div></div>`;
    return '<div class="qr-empty">Selecione um setor ou item para editar.</div>';
  }
  function render() {
    if (!config) return;
    const panel = $("#tab-compra-rapida");
    if (!panel) return;
    const sectionCount = config.secoes.length,
      itemCount = config.secoes.reduce((n, s) => n + (s.itens || []).length, 0),
      productCount = new Set(
        config.secoes.flatMap((s) =>
          (s.itens || []).flatMap((i) => (i.produtos || []).map((p) => p.id)),
        ),
      ).size;
    panel.innerHTML = `<div class="panel-head"><div class="panel-title"><h2>Compra Rápida · teste isolado</h2><p>Gerencie setores, produtos e quantidades usando o catálogo e as imagens já carregados neste admin.</p></div><div class="toolbar"><button class="btn" data-qr="reload">↻ Recarregar</button><button class="btn gold" data-qr="export">↓ Baixar JSON</button><label class="btn">↑ Importar JSON<input id="qrImportFile" hidden type="file" accept=".json,application/json"></label><button class="btn green" data-qr="save-firebase">☁ Salvar teste no Firebase</button><button class="btn primary" data-qr="save-github">✓ Salvar teste no Firebase + GitHub</button></div></div><div class="notice red" style="margin-bottom:14px"><strong>Ambiente de teste:</strong> os salvamentos desta seção usam config_compra_rapida_teste e site/compra-rapida-teste.json. A configuração oficial não será alterada.</div><div class="notice gold" style="margin-bottom:14px"><strong>Vários produtos por seção:</strong> no site, cada opção terá seletor individual de quantidade. O cliente poderá incluir arroz de duas marcas, vários itens de limpeza ou qualquer combinação da mesma seção.</div><div class="qr-admin-layout"><aside class="qr-admin-card qr-admin-pad qr-admin-side"><div class="qr-admin-summary"><div class="qr-admin-metric"><strong>${sectionCount}</strong><span>setores</span></div><div class="qr-admin-metric"><strong>${itemCount}</strong><span>itens</span></div><div class="qr-admin-metric"><strong>${productCount}</strong><span>produtos</span></div></div><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><strong>Estrutura</strong><div id="qrStatus" class="qr-status">Pronto</div></div><button class="btn green small" data-qr="add-section">＋ Setor</button></div><span id="qrDirty" class="chip gold qr-dirty ${dirty ? "show" : ""}" style="margin-top:8px">Não salvo</span><div class="qr-tree">${treeHtml()}</div></aside><section class="qr-editor">${editorHtml()}</section></div>`;
    bindFields();
  }
  function bindFields() {
    const found = selectedItem ? itemById(selectedItem) : null;
    if (found) {
      const i = found.item;
      [
        ["#qrItemTitle", "titulo"],
        ["#qrItemDescription", "descricao"],
      ].forEach(([s, k]) =>
        $(s)?.addEventListener("input", (e) => {
          i[k] = e.target.value;
          markDirty();
        }),
      );
      $("#qrItemId")?.addEventListener("change", (e) => {
        i.id = ensureUniqueId(e.target.value, "item", i);
        selectedItem = i.id;
        markDirty();
        render();
      });
      $("#qrItemOrder")?.addEventListener("change", (e) => {
        i.ordem = Math.max(1, num(e.target.value) || 1);
        markDirty();
        render();
      });
      $("#qrItemActive")?.addEventListener("change", (e) => {
        i.ativo = e.target.checked;
        markDirty();
      });
      $("#qrItemEssential")?.addEventListener("change", (e) => {
        i.essencial = e.target.checked;
        markDirty();
      });
    } else {
      const s = sectionById(selectedSection);
      if (!s) return;
      $("#qrSectionTitle")?.addEventListener("input", (e) => {
        s.titulo = e.target.value;
        markDirty();
      });
      $("#qrSectionDescription")?.addEventListener("input", (e) => {
        s.descricao = e.target.value;
        markDirty();
      });
      $("#qrSectionId")?.addEventListener("change", (e) => {
        s.id = ensureUniqueId(e.target.value, "setor", s);
        selectedSection = s.id;
        markDirty();
        render();
      });
      $("#qrSectionOrder")?.addEventListener("change", (e) => {
        s.ordem = Math.max(1, num(e.target.value) || 1);
        markDirty();
        render();
      });
      $("#qrSectionActive")?.addEventListener("change", (e) => {
        s.ativo = e.target.checked;
        markDirty();
      });
    }
    $("#qrImportFile")?.addEventListener("change", importFile);
  }
  function reorder(list, index, dir) {
    const target = index + dir;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    list.forEach((x, i) => (x.ordem = i + 1));
    markDirty();
    render();
  }
  function openPicker() {
    pickerItem = selectedItem;
    pickerQuery = "";
    pickerCategory = "";
    let overlay = $("#qrPickerOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "qrPickerOverlay";
      overlay.className = "qr-picker-overlay";
      document.body.appendChild(overlay);
    }
    overlay.classList.add("open");
    renderPicker();
  }
  function filteredPickerProducts() {
    const q = norm(pickerQuery);
    return allProducts().filter(
      (p) =>
        (!pickerCategory || String(p.categoria || "") === pickerCategory) &&
        (!q ||
          norm(
            [
              productName(p),
              p.codigo,
              p.gtin,
              p.ean,
              p.marca,
              p.categoria,
              p.subcategoria,
            ].join(" "),
          ).includes(q)),
    );
  }
  function pickerUsedIds(item) {
    return new Set((item?.produtos || []).map((p) => String(p.id)));
  }
  function updatePickerBulkButton() {
    const found = itemById(pickerItem),
      button = $("[data-qr='pick-all-results']", $("#qrPickerOverlay"));
    if (!found || !button) return;
    const used = pickerUsedIds(found.item),
      available = filteredPickerProducts().filter(
        (p) => !used.has(productId(p)),
      ).length;
    button.disabled = available === 0;
    button.textContent = available
      ? `＋ Adicionar todos os resultados (${available})`
      : "✓ Todos os resultados já foram adicionados";
  }
  function renderPicker({ focusSearch = false } = {}) {
    const overlay = $("#qrPickerOverlay"),
      found = itemById(pickerItem);
    if (!overlay || !found) return;
    const used = pickerUsedIds(found.item),
      categories = [
        ...new Set(
          allProducts()
            .map((p) => String(p.categoria || ""))
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
      matches = filteredPickerProducts(),
      rows = matches.slice(0, 120),
      availableCount = matches.filter((p) => !used.has(productId(p))).length;
    overlay.innerHTML = `<section class="qr-picker"><div class="qr-picker-head"><div><h3>Adicionar produtos a ${esc(found.item.titulo)}</h3><p>Adicione um produto ou todos os resultados atuais da busca.</p></div><button class="btn" data-qr="close-picker">Fechar</button></div><div class="qr-picker-search"><input class="input" id="qrPickerSearch" placeholder="Buscar nome, código, EAN ou marca" value="${esc(pickerQuery)}"><select class="select" id="qrPickerCategory"><option value="">Todas as categorias</option>${categories.map((c) => `<option ${pickerCategory === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><button class="btn green qr-picker-add-all" type="button" data-qr="pick-all-results" ${availableCount ? "" : "disabled"}>${availableCount ? `＋ Adicionar todos os resultados (${availableCount})` : "✓ Todos os resultados já foram adicionados"}</button></div>${matches.length > rows.length ? `<div class="tiny qr-picker-limit-note">Mostrando os primeiros ${rows.length} de ${matches.length} resultados. O botão acima adiciona todos.</div>` : ""}<div class="qr-picker-results">${
      rows
        .map((p) => {
          const id = productId(p),
            disabled = used.has(id);
          return `<button class="qr-product-result" data-qr="pick-product" data-id="${esc(id)}" ${disabled ? "disabled" : ""}><img src="${esc(productImage(p))}" alt=""><span><strong>${esc(productName(p))}</strong><small>${esc(p.marca || "")} · ${productStock(p)} em estoque · ${productPrice(p).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small></span><b>${disabled ? "✓" : "＋"}</b></button>`;
        })
        .join("") || '<div class="qr-empty">Nenhum produto encontrado.</div>'
    }</div></section>`;
    const search = $("#qrPickerSearch");
    search?.addEventListener("input", (e) => {
      pickerQuery = e.target.value;
      clearTimeout(overlay._t);
      overlay._t = setTimeout(() => renderPicker({ focusSearch: true }), 180);
    });
    $("#qrPickerCategory")?.addEventListener("change", (e) => {
      pickerCategory = e.target.value;
      renderPicker();
    });
    if (focusSearch && search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }
  function addProduct(id, button) {
    const found = itemById(pickerItem),
      p = allProducts().find((x) => productId(x) === String(id));
    if (!found || !p) return;
    const used = pickerUsedIds(found.item);
    if (used.has(productId(p))) return;
    found.item.produtos.push(snapshotProduct(p));
    if (!found.item.produtoPadraoId) found.item.produtoPadraoId = productId(p);
    if (button) {
      button.disabled = true;
      const marker = button.querySelector("b");
      if (marker) marker.textContent = "✓";
    }
    markDirty();
    updatePickerBulkButton();
    render();
  }
  function addAllPickerProducts() {
    const found = itemById(pickerItem);
    if (!found) return;
    const used = pickerUsedIds(found.item),
      additions = filteredPickerProducts().filter(
        (p) => !used.has(productId(p)),
      );
    if (!additions.length) return;
    additions.forEach((p) => found.item.produtos.push(snapshotProduct(p)));
    if (!found.item.produtoPadraoId)
      found.item.produtoPadraoId = productId(additions[0]);
    const addedIds = new Set(additions.map(productId));
    $$("[data-qr='pick-product']", $("#qrPickerOverlay")).forEach((button) => {
      if (!addedIds.has(String(button.dataset.id))) return;
      button.disabled = true;
      const marker = button.querySelector("b");
      if (marker) marker.textContent = "✓";
    });
    markDirty();
    updatePickerBulkButton();
    render();
    toast(
      `${additions.length} produto(s) adicionados sem alterar a posição da busca.`,
    );
  }
  async function saveFirebase() {
    config.version = VERSION;
    config.updatedAt = new Date().toISOString();
    const r = await fetch(`${firebaseBase()}/${FIREBASE_NODE}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!r.ok) throw new Error(`Firebase ${r.status}`);
    dirty = false;
    render();
    toast("Teste da Compra Rápida salvo no Firebase isolado.");
  }
  function githubSettings() {
    return {
      token: String(state.settings?.githubToken || ""),
      owner: String(state.settings?.githubOwner || "osvaldosereia"),
      repo: String(state.settings?.githubRepo || "SUCEDOAN12"),
      branch: String(state.settings?.githubBranch || "main"),
    };
  }
  async function saveGithub() {
    await saveFirebase();
    const g = githubSettings();
    if (!g.token)
      throw new Error(
        "Informe o token do GitHub na aba Integrações para atualizar o JSON do site.",
      );
    const api = `https://api.github.com/repos/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}/contents/${GITHUB_PATH}`;
    let sha = "";
    const get = await fetch(`${api}?ref=${encodeURIComponent(g.branch)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${g.token}`,
      },
    });
    if (get.ok) sha = (await get.json()).sha || "";
    const body = {
      message: "Atualizar Compra Rápida pelo admin",
      content: btoa(
        unescape(encodeURIComponent(JSON.stringify(config, null, 2))),
      ),
      branch: g.branch,
    };
    if (sha) body.sha = sha;
    const put = await fetch(api, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${g.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!put.ok)
      throw new Error(
        `GitHub ${put.status}: ${(await put.text()).slice(0, 200)}`,
      );
    toast("Teste salvo no Firebase e no GitHub sem alterar a versão oficial.");
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: "application/json",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "compra-rapida.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      config = cleanConfig(JSON.parse(await file.text()));
      selectedSection = config.secoes[0]?.id || "";
      selectedItem = config.secoes[0]?.itens?.[0]?.id || "";
      markDirty();
      render();
      toast("JSON importado. Revise e salve.");
    } catch (err) {
      toast(`JSON inválido: ${err.message}`, "err");
    } finally {
      e.target.value = "";
    }
  }
  function install() {
    const tabs = $$("nav.tabs");
    tabs.forEach((nav) => {
      if (nav.querySelector('[data-tab="compra-rapida"]')) return;
      const btn = document.createElement("button");
      btn.className = "tab";
      btn.type = "button";
      btn.dataset.tab = "compra-rapida";
      btn.textContent = "Compra Rápida";
      const ref = nav.querySelector('[data-tab="cestas"]');
      ref ? nav.insertBefore(btn, ref) : nav.appendChild(btn);
    });
    let panel = $("#tab-compra-rapida");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "tab-compra-rapida";
      panel.className = "panel hidden";
      $("main.app")?.appendChild(panel);
    }
    document.addEventListener("click", handleClick, true);
    loadConfig().catch((e) => {
      panel.innerHTML = `<div class="notice red">Não foi possível carregar a Compra Rápida: ${esc(e.message)}</div>`;
      toast(e.message, "err");
    });
  }
  async function handleClick(e) {
    const b = e.target.closest("[data-qr]");
    if (!b) return;
    const a = b.dataset.qr;
    try {
      if (a === "select-section") {
        selectedSection = b.dataset.id;
        selectedItem = "";
        render();
      } else if (a === "select-item") {
        selectedSection = b.dataset.section;
        selectedItem = b.dataset.id;
        render();
      } else if (a === "add-section") {
        const s = {
          id: ensureUniqueId("novo-setor", "setor"),
          titulo: "Novo setor",
          descricao: "",
          ordem: config.secoes.length + 1,
          ativo: true,
          itens: [],
        };
        config.secoes.push(s);
        selectedSection = s.id;
        selectedItem = "";
        markDirty();
        render();
      } else if (a === "add-item") {
        const s = sectionById(b.dataset.id);
        if (!s) return;
        const i = {
          id: ensureUniqueId("novo-item", "item"),
          titulo: "Novo item",
          descricao: "",
          ordem: s.itens.length + 1,
          ativo: true,
          essencial: false,
          produtoPadraoId: "",
          produtos: [],
        };
        s.itens.push(i);
        selectedSection = s.id;
        selectedItem = i.id;
        markDirty();
        render();
      } else if (a === "move-section")
        reorder(
          config.secoes,
          config.secoes.findIndex((s) => s.id === b.dataset.id),
          Number(b.dataset.dir),
        );
      else if (a === "move-item") {
        const s = sectionById(b.dataset.section);
        reorder(
          s.itens,
          s.itens.findIndex((i) => i.id === b.dataset.id),
          Number(b.dataset.dir),
        );
      } else if (a === "delete-section") {
        if (confirm("Excluir este setor e todos os itens?")) {
          config.secoes = config.secoes.filter((s) => s.id !== selectedSection);
          selectedSection = config.secoes[0]?.id || "";
          selectedItem = "";
          markDirty();
          render();
        }
      } else if (a === "delete-item") {
        const f = itemById(selectedItem);
        if (f && confirm("Excluir este item?")) {
          f.section.itens = f.section.itens.filter(
            (i) => i.id !== selectedItem,
          );
          selectedItem = "";
          markDirty();
          render();
        }
      } else if (a === "open-picker") openPicker();
      else if (a === "close-picker")
        $("#qrPickerOverlay")?.classList.remove("open");
      else if (a === "pick-product") addProduct(b.dataset.id, b);
      else if (a === "pick-all-results") addAllPickerProducts();
      else if (a === "remove-product") {
        const f = itemById(selectedItem),
          idx = Number(b.dataset.index);
        if (f) {
          const removed = f.item.produtos.splice(idx, 1)[0];
          if (String(f.item.produtoPadraoId) === String(removed?.id))
            f.item.produtoPadraoId = f.item.produtos[0]?.id || "";
          markDirty();
          render();
        }
      } else if (a === "default-product") {
        const f = itemById(selectedItem),
          p = f?.item.produtos[Number(b.dataset.index)];
        if (p) {
          f.item.produtoPadraoId = String(p.id);
          markDirty();
          render();
        }
      } else if (a === "move-product") {
        const f = itemById(selectedItem);
        if (f)
          reorder(
            f.item.produtos,
            Number(b.dataset.index),
            Number(b.dataset.dir),
          );
      } else if (a === "reload") {
        if (!dirty || confirm("Descartar alterações não salvas?"))
          await loadConfig();
      } else if (a === "save-firebase") await saveFirebase();
      else if (a === "save-github") await saveGithub();
      else if (a === "export") exportJson();
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), "err");
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
