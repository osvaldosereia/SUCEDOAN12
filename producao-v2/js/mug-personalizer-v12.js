import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';

const BUILD = '20260825-canecas-studio-v12-catalogador-visual';
const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
const MASTER_WIDTH = 2400;
const MASTER_HEIGHT = 960;
const PRINT_LABEL = '24 × 9,5 cm';
const SIDE_WIDTH = 1344;
const MUG_CATEGORY = 'Caneca de Porcelana';
const MUG_CAPACITY = '350ml';
const MUG_NCM = '69111090';
const MUG_PRICE = 24.90;
const PLACEHOLDER_ART = '__MUG_ART__';
const PLACEHOLDER_MOCKUP_1 = '__MUG_MOCKUP_1__';
const PLACEHOLDER_MOCKUP_2 = '__MUG_MOCKUP_2__';
const PLACEHOLDER_MOCKUP_3 = '__MUG_MOCKUP_3__';
const FORBIDDEN_CATALOG_TERMS = [
  /comando\s+salvo/i,
  /i\.?\s*a\.?\s+criativa/i,
  /sequ[eê]ncia/i,
  /prompt/i,
  /instru[cç][aã]o\s+(original|complementar|do operador)/i,
  /use\s+(a\s+)?sua\s+criatividade/i,
  /make\.com|\bmake\b/i,
  /firebase/i,
  /webhook/i,
  /m[oó]dulo\s+\d+/i,
];

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function requestId() {
  return `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem gerada.'));
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
  return canvas.toDataURL('image/webp', 0.96);
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
  return canvas.toDataURL('image/webp', 0.96);
}

async function callMake(hook, payload) {
  const response = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(payload) }),
  });
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`Make respondeu algo que não é JSON (${response.status}).`); }
  if (!response.ok || result.ok === false) throw new Error(result.error || result.message || `Make respondeu HTTP ${response.status}.`);
  return result;
}

function buildOperatorInstructionBlock(instruction = '') {
  const extra = text(instruction);
  if (!extra) return 'INSTRUÇÃO COMPLEMENTAR DO OPERADOR: nenhuma.';
  return `PRIORIDADE MÁXIMA — INSTRUÇÃO COMPLEMENTAR DO OPERADOR:\n${extra}\n\nREGRAS:\n- cumpra todos os detalhes pedidos;\n- texto solicitado deve ser reproduzido exatamente;\n- não resuma, traduza ou parafraseie texto obrigatório;\n- antes de concluir, confira visualmente o cumprimento da instrução.`;
}

function buildArtPrompt(instruction = '') {
  return `Analise cuidadosamente a imagem enviada como REFERÊNCIA E INSPIRAÇÃO e crie uma NOVA ARTE COMERCIAL PARA CANECA.\n\n${buildOperatorInstructionBlock(instruction)}\n\nOBJETIVO:\n- produza somente a arte plana, nunca mockup;\n- composição final horizontal ${MASTER_WIDTH}×${MASTER_HEIGHT}px (${PRINT_LABEL});\n- elementos principais ocupando praticamente toda a altura útil;\n- composição equilibrada entre esquerda, centro e direita;\n- preserve proporções; não estique nem achate;\n- crie solução nova e comercial inspirada na referência.\n\nTEXTO:\n- se o operador pediu texto, inclua-o literalmente;\n- se não pediu, não invente palavras.\n\nRESTRIÇÕES:\n- não mostrar caneca, mãos, mesa, embalagem, cenário de produto, marca-d'água ou interface;\n- não cortar elementos centrais importantes.\n\nENTREGA: uma arte horizontal única, harmoniosa e pronta para sublimação.`;
}

