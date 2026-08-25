import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';
import './mug-studio-gallery.js?admin_build=20260824-mug-gallery-v3';

const BUILD = '20260825-canecas-studio-v11-make-name-fallback';
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

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
  return canvas.toDataURL('image/webp', 0.94);
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
  if (!extra) {
    return `INSTRUÇÃO COMPLEMENTAR DO OPERADOR: nenhuma.\nUse seu julgamento artístico profissional dentro das regras abaixo.`;
  }
  return `PRIORIDADE MÁXIMA — INSTRUÇÃO COMPLEMENTAR DO OPERADOR:\n${extra}\n\nREGRAS OBRIGATÓRIAS PARA A INSTRUÇÃO DO OPERADOR:\n- esta instrução prevalece sobre qualquer orientação genérica abaixo que possa entrar em conflito com ela;\n- cumpra todos os detalhes solicitados pelo operador, não apenas o tema geral;\n- se o operador pedir uma frase, nome, palavra, data ou qualquer outro texto, esse texto é OBRIGATÓRIO na arte;\n- reproduza o texto solicitado exatamente como foi digitado, preservando palavras, acentos, pontuação, maiúsculas e minúsculas;\n- não resuma, não traduza, não corrija, não substitua e não parafraseie o texto solicitado;\n- texto fornecido pelo operador NÃO é texto inventado e deve ser tratado como conteúdo autorizado;\n- posicione o texto solicitado de forma legível, bonita e integrada à composição;\n- antes de concluir, confira visualmente que a instrução foi realmente cumprida.`;
}

function buildArtPrompt(instruction = '') {
  const extra = text(instruction);
  return `Analise cuidadosamente a imagem enviada como REFERÊNCIA E INSPIRAÇÃO e crie uma NOVA ARTE COMERCIAL PARA CANECA.

${buildOperatorInstructionBlock(extra)}

OBJETIVO:
- produza somente a arte plana de impressão, nunca um mockup;
- a arte final será fechada em ${MASTER_WIDTH}×${MASTER_HEIGHT}px, correspondente aproximadamente a ${PRINT_LABEL};
- crie uma composição naturalmente horizontal, proporcional e equilibrada;
- faça os elementos principais ocuparem praticamente TODA a altura útil da impressão, com apenas pequenas margens de segurança em cima e embaixo;
- não deixe o desenho espremido em uma faixa baixa no centro;
- não estique, não achate e não distorça personagens, objetos ou ornamentos;
- interprete com inteligência tema, estilo, paleta, clima e linguagem visual da referência;
- crie uma solução nova e comercial, inspirada na referência, sem simplesmente ampliar a imagem original;
- mantenha boa continuidade entre esquerda, centro e direita para envolver a caneca.

TEXTO:
- se a instrução complementar pedir texto, frase, nome, palavra ou data, inclua esse conteúdo literalmente e trate-o como requisito obrigatório;
- a regra de evitar texto só vale quando o operador NÃO pediu texto;
- se o operador não pediu texto e houver texto essencial e perfeitamente legível na referência, preserve apenas o que fizer sentido;
- quando não houver texto solicitado nem texto essencial confiável na referência, prefira não adicionar texto;
- nunca invente palavras extras além do que foi fornecido pelo operador ou estiver claramente legível na referência.

RESTRIÇÕES:
- não mostrar caneca, mãos, mesa, cenário, embalagem ou fotografia de produto;
- não criar marca-d'água, assinatura ou elementos de interface;
- não cortar rostos ou elementos centrais importantes.

CHECKLIST FINAL ANTES DE GERAR:
- a instrução complementar foi atendida integralmente? ${extra ? 'SIM, ela é obrigatória.' : 'Não há instrução adicional.'}
- se a instrução pediu texto, ele aparece completo, correto, legível e exatamente como digitado?;
- não omita a frase apenas porque ela não existe na imagem de referência.

ENTREGA:
Uma arte horizontal única, sofisticada, harmoniosa e pronta para sublimação.`;
}

