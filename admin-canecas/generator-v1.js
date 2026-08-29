import { FIREBASE_BASE, text, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260829-admin-canecas-generator-v1';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.mugGeneratorWebhook
  || window.__CANECAS_ADMIN_CONFIG__?.makeWebhook
  || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const PRODUCTS_NODE = 'produtos';
const COMMANDS_NODE = 'canecas/comandos_criacao';
const MASTER_WIDTH = 2300;
const MASTER_HEIGHT = 1000;
const PLACEHOLDER_ART = '__MUG_ART__';
const PLACEHOLDER_MOCKUP_1 = '__MUG_MOCKUP_1__';
const PLACEHOLDER_MOCKUP_2 = '__MUG_MOCKUP_2__';
const FINAL_WAIT_MS = 180000;
const POLL_MS = 1800;

const STYLE_OPTIONS = [
  ['minimalista', 'Minimalista'], ['moderna', 'Moderna'], ['elegante', 'Elegante'], ['fofa', 'Fofa'],
  ['religiosa', 'Religiosa'], ['divertida', 'Divertida'], ['romantica', 'Romântica'], ['masculina', 'Masculina'],
  ['feminina', 'Feminina'], ['neutra', 'Neutra'], ['infantil', 'Infantil'], ['profissional', 'Profissional'],
  ['vintage', 'Vintage'], ['colorida', 'Colorida'], ['preto_branco', 'Preto e branco'], ['com_nome', 'Com nome'],
  ['com_frase', 'Com frase'], ['com_ilustracao', 'Com ilustração'], ['arte_continua', 'Arte contínua 360°'],
  ['arte_centralizada', 'Arte centralizada'], ['fundo_claro', 'Fundo claro'], ['alto_contraste', 'Alto contraste']
];

const state = { installed: false, busy: false, commands: [], selectedCommands: new Set(), previewUrl: '' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isHttpUrl = v => /^https?:\/\//i.test(text(v)) && !text(v).startsWith('__MUG_');
const isImageSource = v => isHttpUrl(v) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(text(v));
const requestId = () => `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function titleCase(value) {
  return text(value).toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s\-/])([\p{L}\p{N}])/gu, (_, prefix, char) => `${prefix}${char.toLocaleUpperCase('pt-BR')}`);
}
function parseTags(value) { return [...new Set(String(value || '').split(/[,;|]/).map(text).filter(Boolean))]; }
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
    ['Música', ['musica', 'cantor', 'cantora', 'banda', 'rock', 'sertanejo', 'pagode']]
  ];
  return rules.find(([, terms]) => terms.some(term => theme.includes(term)))?.[0] || 'Criativas';
}
function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 5600 : 3200);
}
function field(label, id, value = '', attrs = '') { return `<label>${esc(label)}<input id="${id}" value="${esc(value)}" ${attrs}></label>`; }
function textarea(label, id, value = '', attrs = '') { return `<label class="span2">${esc(label)}<textarea id="${id}" rows="3" ${attrs}>${esc(value)}</textarea></label>`; }

async function fbGet(path) {
  const response = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}
async function fbPatch(path, value) {
  const response = await fetch(`${FIREBASE_BASE}/${path}.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}
async function fbPut(path, value) {
  const response = await fetch(`${FIREBASE_BASE}/${path}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}

function ensureShell() {
  if (state.installed) return;
  state.installed = true;
  const nav = $('#nav');
  const main = $('#main');
  if (!nav || !main) return;

  const button = document.createElement('button');
  button.id = 'mugGeneratorNav';
  button.type = 'button';
  button.innerHTML = '<b>GR</b>Gerador';
  const mugsButton = nav.querySelector('[data-route="mugs"]');
  mugsButton?.insertAdjacentElement('afterend', button);

  const section = document.createElement('section');
  section.className = 'view';
  section.dataset.view = 'generator';
  section.innerHTML = '<div id="generator"></div>';
  const mugsView = main.querySelector('[data-view="mugs"]');
  mugsView?.insertAdjacentElement('afterend', section);

  button.addEventListener('click', () => showGenerator());
  nav.addEventListener('click', event => {
    if (event.target.closest('[data-route]')) button.classList.remove('active');
  });
  $('#reloadButton')?.addEventListener('click', event => {
    if (!section.classList.contains('active')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loadCommands(true);
    toast('Gerador atualizado.');
  }, true);

  renderGenerator();
  loadCommands();
  document.documentElement.dataset.adminCanecasGenerator = BUILD;
}

function showGenerator() {
  $$('.view').forEach(view => view.classList.toggle('active', view.dataset.view === 'generator'));
  $$('#nav [data-route]').forEach(button => button.classList.remove('active'));
  $('#mugGeneratorNav')?.classList.add('active');
  if ($('#pageTitle')) $('#pageTitle').textContent = 'Gerador de Canecas';
  if ($('#pageSubtitle')) $('#pageSubtitle').textContent = 'Mesmo fluxo do Produção · arte horizontal + 2 mockups + cadastro automático.';
  $('#sidebar')?.classList.remove('open');
  renderGenerator();
  loadCommands();
}

function renderGenerator() {
  const root = $('#generator');
  if (!root || root.dataset.ready === BUILD) return;
  root.dataset.ready = BUILD;
  root.innerHTML = `
    <section class="panel mug-generator-hero">
      <div class="panel-head"><div><h2>Gerador oficial de canecas</h2><p>Usa a mesma automação do Produção e salva o produto inicialmente inativo para revisão.</p></div><span class="badge cf">MAKE</span></div>
      <div class="panel-body"><div class="notice"><b>Fluxo:</b> referência opcional → arte horizontal ${MASTER_WIDTH}×${MASTER_HEIGHT} → 2 mockups → Firebase → Loja Integrada conforme o cenário ativo.<br><small>Webhook incorporado ao código: ${esc(MAKE_WEBHOOK)}</small></div></div>
    </section>

    <div class="mug-generator-grid" id="mugAutomationPanel">
      <section class="panel">
        <div class="panel-head"><div><h2>1. Referência e conteúdo</h2><p>Use uma imagem, comandos salvos e/ou instruções próprias.</p></div></div>
        <div class="panel-body">
          <label class="mug-upload" for="mugReference"><input id="mugReference" type="file" accept="image/*" hidden><div id="mugReferenceEmpty"><b>Escolher imagem de referência</b><span>PNG, JPG ou WEBP · opcional</span></div><img id="mugReferencePreview" alt="Prévia da referência" hidden></label>
          <div class="form" style="margin-top:14px">
            ${field('Tema principal *', 'mugTheme', '', 'placeholder="Ex.: Nossa Senhora Aparecida"')}
            ${field('Nome do produto', 'mugName', '', 'placeholder="Automático se ficar vazio"')}
            ${field('Frase principal', 'mugPhrase', '', 'placeholder="Texto exato da arte"')}
            ${field('Frase secundária', 'mugPhrase2', '', 'placeholder="Opcional"')}
            ${textarea('Descrição livre da arte', 'mugDescription', '', 'placeholder="Explique a composição desejada..."')}
            ${field('Subcategoria', 'mugSubcategory', '', 'placeholder="Automática se ficar vazia"')}
            ${field('Tags', 'mugTags', '', 'placeholder="fé, presente, maria"')}
            ${field('Preço de venda', 'mugPrice', '24.90', 'type="number" min="0" step="0.01"')}
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h2>2. Direção artística</h2><p>Mesmos parâmetros usados pelo gerador do Produção.</p></div></div>
        <div class="panel-body">
          <div class="form">
            ${field('Estilo da arte', 'mugStyle', '', 'placeholder="Ex.: aquarela moderna"')}
            ${field('Paleta de cores', 'mugPalette', '', 'placeholder="Ex.: azul, branco e dourado"')}
            ${field('Tipografia', 'mugTypography', '', 'placeholder="Ex.: serifada elegante"')}
            ${field('Público-alvo', 'mugAudience', '', 'placeholder="Ex.: feminino adulto"')}
            ${field('Elementos obrigatórios', 'mugRequired', '', 'placeholder="O que precisa aparecer"')}
            ${field('Elementos proibidos', 'mugForbidden', '', 'placeholder="O que não pode aparecer"')}
          </div>
          <div class="mug-param-grid">${STYLE_OPTIONS.map(([key, label]) => `<label><input type="checkbox" data-mug-param="${key}"><span>${esc(label)}</span></label>`).join('')}</div>
          <label class="mug-quality"><span>Qualidade</span><select id="mugQuality"><option value="low">LOW · mais rápido</option><option value="medium" selected>MEDIUM</option><option value="high">HIGH</option></select></label>
        </div>
      </section>

      <section class="panel mug-command-panel">
        <div class="panel-head"><div><h2>3. Comandos salvos</h2><p>Mesma biblioteca de comandos do Produção/Caneca10.</p></div><button class="secondary" id="mugReloadCommands" type="button">Atualizar</button></div>
        <div class="panel-body">
          <div id="mugCommandsList" class="mug-command-list"><div class="notice">Carregando comandos…</div></div>
          <details class="mug-command-create"><summary>Criar novo comando</summary><div class="form" style="margin-top:10px">${field('Nome do comando', 'mugCommandName')}${textarea('Texto do comando', 'mugCommandText')}</div><button class="secondary" id="mugSaveCommand" type="button">Salvar comando</button></details>
        </div>
      </section>

      <section class="panel mug-generate-panel">
        <div class="panel-head"><div><h2>4. Gerar</h2><p>O produto nasce inativo e com o padrão operacional da Caneca Fácil.</p></div></div>
        <div class="panel-body">
          <input id="mugWebhook" type="hidden" value="${esc(MAKE_WEBHOOK)}">
          <div class="notice"><b>Padrão automático:</b> porcelana 350 ml · marca Caneca Fácil · estoque 100 · preparação 1 dia útil · 0,3 kg · 11 × 11 × 11 cm · revenda · origem nacional.</div>
          <button class="primary mug-generate-button" id="mugGenerateButton" type="button">Gerar arte + 2 mockups + cadastrar</button>
          <div class="mug-progress" id="mugProgress" hidden><div><strong id="mugProgressTitle">Preparando…</strong><span id="mugProgressPercent">0%</span></div><div class="mug-progress-track"><i id="mugProgressBar"></i></div></div>
          <p id="mugAutomationStatus" class="mug-generator-status">Pronto para gerar.</p>
          <div id="mugResult" class="mug-generator-result" hidden></div>
        </div>
      </section>
    </div>`;
  bindGenerator();
}

function bindGenerator() {
  $('#mugReference')?.addEventListener('change', previewReference);
  $('#mugReloadCommands')?.addEventListener('click', () => loadCommands(true));
  $('#mugSaveCommand')?.addEventListener('click', saveCommand);
  $('#mugGenerateButton')?.addEventListener('click', generate);
  $('#mugCommandsList')?.addEventListener('change', event => {
    const box = event.target.closest('[data-command-id]');
    if (!box) return;
    if (box.checked) state.selectedCommands.add(box.dataset.commandId); else state.selectedCommands.delete(box.dataset.commandId);
  });
}

function previewReference() {
  const file = $('#mugReference')?.files?.[0];
  const img = $('#mugReferencePreview');
  const empty = $('#mugReferenceEmpty');
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = '';
  if (!file) { if (img) { img.hidden = true; img.removeAttribute('src'); } if (empty) empty.hidden = false; return; }
  if (!file.type.startsWith('image/')) { $('#mugReference').value = ''; return toast('Escolha um arquivo de imagem.', true); }
  state.previewUrl = URL.createObjectURL(file);
  img.src = state.previewUrl; img.hidden = false; empty.hidden = true;
}

async function loadCommands(force = false) {
  if (state.commands.length && !force) return renderCommands();
  const list = $('#mugCommandsList');
  if (list) list.innerHTML = '<div class="notice">Carregando comandos…</div>';
  try {
    const data = await fbGet(COMMANDS_NODE);
    state.commands = Object.entries(data || {}).filter(([, value]) => value && typeof value === 'object').map(([key, value]) => ({
      id: text(value.id || key), nome: text(value.nome || value.name || 'Comando'), texto: text(value.texto || value.prompt || value.comando)
    })).filter(item => item.id && item.texto).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    state.selectedCommands = new Set([...state.selectedCommands].filter(id => state.commands.some(item => item.id === id)));
    renderCommands();
  } catch (error) {
    if (list) list.innerHTML = `<div class="notice warn">Não foi possível carregar os comandos: ${esc(error.message || error)}</div>`;
  }
}
function renderCommands() {
  const list = $('#mugCommandsList');
  if (!list) return;
  if (!state.commands.length) { list.innerHTML = '<div class="notice">Nenhum comando salvo.</div>'; return; }
  list.innerHTML = state.commands.map(item => `<label class="mug-command-item"><input type="checkbox" data-command-id="${esc(item.id)}" ${state.selectedCommands.has(item.id) ? 'checked' : ''}><span><b>${esc(item.nome)}</b><small>${esc(item.texto)}</small></span></label>`).join('');
}
async function saveCommand() {
  const nome = text($('#mugCommandName')?.value), texto = text($('#mugCommandText')?.value);
  if (!nome || !texto) return toast('Informe o nome e o texto do comando.', true);
  const id = safeKey(`cmd-${Date.now()}-${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`);
  try {
    await fbPut(`${COMMANDS_NODE}/${id}`, { id, nome, texto, ativo: true, origem: BUILD, criado_em: new Date().toISOString() });
    $('#mugCommandName').value = ''; $('#mugCommandText').value = '';
    await loadCommands(true); toast('Comando salvo.');
  } catch (error) { toast(error.message || error, true); }
}

function fileData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file); }); }
function loadImage(source, timeoutMs = 30000) { return new Promise((resolve, reject) => { const image = new Image(); const timer = setTimeout(() => reject(new Error('Tempo esgotado ao abrir a imagem.')), timeoutMs); if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous'; image.onload = () => { clearTimeout(timer); resolve(image); }; image.onerror = () => { clearTimeout(timer); reject(new Error('Não foi possível abrir a imagem.')); }; image.src = source; }); }
async function normalizedReferenceDataUrl(file) {
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024;
  const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (file) {
    if (file.size > 25 * 1024 * 1024) throw new Error('A imagem de referência deve ter no máximo 25 MB.');
    const image = await loadImage(await fileData(file)); const scale = Math.min(1320 / image.naturalWidth, 880 / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  return canvas.toDataURL('image/webp', 0.92);
}
async function cropMasterArt(source) {
  const image = await loadImage(source); const sourceRatio = image.naturalWidth / image.naturalHeight, targetRatio = MASTER_WIDTH / MASTER_HEIGHT;
  let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
  if (sourceRatio > targetRatio) { sw = image.naturalHeight * targetRatio; sx = (image.naturalWidth - sw) / 2; }
  else { sh = image.naturalWidth / targetRatio; sy = (image.naturalHeight - sh) / 2; }
  const canvas = document.createElement('canvas'); canvas.width = MASTER_WIDTH; canvas.height = MASTER_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, MASTER_WIDTH, MASTER_HEIGHT); ctx.drawImage(image, sx, sy, sw, sh, 0, 0, MASTER_WIDTH, MASTER_HEIGHT);
  return canvas.toDataURL('image/webp', 0.94);
}
function selectedParameters() { return Object.fromEntries(STYLE_OPTIONS.map(([key]) => [key, Boolean($(`[data-mug-param="${key}"]`)?.checked)])); }
function activeParameterLabels(params) { return STYLE_OPTIONS.filter(([key]) => params[key]).map(([, label]) => label); }
function commandText() { return state.commands.filter(item => state.selectedCommands.has(item.id)).map((item, i) => `COMANDO SALVO ${i + 1} — ${item.nome}:\n${item.texto}`).join('\n\n'); }

function collectData() {
  const tema = text($('#mugTheme')?.value), params = selectedParameters();
  const nome = text($('#mugName')?.value) || `Caneca de Porcelana ${titleCase(tema).slice(0, 70)} - 350ml`;
  return {
    request_id: requestId(), tema, nome,
    frase_principal: text($('#mugPhrase')?.value), frase_secundaria: text($('#mugPhrase2')?.value),
    descricao_livre: text($('#mugDescription')?.value), subcategoria: text($('#mugSubcategory')?.value) || classifyTheme(tema),
    tags: text($('#mugTags')?.value), preco: Math.max(0, Number($('#mugPrice')?.value || 24.9)),
    estilo_arte: text($('#mugStyle')?.value), paleta_cores: text($('#mugPalette')?.value), tipografia: text($('#mugTypography')?.value),
    publico_alvo: text($('#mugAudience')?.value), elementos_obrigatorios: text($('#mugRequired')?.value), elementos_proibidos: text($('#mugForbidden')?.value),
    parametros: params, quality: text($('#mugQuality')?.value) || 'medium', comandos: commandText()
  };
}
function buildArtPrompt(data) {
  const params = activeParameterLabels(data.parametros), exactText = [data.frase_principal, data.frase_secundaria].filter(Boolean);
  return `CRIE SOMENTE A ARTE PLANA PARA SUBLIMAÇÃO DE CANECA. NÃO desenhe caneca, mockup, mãos, mesa, cenário ou fotografia de produto.\n\nFORMATO E CORTE:\n- Gere uma composição horizontal em 1536x1024.\n- Toda informação essencial precisa ficar dentro de uma faixa horizontal CENTRAL de proporção 2.3:1.\n- Essa faixa será recortada automaticamente para ${MASTER_WIDTH}x${MASTER_HEIGHT}. Mantenha margem interna de segurança de pelo menos 8%.\n- Não coloque texto nem elementos essenciais acima ou abaixo dessa faixa.\n- A arte deve funcionar como estampa contínua para envolver uma caneca branca de porcelana.\n\nCONTEÚDO:\nTema: ${data.tema}\nNome/contexto: ${data.nome}\nFrase principal: ${data.frase_principal || 'sem frase obrigatória'}\nFrase secundária: ${data.frase_secundaria || 'sem frase secundária'}\nDescrição livre: ${data.descricao_livre || 'crie uma composição comercialmente atraente e original'}\nPúblico-alvo: ${data.publico_alvo || 'geral'}\nEstilo: ${data.estilo_arte || 'livre e coerente com o tema'}\nPaleta: ${data.paleta_cores || 'harmônica e adequada ao tema'}\nTipografia: ${data.tipografia || 'legível e coerente'}\nElementos obrigatórios: ${data.elementos_obrigatorios || 'nenhum além do tema'}\nElementos proibidos: ${data.elementos_proibidos || 'nenhum adicional'}\nParâmetros selecionados: ${params.length ? params.join(', ') : 'nenhum'}\n${data.comandos ? `\nCOMANDOS SALVOS — prioridade alta:\n${data.comandos}\n` : ''}\n${exactText.length ? `TEXTO OBRIGATÓRIO: reproduza EXATAMENTE ${exactText.map(value => `“${value}”`).join(' e ')}.` : 'Não inclua texto aleatório.'}\n\nSe houver imagem de referência, use-a como referência visual conforme a descrição. Não inclua marcas-d'água, assinaturas ou logotipos não solicitados. Resultado limpo, nítido e pronto para impressão.`;
}
function buildMockupPrompt(data, side) {
  const orientation = side === 1 ? 'Vista 1: ângulo de 3/4, alça preferencialmente à direita, mostrando claramente a primeira metade visual da estampa.' : 'Vista 2: caneca girada para o lado oposto, alça preferencialmente à esquerda, mostrando claramente a outra metade da mesma estampa.';
  return `Use a imagem fornecida como ARTE-MESTRE IMUTÁVEL. Crie UMA fotografia quadrada 1:1 de e-commerce de uma caneca branca de porcelana 350 ml. ${orientation}\nAplique exatamente a arte fornecida na superfície curva como sublimação contínua. NÃO redesenhe a arte, NÃO altere textos, NÃO troque cores, NÃO invente símbolos e NÃO substitua elementos. Apenas faça a deformação/perspectiva necessária para parecer impressa na caneca. Fundo branco puro, iluminação suave de estúdio, caneca inteira visível, sem mãos, caixas, objetos extras, texto fora da caneca, logotipo ou marca-d'água. Mockup comercial realista 1024x1024. Tema: ${data.tema}.`;
}
function firebaseTemplate(data) {
  const now = new Date().toISOString(), tags = parseTags(data.tags);
  return {
    id: data.request_id, firebaseKey: data.request_id, codigo: `CANP-${data.request_id.slice(-6).toUpperCase()}`, nome: data.nome,
    categoria: 'Caneca de Porcelana', subcategoria: data.subcategoria, tema: data.tema, tema_caneca: data.tema,
    ncm: '69111090', preco_custo: 10, preco: data.preco, estoque: 100, estoque_gerenciado: true,
    estoque_situacao_em_estoque: 1, estoque_situacao_sem_estoque: 0,
    situacao: 'I', status: 'I', ativo: false, visivel: false, loja_integrada_ativo: false, canecafacil_ativo: false,
    modelo_caneca: true, modelo_publico: false, personalizacao_publica: false, personalizavel: false,
    material: 'Porcelana', material_caneca: 'Porcelana', capacidade: '350ml', embalagem: 'Caneca de porcelana 350ml', unidade: 'UN',
    marca: 'Caneca Fácil', peso_embalado_kg: 0.3, altura_embalada_cm: 11, largura_embalada_cm: 11, comprimento_embalado_cm: 11,
    descricao: data.descricao_livre || `Caneca de porcelana branca 350 ml com arte temática ${data.tema}.`, tags,
    seo_title: data.nome.slice(0, 70), seo_description: (data.descricao_livre || `Caneca de porcelana 350 ml com arte exclusiva de ${data.tema}.`).slice(0, 155),
    url_imagem: PLACEHOLDER_MOCKUP_1, imagem: PLACEHOLDER_MOCKUP_1, imagem_url: PLACEHOLDER_MOCKUP_1,
    imagens: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2], imagens_site: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2],
    mockup_1: PLACEHOLDER_MOCKUP_1, mockup_2: PLACEHOLDER_MOCKUP_2, mockup_3: '', arte_personalizacao: PLACEHOLDER_ART, arte_horizontal: PLACEHOLDER_ART,
    arte_impressao: { url: PLACEHOLDER_ART, ratio: '2.3:1', width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: '24 × 9,5 cm', formato: 'webp' },
    midias_admin: [PLACEHOLDER_MOCKUP_1, PLACEHOLDER_MOCKUP_2, PLACEHOLDER_ART], video_youtube: '',
    origem_cadastro: BUILD, tipo_produto: 'caneca_porcelana', geracao_status: 'concluido', geracao_etapa: 'firebase_salvo', geracao_versao: BUILD,
    configuracao_arte: { descricao_livre: data.descricao_livre, paleta_cores: data.paleta_cores, tipografia: data.tipografia, estilo_arte: data.estilo_arte, publico_alvo: data.publico_alvo, elementos_obrigatorios: data.elementos_obrigatorios, elementos_proibidos: data.elementos_proibidos, parametros: data.parametros, comandos: [...state.selectedCommands], gerador: BUILD },
    loja_integrada: { marca_nome: 'Caneca Fácil', categoria_tipo: 'padronizadas', categoria_nome: 'Canecas Padronizadas', tipo_producao: 'revenda', origem_mercadoria: '0', estoque_gerenciado: true, estoque_quantidade: 100, situacao_em_estoque: 1, situacao_sem_estoque: 0, sync_status: 'nao_publicado' },
    politica_caneca_facil_versao: '20260829-1', criado_em: now, updated_at: now, last_update: Date.now()
  };
}

async function callMake(payload, timeoutMs = 180000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MAKE_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ payload: JSON.stringify({ ...payload, origin: BUILD }) }), signal: controller.signal });
    const raw = await response.text(); let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch {} }
    if (data) { if (!response.ok || data.ok === false) throw new Error(text(data.error || data.message) || `Make HTTP ${response.status}`); return data; }
    if (response.ok && /^accepted\.?$/i.test(text(raw)) && payload.action === 'finalize_mug_product') return waitFinalProduct(payload.request_id);
    const snippet = text(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(snippet ? `Make respondeu conteúdo inválido (${response.status}): ${snippet}` : `Make não devolveu JSON (${response.status}).`);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A automação ultrapassou 3 minutos.');
    throw error;
  } finally { clearTimeout(timer); }
}
function urlsFromProduct(product = {}) {
  return {
    art: text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url),
    m1: text(product.mockup_1 || product.url_imagem || product.imagens_site?.[0] || product.imagens?.[0]),
    m2: text(product.mockup_2 || product.imagens_site?.[1] || product.imagens?.[1])
  };
}
async function waitFinalProduct(id) {
  const deadline = Date.now() + FINAL_WAIT_MS;
  while (Date.now() < deadline) {
    const product = await fbGet(`${PRODUCTS_NODE}/${safeKey(id)}`).catch(() => null), urls = urlsFromProduct(product || {});
    if ([urls.art, urls.m1, urls.m2].every(isHttpUrl)) return { ok: true, action: 'finalize_mug_product', request_id: id, product_saved: true, firebase_key: id, arte_horizontal_url: urls.art, mockup_1_url: urls.m1, mockup_2_url: urls.m2, async_recovered: true };
    await sleep(POLL_MS);
  }
  throw new Error('A automação não publicou a arte e os 2 mockups em até 3 minutos.');
}
async function enforcePolicy(key) {
  return fbPatch(`${PRODUCTS_NODE}/${safeKey(key)}`, {
    marca: 'Caneca Fácil', estoque: 100, estoque_gerenciado: true, estoque_situacao_em_estoque: 1, estoque_situacao_sem_estoque: 0,
    peso_embalado_kg: 0.3, altura_embalada_cm: 11, largura_embalada_cm: 11, comprimento_embalado_cm: 11,
    'loja_integrada/marca_nome': 'Caneca Fácil', 'loja_integrada/tipo_producao': 'revenda', 'loja_integrada/origem_mercadoria': '0',
    'loja_integrada/estoque_gerenciado': true, 'loja_integrada/estoque_quantidade': 100, 'loja_integrada/situacao_em_estoque': 1, 'loja_integrada/situacao_sem_estoque': 0,
    politica_caneca_facil_versao: '20260829-1', updated_at: new Date().toISOString(), last_update: Date.now()
  });
}

