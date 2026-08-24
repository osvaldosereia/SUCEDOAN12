import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';
import './mug-studio-gallery.js?admin_build=20260823-mug-v7-gallery';

const BUILD = '20260824-canecas-studio-v7-3';
const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
const MASTER_WIDTH = 2400;
const MASTER_HEIGHT = 960;
const PRINT_LABEL = '24 × 9,5 cm';
const SIDE_WIDTH = 1344;
const PLACEHOLDER_ART = '__MUG_ART__';
const PLACEHOLDER_MOCKUP_1 = '__MUG_MOCKUP_1__';
const PLACEHOLDER_MOCKUP_2 = '__MUG_MOCKUP_2__';

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

function buildMockupPrompt(side) {
  const orientation = side === 1
    ? 'Mostre a PRIMEIRA METADE / LADO ESQUERDO da arte centralizada na face visível da caneca. A alça deve aparecer preferencialmente à direita.'
    : 'Mostre a SEGUNDA METADE / LADO DIREITO da arte centralizada na face visível da caneca. A alça deve aparecer preferencialmente à esquerda.';
  return `Use a arte fornecida como ARTE-MESTRE IMUTÁVEL. ${orientation}
Crie uma fotografia quadrada 1:1 ultra realista de uma caneca branca de cerâmica 325 ml já sublimada com essa arte.
A impressão corresponde aproximadamente a ${PRINT_LABEL} e deve ocupar praticamente toda a altura útil da caneca, perto da borda superior e da borda inferior.
Não comprima a estampa numa faixa baixa no centro.
Preserve a proporção da arte: não estique e não achate verticalmente o desenho.
Aplique apenas a deformação cilíndrica natural necessária para parecer uma sublimação real.
Não redesenhe, não reescreva, não altere cores, não invente símbolos e não substitua elementos.
Fundo claro e simples. Caneca inteira visível. Sem mãos, café, caixas, plantas, flores, livros ou objetos extras. Resultado comercial 1024×1024.`;
}