function buildNamePrompt(instruction = '') {
  const extra = text(instruction);
  return `Analise visualmente a ARTE FINAL da caneca e identifique com precisão o TEMA CENTRAL para criar um nome comercial em português, específico, pesquisável e útil para catálogo/SEO.

FORMATO EXATO E OBRIGATÓRIO:
Caneca de Porcelana [tema específico da arte] - 350ml

REGRAS PARA O TEMA:
- a parte entre “Caneca de Porcelana” e “- 350ml” deve explicar claramente o assunto real da arte;
- identifique santo, devoção, profissão, hobby, ocasião, personagem, animal, estilo, frase/ideia central ou outro assunto dominante realmente visível;
- se houver uma frase, use no nome o tema/assunto que ela comunica, sem copiar uma frase longa inteira;
- prefira palavras que um cliente realmente usaria para procurar essa caneca;
- seja específico e objetivo; normalmente use de 2 a 8 palavras para o tema;
- nunca use apenas “Arte Exclusiva”, “Decorativa”, “Personalizada”, “Tema”, “Design” ou “Estampa” como tema;
- não invente marca, personagem, santo, profissão ou assunto que não esteja sustentado pela imagem;
- mantenha exatamente o prefixo “Caneca de Porcelana” e o sufixo “- 350ml”.

RESPONDA SOMENTE COM O NOME FINAL, sem explicações, aspas, JSON ou lista.
${extra ? `\nINSTRUÇÃO QUE ORIGINOU A ARTE E AJUDA A IDENTIFICAR O TEMA:\n${extra}` : ''}`;
}

function normalizeGeneratedName(value = '', instruction = '') {
  let middle = text(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, '')
    .replace(/^caneca\s+de\s+porcelana\s*/i, '')
    .replace(/\s*[-–—]\s*350\s*ml\s*$/i, '')
    .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!middle) {
    middle = text(instruction)
      .replace(/^(crie|faça|faca|gere|quero|usar|use)\s+/i, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  if (!middle) middle = 'Tema Visual da Arte';
  if (middle.length > 78) middle = middle.slice(0, 78).replace(/\s+\S*$/, '').trim();
  return `Caneca de Porcelana ${middle} - 350ml`;
}

function productThemeFromName(productName = '') {
  const theme = text(productName)
    .replace(/^caneca\s+de\s+porcelana\s*/i, '')
    .replace(/\s*[-–—]\s*350\s*ml\s*$/i, '')
    .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!theme) throw new Error('Não foi possível extrair o tema para a subcategoria da caneca.');
  return theme;
}

function buildProductDescription(productName = '') {
  const theme = productThemeFromName(productName);
  return `${productName}. Caneca de porcelana branca, com capacidade de 350ml, com arte temática de ${theme}. Ideal para quem se identifica com esse tema e também como opção de presente.`;
}

function buildMockupPrompt(side) {
  const orientation = side === 1
    ? 'Mostre a PRIMEIRA METADE / LADO ESQUERDO da arte centralizada na face visível da caneca. A alça deve aparecer preferencialmente à direita.'
    : side === 2
      ? 'Mostre a SEGUNDA METADE / LADO DIREITO da arte centralizada na face visível da caneca. A alça deve aparecer preferencialmente à esquerda.'
      : 'Mostre o CENTRO DA ARTE centralizado na face frontal da caneca. Use uma visão mais frontal; a alça pode ficar discretamente lateral ou escondida atrás, sem deslocar o centro da arte.';
  return `Use a arte fornecida como ARTE-MESTRE IMUTÁVEL. ${orientation}
Crie uma fotografia quadrada 1:1 ultra realista de uma caneca branca de porcelana 350 ml já sublimada com essa arte.
A impressão corresponde aproximadamente a ${PRINT_LABEL} e deve ocupar praticamente toda a altura útil da caneca, perto da borda superior e da borda inferior.
Não comprima a estampa numa faixa baixa no centro.
Preserve a proporção da arte: não estique e não achate verticalmente o desenho.
Aplique apenas a deformação cilíndrica natural necessária para parecer uma sublimação real.
Não redesenhe, não reescreva, não altere cores, não invente símbolos e não substitua elementos.
Fundo claro e simples. Caneca inteira visível. Sem mãos, café, caixas, plantas, flores, livros ou objetos extras. Resultado comercial 1024×1024.`;
}

