import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';

const BUILD = '20260821-canecas-v5-controller';
const MASTER_WIDTH = 2300;
const MASTER_HEIGHT = 1000;
const PLACEHOLDER_ART = '__MUG_ART__';
const PLACEHOLDER_MOCKUP_1 = '__MUG_MOCKUP_1__';
const PLACEHOLDER_MOCKUP_2 = '__MUG_MOCKUP_2__';

const STYLE_OPTIONS = [
  ['minimalista', 'Minimalista'], ['moderna', 'Moderna'], ['elegante', 'Elegante'], ['fofa', 'Fofa'],
  ['religiosa', 'Religiosa'], ['divertida', 'Divertida'], ['romantica', 'Romântica'], ['masculina', 'Masculina'],
  ['feminina', 'Feminina'], ['neutra', 'Neutra'], ['infantil', 'Infantil'], ['profissional', 'Profissional'],
  ['vintage', 'Vintage'], ['colorida', 'Colorida'], ['preto_branco', 'Preto e branco'], ['com_nome', 'Com nome'],
  ['com_frase', 'Com frase'], ['com_ilustracao', 'Com ilustração'], ['arte_continua', 'Arte contínua 360°'],
  ['arte_centralizada', 'Arte centralizada'], ['fundo_claro', 'Fundo claro'], ['alto_contraste', 'Alto contraste'],
];

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function titleCase(value) {
  return text(value).toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s\-/])([\p{L}\p{N}])/gu, (_, prefix, char) => `${prefix}${char.toLocaleUpperCase('pt-BR')}`);
}

function parseTags(value) {
  return [...new Set(String(value || '').split(/[,;|]/).map(item => text(item)).filter(Boolean))];
}

function classifyTheme(value) {
  const theme = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rules = [
    ['Religiosas', ['jesus', 'maria', 'nossa senhora', 'santo', 'santa', 'sao ', 'deus', 'fe', 'oracao', 'catolic', 'espirito santo', 'pentecost']],
    ['Profissões', ['advog', 'medic', 'enferm', 'professor', 'dentist', 'engenheir', 'contador', 'policial', 'veterin', 'arquit']],
    ['Família', ['mae', 'pai', 'avo', 'avó', 'familia', 'filho', 'filha', 'irmao', 'irma', 'tio', 'tia']],
    ['Românticas', ['amor', 'namor', 'casal', 'casamento', 'marido', 'esposa', 'noivo', 'noiva']],
    ['Pets', ['gato', 'gata', 'cachorro', 'cadela', 'pet', 'pug', 'golden', 'shih', 'bulldog']],
    ['Humor', ['humor', 'engrac', 'meme', 'piada', 'sarcas', 'ironia']],
    ['Esportes e Fitness', ['futebol', 'time', 'crossfit', 'academia', 'corrida', 'ciclismo', 'esporte', 'gym']],
    ['Datas Comemorativas', ['natal', 'pascoa', 'anivers', 'dia das', 'formatura', 'festa junina', 'ano novo']],
    ['Motivacionais', ['motiv', 'gratidao', 'coragem', 'forca', 'foco', 'superacao', 'inspir']],
    ['Geek e Games', ['anime', 'game', 'gamer', 'nerd', 'rpg', 'manga', 'geek']],
    ['Música', ['musica', 'cantor', 'cantora', 'banda', 'rock', 'sertanejo', 'pagode']],
  ];
  return rules.find(([, terms]) => terms.some(term => theme.includes(term)))?.[0] || 'Criativas';
}

function selectedParameters(panel) {
  return Object.fromEntries(STYLE_OPTIONS.map(([key]) => [key, Boolean(panel.querySelector(`[data-mug-param="${key}"]`)?.checked)]));
}

function activeParameterLabels(params) {
  return STYLE_OPTIONS.filter(([key]) => params[key]).map(([, label]) => label);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem de referência.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error('Tempo esgotado ao abrir a imagem.')), timeoutMs);
    if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Imagem ainda não disponível.')); };
    image.src = source;
  });
}