function firebaseTemplate(id, instruction = '') {
  const now = new Date().toISOString();
  const suffix = id.slice(-6).toUpperCase();
  return JSON.stringify({
    id,
    firebaseKey: id,
    codigo: `CAN-${suffix}`,
    nome: `Caneca Decorativa Exclusiva ${suffix}`,
    categoria: 'Canecas',
    subcategoria: 'Decorativas',
    subsubcategoria: 'Artes exclusivas',
    preco_custo: 10,
    preco: 19.90,
    estoque: 0,
    situacao: 'I',
    ativo: false,
    material: 'Cerâmica',
    capacidade: '325 ml',
    embalagem: 'Caneca de cerâmica 325 ml',
    unidade: 'UN',
    dimensao_impressao: PRINT_LABEL,
    descricao: `Caneca branca de cerâmica 325 ml com arte exclusiva criada a partir de uma referência visual. Área de impressão aproximada: ${PRINT_LABEL}.`,
    url_imagem: PLACEHOLDER_MOCKUP_1,
    imagem: PLACEHOLDER_MOCKUP_1,
    imagem_url: PLACEHOLDER_MOCKUP_1,
    imagens: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2],
    imagens_site: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2],
    mockup_1: PLACEHOLDER_MOCKUP_1,
    mockup_2: PLACEHOLDER_MOCKUP_2,
    arte_personalizacao: PLACEHOLDER_ART,
    arte_horizontal: PLACEHOLDER_ART,
    arte_impressao: { url: PLACEHOLDER_ART, ratio: `${MASTER_WIDTH}:${MASTER_HEIGHT}`, width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: PRINT_LABEL, formato: 'webp' },
    midias_admin: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_ART],
    video_youtube: '',
    origem_cadastro: 'make_canecas_studio_v7_3',
    tipo_produto: 'caneca_decorativa',
    geracao_status: 'concluido',
    geracao_etapa: 'firebase_salvo',
    geracao_versao: 'v7.3',
    configuracao_arte: { modo: 'imagem_inspiracao', instrucao_complementar: text(instruction), instruction_priority: Boolean(text(instruction)), width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: PRINT_LABEL, gerador: 'openai_make_v7_3' },
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
    #mugAutomationPanel.mugv7{display:grid;gap:14px;padding:18px}.mugv7-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.mugv7-head h2{margin:3px 0 5px}.mugv7-head p{margin:0;color:#686c65;max-width:760px}.mugv7-main{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;align-items:stretch}.mugv7-upload{border:1px solid #e2e4de;border-radius:18px;padding:16px;background:#fff;display:grid;gap:12px}.mugv7-drop{min-height:250px;border:2px dashed #cfd3ca;border-radius:16px;background:#fafbf8;display:grid;place-items:center;overflow:hidden;cursor:pointer;text-align:center;padding:14px}.mugv7-drop img{width:100%;height:100%;max-height:330px;object-fit:contain}.mugv7-drop strong{display:block;font-size:18px}.mugv7-drop small{display:block;margin-top:5px;color:#71756e}.mugv7-instruction{display:grid;gap:6px}.mugv7-instruction textarea{width:100%;box-sizing:border-box;min-height:90px;resize:vertical;border:1px solid #ccd0c8;border-radius:12px;padding:11px;background:#fff;font:inherit}.mugv7-instruction small{color:#6e726b}.mugv7-info{border:1px solid #e2e4de;border-radius:18px;padding:16px;background:#fff;display:flex;flex-direction:column;justify-content:center;gap:12px}.mugv7-info h3{margin:0}.mugv7-info ul{margin:0;padding-left:20px;color:#62665f;display:grid;gap:7px}.mugv7-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mugv7-status{font-weight:700}.mugv7-settings{border-top:1px solid #eceee9;padding-top:10px}.mugv7-settings summary{cursor:pointer;font-weight:700}.mugv7-settings-grid{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:10px}.mugv7-settings input,.mugv7-settings select{width:100%;box-sizing:border-box;border:1px solid #ccd0c8;border-radius:10px;padding:10px;background:#fff}.mugv7-result{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}.mugv7-result figure{margin:0}.mugv7-result img{width:100%;border:1px solid #ddd;border-radius:14px;display:block;background:#f7f7f5}.mugv7-result .art img{aspect-ratio:${MASTER_WIDTH}/${MASTER_HEIGHT};object-fit:contain}.mugv7-result .mock img{aspect-ratio:1;object-fit:contain}.mugv7-result figcaption{font-size:12px;margin-top:5px;color:#666}@media(max-width:760px){#mugAutomationPanel.mugv7{padding:10px}.mugv7-main{grid-template-columns:1fr}.mugv7-drop{min-height:200px}.mugv7-info{display:none}.mugv7-settings-grid{grid-template-columns:1fr}.mugv7-result{grid-template-columns:1fr 1fr}.mugv7-result .art{grid-column:1/-1}.mugv7-head .badge{display:none}}`;
  document.head.appendChild(style);
}