function firebaseTemplate(id, instruction = '', generatedName = '', nameGeneratedByAi = false) {
  const now = new Date().toISOString();
  const suffix = id.slice(-6).toUpperCase();
  const productName = normalizeGeneratedName(generatedName, instruction);
  const productTheme = productThemeFromName(productName);
  const productDescription = buildProductDescription(productName);
  return JSON.stringify({
    id,
    firebaseKey: id,
    codigo: `CANP-${suffix}`,
    gtin: '',
    ean: '',
    codigo_barras: '',
    nome: productName,
    categoria: MUG_CATEGORY,
    subcategoria: productTheme,
    tema: productTheme,
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
    descricao: productDescription,
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
    origem_cadastro: 'make_canecas_studio_v11_make_name_fallback',
    tipo_produto: 'caneca_porcelana',
    geracao_status: 'concluido',
    geracao_etapa: 'firebase_salvo',
    geracao_versao: 'v11-make-name-fallback',
    nome_gerado_ia: Boolean(nameGeneratedByAi),
    nome_revisao_pendente: !nameGeneratedByAi,
    nome_origem: nameGeneratedByAi ? 'ia_make' : (text(instruction) ? 'fallback_instrucao' : 'fallback_visual'),
    configuracao_arte: { modo: 'imagem_inspiracao', instrucao_complementar: text(instruction), instruction_priority: Boolean(text(instruction)), width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: PRINT_LABEL, gerador: 'openai_make_v11_make_name_fallback' },
    criado_em: now,
    updated_at: now,
    last_update: Date.now(),
  });
}

function installStyles() {
  if (document.getElementById('mugV7Styles')) return;
  const style = document.createElement('style');
  style.id = 'mugV7Styles';
  style.textContent = `
    #mugAutomationPanel.mugv7{display:grid;gap:14px;padding:18px}.mugv7-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.mugv7-head h2{margin:3px 0 5px}.mugv7-head p{margin:0;color:#686c65;max-width:760px}.mugv7-main{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;align-items:stretch}.mugv7-upload{border:1px solid #e2e4de;border-radius:18px;padding:16px;background:#fff;display:grid;gap:12px}.mugv7-drop{min-height:250px;border:2px dashed #cfd3ca;border-radius:16px;background:#fafbf8;display:grid;place-items:center;overflow:hidden;cursor:pointer;text-align:center;padding:14px}.mugv7-drop img{width:100%;height:100%;max-height:330px;object-fit:contain}.mugv7-drop strong{display:block;font-size:18px}.mugv7-drop small{display:block;margin-top:5px;color:#71756e}.mugv7-instruction{display:grid;gap:6px}.mugv7-instruction textarea{width:100%;box-sizing:border-box;min-height:90px;resize:vertical;border:1px solid #ccd0c8;border-radius:12px;padding:11px;background:#fff;font:inherit}.mugv7-instruction small{color:#6e726b}.mugv7-info{border:1px solid #e2e4de;border-radius:18px;padding:16px;background:#fff;display:flex;flex-direction:column;justify-content:center;gap:12px}.mugv7-info h3{margin:0}.mugv7-info ul{margin:0;padding-left:20px;color:#62665f;display:grid;gap:7px}.mugv7-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mugv7-status{font-weight:700}.mugv7-settings{border-top:1px solid #eceee9;padding-top:10px}.mugv7-settings summary{cursor:pointer;font-weight:700}.mugv7-settings-grid{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:10px}.mugv7-settings input,.mugv7-settings select{width:100%;box-sizing:border-box;border:1px solid #ccd0c8;border-radius:10px;padding:10px;background:#fff}.mugv7-result{display:grid;grid-template-columns:2fr repeat(3,minmax(0,1fr));gap:10px}.mugv7-result figure{margin:0}.mugv7-result img{width:100%;border:1px solid #ddd;border-radius:14px;display:block;background:#f7f7f5}.mugv7-result .art img{aspect-ratio:${MASTER_WIDTH}/${MASTER_HEIGHT};object-fit:contain}.mugv7-result .mock img{aspect-ratio:1;object-fit:contain}.mugv7-result figcaption{font-size:12px;margin-top:5px;color:#666}@media(max-width:760px){#mugAutomationPanel.mugv7{padding:10px}.mugv7-main{grid-template-columns:1fr}.mugv7-drop{min-height:200px}.mugv7-info{display:none}.mugv7-settings-grid{grid-template-columns:1fr}.mugv7-result{grid-template-columns:1fr 1fr}.mugv7-result .art{grid-column:1/-1}.mugv7-head .badge{display:none}}`;
  document.head.appendChild(style);
}