async function loadImageWithRetry(source, attempts = 8) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const separator = source.includes('?') ? '&' : '?';
      return await loadImage(`${source}${separator}_mug_v5=${Date.now()}-${attempt}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error(`A arte foi gerada, mas ainda não ficou disponível para o recorte. ${lastError?.message || ''}`.trim());
}

async function normalizedReferenceDataUrl(file) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 1024;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (file) {
    const image = await loadImage(await fileToDataUrl(file));
    const scale = Math.min(1320 / image.naturalWidth, 880 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  return canvas.toDataURL('image/webp', 0.92);
}

async function cropMasterArt(sourceUrl) {
  const image = await loadImageWithRetry(sourceUrl);
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = MASTER_WIDTH / MASTER_HEIGHT;
  let sx = 0; let sy = 0; let sw = image.naturalWidth; let sh = image.naturalHeight;
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
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, MASTER_WIDTH, MASTER_HEIGHT);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, MASTER_WIDTH, MASTER_HEIGHT);
  return canvas.toDataURL('image/webp', 0.94);
}

function buildArtPrompt(data) {
  const params = activeParameterLabels(data.parametros);
  const exactText = [data.frase_principal, data.frase_secundaria].filter(Boolean);
  return `CRIE SOMENTE A ARTE PLANA PARA SUBLIMAÇÃO DE CANECA. NÃO desenhe caneca, mockup, mãos, mesa, cenário ou fotografia de produto.\n\nFORMATO E CORTE:\n- Gere uma composição horizontal em 1536x1024.\n- Toda informação essencial precisa ficar dentro de uma faixa horizontal CENTRAL de proporção 2.3:1.\n- Essa faixa será recortada automaticamente para 2300x1000. Mantenha margem interna de segurança de pelo menos 8%.\n- Não coloque texto nem elementos essenciais acima ou abaixo dessa faixa.\n- A arte deve funcionar como estampa contínua para envolver uma caneca branca de cerâmica.\n\nCONTEÚDO:\nTema: ${data.tema}\nNome/contexto: ${data.nome}\nFrase principal: ${data.frase_principal || 'sem frase obrigatória'}\nFrase secundária: ${data.frase_secundaria || 'sem frase secundária'}\nDescrição livre: ${data.descricao_livre || 'crie uma composição comercialmente atraente e original'}\nPúblico-alvo: ${data.publico_alvo || 'geral'}\nEstilo: ${data.estilo_arte || 'livre e coerente com o tema'}\nPaleta: ${data.paleta_cores || 'harmônica e adequada ao tema'}\nTipografia: ${data.tipografia || 'legível e coerente'}\nElementos obrigatórios: ${data.elementos_obrigatorios || 'nenhum além do tema'}\nElementos proibidos: ${data.elementos_proibidos || 'nenhum adicional'}\nParâmetros selecionados: ${params.length ? params.join(', ') : 'nenhum'}\n\n${exactText.length ? `TEXTO OBRIGATÓRIO: reproduza EXATAMENTE ${exactText.map(value => `“${value}”`).join(' e ')}.` : 'Não inclua texto aleatório.'}\n\nSe houver imagem de referência, use-a como referência visual conforme a descrição. Não inclua marcas-d'água, assinaturas ou logotipos não solicitados. Resultado limpo, nítido e pronto para impressão.`;
}

function buildMockupPrompt(data, side) {
  const orientation = side === 1
    ? 'Vista 1: ângulo de 3/4, alça preferencialmente à direita, mostrando claramente a primeira metade visual da estampa.'
    : 'Vista 2: caneca girada para o lado oposto, alça preferencialmente à esquerda, mostrando claramente a outra metade da mesma estampa.';
  return `Use a imagem fornecida como ARTE-MESTRE IMUTÁVEL. Crie UMA fotografia quadrada 1:1 de e-commerce de uma caneca branca de cerâmica 325 ml. ${orientation}\nAplique exatamente a arte fornecida na superfície curva como sublimação contínua. NÃO redesenhe a arte, NÃO altere textos, NÃO troque cores, NÃO invente símbolos e NÃO substitua elementos. Apenas faça a deformação/perspectiva necessária para parecer impressa na caneca. Fundo branco puro, iluminação suave de estúdio, caneca inteira visível, sem mãos, caixas, objetos extras, texto fora da caneca, logotipo ou marca-d'água. Mockup comercial realista 1024x1024. Tema: ${data.tema}.`;
}

async function callMake(hook, payload) {
  const response = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(payload) }),
  });
  const rawText = await response.text();
  let result = {};
  try { result = rawText ? JSON.parse(rawText) : {}; }
  catch { throw new Error(`Make respondeu algo que não é JSON (${response.status}).`); }
  if (!response.ok || result.ok === false) throw new Error(result.error || result.message || `Make respondeu HTTP ${response.status}.`);
  return result;
}