function renderResult(container, master, finalResult) {
  container.innerHTML = `<div class="mugv7-result">
    <figure class="art"><img src="${escapeHtml(master)}" alt="Arte horizontal"><figcaption>Arte de impressão · ${MASTER_WIDTH}×${MASTER_HEIGHT}px · ${PRINT_LABEL}</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_1_url || '')}" alt="Mockup lado esquerdo"><figcaption>Mockup · lado esquerdo</figcaption></figure>
    <figure class="mock"><img src="${escapeHtml(finalResult.mockup_2_url || '')}" alt="Mockup lado direito"><figcaption>Mockup · lado direito</figcaption></figure>
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
    status.textContent = '1/4 · Preparando imagem de inspiração...';
    const reference = await normalizeReference(file);
    status.textContent = instruction
      ? '2/4 · OpenAI criando a arte e aplicando sua instrução obrigatória...'
      : '2/4 · OpenAI criando a nova arte...';
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
    status.textContent = `3/4 · Preparando arte final ${MASTER_WIDTH}×${MASTER_HEIGHT}...`;
    const master = await cropMaster(artSource);
    const leftReference = await buildSideReference(master, 1);
    const rightReference = await buildSideReference(master, 2);
    const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
    const node = text(config.productsNode || DEFAULT_CONFIG.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '') || 'produtos';
    status.textContent = '4/4 · Gerando os dois lados e cadastrando produto...';
    const finalResult = await callMake(hook, {
      action: 'finalize_mug_product',
      request_id: id,
      image_base64: master,
      mockup_left_base64: leftReference,
      mockup_right_base64: rightReference,
      instruction,
      prompt_mockup_1: buildMockupPrompt(1),
      prompt_mockup_2: buildMockupPrompt(2),
      quality: 'high',
      firebase_url: base,
      products_node: node,
      firebase_template_json: firebaseTemplate(id, instruction),
    });
    if (finalResult.product_saved !== true || !text(finalResult.mockup_1_url) || !text(finalResult.mockup_2_url)) {
      throw new Error('O Make terminou sem confirmar o cadastro completo da caneca.');
    }
    renderResult(resultBox, master, finalResult);
    status.textContent = 'Concluído · produto salvo como inativo.';
    window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated', { detail: { source: BUILD, key: finalResult.firebase_key || id } }));
  } catch (error) {
    console.error('Falha no Criador de Canecas V7.3:', error);
    status.textContent = `Erro: ${error?.message || error}`;
  } finally {
    button.disabled = false;
  }
}

function renderPanel(panel) {
  installStyles();
  panel.className = 'mug-automation-panel mugv7';
  panel.innerHTML = `
    <div class="mugv7-head"><div><span class="eyebrow">Criador de Canecas V7.3</span><h2>Crie uma nova arte a partir de uma inspiração</h2><p>Envie uma imagem e, se quiser, escreva uma instrução complementar. Quando você pedir uma frase, nome ou outro texto, essa instrução passa a ser obrigatória na arte.</p></div><span class="badge warning">Cadastro inativo</span></div>
    <div class="mugv7-main">
      <section class="mugv7-upload"><label class="mugv7-drop" for="mugv7Image"><div id="mugv7Empty"><strong>Escolher imagem</strong><small>PNG, JPG ou WEBP · use uma referência do estilo desejado</small></div><img id="mugv7Preview" alt="Imagem de inspiração" hidden></label><input id="mugv7Image" type="file" accept="image/*" hidden><label class="mugv7-instruction"><strong>Instrução complementar <span class="muted">(opcional)</span></strong><textarea id="mugv7Instruction" maxlength="500" placeholder="Ex.: escreva exatamente ‘Eis-me aqui Senhor.’; use tons de azul; deixe as flores maiores..."></textarea><small>Se pedir uma frase, nome ou palavra, digite exatamente como deve aparecer na arte. A instrução complementar terá prioridade sobre as regras genéricas do gerador.</small></label><div class="mugv7-actions"><button class="button primary" id="mugv7Generate" type="button">Gerar caneca</button><button class="button secondary" id="mugv7Clear" type="button">Trocar imagem</button><span id="mugAutomationStatus" class="mugv7-status"></span></div></section>
      <section class="mugv7-info"><h3>O que a automação fará</h3><ul><li>interpretará a imagem e aplicará a instrução complementar como prioridade;</li><li>se houver frase ou nome solicitado, tentará reproduzi-lo exatamente;</li><li>criará uma nova arte comercial para ${PRINT_LABEL};</li><li>fechará a arte em ${MASTER_WIDTH}×${MASTER_HEIGHT}px sem esticar;</li><li>usará um recorte específico da esquerda para o primeiro mockup;</li><li>usará um recorte específico da direita para o segundo mockup;</li><li>cadastrará a caneca no Firebase como inativa.</li></ul><details class="mugv7-settings"><summary>Configuração</summary><div class="mugv7-settings-grid"><label>Webhook Make<input id="mugv7Webhook" type="url" placeholder="https://hook.eu1.make.com/..."></label><label>Qualidade<select id="mugv7Quality"><option value="high" selected>Alta</option><option value="medium">Média</option><option value="low">Teste</option></select></label></div></details></section>
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