function renderResult(container, master, finalResult, productName) {
  container.innerHTML = `<div class="mugv7-result">
    <figure class="art"><img src="${escapeHtml(master)}" alt="Arte horizontal"><figcaption>${escapeHtml(productName)} · ${MASTER_WIDTH}×${MASTER_HEIGHT}px · ${PRINT_LABEL}</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_1_url || '')}" alt="Mockup lado esquerdo"><figcaption>Mockup · lado esquerdo</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_2_url || '')}" alt="Mockup lado direito"><figcaption>Mockup · lado direito</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_3_url || '')}" alt="Mockup centro da arte"><figcaption>Mockup · centro da arte</figcaption></figure>
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
    status.textContent = '1/5 · Preparando imagem de inspiração...';
    const reference = await normalizeReference(file);
    status.textContent = instruction
      ? '2/5 · OpenAI criando a arte e aplicando sua instrução obrigatória...'
      : '2/5 · OpenAI criando a nova arte...';
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

    status.textContent = `3/5 · Preparando arte final ${MASTER_WIDTH}×${MASTER_HEIGHT} e criando nome...`;
    const master = await cropMaster(artSource);
    let aiName = '';
    try {
      const nameResult = await callMake(hook, {
        action: 'generate_mug_name',
        request_id: id,
        image_base64: master,
        instruction,
        prompt_name: buildNamePrompt(instruction),
      });
      aiName = text(nameResult.product_name || nameResult.name || nameResult.result);
    } catch (nameError) {
      console.warn('A IA não gerou o nome da caneca; usando fallback seguro.', nameError);
    }
    const productName = normalizeGeneratedName(aiName, instruction);
    const nameGeneratedByAi = Boolean(aiName);
    if (!nameGeneratedByAi) console.warn('Make não devolveu nome; cadastro seguirá com fallback seguro para revisão.');
    const leftReference = await buildSideReference(master, 1);
    const rightReference = await buildSideReference(master, 2);
    const centerReference = await buildCenterReference(master);
    const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
    const node = text(config.productsNode || DEFAULT_CONFIG.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '') || 'produtos';

    status.textContent = '4/5 · Gerando os três mockups em porcelana 350 ml...';
    const finalResult = await callMake(hook, {
      action: 'finalize_mug_product',
      request_id: id,
      image_base64: master,
      mockup_left_base64: leftReference,
      mockup_right_base64: rightReference,
      mockup_center_base64: centerReference,
      instruction,
      product_name: productName,
      prompt_mockup_1: buildMockupPrompt(1),
      prompt_mockup_2: buildMockupPrompt(2),
      prompt_mockup_3: buildMockupPrompt(3),
      quality: 'high',
      firebase_url: base,
      products_node: node,
      firebase_template_json: firebaseTemplate(id, instruction, productName, nameGeneratedByAi),
    });
    status.textContent = '5/5 · Confirmando cadastro da caneca...';
    if (finalResult.product_saved !== true || !text(finalResult.mockup_1_url) || !text(finalResult.mockup_2_url) || !text(finalResult.mockup_3_url)) {
      throw new Error('O Make terminou sem confirmar o cadastro completo da caneca.');
    }
    renderResult(resultBox, master, finalResult, productName);
    status.textContent = `Concluído · ${productName} cadastrada por R$ 24,90 como inativa.`;
    window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated', { detail: { source: BUILD, key: finalResult.firebase_key || id } }));
  } catch (error) {
    console.error('Falha no Criador de Canecas V7.5:', error);
    status.textContent = `Erro: ${error?.message || error}`;
  } finally {
    button.disabled = false;
  }
}

function renderPanel(panel) {
  installStyles();
  panel.className = 'mug-automation-panel mugv7';
  panel.innerHTML = `
    <div class="mugv7-head"><div><span class="eyebrow">Criador de Canecas V7.5</span><h2>Crie uma nova arte a partir de uma inspiração</h2><p>A IA cria a arte, gera um nome comercial baseado no resultado e cadastra como ${MUG_CATEGORY}, ${MUG_CAPACITY}, por R$ 24,90.</p></div><span class="badge warning">Cadastro inativo</span></div>
    <div class="mugv7-main">
      <section class="mugv7-upload"><label class="mugv7-drop" for="mugv7Image"><div id="mugv7Empty"><strong>Escolher imagem</strong><small>PNG, JPG ou WEBP · use uma referência do estilo desejado</small></div><img id="mugv7Preview" alt="Imagem de inspiração" hidden></label><input id="mugv7Image" type="file" accept="image/*" hidden><label class="mugv7-instruction"><strong>Instrução complementar <span class="muted">(opcional)</span></strong><textarea id="mugv7Instruction" maxlength="500" placeholder="Ex.: escreva exatamente ‘Eis-me aqui Senhor.’; use tons de azul; deixe as flores maiores..."></textarea><small>Se pedir uma frase, nome ou palavra, digite exatamente como deve aparecer na arte. A instrução complementar terá prioridade sobre as regras genéricas do gerador.</small></label><div class="mugv7-actions"><button class="button primary" id="mugv7Generate" type="button">Gerar caneca</button><button class="button secondary" id="mugv7Clear" type="button">Trocar imagem</button><span id="mugAutomationStatus" class="mugv7-status"></span></div></section>
      <section class="mugv7-info"><h3>O que a automação fará</h3><ul><li>interpretará a imagem e aplicará a instrução complementar como prioridade;</li><li>criará uma nova arte comercial para ${PRINT_LABEL};</li><li>gerará um nome comercial por IA no padrão “Caneca de Porcelana ... - 350ml”;</li><li>gerará três mockups: lado esquerdo, lado direito e centro da arte;</li><li>cadastrará por R$ 24,90 na categoria ${MUG_CATEGORY};</li><li>usará NCM ${MUG_NCM} e deixará EAN/GTIN vazio;</li><li>cadastrará a caneca no Firebase como inativa.</li></ul><details class="mugv7-settings"><summary>Configuração</summary><div class="mugv7-settings-grid"><label>Webhook Make<input id="mugv7Webhook" type="url" placeholder="https://hook.eu1.make.com/..."></label><label>Qualidade<select id="mugv7Quality"><option value="high" selected>Alta</option><option value="medium">Média</option><option value="low">Teste</option></select></label></div></details></section>
    </div>
    <div id="mugv7Result" hidden></div>`;

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
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    empty.hidden = true;
    panel.querySelector('#mugAutomationStatus').textContent = '';
  });
  panel.querySelector('#mugv7Clear').addEventListener('click', () => {
    input.value = '';
    preview.removeAttribute('src');
    preview.hidden = true;
    empty.hidden = false;
    panel.querySelector('#mugv7Instruction').value = '';
    panel.querySelector('#mugv7Result').hidden = true;
  });
  panel.querySelector('#mugv7Generate').addEventListener('click', () => generate(panel));
}

function install() {
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel) return false;
  if (panel.dataset.mugV7 === BUILD) return true;
  panel.dataset.mugV7 = BUILD;
  renderPanel(panel);
  return true;
}

function activate() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  if (!install()) setTimeout(activate, 80);
}

window.addEventListener('admin-v2-route-ready', event => { if (event.detail?.route === 'mug-studio') activate(); });
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'mug-studio') setTimeout(activate, 0); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true });
else setTimeout(activate, 0);

export { install, generate, cropMaster };