function buildCatalogPrompt(retryReason = '') {
  return `CATALOGUE VISUALMENTE A ARTE FINAL DA CANECA.\n\nFONTE DE VERDADE: use SOMENTE a imagem anexada. Não use, deduza nem repita comandos internos, prompts, nomes de módulos, instruções de automação ou textos técnicos do sistema.\n\nRETORNE SOMENTE JSON VÁLIDO, SEM MARKDOWN, com exatamente estas chaves:\n{\n  "tema": "tema comercial principal da arte",\n  "nome": "Caneca de Porcelana [tema comercial específico] - 350ml",\n  "subcategoria": "subcategoria curta baseada no tema",\n  "descricao": "descrição comercial em português mencionando o tema, porcelana branca e 350ml",\n  "tags": ["3 a 8 tags de busca"],\n  "seo_title": "título SEO natural",\n  "seo_description": "descrição SEO natural com até 155 caracteres",\n  "texto_identificado": "texto realmente visível na arte, ou vazio",\n  "confianca_tema": 0.0\n}\n\nREGRAS:\n- identifique o que está VISUALMENTE na arte final: santo, devoção, profissão, hobby, ocasião, animal, flor, esporte, família, frase, estilo ou assunto dominante;\n- o nome deve começar exatamente por "Caneca de Porcelana" e terminar exatamente por "- 350ml";\n- o trecho do tema no nome deve ter normalmente 2 a 8 palavras úteis para pesquisa;\n- jamais use como tema: COMANDO SALVO, I.A. Criativa, sequência, prompt, instrução do operador, Make, Firebase, webhook, módulo, use sua criatividade, modelo de comando ou qualquer texto operacional;\n- se houver texto artístico visível, considere seu significado comercial, mas não copie uma frase longa inteira para o nome;\n- não invente santo, personagem, marca, profissão ou evento que não esteja sustentado pela imagem;\n- tema e subcategoria devem ser limpos e próprios para catálogo;\n- a descrição deve falar do tema efetivamente visto e conter "porcelana branca" e "350ml";\n- confianca_tema deve ser número entre 0 e 1.\n${retryReason ? `\nA tentativa anterior foi rejeitada pelo validador por: ${retryReason}. Corrija sem usar nenhum contexto externo à imagem.` : ''}`;
}

function hasForbiddenCatalogTerm(value) {
  const source = text(value);
  return FORBIDDEN_CATALOG_TERMS.some(pattern => pattern.test(source));
}

function cleanString(value, max = 220) {
  return text(value).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max).trim();
}

function parseCatalogPayload(result) {
  let raw = result.catalog || result.catalog_json || result.metadata || result.metadata_json || result.result;
  if (raw && typeof raw === 'object') return raw;
  raw = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!raw) throw new Error('O catalogador visual não devolveu os dados do produto.');
  try { return JSON.parse(raw); }
  catch { throw new Error('O catalogador visual devolveu JSON inválido.'); }
}

function validateCatalog(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Catálogo visual inválido.');
  const theme = cleanString(input.tema, 80);
  const subcategory = cleanString(input.subcategoria || theme, 80);
  let name = cleanString(input.nome, 140);
  let description = cleanString(input.descricao, 700);
  const detectedText = cleanString(input.texto_identificado, 260);
  const tags = (Array.isArray(input.tags) ? input.tags : [])
    .map(item => cleanString(item, 60)).filter(Boolean).filter(item => !hasForbiddenCatalogTerm(item)).slice(0, 8);

  if (!theme || theme.length < 3) throw new Error('tema vazio ou genérico');
  if (hasForbiddenCatalogTerm(theme) || hasForbiddenCatalogTerm(subcategory) || hasForbiddenCatalogTerm(name) || hasForbiddenCatalogTerm(description)) {
    throw new Error('o retorno contém texto operacional do sistema');
  }
  if (!name || !/^Caneca de Porcelana\s+/i.test(name) || !/\s-\s350ml$/i.test(name)) {
    name = `Caneca de Porcelana ${theme} - 350ml`;
  }
  if (!description || !/porcelana\s+branca/i.test(description) || !/350\s*ml/i.test(description)) {
    description = `${name}. Caneca de porcelana branca 350ml com arte temática de ${theme}, ideal para uso pessoal ou presente.`;
  }
  const seoTitle = cleanString(input.seo_title || name.replace(/\s-\s350ml$/i, ' 350ml'), 120);
  const seoDescription = cleanString(input.seo_description || description, 155);
  const confidenceRaw = Number(input.confianca_tema);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.5;

  return {
    tema: theme,
    nome: name,
    subcategoria: subcategory || theme,
    descricao: description,
    tags,
    seo_title: seoTitle,
    seo_description: seoDescription,
    texto_identificado: detectedText,
    confianca_tema: confidence,
  };
}