function firebaseTemplate(data) {
  const now = new Date().toISOString();
  return JSON.stringify({
    id: data.request_id,
    firebaseKey: data.request_id,
    codigo: data.codigo,
    nome: data.nome,
    categoria: 'Canecas',
    subcategoria: data.subcategoria,
    subsubcategoria: data.tema,
    preco_custo: 10,
    preco: 19.90,
    estoque: 0,
    situacao: 'I',
    ativo: false,
    material: 'Cerâmica',
    capacidade: '325 ml',
    embalagem: 'Caneca de cerâmica 325 ml',
    unidade: 'UN',
    descricao: data.descricao_produto || `Caneca branca de cerâmica 325 ml com arte temática ${data.tema}. Produto cadastrado automaticamente para revisão antes da publicação.`,
    tags: parseTags(data.tags),
    url_imagem: PLACEHOLDER_MOCKUP_1,
    imagem: PLACEHOLDER_MOCKUP_1,
    imagem_url: PLACEHOLDER_MOCKUP_1,
    imagens: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2],
    imagens_site: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2],
    mockup_1: PLACEHOLDER_MOCKUP_1,
    mockup_2: PLACEHOLDER_MOCKUP_2,
    arte_personalizacao: PLACEHOLDER_ART,
    arte_horizontal: PLACEHOLDER_ART,
    arte_impressao: { url: PLACEHOLDER_ART, ratio: '2.3:1', width: MASTER_WIDTH, height: MASTER_HEIGHT, formato: 'webp' },
    midias_admin: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_ART],
    video_youtube: '',
    origem_cadastro: 'make_canecas_admin_studio_v5',
    tipo_produto: 'caneca_personalizavel',
    tema_caneca: data.tema,
    frase_caneca: data.frase_principal || '',
    frase_secundaria_caneca: data.frase_secundaria || '',
    configuracao_arte: {
      descricao_livre: data.descricao_livre,
      paleta_cores: data.paleta_cores,
      tipografia: data.tipografia,
      estilo_arte: data.estilo_arte,
      publico_alvo: data.publico_alvo,
      elementos_obrigatorios: data.elementos_obrigatorios,
      elementos_proibidos: data.elementos_proibidos,
      parametros: data.parametros,
      gerador: 'openai_nativo_make_v5',
    },
    geracao_status: 'concluido',
    geracao_etapa: 'firebase_salvo',
    geracao_versao: 'v5',
    criado_em: now,
    updated_at: now,
    last_update: Date.now(),
  });
}

