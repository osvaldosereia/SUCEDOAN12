(() => {
  'use strict';

  const BUILD = '20260826-ceneca10-interno-v2';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PRODUCTS_NODE = 'produtos';
  const COMMANDS_NODE = 'canecas/comandos_criacao';
  const MODELS_NODE = 'canecas/modelos_criacao';
  const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const SELECTED_COMMANDS_KEY = 'da_admin_v2_mug_saved_commands_selected';
  const MASTER_WIDTH = 2400;
  const MASTER_HEIGHT = 960;
  const SIDE_WIDTH = 1344;
  const PRINT_LABEL = '24 × 9,5 cm';
  const CATEGORY = 'Caneca de Porcelana';
  const CAPACITY = '350ml';
  const NCM = '69111090';
  const PRICE = 24.90;
  const QUALITY = 'high';
  const PH = {
    art: '__MUG_ART__',
    m1: '__MUG_MOCKUP_1__',
    m2: '__MUG_MOCKUP_2__',
    m3: '__MUG_MOCKUP_3__',
  };

  const state = {
    commands: [],
    selected: loadSelectedCommands(),
    busy: false,
    lastProductKey: '',
  };

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const isHttpUrl = value => /^https?:\/\//i.test(text(value));

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
    try { localStorage.setItem(SELECTED_COMMANDS_KEY, JSON.stringify([...state.selected])); } catch {}
  }

  function requestId() {
    return `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function showToast(message, duration = 3400) {
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
    $('#refreshCommandsButton').disabled = busy;
    $('#clearCommandsButton').disabled = busy;
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
      if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível abrir uma imagem da geração.'));
      image.src = source;
    });
  }

  async function normalizeReference(file) {
    const image = await loadImage(await fileToDataUrl(file));
    const scale = Math.min(1, 1800 / image.naturalWidth, 1400 / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/webp', 0.94);
  }

  async function cropMaster(source) {
    const image = await loadImage(source);
    const targetRatio = MASTER_WIDTH / MASTER_HEIGHT;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
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
    return canvas.toDataURL('image/webp', 0.96);
  }

  async function cropReference(masterDataUrl, mode) {
    const image = await loadImage(masterDataUrl);
    const sx = mode === 1
      ? 0
      : mode === 2
        ? MASTER_WIDTH - SIDE_WIDTH
        : Math.max(0, Math.round((MASTER_WIDTH - SIDE_WIDTH) / 2));
    const canvas = document.createElement('canvas');
    canvas.width = SIDE_WIDTH;
    canvas.height = MASTER_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    ctx.drawImage(image, sx, 0, SIDE_WIDTH, MASTER_HEIGHT, 0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    return canvas.toDataURL('image/webp', 0.96);
  }

  async function callMake(payload, timeoutMs = 180000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(MAKE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ payload: JSON.stringify(payload) }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let result = {};
      try { result = raw ? JSON.parse(raw) : {}; }
      catch {
        const hint = raw && raw.length < 180 ? ` · ${raw.replace(/\s+/g, ' ').slice(0, 160)}` : '';
        throw new Error(`Make respondeu conteúdo inválido (${response.status})${hint}`);
      }
      if (!response.ok || result.ok === false) {
        throw new Error(text(result.error || result.message) || `Make respondeu HTTP ${response.status}.`);
      }
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A automação demorou mais de 3 minutos. Tente novamente.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function buildOperatorInstructionBlock(instruction = '') {
    const extra = text(instruction);
    if (!extra) return 'INSTRUÇÃO COMPLEMENTAR DO OPERADOR: nenhuma.';
    return `PRIORIDADE MÁXIMA — INSTRUÇÃO COMPLEMENTAR DO OPERADOR:\n${extra}\n\nREGRAS:\n- cumpra todos os detalhes pedidos;\n- texto solicitado deve ser reproduzido exatamente;\n- não resuma, traduza ou parafraseie texto obrigatório;\n- antes de concluir, confira visualmente o cumprimento da instrução.`;
  }

  function effectiveInstruction() {
    const selected = state.commands.filter(item => state.selected.has(item.id));
    const blocks = selected.map((item, index) => `COMANDO SALVO ${index + 1} — ${item.nome}:\n${item.texto}`);
    const manual = text($('#instructionInput').value);
    if (manual) blocks.push(`INSTRUÇÃO COMPLEMENTAR DIGITADA:\n${manual}`);
    return blocks.join('\n\n');
  }

  function buildArtPrompt(instruction = '') {
    return `Analise cuidadosamente a imagem enviada como REFERÊNCIA E INSPIRAÇÃO e crie uma NOVA ARTE COMERCIAL PARA CANECA.\n\n${buildOperatorInstructionBlock(instruction)}\n\nOBJETIVO:\n- produza somente a arte plana, nunca mockup;\n- composição final horizontal ${MASTER_WIDTH}×${MASTER_HEIGHT}px (${PRINT_LABEL});\n- elementos principais ocupando praticamente toda a altura útil;\n- composição equilibrada entre esquerda, centro e direita;\n- preserve proporções; não estique nem achate;\n- crie solução nova e comercial inspirada na referência.\n\nTEXTO:\n- se o operador pediu texto, inclua-o literalmente;\n- se não pediu, não invente palavras.\n\nRESTRIÇÕES:\n- não mostrar caneca, mãos, mesa, embalagem, cenário de produto, marca-d'água ou interface;\n- não cortar elementos centrais importantes.\n\nENTREGA: uma arte horizontal única, harmoniosa e pronta para sublimação.`;
  }

  function buildCatalogPrompt() {
    return `Analise SOMENTE a imagem final desta arte de caneca e crie os dados comerciais do produto.\n\nResponda preferencialmente em JSON com as chaves nome, tema, subcategoria, descricao, tags, seo_title e seo_description.\n\nVocê tem liberdade para escolher um nome comercial natural e atraente de acordo com o que realmente vê na arte. Não precisa seguir um formato rígido. A categoria técnica será Caneca de Porcelana e a capacidade 350ml.\n\nNão use informações de automação, nomes de módulos ou comandos internos; olhe apenas a arte fornecida.`;
  }

  function buildMockupPrompt(mode) {
    const orientation = mode === 1
      ? 'Mostre a PRIMEIRA METADE / LADO ESQUERDO da arte centralizada na face visível; alça preferencialmente à direita.'
      : mode === 2
        ? 'Mostre a SEGUNDA METADE / LADO DIREITO da arte centralizada na face visível; alça preferencialmente à esquerda.'
        : 'Mostre o CENTRO DA ARTE na face frontal, sem deslocar a composição.';
    return `Use a arte fornecida como ARTE-MESTRE IMUTÁVEL. ${orientation}\nCrie fotografia quadrada 1:1 ultra realista de caneca branca de porcelana 350ml sublimada com essa arte.\nA impressão corresponde aproximadamente a ${PRINT_LABEL} e deve ocupar praticamente toda a altura útil da caneca.\nNão redesenhe, não reescreva, não altere cores, não invente símbolos e não substitua elementos.\nPreserve a proporção e aplique apenas a curvatura cilíndrica natural. Fundo claro e simples; caneca inteira visível; sem objetos extras. Resultado comercial 1024×1024.`;
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
    return text(name)
      .replace(/^caneca\s+de\s+porcelana\s*/i, '')
      .replace(/\s*[-–—]?\s*350\s*ml\s*$/i, '')
      .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
      .trim() || 'Arte Criativa';
  }

  function normalizeCatalog(input) {
    const base = fallbackCatalog();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
    const nome = text(input.nome || input.product_name || input.name || base.nome).replace(/[\r\n]+/g, ' ').slice(0, 160) || base.nome;
    const tema = text(input.tema || deriveThemeFromName(nome)).replace(/[\r\n]+/g, ' ').slice(0, 90) || 'Arte Criativa';
    const subcategoria = text(input.subcategoria || tema).replace(/[\r\n]+/g, ' ').slice(0, 90) || tema;
    const descricao = text(input.descricao || input.description || `${nome}. Caneca de porcelana branca 350ml com arte temática de ${tema}, ideal para uso pessoal ou presente.`).slice(0, 800);
    const tags = (Array.isArray(input.tags) ? input.tags : base.tags).map(item => text(item).slice(0, 60)).filter(Boolean).slice(0, 10);
    const confidence = Number(input.confianca_tema);
    return {
      nome,
      tema,
      subcategoria,
      descricao,
      tags: tags.length ? tags : base.tags,
      seo_title: text(input.seo_title || nome).slice(0, 120),
      seo_description: text(input.seo_description || descricao).slice(0, 155),
      texto_identificado: text(input.texto_identificado || '').slice(0, 280),
      confianca_tema: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      source: 'ia_visual',
    };
  }

  function parseCatalog(result) {
    let raw = result?.catalog ?? result?.catalog_json ?? result?.metadata ?? result?.metadata_json ?? result?.result ?? result?.product_name ?? result?.name;
    if (raw && typeof raw === 'object') return normalizeCatalog(raw);
    raw = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!raw) return fallbackCatalog();
    try { return normalizeCatalog(JSON.parse(raw)); }
    catch { return raw.length <= 160 ? normalizeCatalog({ nome: raw }) : fallbackCatalog(); }
  }

  async function analyzeCatalogSoft(id, master) {
    try {
      return parseCatalog(await callMake({
        action: 'analyze_mug_product',
        request_id: id,
        image_base64: master,
        prompt_catalog: buildCatalogPrompt(),
      }, 90000));
    } catch (error) {
      console.warn('Catalogação opcional falhou; a geração continuará.', error);
      return fallbackCatalog();
    }
  }

  function firebaseTemplate(id, instruction, catalog) {
    const now = new Date().toISOString();
    const suffix = id.slice(-6).toUpperCase();
    return {
      id,
      firebaseKey: id,
      codigo: `CANP-${suffix}`,
      gtin: '', ean: '', codigo_barras: '',
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
      status: 'I',
      ativo: false,
      visivel: false,
      modelo_caneca: true,
      modelo_publico: false,
      personalizacao_publica: false,
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
      url_imagem: PH.m1,
      imagem: PH.m1,
      imagem_url: PH.m1,
      imagens: [PH.m1, PH.m2, PH.m3],
      imagens_site: [PH.m1, PH.m2, PH.m3],
      mockup_1: PH.m1,
      mockup_2: PH.m2,
      mockup_3: PH.m3,
      arte_personalizacao: PH.art,
      arte_horizontal: PH.art,
      arte_impressao: { url: PH.art, ratio: `${MASTER_WIDTH}:${MASTER_HEIGHT}`, width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: PRINT_LABEL, formato: 'webp' },
      midias_admin: [PH.m1, PH.m2, PH.m3, PH.art],
      video_youtube: '',
      origem_cadastro: 'ceneca10_mobile_interno',
      tipo_produto: 'caneca_porcelana',
      geracao_status: 'concluido',
      geracao_etapa: 'firebase_salvo',
      geracao_versao: BUILD,
      catalogacao_origem: catalog.source || 'ia_visual',
      catalogacao_validada: catalog.source === 'ia_visual',
      configuracao_arte: {
        modo: 'imagem_inspiracao_mobile_interno',
        instrucao_complementar: text(instruction),
        width: MASTER_WIDTH,
        height: MASTER_HEIGHT,
        dimensao_real: PRINT_LABEL,
        gerador: BUILD,
      },
      criado_em: now,
      updated_at: now,
      last_update: Date.now(),
    };
  }

  function materializeProduct(template, urls) {
    const replace = value => value === PH.art ? urls.art : value === PH.m1 ? urls.m1 : value === PH.m2 ? urls.m2 : value === PH.m3 ? urls.m3 : value;
    const product = JSON.parse(JSON.stringify(template));
    product.url_imagem = replace(product.url_imagem);
    product.imagem = replace(product.imagem);
    product.imagem_url = replace(product.imagem_url);
    product.imagens = product.imagens.map(replace);
    product.imagens_site = product.imagens_site.map(replace);
    product.mockup_1 = urls.m1;
    product.mockup_2 = urls.m2;
    product.mockup_3 = urls.m3;
    product.arte_personalizacao = urls.art;
    product.arte_horizontal = urls.art;
    product.arte_impressao.url = urls.art;
    product.midias_admin = product.midias_admin.map(replace);
    return product;
  }

  async function putJson(path, payload, method = 'PUT') {
    const response = await fetch(`${FIREBASE_URL}/${path}.json`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Firebase respondeu ${response.status}.`);
    return response.json().catch(() => null);
  }

  async function ensureProductSaved(id, product, makeSaved) {
    if (makeSaved) {
      await putJson(`${PRODUCTS_NODE}/${encodeURIComponent(id)}`, {
        situacao: 'I', status: 'I', ativo: false, visivel: false,
        modelo_caneca: true, modelo_publico: false, personalizacao_publica: false,
        origem_cadastro: 'ceneca10_mobile_interno',
        geracao_versao: BUILD,
        updated_at: new Date().toISOString(), last_update: Date.now(),
      }, 'PATCH');
      return;
    }
    await putJson(`${PRODUCTS_NODE}/${encodeURIComponent(id)}`, product);
  }

  async function syncModelRecord(id, product, urls) {
    await putJson(`${MODELS_NODE}/${encodeURIComponent(id)}`, {
      id,
      product_key: id,
      nome: product.nome,
      categoria: product.categoria,
      subcategoria: product.subcategoria,
      tema: product.tema,
      imagem: urls.m1,
      mockup_1: urls.m1,
      mockup_2: urls.m2,
      mockup_3: urls.m3,
      arte_horizontal: urls.art,
      modelo_publico: false,
      personalizacao_publica: false,
      origem: BUILD,
      atualizado_em: new Date().toISOString(),
    });
  }

  async function fetchCommands() {
    const list = $('#commandsList');
    list.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line short"></div>';
    try {
      const response = await fetch(`${FIREBASE_URL}/${COMMANDS_NODE}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
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
      renderCommands('Não foi possível carregar os comandos. Você ainda pode usar imagem + instrução extra.');
    }
  }

  function renderCommands(message = '') {
    const list = $('#commandsList');
    $('#selectedCommandsCount').textContent = `${state.selected.size} selecionado${state.selected.size === 1 ? '' : 's'}`;
    if (message) { list.innerHTML = `<div class="command-empty">${escapeHtml(message)}</div>`; return; }
    if (!state.commands.length) { list.innerHTML = '<div class="command-empty">Nenhum comando salvo.</div>'; return; }
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

  function renderResult(urls, catalog, key) {
    state.lastProductKey = key;
    $('#artResult').src = urls.art;
    $('#mockup1').src = urls.m1;
    $('#mockup2').src = urls.m2;
    $('#mockup3').src = urls.m3;
    $('#resultName').textContent = catalog.nome;
    $('#resultMeta').textContent = `${catalog.subcategoria || catalog.tema} · R$ ${PRICE.toFixed(2).replace('.', ',')} · salvo inativo · modelo interno`;
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
    if (!file) {
      showToast('Escolha uma imagem de inspiração primeiro.');
      $('#uploadCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!file.type.startsWith('image/')) { showToast('Escolha um arquivo de imagem.'); return; }
    if (file.size > 25 * 1024 * 1024) { showToast('A imagem deve ter no máximo 25 MB.'); return; }

    const id = requestId();
    const instruction = effectiveInstruction();
    setBusy(true);
    $('#resultSection').hidden = true;

    try {
      setProgress(1, 'Preparando a imagem', 'Otimizando a referência para o gerador.');
      const reference = await normalizeReference(file);

      setProgress(2, 'Criando a arte horizontal', instruction ? 'Aplicando os comandos selecionados.' : 'Criando a partir da referência visual.');
      const artResult = await callMake({
        action: 'generate_mug_art',
        mode: 'create_model',
        request_id: id,
        image_base64: reference,
        instruction,
        prompt_art: buildArtPrompt(instruction),
        quality: QUALITY,
        origin: 'ceneca10_interno',
      });
      const artSource = text(artResult.art_source_url || artResult.art_url || artResult.result_url);
      if (!isHttpUrl(artSource)) throw new Error('O Make não devolveu a arte gerada.');

      setProgress(3, 'Fechando e catalogando', 'O nome é analisado sem bloquear a criação.');
      const master = await cropMaster(artSource);
      const catalog = await analyzeCatalogSoft(id, master);

      setProgress(4, 'Preparando as 3 vistas', 'Separando lado esquerdo, lado direito e centro.');
      const [left, right, center] = await Promise.all([
        cropReference(master, 1),
        cropReference(master, 2),
        cropReference(master, 3),
      ]);

      setProgress(5, 'Gerando os 3 mockups', 'Aguarde enquanto as três vistas são finalizadas.');
      const template = firebaseTemplate(id, instruction, catalog);
      const finalResult = await callMake({
        action: 'finalize_mug_product',
        request_id: id,
        image_base64: master,
        mockup_left_base64: left,
        mockup_right_base64: right,
        mockup_center_base64: center,
        instruction,
        product_name: catalog.nome,
        prompt_mockup_1: buildMockupPrompt(1),
        prompt_mockup_2: buildMockupPrompt(2),
        prompt_mockup_3: buildMockupPrompt(3),
        quality: QUALITY,
        firebase_url: FIREBASE_URL,
        products_node: PRODUCTS_NODE,
        firebase_template_json: JSON.stringify(template),
        origin: 'ceneca10_interno',
      });

      const urls = {
        art: text(finalResult.arte_horizontal_url || finalResult.art_url || finalResult.arte_url || artSource),
        m1: text(finalResult.mockup_1_url),
        m2: text(finalResult.mockup_2_url),
        m3: text(finalResult.mockup_3_url),
      };
      if (![urls.art, urls.m1, urls.m2, urls.m3].every(isHttpUrl)) {
        throw new Error('O Make não devolveu a arte e os três mockups completos.');
      }

      setProgress(6, 'Salvando a caneca', 'Confirmando produto inativo e modelo interno no Firebase.');
      const product = materializeProduct(template, urls);
      await ensureProductSaved(id, product, finalResult.product_saved === true);
      await syncModelRecord(id, product, urls);

      $('#progressTitle').textContent = 'Caneca concluída';
      $('#progressDetail').textContent = 'Arte, três mockups, produto inativo e modelo interno salvos.';
      renderResult(urls, catalog, text(finalResult.firebase_key || id));
      showToast('Caneca criada e salva com sucesso.');
    } catch (error) {
      console.error('Falha no Caneca 10:', error);
      const message = text(error?.message || error) || 'Erro inesperado.';
      $('#progressCard').hidden = false;
      $('#progressTitle').textContent = 'Não foi possível concluir';
      $('#progressDetail').textContent = message;
      $('#progressPercent').textContent = '!';
      $('#progressBar').style.width = '100%';
      showToast(message, 5600);
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    $('#imageInput').addEventListener('change', () => {
      const file = $('#imageInput').files?.[0];
      if (file && !file.type.startsWith('image/')) {
        $('#imageInput').value = '';
        showImagePreview(null);
        showToast('Escolha um arquivo de imagem.');
        return;
      }
      showImagePreview(file || null);
    });

    $('#clearImageButton').addEventListener('click', () => {
      if (state.busy) return;
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

    $('#refreshCommandsButton').addEventListener('click', () => { if (!state.busy) fetchCommands(); });
    $('#generateButton').addEventListener('click', generate);
    $('#newMugButton').addEventListener('click', resetGenerator);
  }

  async function init() {
    bindEvents();
    await fetchCommands();
    console.info(`Caneca 10 interno carregado · ${BUILD}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