function setBusy(value) {
  state.busy = value;
  if ($('#mugGenerateButton')) { $('#mugGenerateButton').disabled = value; $('#mugGenerateButton').textContent = value ? 'Gerando…' : 'Gerar arte + 2 mockups + cadastrar'; }
  $$(`#generator input, #generator textarea, #generator select, #generator button`).forEach(el => { if (el.id !== 'mugGenerateButton') el.disabled = value; });
}
function setProgress(step, title, detail = '') {
  const percent = Math.round(step / 5 * 100), box = $('#mugProgress');
  if (box) box.hidden = false;
  if ($('#mugProgressTitle')) $('#mugProgressTitle').textContent = title;
  if ($('#mugProgressPercent')) $('#mugProgressPercent').textContent = `${percent}%`;
  if ($('#mugProgressBar')) $('#mugProgressBar').style.width = `${percent}%`;
  if ($('#mugAutomationStatus')) $('#mugAutomationStatus').textContent = detail || title;
}
function showResult(data, urls, key) {
  const result = $('#mugResult'); if (!result) return;
  result.hidden = false;
  result.innerHTML = `<div class="mug-result-head"><div><span class="badge good">CONCLUÍDO</span><h3>${esc(data.nome)}</h3><p>Firebase ${esc(key)} · salvo inicialmente inativo.</p></div><button class="secondary" id="mugOpenCatalog" type="button">Abrir no cadastro</button></div><div class="mug-result-media"><figure><img src="${esc(urls.m1)}" alt="Mockup 1"><figcaption>Mockup 1</figcaption></figure><figure><img src="${esc(urls.m2)}" alt="Mockup 2"><figcaption>Mockup 2</figcaption></figure><figure class="mug-result-art"><img src="${esc(urls.art)}" alt="Arte horizontal"><figcaption>Arte ${MASTER_WIDTH}×${MASTER_HEIGHT}</figcaption></figure></div>`;
  $('#mugOpenCatalog').onclick = () => { const btn = $('#nav [data-route="mugs"]'); btn?.click(); setTimeout(() => { const row = $(`#mugs tr[data-cf-mug="${CSS.escape(key)}"]`); row?.click(); }, 900); };
}

