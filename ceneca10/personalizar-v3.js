(() => {
  'use strict';

  const BUILD = '20260826-ceneca10-personalizadas-v3-modelos-todas-canecas';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PRODUCTS_NODE = 'produtos';
  const MODELS_NODE = 'canecas/modelos_criacao';
  const COMMANDS_NODE = 'canecas/comandos_criacao';
  const PUBLIC_NODE = 'canecas/personalizadas_publicas';
  const PRIVATE_NODE = 'canecas/personalizadas';
  const PUBLIC_CONFIG_NODE = 'canecas/config_publica';
  const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
  const QUALITY_KEY = 'da_ceneca10_quality';
  const BUSINESS_WHATSAPP = '5565998150975';
  const MUG_CATEGORIES = ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas'];
  const MASTER_WIDTH = 2400;
  const MASTER_HEIGHT = 960;
  const SIDE_WIDTH = 1344;
  const PRICE = 24.90;
  const COST = 10;
  const NCM = '69111090';
  const PLACEHOLDER_ART = '__MUG_ART__';
  const PLACEHOLDER_MOCKUP_1 = '__MUG_MOCKUP_1__';
  const PLACEHOLDER_MOCKUP_2 = '__MUG_MOCKUP_2__';
  const PLACEHOLDER_MOCKUP_3 = '__MUG_MOCKUP_3__';

  const state = {
    models: [],
    created: [],
    selectedModel: null,
    commands: [],
    photoFile: null,
    busy: false,
    webhook: '',
    quality: 'high',
    requestId: '',
    whatsappOpened: false,
    whatsappConfirmed: false,
  };

  const $ = id => document.getElementById(id);
  const text = value => String(value ?? '').trim();
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
  const isUrl = value => /^https?:\/\//i.test(text(value));
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function toast(message, delay = 3200) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, delay);
  }

  function newRequestId() {
    return `cp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function timestamp(item = {}) {
    const numeric = Number(item.last_update || item.timestamp || 0);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(item.updated_at || item.atualizado_em || item.criado_em || item.created_at || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isActiveProduct(product = {}) {
    return text(product.situacao).toUpperCase() !== 'I' && product.ativo !== false;
  }

  function isMugProduct(product = {}) {
    return normalize(product.categoria).includes('caneca')
      || normalize(product.tipo_produto).includes('caneca')
      || normalize(product.origem_cadastro).includes('caneca');
  }

  function phraseFromProduct(product = {}, fallback = '') {
    return text(
      product.personalizacao_cliente?.frase
      || product.configuracao_arte?.frase_cliente
      || product.frase
      || product.modelo_frase
      || fallback
      || product.texto_identificado_arte
    );
  }

  function highlightNameFromProduct(product = {}, fallback = '') {
    return text(
      product.personalizacao_cliente?.nome_destaque
      || product.configuracao_arte?.nome_destaque
      || product.nome_destaque
      || fallback
    );
  }

  function uniqueUrls(values) {
    return [...new Set(values.flat(Infinity).map(text).filter(isUrl))];
  }

  function productImages(product = {}) {
    return uniqueUrls([
      product.mockup_1, product.mockup_2, product.mockup_3,
      product.url_imagem, product.imagem_url, product.imagem,
      product.imagens_site || [], product.imagens || [],
    ]).slice(0, 3);
  }

  function productArt(product = {}) {
    return text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url || product.mockup_1 || product.url_imagem || product.imagem);
  }

  function commandIdsFromProduct(product = {}) {
    const ids = product.modelo_comandos_ids
      || product.configuracao_arte?.comandos_salvos_ids
      || product.configuracao_arte?.comandos_ids
      || [];
    return Array.isArray(ids) ? [...new Set(ids.map(text).filter(Boolean))] : [];
  }

  function modelFromProduct(key, product = {}) {
    const images = productImages(product);
    const art = productArt(product);
    if (!images.length && !art) return null;
    return {
      id: text(product.id || key),
      product_key: text(product.firebaseKey || product.id || key),
      nome: text(product.nome || 'Caneca criada'),
      imagem: images[0] || art,
      images,
      art,
      frase: phraseFromProduct(product),
      nome_destaque: highlightNameFromProduct(product),
      comandos_ids: commandIdsFromProduct(product),
      instrucao_manual: '',
      instrucao_efetiva: '',
      ativo: isActiveProduct(product),
      source: product.modelo_caneca ? 'modelo_criado' : 'criada',
      atualizado_em: text(product.updated_at || product.criado_em),
      product,
      sortAt: timestamp(product),
    };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível abrir uma das imagens.'));
      image.src = source;
    });
  }

  async function normalizePhoto(file) {
    const image = await loadImage(await fileToDataUrl(file));
    const scale = Math.min(1, 1500 / image.naturalWidth, 1500 / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/webp', .94);
  }

  async function fetchAsDataUrl(url) {
    if (!isUrl(url)) return '';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return '';
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
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
    return canvas.toDataURL('image/webp', .96);
  }

  async function sideReference(master, mode) {
    const image = await loadImage(master);
    const sx = mode === 1 ? 0 : mode === 2 ? MASTER_WIDTH - SIDE_WIDTH : Math.round((MASTER_WIDTH - SIDE_WIDTH) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = SIDE_WIDTH;
    canvas.height = MASTER_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    ctx.drawImage(image, sx, 0, SIDE_WIDTH, MASTER_HEIGHT, 0, 0, SIDE_WIDTH, MASTER_HEIGHT);
    return canvas.toDataURL('image/webp', .96);
  }

  async function buildComposite(modelDataUrl, customerDataUrl) {
    if (!modelDataUrl) return customerDataUrl;
    const [model, customer] = await Promise.all([loadImage(modelDataUrl), loadImage(customerDataUrl)]);
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const contain = (image, x, y, width, height) => {
      const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    };
    contain(model, 0, 0, 900, 1000);
    contain(customer, 900, 0, 900, 1000);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(897, 0, 6, 1000);
    return canvas.toDataURL('image/webp', .94);
  }

  async function callMake(payload, timeoutMs = 180000) {
    if (!state.webhook) throw new Error('Automação ainda não configurada para esta página de teste.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(state.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: JSON.stringify(payload) }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let result = {};
      try { result = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`Automação respondeu conteúdo inválido (${response.status}).`); }
      if (!response.ok || result.ok === false) throw new Error(result.error || result.message || `Automação respondeu HTTP ${response.status}.`);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCreatedProducts() {
    const requests = MUG_CATEGORIES.map(async category => {
      const params = new URLSearchParams();
      params.set('orderBy', JSON.stringify('categoria'));
      params.set('equalTo', JSON.stringify(category));
      params.set('limitToLast', '150');
      const response = await fetch(`${FIREBASE_URL}/${PRODUCTS_NODE}.json?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Firebase ${response.status}`);
      return await response.json();
    });
    const settled = await Promise.allSettled(requests);
    const merged = new Map();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const [key, product] of Object.entries(result.value || {})) {
        if (!product || typeof product !== 'object' || !isMugProduct(product)) continue;
        const model = modelFromProduct(key, product);
        if (model) merged.set(model.product_key, model);
      }
    }
    return [...merged.values()].sort((a, b) => b.sortAt - a.sortAt || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async function fetchSavedModels(createdMap) {
    const response = await fetch(`${FIREBASE_URL}/${MODELS_NODE}.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Object.entries(data || {})
      .filter(([, value]) => value && typeof value === 'object')
      .map(([key, value]) => {
        const productKey = text(value.product_key || value.firebaseKey || value.id || key);
        const created = createdMap.get(productKey);
        const product = created?.product || {};
        const images = uniqueUrls([
          value.mockup_1, value.mockup_2, value.mockup_3, value.imagem,
          created?.images || [],
        ]).slice(0, 3);
        const art = text(value.arte_horizontal || created?.art || value.imagem || images[0]);
        return {
          id: text(value.id || productKey),
          product_key: productKey,
          nome: text(value.nome || created?.nome || product.nome || 'Modelo de caneca'),
          imagem: images[0] || art,
          images,
          art,
          frase: text(value.frase || created?.frase || phraseFromProduct(product)),
          nome_destaque: text(value.nome_destaque || created?.nome_destaque || highlightNameFromProduct(product)),
          comandos_ids: Array.isArray(value.comandos_ids) ? value.comandos_ids.map(text).filter(Boolean) : (created?.comandos_ids || []),
          instrucao_manual: text(value.instrucao_manual),
          instrucao_efetiva: text(value.instrucao_efetiva),
          ativo: created ? created.ativo : isActiveProduct(product),
          source: 'modelo_salvo',
          atualizado_em: text(value.atualizado_em || created?.atualizado_em),
          product,
          sortAt: Math.max(Date.parse(value.atualizado_em || '') || 0, created?.sortAt || 0),
        };
      })
      .filter(model => model.product_key && (model.images.length || model.art));
  }

  async function fetchCommands() {
    const response = await fetch(`${FIREBASE_URL}/${COMMANDS_NODE}.json`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Object.entries(data || {})
      .map(([key, value]) => ({ id: text(value?.id || key), texto: text(value?.texto) }))
      .filter(item => item.id && item.texto);
  }

  async function loadModels() {
    const created = await fetchCreatedProducts();
    const createdMap = new Map(created.map(model => [model.product_key, model]));
    const saved = await fetchSavedModels(createdMap);
    const merged = new Map(created.map(model => [model.product_key, { ...model, source: 'criada' }]));
    for (const model of saved) {
      const existing = merged.get(model.product_key);
      merged.set(model.product_key, existing ? { ...existing, ...model, images: model.images.length ? model.images : existing.images, art: model.art || existing.art } : model);
    }
    state.created = created;
    state.models = [...merged.values()].sort((a, b) => b.sortAt - a.sortAt || a.nome.localeCompare(b.nome, 'pt-BR'));
    state.commands = await fetchCommands().catch(() => []);
    if (!state.selectedModel && state.models.length) state.selectedModel = state.models[0];
  }

  function modelCard(model, index, compact = false) {
    const selected = state.selectedModel?.product_key === model.product_key;
    const status = model.ativo ? 'Ativa' : 'Inativa';
    const source = model.source === 'modelo_salvo' ? 'Modelo salvo' : 'Caneca criada';
    return `<button type="button" class="model-card ${compact ? 'compact-model' : ''} ${selected ? 'is-selected' : ''}" data-model="${escapeHtml(model.product_key)}">
      <div class="model-image"><img loading="lazy" decoding="async" src="${escapeHtml(model.images[0] || model.imagem || model.art || '../site/img/logoantonia5.png')}" alt="${escapeHtml(model.nome || `Modelo ${index + 1}`)}"><span class="model-status ${model.ativo ? 'active' : 'inactive'}">${status}</span></div>
      <div class="model-foot"><strong>${escapeHtml(model.nome)}</strong><small>${source}${model.frase ? ' · tem frase' : ''}</small></div>
    </button>`;
  }

  function renderModels() {
    const track = $('modelsTrack');
    const createdTrack = $('createdTrack');
    track.innerHTML = state.models.length
      ? state.models.map((model, index) => modelCard(model, index)).join('')
      : '<div class="empty-models">Nenhuma caneca com imagem foi encontrada.</div>';
    createdTrack.innerHTML = state.created.length
      ? state.created.slice(0, 30).map((model, index) => modelCard(model, index, true)).join('')
      : '<div class="empty-models">Nenhuma criação encontrada.</div>';
    renderSelectedModelInfo();
  }

  function renderSelectedModelInfo() {
    const box = $('selectedModelInfo');
    const model = state.selectedModel;
    if (!model) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('selectedModelName').textContent = model.nome;
    $('selectedModelPhrase').textContent = model.frase || 'Este modelo não possui frase salva.';
    $('useModelPhraseButton').hidden = !model.frase;
    $('selectedModelStatus').textContent = `${model.ativo ? 'Ativa' : 'Inativa'} · ${model.source === 'modelo_salvo' ? 'modelo salvo' : 'caneca criada'} · também pode ser reutilizada como modelo`;
  }

  function selectModel(productKey) {
    const model = state.models.find(item => item.product_key === productKey)
      || state.created.find(item => item.product_key === productKey);
    if (!model) return;
    state.selectedModel = model;
    invalidateWhatsappGate();
    renderModels();
  }

  function modelRecipe(model) {
    const blocks = state.commands
      .filter(command => (model.comandos_ids || []).includes(command.id))
      .map((command, index) => `COMANDO DE ESTILO ${index + 1}:\n${command.texto}`);
    if (model.instrucao_manual) blocks.push(`INSTRUÇÃO VISUAL DO MODELO:\n${model.instrucao_manual}`);
    else if (!blocks.length && model.instrucao_efetiva) blocks.push(`INSTRUÇÃO VISUAL DO MODELO:\n${model.instrucao_efetiva}`);
    return blocks.join('\n\n');
  }

  function artPrompt(recipe, highlightName, phrase) {
    const nameBlock = highlightName
      ? `NOME EM DESTAQUE — ESCREVER EXATAMENTE ASSIM:\n${highlightName}\n- coloque o nome PRÓXIMO DA FOTO/IMAGEM PRINCIPAL;\n- dê destaque tipográfico ao nome, sem cobrir rosto, olhos ou detalhes importantes;\n- harmonize fonte, cor e tamanho com o estilo do modelo;\n- o nome e a imagem devem formar o mesmo polo visual da composição.\n\n`
      : 'NOME EM DESTAQUE: não informado. Não invente nome.\n\n';
    return `A imagem de referência está dividida em duas partes: a METADE ESQUERDA mostra o MODELO VISUAL escolhido e a METADE DIREITA mostra a FOTO DO CLIENTE.\n\nCrie uma NOVA ARTE HORIZONTAL PARA SUBLIMAÇÃO DE CANECA, aproximadamente 24 × 9,5 cm, pronta para fechamento em 2400 × 960 px.\n\nREGRAS PRINCIPAIS:\n- preserve a linguagem visual, clima, cores, acabamento e estilo do modelo;\n- use a foto do cliente como conteúdo personalizado principal;\n- NÃO copie nomes ou frases existentes na arte do modelo; qualquer texto antigo é apenas referência visual;\n- organize a arte em DOIS POLOS: FOTO + NOME EM DESTAQUE de um lado e FRASE do outro lado da caneca;\n- o texto da FRASE deve continuar NO LADO OPOSTO da caneca, separado do nome e da imagem principal;\n- mantenha equilíbrio visual entre os dois lados quando a arte envolver a caneca;\n- entregar somente a arte plana, sem caneca, mãos, mesa, embalagem ou mockup.\n\n${recipe ? `REGRAS DE ESTILO DO MODELO:\n${recipe}\n\n` : ''}${nameBlock}FRASE DO CLIENTE — ESCREVER EXATAMENTE ASSIM:\n${phrase}\n- preserve palavras, acentos e pontuação;\n- mantenha a frase no lado oposto ao polo FOTO + NOME;\n- deixe a frase bonita, legível e integrada ao mesmo estilo visual.\n\nENTREGA: uma única arte horizontal nova, harmoniosa e pronta para sublimação.`;
  }

  function mockupPrompt(side) {
    const position = side === 1 ? 'primeira metade/lado esquerdo' : side === 2 ? 'segunda metade/lado direito' : 'centro da arte';
    return `Use a arte fornecida como arte-mestre imutável. Mostre o ${position} na face visível de uma caneca branca de porcelana 350ml. Fotografia quadrada 1:1 ultra realista, fundo claro e simples, caneca inteira visível, sem objetos extras. Não redesenhe nem reescreva a arte. Preserve exatamente o nome e a frase já presentes na arte. Preserve proporções e aplique somente a curvatura natural da caneca.`;
  }

  function safeName(highlightName, customerName) {
    const label = text(highlightName || customerName).replace(/[\r\n]+/g, ' ').slice(0, 55).trim();
    return `Caneca de Porcelana Personalizada ${label || 'Exclusiva'} - 350ml`;
  }

  function resultUrl(id) {
    const url = new URL('./resultado.html', location.href);
    url.search = '';
    url.searchParams.set('id', id);
    return url.href;
  }

  function contactWhatsappUrl(id, data) {
    const message = [
      'Olá! Quero criar uma caneca personalizada na Dona Antônia.',
      `Código da criação: ${id}`,
      `Meu nome: ${data.customerName}`,
      `Nome para destacar na caneca: ${data.highlightName}`,
      `Modelo: ${data.model.nome}`,
      `Frase: ${data.phrase}`,
      '',
      'Estou enviando esta mensagem para liberar minha criação no site.',
    ].join('\n');
    return `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(message)}`;
  }

  function resultWhatsappUrl(id, publicUrl, data) {
    const message = [
      'Olá! Minha caneca personalizada ficou pronta e quero enviar a criação para vocês.',
      `Código: ${id}`,
      `Meu nome: ${data.customerName}`,
      `Nome destacado: ${data.highlightName}`,
      `Frase: ${data.phrase}`,
      `Link com as 4 imagens: ${publicUrl}`,
    ].join('\n');
    return `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(message)}`;
  }

  function firebaseTemplate(id, data) {
    const now = new Date().toISOString();
    const suffix = id.slice(-8).toUpperCase();
    return JSON.stringify({
      id,
      firebaseKey: id,
      codigo: `CANP-${suffix}`,
      gtin: '', ean: '', codigo_barras: '',
      nome: data.productName,
      categoria: 'Caneca de Porcelana',
      subcategoria: 'Personalizadas',
      tema: 'Personalizada',
      subsubcategoria: '',
      ncm: NCM,
      preco_custo: COST,
      preco: PRICE,
      estoque: 0,
      situacao: 'I',
      ativo: false,
      modelo_caneca: true,
      material: 'Porcelana',
      capacidade: '350ml',
      embalagem: 'Caneca de porcelana 350ml',
      unidade: 'UN',
      dimensao_impressao: '24 × 9,5 cm',
      descricao: `${data.productName}. Caneca de porcelana branca 350ml personalizada com foto, nome em destaque e frase.`,
      tags: ['caneca personalizada', 'caneca com foto', 'caneca com nome', 'presente personalizado', 'caneca 350ml'],
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
      arte_impressao: { url: PLACEHOLDER_ART, ratio: '2400:960', width: 2400, height: 960, dimensao_real: '24 × 9,5 cm', formato: 'webp' },
      midias_admin: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_MOCKUP_3, PLACEHOLDER_ART],
      origem_cadastro: 'ceneca10_cliente_teste',
      tipo_produto: 'caneca_personalizada',
      geracao_status: 'concluido',
      geracao_versao: BUILD,
      personalizacao_cliente: {
        nome: data.customerName,
        nome_destaque: data.highlightName,
        frase: data.phrase,
        frase_modelo_origem: data.model.frase || '',
        modelo_key: data.model.product_key,
        modelo_nome: data.model.nome,
        resultado_url: data.publicUrl,
        whatsapp_contato_iniciado: true,
        whatsapp_confirmado_pelo_cliente: true,
        codigo_contato: id,
      },
      configuracao_arte: {
        modo: 'cliente_modelo_foto_nome_frase',
        modelo_key: data.model.product_key,
        nome_destaque: data.highlightName,
        frase_cliente: data.phrase,
        layout_texto: 'foto_e_nome_em_um_lado_frase_no_lado_oposto',
        width: 2400,
        height: 960,
      },
      criado_em: now,
      updated_at: now,
      last_update: Date.now(),
    });
  }

  async function directSaveProduct(id, templateJson, urls) {
    const product = JSON.parse(templateJson);
    const replace = value => value === PLACEHOLDER_ART ? urls.art
      : value === PLACEHOLDER_MOCKUP_1 ? urls.m1
        : value === PLACEHOLDER_MOCKUP_2 ? urls.m2
          : value === PLACEHOLDER_MOCKUP_3 ? urls.m3 : value;
    product.imagens = product.imagens.map(replace);
    product.imagens_site = product.imagens_site.map(replace);
    product.midias_admin = product.midias_admin.map(replace);
    product.url_imagem = urls.m1;
    product.imagem = urls.m1;
    product.imagem_url = urls.m1;
    product.mockup_1 = urls.m1;
    product.mockup_2 = urls.m2;
    product.mockup_3 = urls.m3;
    product.arte_personalizacao = urls.art;
    product.arte_horizontal = urls.art;
    product.arte_impressao.url = urls.art;
    const response = await fetch(`${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(id)}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product),
    });
    if (!response.ok) throw new Error('Não foi possível salvar a caneca no Produção.');
  }

  async function ensureProductModelFlag(id) {
    await fetch(`${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(id)}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelo_caneca: true, modelo_atualizado_em: new Date().toISOString() }),
    }).catch(() => {});
  }

  async function saveReusableModel(id, data, urls, recipe) {
    const model = {
      id,
      product_key: id,
      nome: data.productName,
      imagem: urls.m1,
      mockup_1: urls.m1,
      mockup_2: urls.m2,
      mockup_3: urls.m3,
      arte_horizontal: urls.art,
      frase: data.phrase,
      nome_destaque: data.highlightName,
      comandos_ids: Array.isArray(data.model.comandos_ids) ? data.model.comandos_ids : [],
      instrucao_efetiva: recipe,
      atualizado_em: new Date().toISOString(),
      origem: BUILD,
    };
    const response = await fetch(`${FIREBASE_URL}/${MODELS_NODE}/${encodeURIComponent(id)}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model),
    });
    if (!response.ok) console.warn('Caneca criada, mas não foi possível salvar o atalho de modelo.');
    await ensureProductModelFlag(id);
  }

  async function saveLeadIntent(id, data) {
    const payload = {
      id,
      cliente_nome: data.customerName,
      nome_destaque: data.highlightName,
      modelo_key: data.model.product_key,
      modelo_nome: data.model.nome,
      frase: data.phrase,
      status: 'contato_whatsapp_iniciado',
      whatsapp_contato_iniciado: true,
      origem: BUILD,
      criado_em: new Date().toISOString(),
    };
    await fetch(`${FIREBASE_URL}/${PRIVATE_NODE}/${encodeURIComponent(id)}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).catch(() => {});
  }

  async function saveCreationRecords(id, data, urls) {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const publicData = {
      id,
      nome_publico: `Caneca personalizada ${data.highlightName}`,
      nome_destaque: data.highlightName,
      modelo_nome: data.model.nome,
      modelo_key: data.model.product_key,
      frase: data.phrase,
      arte_horizontal: urls.art,
      mockup_1: urls.m1,
      mockup_2: urls.m2,
      mockup_3: urls.m3,
      produto_key: id,
      criado_em: now,
      expira_em: expiresAt,
    };
    const privateData = {
      ...publicData,
      cliente_nome: data.customerName,
      status: 'criacao_gerada_aguardando_envio_link',
      resultado_url: data.publicUrl,
      whatsapp_contato_iniciado: true,
      whatsapp_confirmado_pelo_cliente: true,
      codigo_contato: id,
      origem: BUILD,
    };
    const [publicResponse, privateResponse] = await Promise.all([
      fetch(`${FIREBASE_URL}/${PUBLIC_NODE}/${encodeURIComponent(id)}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(publicData) }),
      fetch(`${FIREBASE_URL}/${PRIVATE_NODE}/${encodeURIComponent(id)}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(privateData) }),
    ]);
    if (!publicResponse.ok || !privateResponse.ok) throw new Error('A caneca foi criada, mas o link público não pôde ser salvo.');
  }

  function progress(percent, title, detail) {
    $('progressCard').hidden = false;
    $('progressPercent').textContent = `${percent}%`;
    $('progressBar').style.width = `${percent}%`;
    $('progressTitle').textContent = title;
    if (detail) $('progressDetail').textContent = detail;
  }

  function currentFormData() {
    return {
      model: state.selectedModel,
      customerName: text($('customerNameInput').value),
      highlightName: text($('highlightNameInput').value),
      phrase: text($('phraseInput').value),
    };
  }

  function validateBeforeWhatsapp() {
    const data = currentFormData();
    if (!data.model) throw new Error('Escolha um modelo.');
    if (!state.photoFile) throw new Error('Envie sua foto.');
    if (!data.customerName) throw new Error('Informe seu nome.');
    if (!data.highlightName) throw new Error('Informe o nome que deve aparecer em destaque na caneca.');
    if (!data.phrase) throw new Error('Escreva a frase da caneca.');
    return data;
  }

  function updateGateUi() {
    const unlocked = state.whatsappOpened && state.whatsappConfirmed;
    $('whatsappGateCard').classList.toggle('is-unlocked', unlocked);
    $('whatsappConfirmBox').hidden = !state.whatsappOpened;
    $('whatsappUnlockButton').textContent = state.whatsappOpened ? 'Abrir o WhatsApp novamente' : 'Abrir WhatsApp e enviar mensagem';
    $('generateButton').disabled = state.busy || !unlocked;
    $('generateHelp').textContent = unlocked
      ? 'Contato confirmado. Agora você pode gerar sua caneca.'
      : 'Envie primeiro a mensagem pelo WhatsApp para liberar.';
    if (state.whatsappOpened && !state.whatsappConfirmed) {
      $('whatsappGateStatus').textContent = 'Depois de enviar a mensagem no WhatsApp, volte aqui e marque a confirmação acima.';
    } else if (unlocked) {
      $('whatsappGateStatus').textContent = `Liberado para gerar · código ${state.requestId}`;
    }
  }

  function invalidateWhatsappGate() {
    if (state.busy) return;
    state.requestId = '';
    state.whatsappOpened = false;
    state.whatsappConfirmed = false;
    $('whatsappSentConfirm').checked = false;
    updateGateUi();
  }

  function openWhatsappGate() {
    let data;
    try { data = validateBeforeWhatsapp(); }
    catch (error) { toast(error.message); return; }
    if (!state.requestId) state.requestId = newRequestId();
    state.whatsappOpened = true;
    state.whatsappConfirmed = false;
    $('whatsappSentConfirm').checked = false;
    updateGateUi();
    window.open(contactWhatsappUrl(state.requestId, data), '_blank', 'noopener');
    saveLeadIntent(state.requestId, data);
  }

  async function loadWebhook() {
    state.quality = localStorage.getItem(QUALITY_KEY) || 'high';
    state.webhook = text(localStorage.getItem(WEBHOOK_KEY));
    if (state.webhook) return;
    try {
      const response = await fetch(`${FIREBASE_URL}/${PUBLIC_CONFIG_NODE}/make_webhook.json`, { cache: 'no-store' });
      if (response.ok) {
        const value = await response.json();
        if (typeof value === 'string' && /^https:\/\//i.test(value)) state.webhook = value;
      }
    } catch {}
  }

  async function generate() {
    if (state.busy) return;
    if (!state.whatsappOpened || !state.whatsappConfirmed || !state.requestId) return toast('Envie primeiro a mensagem pelo WhatsApp e confirme o envio.');
    let baseData;
    try { baseData = validateBeforeWhatsapp(); }
    catch (error) { invalidateWhatsappGate(); toast(`${error.message} Será necessário liberar novamente pelo WhatsApp.`); return; }
    if (!state.webhook) return toast('Esta página de teste ainda não está ligada à automação.');

    state.busy = true;
    updateGateUi();
    $('doneCard').hidden = true;
    $('bottomAction').hidden = true;
    const id = state.requestId;
    const publicUrl = resultUrl(id);
    const productName = safeName(baseData.highlightName, baseData.customerName);
    const data = { id, ...baseData, publicUrl, productName };

    try {
      progress(8, 'Preparando sua foto…', 'Organizando as referências do modelo escolhido.');
      const customerPhoto = await normalizePhoto(state.photoFile);
      let modelData = '';
      try { modelData = await fetchAsDataUrl(data.model.art || data.model.images[0]); } catch {}
      const composite = await buildComposite(modelData, customerPhoto);
      const recipe = modelRecipe(data.model);

      progress(22, 'Criando a arte personalizada…', 'Posicionando sua foto, o nome em destaque e a frase em lados diferentes da caneca.');
      const artResult = await callMake({
        action: 'generate_mug_art',
        request_id: id,
        image_base64: composite,
        instruction: recipe,
        prompt_art: artPrompt(recipe, data.highlightName, data.phrase),
        customer_highlight_name: data.highlightName,
        customer_phrase: data.phrase,
        layout_instruction: 'nome destacado próximo da imagem; frase no lado oposto da caneca',
        quality: state.quality,
      });
      const artSource = text(artResult.art_source_url || artResult.result_url);
      if (!artSource) throw new Error('A automação não devolveu a arte criada.');

      progress(46, 'Ajustando a arte…', 'Preparando a imagem final para a caneca.');
      const master = await cropMaster(artSource);
      const [left, right, center] = await Promise.all([sideReference(master, 1), sideReference(master, 2), sideReference(master, 3)]);
      const template = firebaseTemplate(id, data);

      progress(58, 'Criando as prévias…', 'Gerando as três vistas da caneca sem alterar o nome nem a frase.');
      const finalResult = await callMake({
        action: 'finalize_mug_product',
        request_id: id,
        image_base64: master,
        mockup_left_base64: left,
        mockup_right_base64: right,
        mockup_center_base64: center,
        instruction: recipe,
        product_name: productName,
        prompt_mockup_1: mockupPrompt(1),
        prompt_mockup_2: mockupPrompt(2),
        prompt_mockup_3: mockupPrompt(3),
        quality: 'high',
        firebase_url: FIREBASE_URL,
        products_node: PRODUCTS_NODE,
        firebase_template_json: template,
      });
      const urls = {
        art: text(finalResult.art_url || finalResult.arte_url || finalResult.art_source_url) || artSource,
        m1: text(finalResult.mockup_1_url),
        m2: text(finalResult.mockup_2_url),
        m3: text(finalResult.mockup_3_url),
      };
      if (!urls.m1 || !urls.m2 || !urls.m3) throw new Error('A automação não devolveu os três mockups.');

      progress(82, 'Salvando sua criação…', 'Cadastrando como inativa e também como novo modelo reutilizável.');
      if (finalResult.product_saved !== true) await directSaveProduct(id, template, urls);
      await ensureProductModelFlag(id);
      await saveCreationRecords(id, data, urls);
      await saveReusableModel(id, data, urls, recipe);

      progress(100, 'Tudo pronto!', 'Seu link com as quatro imagens foi criado.');
      $('donePreview').src = urls.m1;
      $('viewResultButton').href = publicUrl;
      $('sendResultWhatsappButton').href = resultWhatsappUrl(id, publicUrl, data);
      $('doneMessage').textContent = 'Sua caneca foi salva como inativa e já pode servir de modelo para novas criações. Veja as quatro imagens e envie o link para nossa equipe.';
      $('doneCard').hidden = false;
      $('progressCard').hidden = true;
      $('doneCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('Falha no teste de caneca personalizada:', error);
      toast(error?.message || String(error), 5200);
      $('progressCard').hidden = true;
      $('bottomAction').hidden = false;
    } finally {
      state.busy = false;
      updateGateUi();
    }
  }

  async function saveAdminSettings() {
    const hook = text($('webhookInput').value);
    if (!/^https:\/\//i.test(hook)) return toast('Informe um webhook válido.');
    localStorage.setItem(WEBHOOK_KEY, hook);
    localStorage.setItem(QUALITY_KEY, $('qualityInput').value || 'high');
    state.webhook = hook;
    state.quality = $('qualityInput').value || 'high';
    if ($('publishWebhookInput').checked) {
      const response = await fetch(`${FIREBASE_URL}/${PUBLIC_CONFIG_NODE}/make_webhook.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hook),
      });
      if (!response.ok) return toast('Configuração local salva, mas não foi possível publicar para teste.');
    }
    toast('Automação configurada.');
    $('adminSettingsDialog').close();
  }

  function bindModelTracks() {
    const handler = event => {
      const button = event.target.closest('[data-model]');
      if (button) selectModel(text(button.dataset.model));
    };
    $('modelsTrack').addEventListener('click', handler);
    $('createdTrack').addEventListener('click', handler);
  }

  function bind() {
    bindModelTracks();
    $('useModelPhraseButton').addEventListener('click', () => {
      if (!state.selectedModel?.frase) return;
      $('phraseInput').value = state.selectedModel.frase;
      $('phraseCount').textContent = $('phraseInput').value.length;
      invalidateWhatsappGate();
      toast('Frase do modelo copiada. Você pode editar antes de continuar.');
    });
    $('customerPhotoInput').addEventListener('change', () => {
      const file = $('customerPhotoInput').files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      state.photoFile = file;
      $('customerPhotoPreview').src = URL.createObjectURL(file);
      $('customerPhotoPreview').hidden = false;
      $('photoEmpty').hidden = true;
      $('changePhotoButton').hidden = false;
      invalidateWhatsappGate();
    });
    $('changePhotoButton').addEventListener('click', () => $('customerPhotoInput').click());
    $('phraseInput').addEventListener('input', () => {
      $('phraseCount').textContent = $('phraseInput').value.length;
      invalidateWhatsappGate();
    });
    $('customerNameInput').addEventListener('input', invalidateWhatsappGate);
    $('highlightNameInput').addEventListener('input', invalidateWhatsappGate);
    $('whatsappUnlockButton').addEventListener('click', openWhatsappGate);
    $('whatsappSentConfirm').addEventListener('change', () => {
      state.whatsappConfirmed = state.whatsappOpened && $('whatsappSentConfirm').checked;
      updateGateUi();
    });
    $('generateButton').addEventListener('click', generate);
    $('createAnotherButton').addEventListener('click', () => location.reload());

    const adminMode = new URLSearchParams(location.search).get('admin') === '1';
    if (adminMode) {
      $('adminSettingsButton').hidden = false;
      $('adminSettingsButton').addEventListener('click', () => {
        $('webhookInput').value = state.webhook;
        $('qualityInput').value = state.quality;
        $('adminSettingsDialog').showModal();
      });
      $('saveAdminSettingsButton').addEventListener('click', saveAdminSettings);
    }
  }

  async function init() {
    bind();
    await loadWebhook();
    try {
      await loadModels();
      renderModels();
    } catch (error) {
      console.error('Falha ao carregar modelos:', error);
      $('modelsTrack').innerHTML = `<div class="empty-models">${escapeHtml(error?.message || error)}</div>`;
      $('createdTrack').innerHTML = '<div class="empty-models">Não foi possível carregar as canecas criadas.</div>';
    }
    updateGateUi();
    if (!state.webhook && new URLSearchParams(location.search).get('admin') === '1') toast('Configure o webhook desta página de teste na engrenagem.');
    console.info(`Caneca 10 personalizadas carregado · ${BUILD}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