async function analyzeCatalog(hook, id, master) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await callMake(hook, {
        action: 'analyze_mug_product',
        request_id: id,
        image_base64: master,
        prompt_catalog: buildCatalogPrompt(lastError?.message || ''),
      });
      return validateCatalog(parseCatalogPayload(result));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Falha na catalogação visual ${attempt}/2:`, lastError);
    }
  }
  throw new Error(`A análise da arte não produziu cadastro confiável: ${lastError?.message || 'erro desconhecido'}.`);
}

function buildMockupPrompt(side) {
  const orientation = side === 1
    ? 'Mostre a PRIMEIRA METADE / LADO ESQUERDO da arte centralizada na face visível; alça preferencialmente à direita.'
    : side === 2
      ? 'Mostre a SEGUNDA METADE / LADO DIREITO da arte centralizada na face visível; alça preferencialmente à esquerda.'
      : 'Mostre o CENTRO DA ARTE na face frontal, sem deslocar a composição.';
  return `Use a arte fornecida como ARTE-MESTRE IMUTÁVEL. ${orientation}\nCrie fotografia quadrada 1:1 ultra realista de caneca branca de porcelana 350ml sublimada com essa arte.\nA impressão corresponde aproximadamente a ${PRINT_LABEL} e deve ocupar praticamente toda a altura útil da caneca.\nNão redesenhe, não reescreva, não altere cores, não invente símbolos e não substitua elementos.\nPreserve a proporção e aplique apenas a curvatura cilíndrica natural. Fundo claro e simples; caneca inteira visível; sem objetos extras. Resultado comercial 1024×1024.`;
}

function firebaseTemplate(id, instruction, catalog) {
  const now = new Date().toISOString();
  const suffix = id.slice(-6).toUpperCase();
  return JSON.stringify({
    id,
    firebaseKey: id,
    codigo: `CANP-${suffix}`,
    gtin: '', ean: '', codigo_barras: '',
    nome: catalog.nome,
    categoria: MUG_CATEGORY,
    subcategoria: catalog.subcategoria,
    tema: catalog.tema,
    subsubcategoria: '',
    ncm: MUG_NCM,
    preco_custo: 10,
    preco: MUG_PRICE,
    estoque: 0,
    situacao: 'I',
    ativo: false,
    material: 'Porcelana',
    capacidade: MUG_CAPACITY,
    embalagem: `Caneca de porcelana ${MUG_CAPACITY}`,
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
    arte_impressao: { url: PLACEHOLDER_ART, ratio: `${MASTER_WIDTH}:${MASTER_HEIGHT}`, width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: PRINT_LABEL, formato: 'webp' },
    midias_admin: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_MOCKUP_3, PLACEHOLDER_ART],
    video_youtube: '',
    origem_cadastro: 'make_canecas_studio_v12_catalogador_visual',
    tipo_produto: 'caneca_porcelana',
    geracao_status: 'concluido',
    geracao_etapa: 'firebase_salvo',
    geracao_versao: 'v12-catalogador-visual',
    catalogacao_origem: 'ia_analise_arte_final',
    catalogacao_validada: true,
    configuracao_arte: {
      modo: 'imagem_inspiracao',
      instrucao_complementar: text(instruction),
      instruction_priority: Boolean(text(instruction)),
      width: MASTER_WIDTH,
      height: MASTER_HEIGHT,
      dimensao_real: PRINT_LABEL,
      gerador: 'openai_make_v12_catalogador_visual'
    },
    criado_em: now,
    updated_at: now,
    last_update: Date.now(),
  });
}

function installStyles() {
  if (document.getElementById('mugV12Styles')) return;
  const style = document.createElement('style');
  style.id = 'mugV12Styles';
  style.textContent = `
    #mugAutomationPanel.mugv7{display:grid;gap:14px;padding:18px}.mugv7-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.mugv7-head h2{margin:3px 0 5px}.mugv7-head p{margin:0;color:#686c65;max-width:760px}.mugv7-main{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;align-items:stretch}.mugv7-upload,.mugv7-info{border:1px solid #e2e4de;border-radius:18px;padding:16px;background:#fff}.mugv7-upload{display:grid;gap:12px}.mugv7-drop{min-height:250px;border:2px dashed #cfd3ca;border-radius:16px;background:#fafbf8;display:grid;place-items:center;overflow:hidden;cursor:pointer;text-align:center;padding:14px}.mugv7-drop img{width:100%;height:100%;max-height:330px;object-fit:contain}.mugv7-drop strong{display:block;font-size:18px}.mugv7-drop small{display:block;margin-top:5px;color:#71756e}.mugv7-instruction{display:grid;gap:6px}.mugv7-instruction textarea{width:100%;box-sizing:border-box;min-height:90px;resize:vertical;border:1px solid #ccd0c8;border-radius:12px;padding:11px;background:#fff;font:inherit}.mugv7-instruction small{color:#6e726b}.mugv7-info{display:flex;flex-direction:column;justify-content:center;gap:12px}.mugv7-info h3{margin:0}.mugv7-info ul{margin:0;padding-left:20px;color:#62665f;display:grid;gap:7px}.mugv7-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mugv7-status{font-weight:700}.mugv7-settings{border-top:1px solid #eceee9;padding-top:10px}.mugv7-settings summary{cursor:pointer;font-weight:700}.mugv7-settings-grid{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:10px}.mugv7-settings input,.mugv7-settings select{width:100%;box-sizing:border-box;border:1px solid #ccd0c8;border-radius:10px;padding:10px;background:#fff}.mugv7-result{display:grid;grid-template-columns:2fr repeat(3,minmax(0,1fr));gap:10px}.mugv7-result figure{margin:0}.mugv7-result img{width:100%;border:1px solid #ddd;border-radius:14px;display:block;background:#f7f7f5}.mugv7-result .art img{aspect-ratio:${MASTER_WIDTH}/${MASTER_HEIGHT};object-fit:contain}.mugv7-result .mock img{aspect-ratio:1;object-fit:contain}.mugv7-result figcaption{font-size:12px;margin-top:5px;color:#666}.mugv12-catalog{grid-column:1/-1;border:1px solid #e1e4dc;border-radius:14px;padding:12px;background:#fbfcf9;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mugv12-catalog div{font-size:11px}.mugv12-catalog strong{display:block;font-size:10px;text-transform:uppercase;color:#777;margin-bottom:2px}@media(max-width:760px){#mugAutomationPanel.mugv7{padding:10px}.mugv7-main{grid-template-columns:1fr}.mugv7-drop{min-height:200px}.mugv7-info{display:none}.mugv7-settings-grid{grid-template-columns:1fr}.mugv7-result{grid-template-columns:1fr 1fr}.mugv7-result .art{grid-column:1/-1}.mugv7-head .badge{display:none}.mugv12-catalog{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function renderResult(container, master, finalResult, catalog) {
  container.innerHTML = `<div class="mugv7-result">
    <figure class="art"><img src="${escapeHtml(master)}" alt="Arte horizontal"><figcaption>${escapeHtml(catalog.nome)} · ${MASTER_WIDTH}×${MASTER_HEIGHT}px · ${PRINT_LABEL}</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_1_url || '')}" alt="Mockup lado esquerdo"><figcaption>Mockup · lado esquerdo</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_2_url || '')}" alt="Mockup lado direito"><figcaption>Mockup · lado direito</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_3_url || '')}" alt="Mockup centro"><figcaption>Mockup · centro da arte</figcaption></figure>
    <div class="mugv12-catalog"><div><strong>Tema</strong>${escapeHtml(catalog.tema)}</div><div><strong>Subcategoria</strong>${escapeHtml(catalog.subcategoria)}</div><div><strong>Confiança</strong>${Math.round(catalog.confianca_tema * 100)}%</div><div><strong>Nome</strong>${escapeHtml(catalog.nome)}</div><div><strong>Tags</strong>${escapeHtml(catalog.tags.join(', '))}</div><div><strong>Descrição</strong>${escapeHtml(catalog.descricao)}</div></div>
  </div>`;
  container.hidden = false;
}

