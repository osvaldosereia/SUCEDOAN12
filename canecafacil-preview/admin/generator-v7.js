(() => {
  'use strict';

  const BUILD = '20260904-canecafacil-generator-v7-master-png';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const ROOT = 'canecafacil_v2';
  const COMMANDS_NODE = 'canecas/comandos_criacao';
  const GENERATIONS_NODE = 'canecas/geracoes';
  const SELECTED_KEY = 'cf_preview_selected_commands_v7';
  const DEFAULT_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const WAIT_MS = 360000;
  const POLL_MS = 1800;
  const ART_WIDTH = 2400;
  const ART_HEIGHT = 960;

  const STYLE = `Ilustração editorial pop contemporânea, com flat cartoon moderno e line art limpa. Personagens feitos com formas simples, arredondadas e levemente caricatas, silhueta marcante, poses expressivas e rostos minimalistas. Usar contornos escuros, suaves e consistentes, cores chapadas em paleta alegre de coral, rosa, amarelo, azul, turquesa, verde-menta, lilás, creme e pêssego. Trabalhar com cerca de 4 a 6 cores principais, sombras mínimas e sem gradientes complexos. Visual adulto, divertido, leve, inteligente e contemporâneo, com formas grandes e poucos detalhes. Objetos e acessórios devem seguir a mesma linguagem gráfica simplificada. Evitar kawaii, desenho infantil, anime, 3D, realismo, aquarela, textura vintage, excesso de detalhes, clip-art e estética publicitária.`;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const text = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safe = v => text(v).replace(/[.#$\[\]/]/g, '_');
  const slug = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  const normalizeHex = v => {
    const raw = text(v).replace('#', '');
    return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : '#FF6B1A';
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = { busy: false, commands: [], selected: loadSelected(), editingId: '' };

  function loadSelected() {
    try {
      const raw = JSON.parse(localStorage.getItem(SELECTED_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch { return new Set(); }
  }
  function persistSelected() {
    try { localStorage.setItem(SELECTED_KEY, JSON.stringify([...state.selected])); } catch {}
  }
  function toast(message, error = false) {
    const el = $('#toast'); if (!el) return;
    el.textContent = message; el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 3200);
  }
  async function fb(path, options = {}) {
    const response = await fetch(`${FIREBASE}/${path}.json${options.bust ? `?_=${Date.now()}` : ''}`, {
      method: options.method || 'GET', cache: options.bust ? 'no-store' : 'default',
      headers: { Accept: 'application/json', ...(options.body !== undefined ? {'Content-Type':'application/json'} : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json().catch(() => null);
  }
  const fbGet = path => fb(path, { bust: true });
  const fbPut = (path, body) => fb(path, { method: 'PUT', body });
  const fbDelete = path => fb(path, { method: 'DELETE' });

  function resolveWebhook() {
    let saved = '', current = {}, legacy = {};
    try { saved = text(localStorage.getItem('canecafacil_make_webhook')); } catch {}
    try { current = JSON.parse(localStorage.getItem('da_admin_v2_config') || '{}') || {}; } catch {}
    try { legacy = JSON.parse(localStorage.getItem('da_admin_settings_v4') || '{}') || {}; } catch {}
    const valid = v => /^https:\/\/hook\.[a-z0-9-]+\.make\.com\/[A-Za-z0-9_-]+$/i.test(text(v));
    const candidates = [saved, current.makeAiWebhookUrl, current.makeImageWebhookUrl, current.makeTextWebhookUrl, legacy.makeAiWebhookUrl, legacy.makeImageWebhookUrl, legacy.makeTextWebhookUrl, DEFAULT_WEBHOOK].map(text);
    const value = candidates.find(valid) || DEFAULT_WEBHOOK;
    try { localStorage.setItem('canecafacil_make_webhook', value); } catch {}
    return value;
  }

  function imageRef(record = {}) {
    const d = record.result || record.data || {};
    return text(record.art_source_url || record.art_source_base64 || record.art_url || record.arte_url || record.mockup_png || record.image_url || record.url || d.art_source_url || d.art_source_base64 || d.art_url || d.arte_url || d.mockup_png || d.image_url || d.url);
  }
  function validImageRef(value) {
    const v = text(value);
    return /^https?:\/\//i.test(v) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(v);
  }
  function validPngRef(value) {
    const v = text(value);
    return /^data:image\/png;base64,/i.test(v) || /^https?:\/\/.*\.png(?:[?#].*)?$/i.test(v);
  }

  async function callMake(payload, allowAccepted = false) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), WAIT_MS);
    try {
      const response = await fetch(resolveWebhook(), {
        method: 'POST',
        headers: {'Content-Type':'application/json', Accept:'application/json'},
        body: JSON.stringify({ payload: JSON.stringify({ ...payload, quality: 'low', origin: BUILD, client_contract: 'canecafacil-v17-master-png' }) }),
        signal: ctl.signal
      });
      const raw = await response.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (data) {
        if (!response.ok || data.ok === false) throw new Error(text(data.error || data.message) || `Make ${response.status}`);
        return data;
      }
      if (response.ok && /^accepted\.?$/i.test(text(raw)) && allowAccepted) return { ok: true, accepted: true };
      throw new Error(text(raw).slice(0, 260) || `Make não retornou JSON (${response.status})`);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A chamada ao Make ultrapassou 6 minutos.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function loadImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem de referência.'));
      img.src = source;
    });
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem de referência.'));
      reader.readAsDataURL(file);
    });
  }
  async function normalizedReference(file) {
    const canvas = document.createElement('canvas');
    canvas.width = 1536; canvas.height = 1024;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (file) {
      if (!file.type.startsWith('image/')) throw new Error('A referência precisa ser uma imagem PNG, JPG ou WEBP.');
      const img = await loadImage(await fileToDataUrl(file));
      const scale = Math.min(1320 / img.naturalWidth, 880 / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    return canvas.toDataURL('image/webp', 0.92);
  }

  function artPrompt(instruction) {
    return `CRIE SOMENTE A ARTE PLANA HORIZONTAL PARA SUBLIMAÇÃO DE CANECA. NÃO desenhe caneca, mockup, mãos, mesa, embalagem ou fotografia do produto.\n\nFORMATO TÉCNICO:\n- composição panorâmica preparada para fechamento final em ${ART_WIDTH} × ${ART_HEIGHT}px, equivalente a aproximadamente 24 × 9,5 cm;\n- elementos principais devem ocupar bem a altura útil sem ficar espremidos;\n- mantenha rostos, palavras e elementos essenciais dentro da faixa segura central;\n- NÃO coloque informação crítica nos 10% extremos esquerdo e direito, pois essas regiões se aproximam da alça quando a arte envolve a caneca;\n- fundos e elementos de sangria podem alcançar as bordas; conteúdo principal deve manter respiro;\n- laterais visualmente orgânicas, sem uma sensação de corte reto artificial;\n- não achate nem estique personagens ou objetos;\n- não invente texto que não tenha sido solicitado.\n\nESTILO FIXO CANECAFÁCIL:\n${STYLE}\n\nIMAGEM DE REFERÊNCIA:\nUse a imagem anexada como inspiração de conteúdo/composição quando ela contiver informação visual. Se for uma base branca, siga apenas as instruções abaixo.\n\nINSTRUÇÃO DO OPERADOR + COMANDOS SALVOS:\n${instruction || 'Use sua criatividade dentro do estilo fixo e crie uma arte adulta, divertida e desejável para caneca.'}\n\nEntregue apenas a arte final plana. Sem logotipos, assinatura ou marca-d’água.`;
  }

  function mockupMasterPrompt() {
    return `Use a ARTE HORIZONTAL fornecida como ARTE-MESTRE IMUTÁVEL e crie o mockup oficial do novo site CanecaFácil.\n\nSAÍDA:\n- UM ÚNICO arquivo PNG com fundo realmente transparente (alpha);\n- composição vertical com DUAS VISTAS da MESMA caneca branca de porcelana;\n- uma vista na metade superior e a segunda na metade inferior, nunca lado a lado;\n- duas vistas em escala semelhante, mostrando lados complementares da mesma estampa;\n- uma alça pode aparecer para a esquerda e a outra para a direita;\n- canecas inteiras, sem cortar alça, borda ou sombra;\n- conjunto centralizado e com bastante área transparente ao redor;\n- luz de estúdio suave e sombra curta/semitransparente permitida;\n- sem mesa, parede, cenário, fundo branco, moldura ou retângulo;\n- pequenos doodles gráficos coerentes com a arte podem aparecer ao redor, desde que permaneçam no alpha e não cubram a estampa.\n\nFIDELIDADE ABSOLUTA À ARTE:\n- NÃO redesenhar a ilustração;\n- NÃO alterar palavras, ortografia, cores, personagens ou símbolos;\n- aplicar apenas perspectiva e deformação de superfície necessárias para a curvatura da caneca;\n- manter texto e personagem principal em posição de leitura confortável, longe da alça;\n- a segunda vista deve revelar a continuidade/lado complementar da arte, e não repetir exatamente a primeira vista.\n\nVisual do produto: limpo, contemporâneo e realista apenas na porcelana/iluminação. A arte impressa deve permanecer exatamente a arte fornecida.`;
  }

  function progress(percent, title, detail = '') {
    const box = $('#generatorProgress'); if (box) box.hidden = false;
    if ($('#progressTitle')) $('#progressTitle').textContent = title;
    if ($('#progressPercent')) $('#progressPercent').textContent = `${percent}%`;
    if ($('#progressBar')) $('#progressBar').style.width = `${percent}%`;
    if ($('#progressText')) $('#progressText').textContent = detail || title;
  }
  function setBusy(value) {
    state.busy = value;
    const btn = $('#generateBtn');
    if (btn) { btn.disabled = value; btn.textContent = value ? 'Gerando…' : '✦ Gerar caneca'; }
    $$('#generatorForm input,#generatorForm textarea,#generatorForm select,#generatorForm button').forEach(el => {
      if (el.id !== 'generateBtn') el.disabled = value;
    });
  }

  function normalizeCommands(map = {}) {
    return Object.entries(map || {}).filter(([,v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([id,v]) => ({
      id: text(v.id || id), nome: text(v.nome || v.name), texto: text(v.texto || v.prompt || v.comando), criado_em: text(v.criado_em)
    })).filter(x => x.id && x.nome && x.texto).sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity:'base' }));
  }
  async function loadCommands(force = false) {
    if (state.commands.length && !force) return renderCommands();
    const status = $('#cfCommandStatus'); if (status) status.textContent = 'Carregando…';
    try {
      state.commands = normalizeCommands(await fbGet(COMMANDS_NODE));
      state.selected = new Set([...state.selected].filter(id => state.commands.some(c => c.id === id)));
      persistSelected(); renderCommands(); if (status) status.textContent = '';
    } catch (error) {
      if (status) status.textContent = error.message || String(error);
    }
  }
  function renderCommands() {
    const root = $('#cfCommandList'); if (!root) return;
    const count = state.selected.size;
    if ($('#cfCommandSelected')) $('#cfCommandSelected').textContent = `${count} selecionado${count === 1 ? '' : 's'}`;
    if ($('#cfCommandEffective')) $('#cfCommandEffective').textContent = count ? `Os ${count} comando${count === 1 ? '' : 's'} serão enviados junto da instrução.` : 'Selecione comandos para reutilizar na próxima geração.';
    root.innerHTML = state.commands.length ? state.commands.map(c => `<article class="cf-command-item"><label><input type="checkbox" data-cf-command-select="${esc(c.id)}" ${state.selected.has(c.id) ? 'checked' : ''}></label><div><strong>${esc(c.nome)}</strong><p>${esc(c.texto)}</p><div class="cf-command-actions"><button type="button" class="mini-button" data-cf-command-edit="${esc(c.id)}">Editar</button><button type="button" class="mini-button danger" data-cf-command-delete="${esc(c.id)}">Excluir</button></div></div></article>`).join('') : '<small>Nenhum comando salvo. Crie o primeiro acima.</small>';
  }
  function resetCommandForm() {
    state.editingId = '';
    if ($('#cfCommandName')) $('#cfCommandName').value = '';
    if ($('#cfCommandText')) $('#cfCommandText').value = '';
    if ($('#cfCommandSave')) $('#cfCommandSave').textContent = 'Salvar comando';
    if ($('#cfCommandCancel')) $('#cfCommandCancel').hidden = true;
  }
  function editCommand(id) {
    const c = state.commands.find(x => x.id === id); if (!c) return;
    state.editingId = id; $('#cfCommandName').value = c.nome; $('#cfCommandText').value = c.texto;
    $('#cfCommandSave').textContent = 'Salvar alteração'; $('#cfCommandCancel').hidden = false; $('#cfCommandName').focus();
  }
  async function saveCommand() {
    const nome = text($('#cfCommandName')?.value), texto = text($('#cfCommandText')?.value);
    if (!nome || !texto) return toast('Preencha nome e texto do comando.', true);
    const current = state.commands.find(c => c.id === state.editingId);
    const id = current?.id || safe(`cmd-${Date.now()}-${Math.random().toString(36).slice(2,8)}`), now = new Date().toISOString();
    try {
      await fbPut(`${COMMANDS_NODE}/${safe(id)}`, { id, nome, texto, ativo:true, criado_em:current?.criado_em || now, atualizado_em:now });
      resetCommandForm(); await loadCommands(true); toast('Comando salvo.');
    } catch (error) { toast(error.message || 'Falha ao salvar comando.', true); }
  }
  async function deleteCommand(id) {
    const c = state.commands.find(x => x.id === id); if (!c || !confirm(`Excluir o comando “${c.nome}”?`)) return;
    try {
      await fbDelete(`${COMMANDS_NODE}/${safe(id)}`); state.selected.delete(id); persistSelected(); await loadCommands(true); toast('Comando excluído.');
    } catch (error) { toast(error.message || 'Falha ao excluir comando.', true); }
  }
  function selectedInstruction() {
    return state.commands.filter(c => state.selected.has(c.id)).map((c,i) => `COMANDO PADRÃO ${i+1} — ${c.nome}:\n${c.texto}`).join('\n\n');
  }

  function installCommandUi() {
    const form = $('#generatorForm'); if (!form || $('#cfCommandLibrary')) return;
    const instruction = form.querySelector('textarea[name="instrucao"]')?.closest('label'); if (!instruction) return;
    const section = document.createElement('section');
    section.id = 'cfCommandLibrary'; section.className = 'cf-command-library';
    section.innerHTML = `<div class="cf-command-head"><div><strong>Comandos padrão</strong><small>Crie, salve e selecione comandos para reutilizar nas próximas gerações.</small></div><button type="button" class="mini-button" id="cfCommandRefresh">Atualizar</button></div><div id="cfCommandForm" class="cf-command-form"><input id="cfCommandName" maxlength="60" placeholder="Nome do comando"><textarea id="cfCommandText" maxlength="1000" rows="3" placeholder="Texto da instrução reutilizável"></textarea><div><button type="button" class="mini-button" id="cfCommandSave">Salvar comando</button><button type="button" class="mini-button" id="cfCommandCancel" hidden>Cancelar</button></div></div><div id="cfCommandStatus" class="cf-command-effective"></div><div class="cf-command-toolbar"><span id="cfCommandSelected">0 selecionados</span><button type="button" class="mini-button" id="cfCommandClear">Limpar seleção</button></div><div id="cfCommandEffective" class="cf-command-effective">Selecione comandos para reutilizar na próxima geração.</div><div id="cfCommandList" class="cf-command-list"><small>Carregando comandos…</small></div>`;
    instruction.insertAdjacentElement('afterend', section);

    const note = document.createElement('div'); note.className = 'cf-automation-note';
    note.innerHTML = `<strong>Cenário esperado: V17 · mockup mestre PNG</strong><small>Fluxo: generate_mug_art → finalize_mug_product → mockup_png transparente → Firebase.</small><small>Webhook: <code>${esc(resolveWebhook())}</code></small>`;
    form.querySelector('.strong-hint')?.insertAdjacentElement('afterend', note);

    const positioning = document.createElement('div'); positioning.className = 'cf-position-note';
    positioning.innerHTML = '<strong>Saída da loja</strong><span>Arte horizontal + um único PNG transparente com duas vistas da mesma caneca em composição vertical. Nada importante deve ficar nos 10% extremos da arte, próximos à alça.</span>';
    section.insertAdjacentElement('afterend', positioning);

    $('#cfCommandRefresh').onclick = () => loadCommands(true);
    $('#cfCommandSave').onclick = saveCommand;
    $('#cfCommandCancel').onclick = resetCommandForm;
    $('#cfCommandClear').onclick = () => { state.selected.clear(); persistSelected(); renderCommands(); };
    $('#cfCommandList').addEventListener('change', event => {
      const input = event.target.closest('[data-cf-command-select]'); if (!input) return;
      if (input.checked) state.selected.add(input.dataset.cfCommandSelect); else state.selected.delete(input.dataset.cfCommandSelect);
      persistSelected(); renderCommands();
    });
    $('#cfCommandList').addEventListener('click', event => {
      const edit = event.target.closest('[data-cf-command-edit]'), del = event.target.closest('[data-cf-command-delete]');
      if (edit) editCommand(edit.dataset.cfCommandEdit); if (del) deleteCommand(del.dataset.cfCommandDelete);
    });
  }

  function installStyles() {
    if ($('#cfGeneratorV7Styles')) return;
    const style = document.createElement('style'); style.id = 'cfGeneratorV7Styles';
    style.textContent = `.cf-command-library{grid-column:1/-1;border:1px solid #e2e2e2;border-radius:18px;padding:16px;background:#fafafa;display:grid;gap:12px}.cf-command-head,.cf-command-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.cf-command-head small{display:block;color:#777;margin-top:3px}.cf-command-form{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(240px,1.5fr) auto;gap:8px;align-items:start}.cf-command-form input,.cf-command-form textarea{width:100%}.cf-command-form>div{display:flex;gap:6px;flex-wrap:wrap}.cf-command-effective,.cf-automation-note,.cf-position-note{font-size:12px;color:#656565}.cf-command-list{display:grid;gap:8px;max-height:300px;overflow:auto}.cf-command-item{display:grid;grid-template-columns:24px 1fr;gap:8px;padding:11px;border:1px solid #e6e6e6;border-radius:14px;background:#fff}.cf-command-item p{margin:4px 0 8px;font-size:12px;color:#666;white-space:pre-wrap}.cf-command-actions{display:flex;gap:6px}.cf-command-item input[type=checkbox]{width:17px;height:17px}.cf-automation-note{display:grid;gap:3px;padding:10px 12px;border:1px solid #dfe8df;border-radius:13px;background:#f7fbf7;margin:10px 0}.cf-automation-note strong{color:#1f4b2b}.cf-automation-note code{word-break:break-all;font-size:10px}.cf-position-note{grid-column:1/-1;padding:10px 12px;border-left:3px solid #111;background:#fff}.cf-position-note strong{display:block;color:#111;margin-bottom:3px}.cf-position-note span{line-height:1.45}@media(max-width:760px){.cf-command-form{grid-template-columns:1fr}.cf-command-head,.cf-command-toolbar{align-items:flex-start;flex-direction:column}}`;
    document.head.appendChild(style);
  }

  function generatorData(form) {
    return {
      manual: text(form.elements.instrucao?.value), nome: text(form.elements.nome?.value), categoria: text(form.elements.categoria?.value) || 'Geral',
      subcategoria: text(form.elements.subcategoria?.value), fundo: normalizeHex(form.elements.fundo_text?.value || form.elements.fundo?.value),
      personalizavel: form.elements.personalizavel?.checked !== false
    };
  }
  function effectiveInstruction(data) {
    return [selectedInstruction(), data.manual].filter(Boolean).join('\n\nINSTRUÇÃO COMPLEMENTAR DO OPERADOR:\n');
  }
  function generatedName(data, instruction) {
    if (data.nome) return data.nome;
    const first = text(instruction).replace(/^COMANDO PADRÃO[^:]*:\s*/i, '').split(/[.!?\n]/)[0].trim();
    return first.slice(0,58) || 'Caneca editorial';
  }
  function buildTemplate(data, id, instruction) {
    const nome = generatedName(data, instruction), now = new Date().toISOString();
    return JSON.stringify({
      nome, slug: slug(nome), ordem: Date.now(), categoria: data.categoria, subcategoria: data.subcategoria,
      preco: 24.9, fundo: data.fundo, mockup_png: '__MUG_MOCKUP_PNG__', mockup_1: '__MUG_MOCKUP_1__', mockup_2: '__MUG_MOCKUP_2__',
      arte_horizontal: '__MUG_ART__', descricao_curta: text(instruction).slice(0,220), ativo: false, personalizavel: data.personalizavel,
      geracao_status: 'concluido', geracao_versao: BUILD, geracao_estilo: 'editorial_pop_contemporaneo',
      mockup_contrato: 'master_png_transparente_duas_vistas', criado_em: now, atualizado_em: now
    });
  }

  async function waitArt(id) {
    const end = Date.now() + WAIT_MS;
    while (Date.now() < end) {
      const record = await fbGet(`${GENERATIONS_NODE}/${safe(id)}`).catch(() => null);
      if (record?.ok === false) throw new Error(text(record.error || record.message) || 'A geração da arte falhou no Make.');
      const value = imageRef(record || {});
      if (validImageRef(value)) return value;
      await sleep(POLL_MS);
    }
    throw new Error('O cenário não devolveu a arte horizontal em até 6 minutos.');
  }
  async function waitFinal(id) {
    const end = Date.now() + WAIT_MS;
    let lastStatus = '';
    while (Date.now() < end) {
      const [generation, product] = await Promise.all([
        fbGet(`${GENERATIONS_NODE}/${safe(id)}`).catch(() => null),
        fbGet(`${ROOT}/produtos/${safe(id)}`).catch(() => null)
      ]);
      if (generation?.ok === false) throw new Error(text(generation.error || generation.message) || 'A finalização falhou no Make.');
      const status = text(generation?.status);
      if (status && status !== lastStatus) {
        lastStatus = status;
        const labels = { finalizing:'Preparando finalização no Make…', art_saved:'Arte horizontal salva. Gerando mockup mestre…', mockup_saved:'Mockup PNG salvo. Gravando produto…', complete:'Finalização concluída. Conferindo produto…' };
        if ($('#progressText')) $('#progressText').textContent = labels[status] || `Make: ${status}`;
      }
      const art = text(product?.arte_horizontal), mockup = text(product?.mockup_png);
      if (product && validImageRef(art) && validPngRef(mockup) && product.mockup_contrato === 'master_png_transparente_duas_vistas') return product;
      if (product && mockup === '__MUG_MOCKUP_PNG__') lastStatus = 'cenario_antigo_sem_mockup_png';
      await sleep(POLL_MS);
    }
    const detail = lastStatus ? ` Último status: ${lastStatus}.` : '';
    throw new Error(`O cenário não entregou o mockup PNG mestre no contrato V17 em até 6 minutos.${detail}`);
  }

  function showResult(product, id) {
    const root = $('#generatorResult'); if (!root) return;
    root.hidden = false;
    root.innerHTML = `<div class="result-head"><div><p class="kicker">Concluído · inativo para revisão</p><h2>${esc(product.nome || 'Nova caneca')}</h2></div></div><div class="result-grid"><figure class="result-figure mockup-result" style="background:${esc(product.fundo || '#FF6B1A')}"><img src="${esc(product.mockup_png)}" alt="Mockup mestre PNG"><figcaption>Mockup mestre único · PNG transparente · duas vistas verticais</figcaption></figure><div class="result-art"><img src="${esc(product.arte_horizontal)}" alt="Arte horizontal"><div class="result-meta"><div><span>Categoria</span><strong>${esc(product.categoria || 'Geral')}${product.subcategoria ? ' · '+esc(product.subcategoria) : ''}</strong></div><div><span>Contrato</span><strong>master PNG</strong></div><div><span>ID</span><strong>${esc(id)}</strong></div></div></div></div>`;
  }

  async function run(event) {
    const form = event.target;
    if (form?.id !== 'generatorForm') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (state.busy) return;
    const data = generatorData(form), file = $('#generatorReference')?.files?.[0] || null;
    const instruction = effectiveInstruction(data);
    if (!file && !instruction) return toast('Envie uma imagem de inspiração, selecione um comando ou escreva uma instrução.', true);

    const id = `mug-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    setBusy(true); if ($('#generatorResult')) $('#generatorResult').hidden = true;
    try {
      progress(10, 'Preparando', file ? 'Normalizando a imagem de inspiração.' : 'Criando base branca para geração por comandos.');
      const reference = await normalizedReference(file);

      progress(35, 'Gerando arte horizontal', 'Criando a arte plana 2400×960 no estilo fixo CanecaFácil.');
      const artResponse = await callMake({ action:'generate_mug_art', mode:'create_model', request_id:id, image_base64:reference, instruction, prompt_art:artPrompt(instruction) }, true);
      let art = imageRef(artResponse);
      if (!validImageRef(art) && artResponse.accepted) art = await waitArt(id);
      if (!validImageRef(art)) throw new Error('O cenário não devolveu uma arte horizontal válida.');

      progress(65, 'Gerando mockup mestre', 'Enviando a arte para a finalização V17. O Make responderá Accepted e continuará em segundo plano.');
      const finish = await callMake({
        action:'finalize_mug_product', request_id:id, image_base64:art,
        prompt_mockup_master:mockupMasterPrompt(),
        prompt_mockup_1:mockupMasterPrompt(), prompt_mockup_2:mockupMasterPrompt(),
        firebase_url:FIREBASE, products_node:`${ROOT}/produtos`,
        firebase_template_json:buildTemplate(data,id,instruction), seo_slug:slug(generatedName(data,instruction)),
        personalizavel:data.personalizavel, ativo_loja:false
      }, true);
      if (finish.accepted && $('#progressText')) $('#progressText').textContent = 'Accepted · acompanhando o cenário pelo Firebase…';

      progress(75, 'Finalizando no Make', 'Aguardando arte salva, mockup PNG transparente e cadastro do produto.');
      const product = await waitFinal(id);
      progress(100, 'Concluído', 'Arte horizontal e mockup mestre PNG foram salvos corretamente.');
      showResult(product,id); toast('Caneca gerada no contrato V17 e salva para revisão.');
      $('#reloadBtn')?.click();
      setTimeout(() => fbDelete(`${GENERATIONS_NODE}/${safe(id)}`).catch(() => {}), 20000);
    } catch (error) {
      console.error('[CanecaFácil generator v7]', error);
      toast(error.message || 'Falha ao gerar a caneca.', true);
      if ($('#progressText')) $('#progressText').textContent = error.message || 'Falha ao gerar.';
    } finally { setBusy(false); }
  }

  function clearGenerator() {
    if (state.busy) return;
    const form = $('#generatorForm'); if (!form) return;
    form.reset();
    if (form.elements.fundo) form.elements.fundo.value = '#FF6B1A';
    if (form.elements.fundo_text) form.elements.fundo_text.value = '#FF6B1A';
    const input = $('#generatorReference'); if (input) input.value = '';
    const preview = $('#referencePreview'); if (preview) preview.innerHTML = '<small>Nenhuma imagem selecionada</small>';
    if ($('#generatorProgress')) $('#generatorProgress').hidden = true;
    if ($('#generatorResult')) $('#generatorResult').hidden = true;
    state.selected.clear(); persistSelected(); renderCommands();
  }

  function boot() {
    const form = $('#generatorForm'); if (!form) return;
    form.onsubmit = null;
    ['tema','frase'].forEach(name => { const el = form.elements?.[name]; if (el) { el.required = false; el.closest('label')?.remove(); } });
    const badge = form.querySelector('.contract-badge'); if (badge) badge.textContent = 'V17';
    const hint = form.querySelector('.strong-hint'); if (hint) hint.textContent = 'Imagem de inspiração opcional + comandos salvos + instrução opcional. Saída: arte horizontal e um mockup mestre PNG transparente.';
    installStyles(); installCommandUi(); loadCommands();
    form.addEventListener('submit', run, true);
    const clear = $('#clearGeneratorBtn'); if (clear) clear.onclick = clearGenerator;
    document.documentElement.dataset.generatorV7 = BUILD;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once:true });
  else setTimeout(boot, 0);
})();