async function generate() {
  if (state.busy) return;
  const data = collectData();
  if (!data.tema) return toast('Informe o tema principal.', true);
  const file = $('#mugReference')?.files?.[0] || null;
  setBusy(true); if ($('#mugResult')) $('#mugResult').hidden = true;
  try {
    setProgress(1, 'Preparando referência', 'Otimizando a imagem e os parâmetros.');
    const referenceData = await normalizedReferenceDataUrl(file);

    setProgress(2, 'Criando arte horizontal', 'OpenAI está criando a arte pelo mesmo cenário do Produção.');
    const artResult = await callMake({ action: 'generate_mug_art', request_id: data.request_id, image_base64: referenceData, prompt_art: buildArtPrompt(data), quality: data.quality }, 180000);
    const artSource = text(artResult.art_source_url || artResult.arte_url || artResult.art_url || artResult.image_url || artResult.url || artResult.art_source_base64);
    if (!isImageSource(artSource)) throw new Error('O Make não devolveu a arte gerada.');

    setProgress(3, 'Finalizando arte', `Recortando exatamente para ${MASTER_WIDTH}×${MASTER_HEIGHT}.`);
    const finalArtData = await cropMasterArt(artSource);

    setProgress(4, 'Gerando 2 mockups', 'Aplicando a arte sem redesenhar e cadastrando o produto.');
    const template = firebaseTemplate(data);
    const final = await callMake({
      action: 'finalize_mug_product', request_id: data.request_id, image_base64: finalArtData,
      prompt_mockup_1: buildMockupPrompt(data, 1), prompt_mockup_2: buildMockupPrompt(data, 2), quality: data.quality,
      firebase_url: FIREBASE_BASE, products_node: PRODUCTS_NODE, firebase_template_json: JSON.stringify(template), product_name: data.nome
    }, 180000);

    let urls = { art: text(final.arte_horizontal_url || final.art_url || final.arte_url), m1: text(final.mockup_1_url || final.mockup1_url), m2: text(final.mockup_2_url || final.mockup2_url) };
    const key = text(final.firebase_key || final.product_key || data.request_id);
    if (![urls.art, urls.m1, urls.m2].every(isHttpUrl)) urls = urlsFromProduct(await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`) || {});
    if (![urls.art, urls.m1, urls.m2].every(isHttpUrl)) throw new Error('A automação terminou sem publicar a arte e os 2 mockups.');

    setProgress(5, 'Concluído', 'Produto cadastrado. Aplicando o padrão operacional da Caneca Fácil.');
    await enforcePolicy(key).catch(error => console.warn('[Gerador Admin Canecas] política operacional:', error));
    showResult(data, urls, key);
    window.dispatchEvent(new CustomEvent('admin-canecas:mug-created', { detail: { key, source: BUILD } }));
    toast('Caneca criada com arte + 2 mockups.');
  } catch (error) {
    console.error('[Gerador Admin Canecas]', error);
    if ($('#mugAutomationStatus')) $('#mugAutomationStatus').textContent = `Erro: ${error.message || error}`;
    toast(error.message || error, true);
  } finally { setBusy(false); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureShell, { once: true }); else ensureShell();

export { BUILD, MAKE_WEBHOOK, showGenerator, generate };