async function generate(panel) {
  const file = panel.querySelector('#mugv7Image')?.files?.[0];
  const hook = text(panel.querySelector('#mugv7Webhook')?.value);
  const instruction = text(panel.querySelector('#mugv7Instruction')?.value);
  const quality = panel.querySelector('#mugv7Quality')?.value || 'high';
  const button = panel.querySelector('#mugv7Generate');
  const status = panel.querySelector('#mugAutomationStatus');
  const resultBox = panel.querySelector('#mugv7Result');
  const config = loadConfig();
  if (!file) { status.textContent = 'Escolha uma imagem de inspiração.'; return; }
  if (!hook) { status.textContent = 'Configure o webhook do Make em Configuração.'; return; }
  if (!text(config.firebaseUrl)) { status.textContent = 'Firebase não está configurado.'; return; }
  button.disabled = true;
  resultBox.hidden = true;
  const id = requestId();
  try {
    status.textContent = '1/6 · Preparando imagem de inspiração...';
    const reference = await normalizeReference(file);
    status.textContent = instruction ? '2/6 · Criando arte com os comandos selecionados...' : '2/6 · Criando a nova arte...';
    const artResult = await callMake(hook, {
      action: 'generate_mug_art', request_id: id, image_base64: reference,
      instruction, prompt_art: buildArtPrompt(instruction), quality,
    });
    const artSource = text(artResult.art_source_url || artResult.result_url);
    if (!artSource) throw new Error('O Make não devolveu a arte gerada.');

    status.textContent = `3/6 · Fechando ${MASTER_WIDTH}×${MASTER_HEIGHT} e catalogando somente a arte final...`;
    const master = await cropMaster(artSource);
    const catalog = await analyzeCatalog(hook, id, master);

    status.textContent = '4/6 · Preparando as três vistas da arte...';
    const [leftReference, rightReference, centerReference] = await Promise.all([
      buildSideReference(master, 1), buildSideReference(master, 2), buildCenterReference(master),
    ]);
    const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
    const node = text(config.productsNode || DEFAULT_CONFIG.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '') || 'produtos';

    status.textContent = '5/6 · Gerando os três mockups...';
    const finalResult = await callMake(hook, {
      action: 'finalize_mug_product', request_id: id, image_base64: master,
      mockup_left_base64: leftReference, mockup_right_base64: rightReference, mockup_center_base64: centerReference,
      instruction, product_name: catalog.nome,
      prompt_mockup_1: buildMockupPrompt(1), prompt_mockup_2: buildMockupPrompt(2), prompt_mockup_3: buildMockupPrompt(3),
      quality: 'high', firebase_url: base, products_node: node,
      firebase_template_json: firebaseTemplate(id, instruction, catalog),
    });
    status.textContent = '6/6 · Confirmando cadastro completo...';
    if (finalResult.product_saved !== true || !text(finalResult.mockup_1_url) || !text(finalResult.mockup_2_url) || !text(finalResult.mockup_3_url)) {
      throw new Error('O Make terminou sem confirmar o cadastro completo da caneca.');
    }
    renderResult(resultBox, master, finalResult, catalog);
    status.textContent = `Concluído · ${catalog.nome} cadastrada por R$ 24,90 como inativa.`;
    window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated', { detail: { source: BUILD, key: finalResult.firebase_key || id } }));
  } catch (error) {
    console.error('Falha no Criador de Canecas V12:', error);
    status.textContent = `Erro: ${error?.message || error}`;
  } finally {
    button.disabled = false;
  }
}