function collectData(panel, referenceFile) {
  const theme = text(panel.querySelector('#mugTheme')?.value);
  const requestId = `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const automaticName = `Caneca ${titleCase(theme).slice(0, 62)} em Cerâmica 325 ml`;
  return {
    request_id: requestId,
    codigo: requestId.replace(/^mug-/, 'CAN-').replace(/-/g, '').slice(0, 20).toUpperCase(),
    tema: theme,
    nome: text(panel.querySelector('#mugName')?.value) || automaticName,
    frase_principal: text(panel.querySelector('#mugPhrase')?.value),
    frase_secundaria: text(panel.querySelector('#mugPhrase2')?.value),
    descricao_livre: text(panel.querySelector('#mugDescription')?.value),
    subcategoria: text(panel.querySelector('#mugSubcategory')?.value) || classifyTheme(theme),
    tags: text(panel.querySelector('#mugTags')?.value),
    estilo_arte: text(panel.querySelector('#mugStyle')?.value),
    paleta_cores: text(panel.querySelector('#mugPalette')?.value),
    tipografia: text(panel.querySelector('#mugTypography')?.value),
    publico_alvo: text(panel.querySelector('#mugAudience')?.value),
    elementos_obrigatorios: text(panel.querySelector('#mugRequired')?.value),
    elementos_proibidos: text(panel.querySelector('#mugForbidden')?.value),
    parametros: selectedParameters(panel),
    quality: text(panel.querySelector('#mugQuality')?.value) || 'medium',
    has_reference: Boolean(referenceFile),
  };
}

async function generateV5(panel) {
  const button = panel.querySelector('#mugGenerateButton');
  const status = panel.querySelector('#mugAutomationStatus');
  const resultBox = panel.querySelector('#mugResult');
  const hook = text(panel.querySelector('#mugWebhook')?.value);
  const referenceInput = panel.querySelector('#mugReference');
  const referenceFile = referenceInput?.files?.[0] || null;
  const data = collectData(panel, referenceFile);
  const config = loadConfig();

  if (!data.tema) return void (status.textContent = 'Informe o tema principal.');
  if (!hook) return void (status.textContent = 'Cole o webhook do cenário Make V5.');
  if (!text(config.firebaseUrl)) return void (status.textContent = 'Firebase não está configurado no Admin.');

  button.disabled = true;
  resultBox.hidden = true;
  try {
    status.textContent = '1/4 · Preparando referência e enviando para o Make...';
    const referenceData = await normalizedReferenceDataUrl(referenceFile);

    status.textContent = '2/4 · OpenAI está criando a arte horizontal...';
    const artResult = await callMake(hook, {
      action: 'generate_mug_art',
      request_id: data.request_id,
      image_base64: referenceData,
      prompt_art: buildArtPrompt(data),
      quality: data.quality,
    });
    const artSourceUrl = text(artResult.art_source_url || artResult.arte_url || artResult.image_url || artResult.url);
    if (!artSourceUrl) throw new Error('O Make V5 não retornou art_source_url.');

    status.textContent = '3/4 · Preparando arte final exata em 2300×1000...';
    const finalArtData = await cropMasterArt(artSourceUrl);

    status.textContent = '4/4 · Make está gerando 2 mockups, salvando imagens e cadastrando no Firebase...';
    const finalizeResult = await callMake(hook, {
      action: 'finalize_mug_product',
      request_id: data.request_id,
      image_base64: finalArtData,
      prompt_mockup_1: buildMockupPrompt(data, 1),
      prompt_mockup_2: buildMockupPrompt(data, 2),
      quality: data.quality,
      firebase_url: text(config.firebaseUrl).replace(/\/+$/, ''),
      products_node: text(config.productsNode || DEFAULT_CONFIG.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, ''),
      firebase_template_json: firebaseTemplate(data),
    });

    const artUrl = text(finalizeResult.arte_horizontal_url || finalizeResult.art_url);
    const mockup1 = text(finalizeResult.mockup_1_url || finalizeResult.mockup1_url);
    const mockup2 = text(finalizeResult.mockup_2_url || finalizeResult.mockup2_url);
    if (!artUrl || !mockup1 || !mockup2 || finalizeResult.product_saved !== true) {
      throw new Error('O Make terminou sem confirmar as 3 imagens e o cadastro do produto.');
    }

    resultBox.hidden = false;
    resultBox.innerHTML = `<strong>${escapeHtml(data.nome)}</strong><span>cadastrado como INATIVO · ${escapeHtml(data.subcategoria)}</span><div class="mug-result-media"><figure><img src="${escapeAttribute(mockup1)}" alt="Mockup 1"><figcaption>Mockup 1 · site</figcaption></figure><figure><img src="${escapeAttribute(mockup2)}" alt="Mockup 2"><figcaption>Mockup 2 · site</figcaption></figure><figure class="mug-art-preview"><img src="${escapeAttribute(artUrl)}" alt="Arte horizontal"><figcaption>Arte 2300×1000 · produção</figcaption></figure></div>`;
    status.textContent = 'Concluído. Make gerou os mockups e salvou o produto como inativo no Firebase.';
    window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated', { detail: { key: data.request_id, source: BUILD } }));
  } catch (error) {
    console.error('Falha no Estúdio de Canecas V5:', error);
    status.textContent = `Erro: ${error?.message || error}`;
  } finally {
    button.disabled = false;
  }
}

function install() {
  if (window.__daMugStudioV5Controller === BUILD) return;
  window.__daMugStudioV5Controller = BUILD;

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#mugGenerateButton');
    if (!button) return;
    const panel = button.closest('#mugAutomationPanel');
    if (!panel) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    generateV5(panel);
  }, true);

  const prepare = () => {
    const panel = document.getElementById('mugAutomationPanel');
    if (!panel) return;
    const button = panel.querySelector('#mugGenerateButton');
    if (button) button.textContent = 'Gerar arte + finalizar no Make';
    const title = panel.querySelector('.mug-auto-title p');
    if (title) title.textContent = '1 arte horizontal → recorte 2300×1000 → Make gera 2 mockups → Make cadastra o produto inativo no Firebase.';
    const fixed = panel.querySelector('.mug-fixed-values span');
    if (fixed) fixed.textContent = 'Finalização no Make V5 · 2 mockups + arte de impressão · cadastro Firebase inativo.';
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepare, { once: true });
  else prepare();
  window.addEventListener('admin-v2-route-ready', event => { if (event.detail?.route === 'mug-studio') prepare(); });
}

install();

export { generateV5, firebaseTemplate };
