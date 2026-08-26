(() => {
  'use strict';

  const BUILD = '20260826-ceneca10-mobile-v1';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PRODUCTS_NODE = 'produtos';
  const COMMANDS_NODE = 'canecas/comandos_criacao';
  const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
  const ADMIN_CONFIG_KEY = 'da_admin_v2_config';
  const SELECTED_COMMANDS_KEY = 'da_admin_v2_mug_saved_commands_selected';
  const QUALITY_KEY = 'da_ceneca10_quality';
  const MASTER_WIDTH = 2400;
  const MASTER_HEIGHT = 960;
  const SIDE_WIDTH = 1344;
  const PRINT_LABEL = '24 × 9,5 cm';
  const CATEGORY = 'Caneca de Porcelana';
  const CAPACITY = '350ml';
  const NCM = '69111090';
  const PRICE = 24.90;
  const PLACEHOLDER_ART = '__MUG_ART__';
  const PLACEHOLDER_MOCKUP_1 = '__MUG_MOCKUP_1__';
  const PLACEHOLDER_MOCKUP_2 = '__MUG_MOCKUP_2__';
  const PLACEHOLDER_MOCKUP_3 = '__MUG_MOCKUP_3__';

  const state = {
    commands: [],
    selected: loadSelectedCommands(),
    busy: false,
    lastProductKey: '',
  };

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function loadSelectedCommands() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SELECTED_COMMANDS_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function persistSelectedCommands() {
    localStorage.setItem(SELECTED_COMMANDS_KEY, JSON.stringify([...state.selected]));
  }

  function requestId() {
    return `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getWebhook() {
    const direct = text(localStorage.getItem(WEBHOOK_KEY));
    if (direct) return direct;
    try {
      const config = JSON.parse(localStorage.getItem(ADMIN_CONFIG_KEY) || '{}');
      return text(config.mugMakeWebhookUrl || config.makeAiWebhookUrl || '');
    } catch {
      return '';
    }
  }

  function setWebhook(value) {
    const clean = text(value);
    if (clean) localStorage.setItem(WEBHOOK_KEY, clean);
    else localStorage.removeItem(WEBHOOK_KEY);
  }

  function showToast(message, duration = 3200) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, duration);
  }

  function setProgress(step, title, detail = '') {
    const percent = Math.round((step / 6) * 100);
    $('#progressCard').hidden = false;
    $('#progressTitle').textContent = title;
    $('#progressDetail').textContent = detail || 'Não feche esta tela durante a criação.';
    $('#progressPercent').textContent = `${percent}%`;
    $('#progressBar').style.width = `${percent}%`;
  }

  function setBusy(busy) {
    state.busy = busy;
    $('#generateButton').disabled = busy;
    $('#generateButtonText').textContent = busy ? 'Gerando…' : 'Gerar caneca';
    $('#imageInput').disabled = busy;
    $('#instructionInput').disabled = busy;
    document.querySelectorAll('.command-chip').forEach(button => { button.disabled = busy; });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
      image.src = source;
    });
  }

  async function normalizeReference(file) {
    const image = await loadImage(await fileToDataUrl(file));
    const maxW = 1800;
    const maxH = 1400;
    const scale = Math.min(1, maxW / image.naturalWidth, maxH / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/webp', 0.92);
  }

  async function cropMaster(source) {
    const image = await loadImage(source);
    const targetRatio = MASTER_WIDTH / MASTER_HEIGHT;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;

    if (sourceRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / targetRatio;
      sy = (image.naturalHeight - sh) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = MASTER_WIDTH;
    canvas.height = MASTER_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, MASTER_WIDTH, MASTER_HEIGHT);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, MASTER_WIDTH, MASTER_HEIGHT);
    return canvas.toDataURL('image/webp', 0.95);
  }

  async function buildSideReference(masterDataUrl, side) {
    const image = await loadImage(masterDataUrl);
    const sx = side === 1 ? 0 : MASTER_WIDTH - SIDE_WIDTH;
    const canvas = document.createElement('canvas');
    canvas.width = SIDE_WIDTH;
    canvas.height = MASTER_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    ctx.drawImage(image, sx, 0, SIDE_WIDTH, MASTER_HEIGHT, 0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    return canvas.toDataURL('image/webp', 0.95);
  }

  async function buildCenterReference(masterDataUrl) {
    const image = await loadImage(masterDataUrl);
    const sx = Math.max(0, Math.round((MASTER_WIDTH - SIDE_WIDTH) / 2));
    const canvas = document.createElement('canvas');
    canvas.width = SIDE_WIDTH;
    canvas.height = MASTER_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    ctx.drawImage(image, sx, 0, SIDE_WIDTH, MASTER_HEIGHT, 0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    return canvas.toDataURL('image/webp', 0.95);
  }

  async function callMake(hook, payload) {
    const response = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
    });
    const raw = await response.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      const hint = raw && raw.length < 180 ? ` · ${raw.replace(/\s+/g, ' ').slice(0, 160)}` : '';
      throw new Error(`Make respondeu algo que não é JSON (${response.status})${hint}`);
    }
    if (!response.ok || result.ok === false) {
      throw new Error(text(result.error || result.message) || `Make respondeu HTTP ${response.status}.`);
    }
    return result;
  }

  function effectiveInstruction() {
    const selected = state.commands.filter(item => state.selected.has(item.id));
    const blocks = selected.map((item, index) => `COMANDO SALVO ${index + 1} — ${item.nome}:\n${item.texto}`);
    const manual = text($('#instructionInput').value);
    if (manual) blocks.push(`INSTRUÇÃO COMPLEMENTAR DIGITADA:\n${manual}`);
    return blocks.join('\n\n');
  }

  function buildArtPrompt(instruction = '') {
    const extra = text(instruction);
    return `Analise cuidadosamente a imagem enviada como REFERÊNCIA E INSPIRAÇÃO e crie uma NOVA ARTE COMERCIAL PARA CANECA.

${extra ? `INSTRUÇÕES OBRIGATÓRIAS DO OPERADOR:\n${extra}` : 'Não há instrução adicional do operador.'}

OBJETIVO:
- produza somente a arte plana, nunca mockup;
- composição final horizontal ${MASTER_WIDTH}×${MASTER_HEIGHT}px (${PRINT_LABEL});
- elementos principais ocupando praticamente toda a altura útil;
- composição equilibrada entre esquerda, centro e direita;
- preserve proporções e não achate personagens ou objetos;
- crie uma solução nova e comercial inspirada na referência.

TEXTO:
- se o operador pediu texto, inclua-o literalmente;
- se não pediu, não invente palavras.

RESTRIÇÕES:
- não mostrar caneca, mãos, mesa, embalagem, marca-d'água ou interface;
- não cortar elementos centrais importantes.

ENTREGA: uma arte horizontal única, harmoniosa e pronta para sublimação.`;
  }

  function buildCatalogPrompt() {
    return `Analise SOMENTE a imagem final desta arte de caneca e crie os dados comerciais do produto.

Responda preferencialmente em JSON com as chaves nome, tema, subcategoria, descricao, tags, seo_title e seo_description.

Você tem liberdade para escolher um nome comercial natural e atraente de acordo com o que realmente vê na arte. Não precisa seguir um formato rígido. A categoria técnica será Caneca de Porcelana e a capacidade 350ml.

Não use informações de automação, nomes de módulos ou comandos internos; olhe apenas a arte fornecida.`;
  }

  function buildMockupPrompt(side) {
    const orientation = side === 1
      ? 'Mostre a PRIMEIRA METADE / LADO ESQUERDO da arte na face visível; alça preferencialmente à direita.'
      : side === 2
        ? 'Mostre a SEGUNDA METADE / LADO DIREITO da arte na face visível; alça preferencialmente à esquerda.'
        : 'Mostre o CENTRO DA ARTE na face frontal, sem deslocar a composição.';

    return `Use a arte fornecida como ARTE-MESTRE IMUTÁVEL. ${orientation}
Crie uma fotografia quadrada 1:1 ultra realista de uma caneca branca de porcelana 350ml sublimada com essa arte.
A impressão deve ocupar praticamente toda a altura útil da caneca.
Não redesenhe, não reescreva, não altere cores e não invente elementos.
Preserve a proporção e aplique apenas a curvatura cilíndrica natural.
Fundo claro e simples. Caneca inteira visível. Sem objetos extras. Resultado comercial 1024×1024.`;
  }

  function fallbackCatalog() {
    return {
      nome: 'Caneca de Porcelana Arte Criativa - 350ml',
      tema: 'Arte Criativa',
      subcategoria: 'Arte Criativa',
      descricao: 'Caneca de porcelana branca 350ml com arte exclusiva, ideal para uso pessoal ou presente.',
      tags: ['caneca de porcelana', 'caneca 350ml', 'arte criativa', 'presente'],
      seo_title: 'Caneca de Porcelana Arte Criativa - 350ml',
      seo_description: 'Caneca de porcelana branca 350ml com arte exclusiva, ideal para presente e uso pessoal.',
      texto_identificado: '',
      confianca_tema: 0,
      source: 'fallback_mobile',
    };
  }

  function deriveThemeFromName(name) {
    const clean = text(name)
      .replace(/^caneca\s+de\s+porcelana\s*/i, '')
      .replace(/\s*[-–—]?\s*350\s*ml\s*$/i, '')
      .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
      .trim();
    return clean || 'Arte Criativa';
  }

  function normalizeCatalogLoose(input) {
    const base = fallbackCatalog();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

    const name = text(input.nome || input.product_name || input.name || base.nome).replace(/[\r\n]+/g, ' ').slice(0, 160).trim() || base.nome;
    const theme = text(input.tema || deriveThemeFromName(name)).replace(/[\r\n]+/g, ' ').slice(0, 90).trim() || 'Arte Criativa';
    const subcategory = text(input.subcategoria || theme).replace(/[\r\n]+/g, ' ').slice(0, 90).trim() || theme;
    const description = text(input.descricao || input.description || `${name}. Caneca de porcelana branca 350ml com arte temática de ${theme}, ideal para uso pessoal ou presente.`).slice(0, 800);
    const tags = (Array.isArray(input.tags) ? input.tags : base.tags).map(item => text(item).slice(0, 60)).filter(Boolean).slice(0, 10);
    const confidence = Number(input.confianca_tema);

    return {
      nome: name,
      tema: theme,
      subcategoria: subcategory,
      descricao: description,
      tags: tags.length ? tags : base.tags,
      seo_title: text(input.seo_title || name).slice(0, 120),
      seo_description: text(input.seo_description || description).slice(0, 155),
      texto_identificado: text(input.texto_identificado || '').slice(0, 280),
      confianca_tema: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      source: 'ia_visual',
    };
  }

  function parseCatalogLoose(result) {
    let raw = result?.catalog ?? result?.catalog_json ?? result?.metadata ?? result?.metadata_json ?? result?.result ?? result?.product_name ?? result?.name;
    if (raw && typeof raw === 'object') return normalizeCatalogLoose(raw);
    raw = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!raw) return fallbackCatalog();
    try {
      return normalizeCatalogLoose(JSON.parse(raw));
    } catch {
      if (raw.length <= 160 && !/[<{][!a-z]/i.test(raw)) return normalizeCatalogLoose({ nome: raw });
      return fallbackCatalog();
    }
  }

  async function analyzeCatalogSoft(hook, id, master) {
    try {
      const result = await callMake(hook, {
        action: 'analyze_mug_product',
        request_id: id,
        image_base64: master,
        prompt_catalog: buildCatalogPrompt(),
      });
      return parseCatalogLoose(result);
    } catch (error) {
      console.warn('Catalogador opcional falhou; geração continuará.', error);
      return fallbackCatalog();
    }
  }

  function firebaseTemplate(id, instruction, catalog) {
    const now = new Date().toISOString();
    const suffix = id.slice(-6).toUpperCase();
    return JSON.stringify({
      id,
      firebaseKey: id,
      codigo: `CANP-${suffix}`,
      gtin: '',
      ean: '',
      codigo_barras: '',
      nome: catalog.nome,
      categoria: CATEGORY,
      subcategoria: catalog.subcategoria,
      tema: catalog.tema,
      subsubcategoria: '',
      ncm: NCM,
      preco_custo: 10,
      preco: PRICE,
      estoque: 0,
      situacao: 'I',
      ativo: false,
      material: 'Porcelana',
      capacidade: CAPACITY,
      embalagem: `Caneca de porcelana ${CAPACITY}`,
      unidade: 'UN',
      dimensao_impressao: PRINT_LABEL,
      descricao: catalog.descricao,
      tags: catalog.tags,
      seo_title: catalog.seo_title,
      seo_description: catalog.seo_description,
      texto_identificado_arte: catalog.texto_identificado,
      confianca_tema: catalog.confianca_tema,
      url_imagem: PLACEHOLDER_MOCKUP_1,
      imagem: PLACEHOLDER_MOCKUP_1,
      imagem_url: PLACEHOLDER_MOCKUP_1,
      imagens: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_MOCKUP_3],
      imagens_site: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_MOCKUP_3],
      mockup_1: PLACEHOLDER_MOCKUP_1,
      mockup_2: PLACEHOLDER_MOCKUP_2,
      mockup_3: PLACEHOLDER_MOCKUP_3,
      arte_personalizacao: PLACEHOLDER_ART,
      arte_horizontal: PLACEHOLDER_ART,
      arte_impressao: {
        url: PLACEHOLDER_ART,
        ratio: `${MASTER_WIDTH}:${MASTER_HEIGHT}`,
        width: MASTER_WIDTH,
        height: MASTER_HEIGHT,
        dimensao_real: PRINT_LABEL,
        formato: 'webp',
      },
      midias_admin: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_MOCKUP_3, PLACEHOLDER_ART],
      video_youtube: '',
      origem_cadastro: 'ceneca10_mobile',
      tipo_produto: 'caneca_porcelana',
      geracao_status: 'concluido',
      geracao_etapa: 'firebase_salvo',
      geracao_versao: BUILD,
      catalogacao_origem: catalog.source || 'ia_visual',
      catalogacao_validada: catalog.source === 'ia_visual',
      configuracao_arte: {
        modo: 'imagem_inspiracao_mobile',
        instrucao_complementar: text(instruction),
        width: MASTER_WIDTH,
        height: MASTER_HEIGHT,
        dimensao_real: PRINT_LABEL,
        gerador: BUILD,
      },
      criado_em: now,
      updated_at: now,
      last_update: Date.now(),
    });
  }

  function materializeProduct(templateJson, finalResult) {
    const raw = templateJson
      .replaceAll(PLACEHOLDER_ART, text(finalResult.arte_horizontal_url))
      .replaceAll(PLACEHOLDER_MOCKUP_1, text(finalResult.mockup_1_url))
      .replaceAll(PLACEHOLDER_MOCKUP_2, text(finalResult.mockup_2_url))
      .replaceAll(PLACEHOLDER_MOCKUP_3, text(finalResult.mockup_3_url));
    return JSON.parse(raw);
  }

  async function directFirebaseSave(id, templateJson, finalResult) {
    const product = materializeProduct(templateJson, finalResult);
    const response = await fetch(`${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(id)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(product),
    });
    if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao salvar a caneca.`);
    return product;
  }

  async function fetchCommands() {
    const list = $('#commandsList');
    list.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line short"></div>';
    try {
      const response = await fetch(`${FIREBASE_URL}/${COMMANDS_NODE}.json?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Firebase ${response.status}`);
      const data = await response.json();
      state.commands = Object.entries(data || {})
        .filter(([, value]) => value && typeof value === 'object')
        .map(([key, value]) => ({ id: text(value.id || key), nome: text(value.nome), texto: text(value.texto) }))
        .filter(item => item.id && item.nome && item.texto)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

      state.selected = new Set([...state.selected].filter(id => state.commands.some(item => item.id === id)));
      persistSelectedCommands();
      renderCommands();
    } catch (error) {
      console.error('Falha ao carregar comandos:', error);
      state.commands = [];
      renderCommands('Não foi possível carregar os comandos. Você ainda pode gerar usando apenas a imagem e a instrução extra.');
    }
  }

  function renderCommands(message = '') {
    const list = $('#commandsList');
    $('#selectedCommandsCount').textContent = `${state.selected.size} selecionado${state.selected.size === 1 ? '' : 's'}`;
    if (message) {
      list.innerHTML = `<div class="command-empty">${escapeHtml(message)}</div>`;
      return;
    }
    if (!state.commands.length) {
      list.innerHTML = '<div class="command-empty">Nenhum comando salvo.</div>';
      return;
    }
    list.innerHTML = state.commands.map(item => `
      <button type="button" class="command-chip ${state.selected.has(item.id) ? 'selected' : ''}" data-command-id="${escapeHtml(item.id)}" aria-pressed="${state.selected.has(item.id)}">
        <strong>${escapeHtml(item.nome)}</strong>
        <small>${escapeHtml(item.texto)}</small>
      </button>`).join('');
  }

  function showImagePreview(file) {
    const preview = $('#imagePreview');
    const empty = $('#cameraEmpty');
    if (!file) {
      preview.hidden = true;
      preview.removeAttribute('src');
      empty.hidden = false;
      $('#clearImageButton').hidden = true;
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    empty.hidden = true;
    $('#clearImageButton').hidden = false;
  }

  function renderResult(master, finalResult, catalog, key) {
    state.lastProductKey = key;
    $('#artResult').src = master;
    $('#mockup1').src = text(finalResult.mockup_1_url);
    $('#mockup2').src = text(finalResult.mockup_2_url);
    $('#mockup3').src = text(finalResult.mockup_3_url);
    $('#resultName').textContent = catalog.nome;
    $('#resultMeta').textContent = `${catalog.subcategoria || catalog.tema} · R$ ${PRICE.toFixed(2).replace('.', ',')} · cadastro inativo`;
    $('#resultSection').hidden = false;
    $('#resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetGenerator() {
    $('#imageInput').value = '';
    showImagePreview(null);
    $('#instructionInput').value = '';
    $('#progressCard').hidden = true;
    $('#resultSection').hidden = true;
    $('#progressBar').style.width = '0%';
    $('#mockupCarousel').scrollTo({ left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function generate() {
    if (state.busy) return;
    const file = $('#imageInput').files?.[0];
    const hook = getWebhook();
    if (!file) {
      showToast('Escolha uma imagem de inspiração primeiro.');
      $('#uploadCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!hook) {
      showToast('Configure o webhook do Make neste celular.');
      openSettings();
      return;
    }

    const id = requestId();
    const instruction = effectiveInstruction();
    const quality = localStorage.getItem(QUALITY_KEY) || 'high';
    setBusy(true);
    $('#resultSection').hidden = true;

    try {
      setProgress(1, 'Preparando a imagem', 'Otimizando a foto para enviar ao Make.');
      const reference = await normalizeReference(file);
      await sleep(100);

      setProgress(2, 'Criando a arte horizontal', instruction ? 'Aplicando os comandos e a instrução selecionada.' : 'Criando a partir da referência visual.');
      const artResult = await callMake(hook, {
        action: 'generate_mug_art',
        request_id: id,
        image_base64: reference,
        instruction,
        prompt_art: buildArtPrompt(instruction),
        quality,
      });
      const artSource = text(artResult.art_source_url || artResult.result_url);
      if (!artSource) throw new Error('O Make não devolveu a arte gerada.');

      setProgress(3, 'Fechando e analisando a arte', 'A análise do cadastro é opcional e nunca bloqueia a criação.');
      const master = await cropMaster(artSource);
      const catalog = await analyzeCatalogSoft(hook, id, master);

      setProgress(4, 'Preparando as 3 vistas', 'Separando lado esquerdo, lado direito e centro da arte.');
      const [leftReference, rightReference, centerReference] = await Promise.all([
        buildSideReference(master, 1),
        buildSideReference(master, 2),
        buildCenterReference(master),
      ]);

      setProgress(5, 'Gerando os 3 mockups', 'Esta é a etapa mais demorada.');
      const templateJson = firebaseTemplate(id, instruction, catalog);
      const finalResult = await callMake(hook, {
        action: 'finalize_mug_product',
        request_id: id,
        image_base64: master,
        mockup_left_base64: leftReference,
        mockup_right_base64: rightReference,
        mockup_center_base64: centerReference,
        instruction,
        product_name: catalog.nome,
        prompt_mockup_1: buildMockupPrompt(1),
        prompt_mockup_2: buildMockupPrompt(2),
        prompt_mockup_3: buildMockupPrompt(3),
        quality: 'high',
        firebase_url: FIREBASE_URL,
        products_node: PRODUCTS_NODE,
        firebase_template_json: templateJson,
      });

      const hasThreeMockups = Boolean(text(finalResult.mockup_1_url) && text(finalResult.mockup_2_url) && text(finalResult.mockup_3_url));
      if (!hasThreeMockups) throw new Error('O Make não devolveu os três mockups completos.');

      setProgress(6, 'Salvando a caneca', 'Confirmando o cadastro no Firebase.');
      if (finalResult.product_saved !== true) {
        await directFirebaseSave(id, templateJson, finalResult);
      }

      $('#progressTitle').textContent = 'Caneca concluída';
      $('#progressDetail').textContent = 'Arte, três mockups e cadastro finalizados.';
      renderResult(master, finalResult, catalog, text(finalResult.firebase_key || id));
      showToast('Caneca criada e cadastrada com sucesso.');
    } catch (error) {
      console.error('Falha no Caneca 10:', error);
      const message = text(error?.message || error) || 'Erro inesperado.';
      $('#progressCard').hidden = false;
      $('#progressTitle').textContent = 'Não foi possível concluir';
      $('#progressDetail').textContent = message;
      $('#progressPercent').textContent = '!';
      $('#progressBar').style.width = '100%';
      showToast(message, 5200);
    } finally {
      setBusy(false);
    }
  }

  function openSettings() {
    $('#webhookInput').value = getWebhook();
    $('#qualityInput').value = localStorage.getItem(QUALITY_KEY) || 'high';
    const dialog = $('#settingsDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function bindEvents() {
    $('#settingsButton').addEventListener('click', openSettings);
    $('#saveSettingsButton').addEventListener('click', () => {
      setWebhook($('#webhookInput').value);
      localStorage.setItem(QUALITY_KEY, $('#qualityInput').value || 'high');
      $('#settingsDialog').close?.();
      showToast('Configuração salva neste celular.');
    });

    $('#imageInput').addEventListener('change', () => {
      const file = $('#imageInput').files?.[0];
      if (file && !file.type.startsWith('image/')) {
        $('#imageInput').value = '';
        showToast('Escolha um arquivo de imagem.');
        return;
      }
      showImagePreview(file || null);
    });

    $('#clearImageButton').addEventListener('click', () => {
      $('#imageInput').value = '';
      showImagePreview(null);
    });

    $('#commandsList').addEventListener('click', event => {
      const button = event.target.closest('[data-command-id]');
      if (!button || state.busy) return;
      const id = text(button.dataset.commandId);
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      persistSelectedCommands();
      renderCommands();
    });

    $('#clearCommandsButton').addEventListener('click', () => {
      if (state.busy) return;
      state.selected.clear();
      persistSelectedCommands();
      renderCommands();
    });

    $('#refreshCommandsButton').addEventListener('click', () => {
      if (!state.busy) fetchCommands();
    });

    $('#generateButton').addEventListener('click', generate);
    $('#newMugButton').addEventListener('click', resetGenerator);
  }

  async function init() {
    bindEvents();
    $('#webhookInput').value = getWebhook();
    $('#qualityInput').value = localStorage.getItem(QUALITY_KEY) || 'high';
    await fetchCommands();
    if (!getWebhook()) {
      setTimeout(() => showToast('Primeiro acesso neste celular: configure o webhook do Make em ⚙.'), 600);
    }
    console.info(`Caneca 10 carregado · ${BUILD}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