function renderPanel(panel) {
  installStyles();
  delete panel.dataset.commandLibraryBuild;
  panel.className = 'mug-automation-panel mugv7';
  panel.dataset.mugV12 = BUILD;
  panel.innerHTML = `
    <div class="mugv7-head"><div><span class="eyebrow">Criador de Canecas V12</span><h2>Arte → catalogação visual → 3 mockups</h2><p>Os comandos servem somente para criar a arte. Depois, uma IA separada analisa exclusivamente a arte final e monta os dados comerciais do produto.</p></div><span class="badge warning">Cadastro inativo</span></div>
    <div class="mugv7-main">
      <section class="mugv7-upload"><label class="mugv7-drop" for="mugv7Image"><div id="mugv7Empty"><strong>Escolher imagem</strong><small>PNG, JPG ou WEBP · referência visual</small></div><img id="mugv7Preview" alt="Imagem de inspiração" hidden></label><input id="mugv7Image" type="file" accept="image/*" hidden><label class="mugv7-instruction"><strong>Instrução complementar <span class="muted">(opcional)</span></strong><textarea id="mugv7Instruction" maxlength="500" placeholder="Ex.: escreva exatamente ‘Eis-me aqui Senhor.’; use tons de azul..."></textarea><small>Esta instrução e os comandos salvos influenciam apenas a criação da arte; nunca são usados como nome ou tema do produto.</small></label><div class="mugv7-actions"><button class="button primary" id="mugv7Generate" type="button">Gerar caneca</button><button class="button secondary" id="mugv7Clear" type="button">Trocar imagem</button><span id="mugAutomationStatus" class="mugv7-status"></span></div></section>
      <section class="mugv7-info"><h3>Fluxo V12</h3><ul><li>cria a arte horizontal;</li><li>fecha a arte final em ${MASTER_WIDTH}×${MASTER_HEIGHT}px;</li><li>catalogador visual analisa somente essa arte;</li><li>preenche tema, nome, subcategoria, descrição, tags e SEO;</li><li>validador bloqueia textos internos da automação;</li><li>gera os 3 mockups;</li><li>salva no Firebase como ${MUG_CATEGORY}, inativa, por R$ 24,90.</li></ul><details class="mugv7-settings"><summary>Configuração</summary><div class="mugv7-settings-grid"><label>Webhook Make<input id="mugv7Webhook" type="url" placeholder="https://hook.eu1.make.com/..."></label><label>Qualidade da arte<select id="mugv7Quality"><option value="high" selected>Alta</option><option value="medium">Média</option><option value="low">Teste</option></select></label></div></details></section>
    </div><div id="mugv7Result" hidden></div>`;

  const input = panel.querySelector('#mugv7Image');
  const preview = panel.querySelector('#mugv7Preview');
  const empty = panel.querySelector('#mugv7Empty');
  const webhook = panel.querySelector('#mugv7Webhook');
  webhook.value = localStorage.getItem(WEBHOOK_KEY) || '';
  webhook.addEventListener('change', () => localStorage.setItem(WEBHOOK_KEY, text(webhook.value)));
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) { preview.hidden = true; empty.hidden = false; return; }
    if (!file.type.startsWith('image/')) { input.value = ''; return; }
    preview.src = URL.createObjectURL(file); preview.hidden = false; empty.hidden = true;
    panel.querySelector('#mugAutomationStatus').textContent = '';
  });
  panel.querySelector('#mugv7Clear').addEventListener('click', () => {
    input.value = ''; preview.removeAttribute('src'); preview.hidden = true; empty.hidden = false;
    panel.querySelector('#mugv7Instruction').value = ''; panel.querySelector('#mugv7Result').hidden = true;
  });
  panel.querySelector('#mugv7Generate').addEventListener('click', () => generate(panel));
}

function install() {
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel) return false;
  if (panel.dataset.mugV12 === BUILD && panel.querySelector('#mugv7Generate')) return true;
  renderPanel(panel);
  return true;
}

function activate() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  if (!install()) setTimeout(activate, 80);
}

window.addEventListener('admin-v2-route-ready', event => { if (event.detail?.route === 'mug-studio') setTimeout(activate, 0); });
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'mug-studio') setTimeout(activate, 0); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true });
else setTimeout(activate, 0);

export { install, generate, cropMaster, validateCatalog, parseCatalogPayload };