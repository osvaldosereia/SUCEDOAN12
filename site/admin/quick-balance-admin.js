(() => {
  "use strict";
  const config = window.DONA_SITE_CONFIG || {};
  const supabase = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.publishableKey || "";
  const $ = (id) => document.getElementById(id);
  const view = document.querySelector('[data-panel="quick-balance"]');
  if (!view) return;

  const scanForm = $("quick-balance-scan");
  const scanInput = $("quick-balance-ean");
  const productCard = $("quick-balance-product");
  const searchButton = $("quick-balance-search");
  const saveButton = $("quick-balance-save");
  const nextButton = $("quick-balance-next");
  const quantityDialog = $("quick-balance-keypad");
  const quantityDisplay = $("quick-balance-keypad-value");
  const quantityDisplayCard = $("quick-balance-count-open");
  const validityInput = $("quick-balance-validity");
  const gondolaSelect = $("quick-balance-gondola");
  const saveStatus = $("quick-balance-save-status");

  let currentProduct = null;
  let currentEan = "";
  let quantityValue = "";
  let keypadDraft = "";
  let scanTimer = 0;
  let scanBurstStartedAt = 0;
  let scanBurstLastAt = 0;
  let scanBurstLastLength = 0;
  let scanBurstDigitCount = 0;
  let lookupSequence = 0;
  let lookupBusy = false;
  let savedCurrent = false;
  let saving = false;

  function digits(value) { return String(value || "").replace(/\D/g, ""); }
  function resetScanBurst() {
    scanBurstStartedAt = 0;
    scanBurstLastAt = 0;
    scanBurstLastLength = 0;
    scanBurstDigitCount = 0;
  }
  function completeScan() {
    if (lookupBusy) return;
    window.clearTimeout(scanTimer);
    scanTimer = 0;
    resetScanBurst();
    lookup(scanInput.value);
  }
  function quantityNumber(value) {
    const text = String(value || "").trim().replace(",", ".");
    if (!text || text === ".") return null;
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 && number <= 999999.999 ? number : null;
  }
  function formatQuantity(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(number) : "—";
  }
  function setStatus(id, message, tone) {
    const node = $(id);
    node.textContent = message || "";
    node.dataset.tone = tone || "neutral";
  }
  function updateSaveButton() {
    saveButton.disabled = saving || savedCurrent || !currentProduct || quantityNumber(quantityValue) === null;
  }
  function setBusyFields(busy) {
    view.querySelectorAll("[data-count-step]").forEach((button) => { button.disabled = busy; });
    quantityDisplayCard.disabled = busy;
    validityInput.disabled = busy;
    gondolaSelect.disabled = busy;
    nextButton.disabled = busy;
  }
  function markDirty() {
    if (saving) return;
    savedCurrent = false;
    nextButton.hidden = true;
    if (saveStatus.dataset.tone === "success") setStatus("quick-balance-save-status", "Alterações ainda não salvas.", "neutral");
    updateSaveButton();
  }
  async function request(action, params) {
    const response = await fetch(supabase + "/functions/v1/site-admin-v1", {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "x-admin-code": window.DonaAdminAuth?.getCode?.() || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.assign({ action }, params || {})),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Não foi possível consultar.");
    return data;
  }
  function updateQuantityDisplay() {
    quantityDisplayCard.textContent = quantityValue === "" ? "Informar" : formatQuantity(quantityValue);
    quantityDisplayCard.setAttribute("aria-label", quantityValue === "" ? "Informar quantidade contada" : "Contagem: " + formatQuantity(quantityValue));
  }
  function setCountValue(value) {
    quantityValue = String(value || "").replace(".", ",");
    updateQuantityDisplay();
    markDirty();
  }
  function renderGondolas(values, selected) {
    const activeList = Array.isArray(values) ? values.map(String) : [];
    const list = activeList.slice();
    const current = selected === null || selected === undefined ? "" : String(selected);
    if (current && !list.includes(current)) list.unshift(current);
    gondolaSelect.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Sem gôndola";
    gondolaSelect.append(blank);
    list.forEach((number) => {
      const option = document.createElement("option");
      option.value = number;
      option.textContent = current === number && !activeList.includes(number) ? number + " · cadastro atual" : number;
      gondolaSelect.append(option);
    });
    gondolaSelect.value = current;
  }
  function renderProduct(data) {
    const product = data.product || {};
    const currentStock = product.current_stock === null || product.current_stock === undefined ? null : Number(product.current_stock);
    currentProduct = {
      id: product.id,
      name: product.name || "",
      brand: product.brand || "",
      sku: product.sku || "",
      gtin: product.gtin || "",
      image_url: product.image_url || "",
      validity_date: product.validity_date || null,
      gondola: product.gondola === undefined ? null : product.gondola,
      current_stock: Number.isFinite(currentStock) ? currentStock : null,
      stock_ready: Number.isFinite(currentStock),
      is_active: product.is_active === true,
    };
    quantityValue = currentProduct.stock_ready ? String(currentProduct.current_stock).replace(".", ",") : "";
    savedCurrent = false;
    saving = false;
    updateQuantityDisplay();

    $("quick-balance-name").textContent = currentProduct.name;
    const identifiers = [
      currentProduct.brand,
      currentProduct.sku ? "SKU " + currentProduct.sku : "",
      currentProduct.gtin ? "EAN " + currentProduct.gtin : "",
    ].filter(Boolean);
    $("quick-balance-identifiers").textContent = identifiers.join(" · ");
    const image = $("quick-balance-image");
    if (currentProduct.image_url) {
      image.src = currentProduct.image_url;
      image.alt = currentProduct.name;
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.alt = "";
      image.hidden = true;
    }
    const active = $("quick-balance-active");
    active.textContent = currentProduct.is_active ? "Ativo" : "Inativo";
    active.dataset.active = String(currentProduct.is_active);
    $("quick-balance-current-stock").textContent = currentProduct.stock_ready ? formatQuantity(currentProduct.current_stock) : "Não cadastrado";
    $("quick-balance-stock-source").textContent = "Estoque físico no Supabase";
    validityInput.value = currentProduct.validity_date || "";
    renderGondolas(data.gondolas, currentProduct.gondola);
    setStatus("quick-balance-save-status", "", "neutral");
    nextButton.hidden = true;
    productCard.hidden = false;
    updateSaveButton();
  }
  async function lookup(value) {
    if (lookupBusy) return;
    if (currentProduct && !savedCurrent) {
      scanInput.value = "";
      scanInput.disabled = false;
      searchButton.disabled = false;
      setStatus("quick-balance-scan-status", "Salve este balanço antes de ler outro produto.", "error");
      scanInput.focus({ preventScroll: true });
      return;
    }
    window.clearTimeout(scanTimer);
    scanTimer = 0;
    resetScanBurst();
    const ean = digits(value);
    if (ean.length < 8 || ean.length > 14) {
      scanInput.value = "";
      scanInput.disabled = false;
      searchButton.disabled = false;
      setStatus("quick-balance-scan-status", "Leia um código EAN válido.", "error");
      scanInput.focus({ preventScroll: true });
      return;
    }
    const requestId = ++lookupSequence;
    lookupBusy = true;
    currentProduct = null;
    currentEan = ean;
    productCard.hidden = true;
    saveButton.disabled = true;
    nextButton.hidden = true;
    scanInput.value = "";
    scanInput.disabled = false;
    setStatus("quick-balance-scan-status", "Buscando produto…", "neutral");
    searchButton.disabled = true;
    try {
      const data = await request("quick_balance_lookup", { ean });
      if (requestId !== lookupSequence) return;
      if (!data.found || !data.product) {
        setStatus("quick-balance-scan-status", data.message || "Produto não encontrado para este EAN.", "error");
        scanInput.focus({ preventScroll: true });
        return;
      }
      renderProduct(data);
      setStatus("quick-balance-scan-status", "Produto localizado. Confira e salve a contagem.", "success");
      scanInput.focus({ preventScroll: true });
    } catch (error) {
      if (requestId === lookupSequence) {
        setStatus("quick-balance-scan-status", error.message || "Não foi possível buscar o produto.", "error");
        scanInput.focus({ preventScroll: true });
      }
    } finally {
      if (requestId === lookupSequence) {
        lookupBusy = false;
        scanInput.disabled = false;
        searchButton.disabled = false;
      }
    }
  }
  function adjustQuantity(step) {
    let current = quantityNumber(quantityValue);
    if (current === null) current = 0;
    setCountValue(String(Math.max(0, Math.min(999999.999, Math.round((current + step) * 1000) / 1000))));
  }
  function openKeypad() {
    if (!currentProduct || quantityDialog.open) return;
    keypadDraft = quantityValue;
    quantityDisplay.textContent = keypadDraft || "0";
    quantityDialog.showModal();
  }
  function updateKeypad() { quantityDisplay.textContent = keypadDraft || "0"; }
  function appendKey(key) {
    if (key === "," || key === ".") {
      if (keypadDraft.includes(",") || keypadDraft.includes(".")) return;
      keypadDraft = keypadDraft ? keypadDraft + "," : "0,";
    } else if (/^\d$/.test(key)) {
      const parts = keypadDraft.split(/[,.]/);
      const whole = parts[0] || "";
      const fraction = parts[1] || "";
      if (whole.replace(/\D/g, "").length >= 6 && !/[,.]/.test(keypadDraft)) return;
      if (fraction.length >= 3) return;
      keypadDraft = keypadDraft === "0" ? key : keypadDraft + key;
    }
    updateKeypad();
  }
  async function saveCurrentCount() {
    if (!currentProduct || saving || savedCurrent) return;
    const quantity = quantityNumber(quantityValue);
    if (quantity === null) {
      setStatus("quick-balance-save-status", "Informe a quantidade contada.", "error");
      return;
    }
    saving = true;
    setBusyFields(true);
    saveButton.textContent = "Salvando…";
    updateSaveButton();
    setStatus("quick-balance-save-status", "Salvando estoque, validade e gôndola…", "neutral");
    try {
      const data = await request("quick_balance_save", {
        product_id: currentProduct.id,
        ean: currentEan,
        counted_quantity: quantity,
        expected_stock: currentProduct.current_stock,
        validity_date: validityInput.value || null,
        gondola: gondolaSelect.value || null,
        expected_validity_date: currentProduct.validity_date,
        expected_gondola: currentProduct.gondola,
      });
      const count = data.count || {};
      currentProduct.current_stock = Number(count.counted_stock ?? quantity);
      currentProduct.stock_ready = Number.isFinite(currentProduct.current_stock);
      currentProduct.validity_date = validityInput.value || null;
      currentProduct.gondola = gondolaSelect.value || null;
      $("quick-balance-current-stock").textContent = formatQuantity(currentProduct.current_stock);
      savedCurrent = true;
      setStatus("quick-balance-save-status", "Balanço salvo no Supabase: estoque, validade e gôndola atualizados.", "success");
      nextButton.hidden = false;
      scanInput.disabled = false;
      searchButton.disabled = false;
      scanInput.value = "";
      window.setTimeout(() => scanInput.focus({ preventScroll: true }), 120);
    } catch (error) {
      setStatus("quick-balance-save-status", error.message || "Não foi possível salvar. Tente novamente.", "error");
    } finally {
      saving = false;
      setBusyFields(false);
      saveButton.textContent = "Salvar balanço";
      updateSaveButton();
    }
  }

  scanForm.addEventListener("submit", (event) => {
    event.preventDefault();
    completeScan();
  });
  scanInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && !(event.key === "Tab" && digits(scanInput.value).length >= 8)) return;
    event.preventDefault();
    completeScan();
  });
  scanInput.addEventListener("input", (event) => {
    if (lookupBusy) return;
    const now = Date.now();
    const length = digits(scanInput.value).length;
    const inputType = String(event.inputType || "");
    const addedDigits = Math.max(0, length - scanBurstLastLength);
    const pastedValue = inputType.startsWith("insertFromPaste") || inputType.startsWith("insertFromDrop") || addedDigits >= 8;

    if (now - scanBurstLastAt > 750) {
      scanBurstStartedAt = now;
      scanBurstDigitCount = 0;
    }
    scanBurstDigitCount += addedDigits;
    scanBurstLastAt = now;
    scanBurstLastLength = length;

    const rapidReaderInput = scanBurstDigitCount >= 8 && now - scanBurstStartedAt <= 2500;
    if (length < 8 || length > 14 || (!pastedValue && !rapidReaderInput)) return;

    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      const ean = digits(scanInput.value);
      scanTimer = 0;
      resetScanBurst();
      if (ean.length >= 8 && ean.length <= 14) lookup(ean);
    }, pastedValue ? 160 : 450);
  });
  view.querySelectorAll("[data-count-step]").forEach((button) => {
    button.addEventListener("click", () => adjustQuantity(Number(button.dataset.countStep) || 0));
  });
  quantityDisplayCard.addEventListener("click", openKeypad);
  validityInput.addEventListener("change", markDirty);
  gondolaSelect.addEventListener("change", markDirty);
  saveButton.addEventListener("click", saveCurrentCount);
  nextButton.addEventListener("click", () => {
    lookupSequence++;
    currentProduct = null;
    currentEan = "";
    quantityValue = "";
    keypadDraft = "";
    savedCurrent = false;
    productCard.hidden = true;
    scanInput.value = "";
    scanInput.disabled = false;
    searchButton.disabled = false;
    saveButton.disabled = true;
    nextButton.hidden = true;
    setStatus("quick-balance-save-status", "", "neutral");
    setStatus("quick-balance-scan-status", "Pronto para o próximo EAN.", "neutral");
    scanInput.focus({ preventScroll: true });
  });
  quantityDialog.addEventListener("click", (event) => {
    if (event.target === quantityDialog) {
      quantityDialog.close();
      return;
    }
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-key],[data-keypad-action]");
    if (!button) return;
    const action = button.dataset.keypadAction;
    if (button.dataset.key !== undefined) appendKey(button.dataset.key);
    else if (action === "clear") keypadDraft = "";
    else if (action === "backspace") keypadDraft = keypadDraft.slice(0, -1);
    else if (action === "cancel") {
      quantityDialog.close();
      return;
    } else if (action === "confirm") {
      if (keypadDraft !== "" && quantityNumber(keypadDraft) === null) return;
      setCountValue(keypadDraft);
      quantityDialog.close();
      return;
    }
    updateKeypad();
  });

  window.DonaQuickBalanceAdmin = {
    open() { window.setTimeout(() => scanInput.focus({ preventScroll: true }), 100); },
  };
})();