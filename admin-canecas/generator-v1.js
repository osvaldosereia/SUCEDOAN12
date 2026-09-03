import { FIREBASE_BASE, text, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260903-admin-canecas-generator-v3-async-core';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.mugGeneratorWebhook
  || window.__CANECAS_ADMIN_CONFIG__?.makeWebhook
  || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const PRODUCTS_NODE = 'produtos';
const COMMANDS_NODE = 'canecas/comandos_criacao';
const GENERATIONS_NODE = 'canecas/geracoes';
const SELECTED_KEY = 'da_admin_v2_mug_saved_commands_selected';
const MASTER_WIDTH = 2400;
const MASTER_HEIGHT = 960;
const SIDE_WIDTH = 1344;
const PRINT_LABEL = '24 × 9,5 cm';
const FINAL_WAIT_MS = 180000;
const POLL_MS = 1800;
const PH = Object.freeze({ art: '__MUG_ART__', m1: '__MUG_MOCKUP_1__', m2: '__MUG_MOCKUP_2__' });

const state = { installed: false, busy: false, commands: [], selected: loadSelected(), editingId: '', previewUrl: '' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isHttpUrl = v => /^https?:\/\//i.test(text(v)) && !text(v).startsWith('__MUG_');
const isImageSource = v => isHttpUrl(v) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(text(v));
const requestId = () => `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function loadSelected() { try { const raw = JSON.parse(localStorage.getItem(SELECTED_KEY) || '[]'); return new Set(Array.isArray(raw) ? raw.map(String) : []); } catch { return new Set(); } }
function persistSelected() { localStorage.setItem(SELECTED_KEY, JSON.stringify([...state.selected])); }
function toast(message, error = false) { const el = $('#toast'); if (!el) return; el.textContent = message; el.className = `toast${error ? ' error' : ''}`; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, error ? 5600 : 3000); }
async function fbGet(path) { const r = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`Firebase ${r.status}`); return r.json(); }
async function fbPut(path, value) { const r = await fetch(`${FIREBASE_BASE}/${path}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value) }); if (!r.ok) throw new Error(`Firebase ${r.status}`); return r.json().catch(() => null); }
async function fbPatch(path, value) { const r = await fetch(`${FIREBASE_BASE}/${path}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value) }); if (!r.ok) throw new Error(`Firebase ${r.status}`); return r.json().catch(() => null); }
async function fbDelete(path) { const r = await fetch(`${FIREBASE_BASE}/${path}.json`, { method: 'DELETE' }); if (!r.ok) throw new Error(`Firebase ${r.status}`); }

function ensureShell() {
  if (state.installed) return;
  state.installed = true;
  const nav = $('#nav'), main = $('#main');
  if (!nav || !main) return;
  const button = document.createElement('button');
  button.id = 'mugGeneratorNav'; button.type = 'button'; button.innerHTML = '<b>GR</b>Gerador';
  nav.querySelector('[data-route="mugs"]')?.insertAdjacentElement('afterend', button);
  const section = document.createElement('section');
  section.className = 'view'; section.dataset.view = 'generator'; section.innerHTML = '<div id="generator"></div>';
  main.querySelector('[data-view="mugs"]')?.insertAdjacentElement('afterend', section);
  button.onclick = showGenerator;
  nav.addEventListener('click', event => { if (event.target.closest('[data-route]')) button.classList.remove('active'); });
  renderGenerator(); loadCommands(); document.documentElement.dataset.adminCanecasGenerator = BUILD;
}

function showGenerator() {
  $$('.view').forEach(view => view.classList.toggle('active', view.dataset.view === 'generator'));
  $$('#nav [data-route]').forEach(button => button.classList.remove('active'));
  $('#mugGeneratorNav')?.classList.add('active');
  if ($('#pageTitle')) $('#pageTitle').textContent = 'Criador de canecas';
  if ($('#pageSubtitle')) $('#pageSubtitle').textContent = 'Imagem de inspiração + comandos salvos + instrução opcional. Mesmo fluxo do Produção.';
  $('#sidebar')?.classList.remove('open'); renderGenerator(); loadCommands();
}

function renderGenerator() {
  const root = $('#generator'); if (!root || root.dataset.ready === BUILD) return; root.dataset.ready = BUILD;
  root.innerHTML = `
    <section id="mugAutomationPanel" class="panel mug-prod-generator">
      <div class="mug-prod-head"><div><span class="eyebrow">Criador de Canecas</span><h2>Arte horizontal + 2 mockups</h2><p>Mesmo fluxo do Produção. Nenhum campo de texto é obrigatório: use imagem, comandos, uma instrução opcional ou combine os três.</p></div><span class="badge warning">Cadastro inativo</span></div>
      <div class="mug-prod-main">
        <section class="mug-prod-create">
          <label class="mug-prod-drop" for="mugArtImage"><div id="mugArtEmpty"><strong>Escolher imagem</strong><small>PNG, JPG ou WEBP · opcional</small></div><img id="mugArtPreview" alt="Imagem de inspiração" hidden></label>
          <input id="mugArtImage" type="file" accept="image/*" hidden>
          <label class="mug-prod-instruction"><strong>Instrução complementar <span class="muted">(opcional)</span></strong><textarea id="mugArtInstruction" maxlength="800" placeholder="Ex.: escreva exatamente ‘Eis-me aqui Senhor.’; use tons de azul..."></textarea><small>Os comandos selecionados são somados automaticamente a esta instrução.</small></label>
          <div class="mug-prod-actions"><button class="primary" id="mugArtGenerate" type="button">Gerar caneca</button><button class="secondary" id="mugArtClear" type="button">Limpar</button></div>
          <div class="mug-progress" id="mugProgress" hidden><div><strong id="mugProgressTitle">Preparando…</strong><span id="mugProgressPercent">0%</span></div><div class="mug-progress-track"><i id="mugProgressBar"></i></div></div>
          <p id="mugAutomationStatus" class="mug-generator-status">Pronto para gerar.</p>
          <details class="mug-prod-config"><summary>Configuração</summary><div class="notice"><b>Webhook Make:</b> ${esc(MAKE_WEBHOOK)}<br><b>IA:</b> LOW fixa · <b>Arte:</b> ${MASTER_WIDTH}×${MASTER_HEIGHT}px · ${PRINT_LABEL}</div></details>
        </section>
        <aside class="mug-command-library" id="mugCommandLibrary">
          <div class="mug-command-head"><div><h3>Comandos salvos</h3><p>Selecione um ou mais para reutilizar.</p></div><button class="secondary" id="mugCommandRefresh" type="button">Atualizar</button></div>
          <div class="mug-command-form"><input id="mugCommandName" maxlength="60" placeholder="Nome do comando · Ex.: Sem texto"><textarea id="mugCommandText" maxlength="800" placeholder="Escreva aqui o comando que será reutilizado."></textarea><div class="mug-command-form-actions"><button class="primary" id="mugCommandSave" type="button">Salvar comando</button><button class="secondary" id="mugCommandCancel" type="button" hidden>Cancelar</button></div><div class="mug-command-status" id="mugCommandStatus"></div></div>
          <div class="mug-command-toolbar"><span id="mugCommandSelectedCount">0 selecionados</span><button class="secondary" id="mugCommandClearSelection" type="button">Limpar seleção</button></div>
          <div class="mug-command-effective" id="mugCommandEffective">Selecione comandos para somá-los à próxima criação.</div>
          <div class="mug-command-list" id="mugCommandList"><div class="notice">Carregando comandos…</div></div>
        </aside>
      </div>
      <div id="mugArtResult" class="mug-generator-result" hidden></div>
    </section>`;
  bindGenerator();
}

function bindGenerator() {
  $('#mugArtImage')?.addEventListener('change', previewReference); $('#mugArtGenerate')?.addEventListener('click', generate); $('#mugArtClear')?.addEventListener('click', clearGenerator);
  $('#mugCommandRefresh')?.addEventListener('click', () => loadCommands(true)); $('#mugCommandSave')?.addEventListener('click', saveCommand); $('#mugCommandCancel')?.addEventListener('click', resetCommandForm);
  $('#mugCommandClearSelection')?.addEventListener('click', () => { state.selected.clear(); persistSelected(); renderCommands(); });
  $('#mugCommandList')?.addEventListener('change', event => { const input = event.target.closest('[data-command-select]'); if (!input) return; if (input.checked) state.selected.add(input.dataset.commandSelect); else state.selected.delete(input.dataset.commandSelect); persistSelected(); renderCommands(); });
  $('#mugCommandList')?.addEventListener('click', event => { const edit = event.target.closest('[data-command-edit]'), del = event.target.closest('[data-command-delete]'); if (edit) editCommand(edit.dataset.commandEdit); if (del) deleteCommand(del.dataset.commandDelete); });
}

function previewReference() {
  const file = $('#mugArtImage')?.files?.[0], img = $('#mugArtPreview'), empty = $('#mugArtEmpty');
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); state.previewUrl = '';
  if (!file) { img.hidden = true; img.removeAttribute('src'); empty.hidden = false; return; }
  if (!file.type.startsWith('image/')) { $('#mugArtImage').value = ''; return toast('Escolha um arquivo de imagem.', true); }
  state.previewUrl = URL.createObjectURL(file); img.src = state.previewUrl; img.hidden = false; empty.hidden = true;
}
function clearGenerator() {
  if (state.busy) return; const input = $('#mugArtImage'); if (input) input.value = ''; if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); state.previewUrl = '';
  const img = $('#mugArtPreview'); if (img) { img.hidden = true; img.removeAttribute('src'); } if ($('#mugArtEmpty')) $('#mugArtEmpty').hidden = false;
  if ($('#mugArtInstruction')) $('#mugArtInstruction').value = ''; if ($('#mugArtResult')) $('#mugArtResult').hidden = true; if ($('#mugAutomationStatus')) $('#mugAutomationStatus').textContent = 'Pronto para gerar.'; if ($('#mugProgress')) $('#mugProgress').hidden = true;
}

function normalizeCommands(data) { return Object.entries(data || {}).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([key, v]) => ({ id: text(v.id || key), nome: text(v.nome || v.name), texto: text(v.texto || v.prompt || v.comando), criado_em: text(v.criado_em) })).filter(item => item.id && item.nome && item.texto).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })); }
async function loadCommands(force = false) { if (state.commands.length && !force) return renderCommands(); if ($('#mugCommandStatus')) $('#mugCommandStatus').textContent = 'Carregando…'; try { state.commands = normalizeCommands(await fbGet(COMMANDS_NODE)); state.selected = new Set([...state.selected].filter(id => state.commands.some(item => item.id === id))); persistSelected(); renderCommands(); if ($('#mugCommandStatus')) $('#mugCommandStatus').textContent = ''; } catch (error) { if ($('#mugCommandStatus')) $('#mugCommandStatus').textContent = error.message || error; } }
function renderCommands() {
  const list = $('#mugCommandList'); if (!list) return; const count = state.selected.size;
  if ($('#mugCommandSelectedCount')) $('#mugCommandSelectedCount').textContent = `${count} selecionado${count === 1 ? '' : 's'}`;
  if ($('#mugCommandEffective')) $('#mugCommandEffective').textContent = count ? `Os ${count} comando${count === 1 ? '' : 's'} selecionado${count === 1 ? '' : 's'} serão somados à instrução ao gerar.` : 'Selecione comandos para somá-los à próxima criação.';
  list.innerHTML = state.commands.length ? state.commands.map(item => `<article class="mug-command-item"><label class="mug-command-check"><input type="checkbox" data-command-select="${esc(item.id)}" ${state.selected.has(item.id) ? 'checked' : ''}></label><div class="mug-command-body"><strong>${esc(item.nome)}</strong><p title="${esc(item.texto)}">${esc(item.texto)}</p><div class="mug-command-actions"><button class="secondary" type="button" data-command-edit="${esc(item.id)}">Editar</button><button class="secondary" type="button" data-command-delete="${esc(item.id)}">Excluir</button></div></div></article>`).join('') : '<div class="notice">Nenhum comando salvo.</div>';
}
function resetCommandForm() { state.editingId = ''; if ($('#mugCommandName')) $('#mugCommandName').value = ''; if ($('#mugCommandText')) $('#mugCommandText').value = ''; if ($('#mugCommandSave')) $('#mugCommandSave').textContent = 'Salvar comando'; if ($('#mugCommandCancel')) $('#mugCommandCancel').hidden = true; }
function editCommand(id) { const item = state.commands.find(command => command.id === id); if (!item) return; state.editingId = id; $('#mugCommandName').value = item.nome; $('#mugCommandText').value = item.texto; $('#mugCommandSave').textContent = 'Salvar alteração'; $('#mugCommandCancel').hidden = false; $('#mugCommandName').focus(); }
async function saveCommand() { const nome = text($('#mugCommandName')?.value), texto = text($('#mugCommandText')?.value); if (!nome || !texto) return void ($('#mugCommandStatus').textContent = 'Preencha nome e texto apenas para salvar o comando.'); const current = state.commands.find(item => item.id === state.editingId), id = current?.id || safeKey(`cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), now = new Date().toISOString(); try { $('#mugCommandStatus').textContent = 'Salvando…'; await fbPut(`${COMMANDS_NODE}/${safeKey(id)}`, { id, nome, texto, ativo: true, criado_em: current?.criado_em || now, atualizado_em: now }); resetCommandForm(); await loadCommands(true); $('#mugCommandStatus').textContent = 'Comando salvo.'; } catch (error) { $('#mugCommandStatus').textContent = error.message || error; } }
async function deleteCommand(id) { const item = state.commands.find(command => command.id === id); if (!item || !confirm(`Excluir o comando "${item.nome}"?`)) return; try { await fbDelete(`${COMMANDS_NODE}/${safeKey(id)}`); state.selected.delete(id); persistSelected(); await loadCommands(true); } catch (error) { $('#mugCommandStatus').textContent = error.message || error; } }
function effectiveInstruction() { const selected = state.commands.filter(item => state.selected.has(item.id)), blocks = selected.map((item, index) => `COMANDO SALVO ${index + 1} — ${item.nome}:\n${item.texto}`), manual = text($('#mugArtInstruction')?.value); if (manual) blocks.push(`INSTRUÇÃO COMPLEMENTAR DIGITADA:\n${manual}`); return blocks.join('\n\n'); }

function fileData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file); }); }
function loadImage(source, timeoutMs = 30000) { return new Promise((resolve, reject) => { const image = new Image(), timer = setTimeout(() => reject(new Error('Tempo esgotado ao abrir a imagem.')), timeoutMs); if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous'; image.onload = () => { clearTimeout(timer); resolve(image); }; image.onerror = () => { clearTimeout(timer); reject(new Error('Não foi possível abrir a imagem.')); }; image.src = source; }); }
async function normalizeReference(file) { const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024; const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); if (file) { if (file.size > 25 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 25 MB.'); const image = await loadImage(await fileData(file)), scale = Math.min(1320 / image.naturalWidth, 880 / image.naturalHeight), width = image.naturalWidth * scale, height = image.naturalHeight * scale; ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); } return canvas.toDataURL('image/webp', 0.92); }
async function cropMaster(source) { const image = await loadImage(source), target = MASTER_WIDTH / MASTER_HEIGHT, ratio = image.naturalWidth / image.naturalHeight; let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight; if (ratio > target) { sw = image.naturalHeight * target; sx = (image.naturalWidth - sw) / 2; } else { sh = image.naturalWidth / target; sy = (image.naturalHeight - sh) / 2; } const canvas = document.createElement('canvas'); canvas.width = MASTER_WIDTH; canvas.height = MASTER_HEIGHT; const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, MASTER_WIDTH, MASTER_HEIGHT); ctx.drawImage(image, sx, sy, sw, sh, 0, 0, MASTER_WIDTH, MASTER_HEIGHT); return canvas.toDataURL('image/webp', 0.96); }
async function cropReference(master, side) { const image = await loadImage(master), sx = side === 'left' ? 0 : MASTER_WIDTH - SIDE_WIDTH, canvas = document.createElement('canvas'); canvas.width = SIDE_WIDTH; canvas.height = MASTER_HEIGHT; const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIDE_WIDTH, MASTER_HEIGHT); ctx.drawImage(image, sx, 0, SIDE_WIDTH, MASTER_HEIGHT, 0, 0, SIDE_WIDTH, MASTER_HEIGHT); return canvas.toDataURL('image/webp', 0.96); }

function buildArtPrompt(instruction, hasReference) { const source = hasReference ? 'inspirada na imagem enviada' : 'original, comercial e pronta para venda'; return `Crie uma NOVA ARTE COMERCIAL PARA CANECA ${source}.\n\n${instruction ? `INSTRUÇÕES DO OPERADOR — prioridade máxima:\n${instruction}\n\n` : ''}ENTREGA: somente arte plana horizontal ${MASTER_WIDTH}×${MASTER_HEIGHT}px (${PRINT_LABEL}), pronta para sublimação. Preserve equilíbrio entre esquerda, centro e direita. Não mostre caneca, mãos, mesa, embalagem ou interface. Se houver texto solicitado, reproduza exatamente; se não houver, não invente texto. Se não houver imagem nem instruções, crie uma arte comercial original, moderna e neutra.`; }
function buildMockupPrompt(side) { const view = side === 'left' ? 'PRIMEIRA METADE / LADO ESQUERDO, com a alça à direita' : 'SEGUNDA METADE / LADO DIREITO, com a alça à esquerda'; return `Use a arte fornecida como ARTE-MESTRE IMUTÁVEL. Mostre ${view} aplicado em uma caneca branca de porcelana 350ml, fotografia quadrada ultra realista, fundo claro e simples. Não redesenhe, não reescreva, não altere cores e não invente símbolos. Preserve a arte exatamente e aplique apenas a curvatura natural da caneca.`; }
function fallbackCatalog(reason = '') { return { tema: 'Arte Criativa', nome: 'Caneca de Porcelana Arte Criativa - 350ml', subcategoria: 'Arte Criativa', descricao: 'Caneca de porcelana branca 350ml com arte exclusiva, ideal para uso pessoal ou presente.', tags: ['caneca de porcelana', 'caneca 350ml', 'arte criativa', 'presente'], seo_title: 'Caneca de Porcelana Arte Criativa - 350ml', seo_description: 'Caneca de porcelana branca 350ml com arte exclusiva, ideal para presente e uso pessoal.', texto_identificado: '', source: 'fallback', reason: text(reason).slice(0, 180) }; }
function normalizeCatalog(input) { const base = fallbackCatalog(); if (!input || typeof input !== 'object' || Array.isArray(input)) return base; const clean = (v, max = 180) => text(v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, max).trim(); const tema = clean(input.tema || input.theme || 'Arte Criativa', 90) || 'Arte Criativa'; let nome = clean(input.nome || input.product_name || input.name, 160) || `Caneca de Porcelana ${tema} - 350ml`; if (!/^Caneca de Porcelana\s+/i.test(nome)) nome = `Caneca de Porcelana ${nome.replace(/\s*-\s*350ml$/i, '')} - 350ml`; if (!/\s-\s350ml$/i.test(nome)) nome = `${nome.replace(/\s*-?\s*350ml$/i, '').trim()} - 350ml`; const descricao = clean(input.descricao || input.description, 800) || `Caneca de porcelana branca 350ml com arte temática de ${tema}, ideal para uso pessoal ou presente.`; const tags = (Array.isArray(input.tags) ? input.tags : base.tags).map(v => clean(v, 60)).filter(Boolean).slice(0, 10); return { tema, nome, subcategoria: clean(input.subcategoria || tema, 90) || tema, descricao, tags: tags.length ? tags : base.tags, seo_title: clean(input.seo_title || nome, 120), seo_description: clean(input.seo_description || descricao, 155), texto_identificado: clean(input.texto_identificado, 260), source: 'ia_visual' }; }
function parseCatalog(result) { let raw = result?.catalog ?? result?.catalog_json ?? result?.metadata ?? result?.metadata_json ?? result?.result ?? result?.product_name ?? result?.name; if (raw && typeof raw === 'object') return normalizeCatalog(raw); raw = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(); if (!raw) return fallbackCatalog('retorno vazio'); try { return normalizeCatalog(JSON.parse(raw)); } catch { return raw.length <= 160 ? normalizeCatalog({ nome: raw }) : fallbackCatalog('retorno não JSON'); } }

function artFromGeneration(record = {}) {
  const value = text(record.art_source_url || record.art_url || record.arte_url || record.art_source_base64 || record.art_base64 || record.image_base64);
  if (isImageSource(value)) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 1000) return `data:image/webp;base64,${value.replace(/\s+/g, '')}`;
  return '';
}
async function waitGeneratedArt(id, status) {
  const deadline = Date.now() + FINAL_WAIT_MS, started = Date.now();
  while (Date.now() < deadline) {
    const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    if (status) status.textContent = `O Make aceitou a criação. Aguardando a arte… ${seconds}s`;
    const record = await fbGet(`${GENERATIONS_NODE}/${safeKey(id)}`).catch(() => null);
    if (record?.ok === false) throw new Error(text(record.error || record.message) || 'A geração da arte falhou no Make.');
    const source = artFromGeneration(record || {});
    if (source) {
      setTimeout(() => fbDelete(`${GENERATIONS_NODE}/${safeKey(id)}`).catch(() => {}), 10000);
      return { ok: true, action: 'generate_mug_art', request_id: id, art_source_url: source, async_recovered: true };
    }
    await sleep(POLL_MS);
  }
  throw new Error(`A arte não apareceu em até 3 minutos. Código da tentativa: ${id}.`);
}
async function callMake(payload, { timeout = 180000, status = null } = {}) { const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout); try { const response = await fetch(MAKE_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ payload: JSON.stringify({ ...payload, quality: 'low', origin: BUILD, client_contract: BUILD }) }), signal: ctl.signal }); const raw = await response.text(); let data = null; if (raw) { try { data = JSON.parse(raw); } catch {} } if (data) { if (!response.ok || data.ok === false) throw new Error(text(data.error || data.message) || `Make HTTP ${response.status}`); return data; } if (response.ok && /^accepted\.?$/i.test(text(raw))) { clearTimeout(timer); if (payload.action === 'generate_mug_art') return waitGeneratedArt(payload.request_id, status); if (payload.action === 'finalize_mug_product') return waitFinalProduct(payload.request_id, status); } const snippet = text(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160); throw new Error(snippet ? `Make respondeu conteúdo inválido (${response.status}): ${snippet}` : `Make não devolveu JSON (${response.status}).`); } catch (error) { if (error?.name === 'AbortError') throw new Error(`A automação ultrapassou 3 minutos. Código da tentativa: ${payload.request_id || 'sem código'}.`); throw error; } finally { clearTimeout(timer); } }
async function analyzeCatalogSoft(id, master) { try { return parseCatalog(await callMake({ action: 'analyze_mug_product', request_id: id, image_base64: master, prompt_catalog: 'Analise somente a arte final. Retorne JSON com tema, nome comercial natural, subcategoria, descrição, tags, seo_title, seo_description e texto_identificado. Não use comandos técnicos como nome do produto.' }, { timeout: 90000 })); } catch (error) { console.warn('[Admin Canecas] catalogação visual falhou:', error); return fallbackCatalog(error.message || error); } }
function urlsFromProduct(product = {}) { return { art: text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url), m1: text(product.mockup_1 || product.url_imagem || product.imagens_site?.[0] || product.imagens?.[0]), m2: text(product.mockup_2 || product.imagens_site?.[1] || product.imagens?.[1]) }; }
async function waitFinalProduct(id, status) { const deadline = Date.now() + FINAL_WAIT_MS, started = Date.now(); while (Date.now() < deadline) { if (status) status.textContent = `Gerando 2 mockups e cadastrando… ${Math.max(1, Math.round((Date.now() - started) / 1000))}s`; const product = await fbGet(`${PRODUCTS_NODE}/${safeKey(id)}`).catch(() => null), urls = urlsFromProduct(product || {}); if ([urls.art, urls.m1, urls.m2].every(isHttpUrl)) return { ok: true, request_id: id, product_saved: true, firebase_key: id, arte_horizontal_url: urls.art, mockup_1_url: urls.m1, mockup_2_url: urls.m2 }; await sleep(POLL_MS); } throw new Error('A automação não publicou a arte e os 2 mockups em até 3 minutos.'); }

function firebaseTemplate(id, instruction, catalog) {
  const now = new Date().toISOString();
  return { id, firebaseKey: id, codigo: `CANP-${id.slice(-6).toUpperCase()}`, gtin: '', ean: '', codigo_barras: '', nome: catalog.nome, categoria: 'Caneca de Porcelana', subcategoria: catalog.subcategoria, tema: catalog.tema, ncm: '69111090', preco_custo: 10, preco: 24.90, estoque: 100, estoque_gerenciado: true, estoque_situacao_em_estoque: 1, estoque_situacao_sem_estoque: 0, situacao: 'I', status: 'I', ativo: false, visivel: false, loja_integrada_ativo: false, canecafacil_ativo: false, modelo_caneca: true, modelo_publico: false, personalizacao_publica: false, personalizavel: false, material: 'Porcelana', material_caneca: 'Porcelana', capacidade: '350ml', embalagem: 'Caneca de porcelana 350ml', unidade: 'UN', marca: 'Caneca Fácil', peso_embalado_kg: 0.3, altura_embalada_cm: 11, largura_embalada_cm: 11, comprimento_embalado_cm: 11, dimensao_impressao: PRINT_LABEL, descricao: catalog.descricao, tags: catalog.tags, seo_title: catalog.seo_title, seo_description: catalog.seo_description, texto_identificado_arte: catalog.texto_identificado || '', url_imagem: PH.m1, imagem: PH.m1, imagem_url: PH.m1, imagens: [PH.m1, PH.m2], imagens_site: [PH.m1, PH.m2], mockup_1: PH.m1, mockup_2: PH.m2, mockup_3: '', arte_personalizacao: PH.art, arte_horizontal: PH.art, arte_impressao: { url: PH.art, ratio: `${MASTER_WIDTH}:${MASTER_HEIGHT}`, width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: PRINT_LABEL, formato: 'webp' }, midias_admin: [PH.m1, PH.m2, PH.art], video_youtube: '', origem_cadastro: BUILD, tipo_produto: 'caneca_porcelana', geracao_status: 'concluido', geracao_etapa: 'firebase_salvo', geracao_versao: BUILD, configuracao_arte: { modo: 'imagem_comandos_instrucao', instrucao_complementar: instruction, comandos: [...state.selected], width: MASTER_WIDTH, height: MASTER_HEIGHT, dimensao_real: PRINT_LABEL, gerador: BUILD }, loja_integrada: { marca_nome: 'Caneca Fácil', categoria_tipo: 'padronizadas', categoria_nome: 'Canecas Padronizadas', tipo_producao: 'revenda', origem_mercadoria: '0', estoque_gerenciado: true, estoque_quantidade: 100, situacao_em_estoque: 1, situacao_sem_estoque: 0, sync_status: 'nao_publicado' }, politica_caneca_facil_versao: '20260829-1', criado_em: now, updated_at: now, last_update: Date.now() };
}
async function enforcePolicy(key) { return fbPatch(`${PRODUCTS_NODE}/${safeKey(key)}`, { marca: 'Caneca Fácil', estoque: 100, estoque_gerenciado: true, estoque_situacao_em_estoque: 1, estoque_situacao_sem_estoque: 0, peso_embalado_kg: 0.3, altura_embalada_cm: 11, largura_embalada_cm: 11, comprimento_embalado_cm: 11, 'loja_integrada/marca_nome': 'Caneca Fácil', 'loja_integrada/tipo_producao': 'revenda', 'loja_integrada/origem_mercadoria': '0', 'loja_integrada/estoque_gerenciado': true, 'loja_integrada/estoque_quantidade': 100, 'loja_integrada/situacao_em_estoque': 1, 'loja_integrada/situacao_sem_estoque': 0, politica_caneca_facil_versao: '20260829-1', updated_at: new Date().toISOString(), last_update: Date.now() }); }
function setBusy(value) { state.busy = value; if ($('#mugArtGenerate')) { $('#mugArtGenerate').disabled = value; $('#mugArtGenerate').textContent = value ? 'Gerando…' : 'Gerar caneca'; } $$(`#generator input, #generator textarea, #generator button`).forEach(el => { if (el.id !== 'mugArtGenerate') el.disabled = value; }); }
function setProgress(step, title, detail = '') { const percent = Math.round(step / 5 * 100), box = $('#mugProgress'); if (box) box.hidden = false; if ($('#mugProgressTitle')) $('#mugProgressTitle').textContent = title; if ($('#mugProgressPercent')) $('#mugProgressPercent').textContent = `${percent}%`; if ($('#mugProgressBar')) $('#mugProgressBar').style.width = `${percent}%`; if ($('#mugAutomationStatus')) $('#mugAutomationStatus').textContent = detail || title; }
function showResult(catalog, urls, key) { const result = $('#mugArtResult'); if (!result) return; result.hidden = false; result.innerHTML = `<div class="mug-result-head"><div><span class="badge good">CONCLUÍDO</span><h3>${esc(catalog.nome)}</h3><p>Firebase ${esc(key)} · cadastrado inativo para revisão.</p></div><button class="secondary" id="mugOpenCatalog" type="button">Abrir no cadastro</button></div><div class="mug-result-media"><div class="mug-result-mockups"><figure><img src="${esc(urls.m1)}" alt="Mockup 1"><figcaption>Mockup 1</figcaption></figure><figure><img src="${esc(urls.m2)}" alt="Mockup 2"><figcaption>Mockup 2</figcaption></figure></div><figure class="mug-result-art"><img src="${esc(urls.art)}" alt="Arte horizontal"><figcaption>Arte horizontal · ${MASTER_WIDTH}×${MASTER_HEIGHT}px · ${PRINT_LABEL}</figcaption></figure><div class="mug-result-catalog"><div><b>Tema</b>${esc(catalog.tema)}</div><div><b>Subcategoria</b>${esc(catalog.subcategoria)}</div><div><b>Nome</b>${esc(catalog.nome)}</div></div></div>`; $('#mugOpenCatalog').onclick = () => { $('#nav [data-route="mugs"]')?.click(); setTimeout(() => $(`#mugs tr[data-cf-mug="${CSS.escape(key)}"]`)?.click(), 900); }; }

async function generate() {
  if (state.busy) return;
  const file = $('#mugArtImage')?.files?.[0] || null;
  if (file && !file.type.startsWith('image/')) return toast('O arquivo escolhido não é uma imagem.', true);
  const instruction = effectiveInstruction(), id = requestId(), status = $('#mugAutomationStatus');
  setBusy(true); if ($('#mugArtResult')) $('#mugArtResult').hidden = true;
  try {
    setProgress(1, 'Preparando', file ? 'Preparando imagem e comandos…' : 'Gerando sem imagem de referência…');
    const reference = await normalizeReference(file);
    setProgress(2, 'Criando arte horizontal', 'OpenAI está criando a arte pelo mesmo cenário do Produção.');
    const artResult = await callMake({ action: 'generate_mug_art', mode: 'create_model', request_id: id, image_base64: reference, instruction, prompt_art: buildArtPrompt(instruction, Boolean(file)) }, { status });
    const artSource = text(artResult.art_source_url || artResult.arte_url || artResult.art_url || artResult.image_url || artResult.url || artResult.art_source_base64);
    if (!isImageSource(artSource)) throw new Error('O Make não devolveu a arte gerada.');
    setProgress(3, 'Finalizando e catalogando', `Fechando ${MASTER_WIDTH}×${MASTER_HEIGHT}px e criando nome/SEO automaticamente.`);
    const master = await cropMaster(artSource), catalog = await analyzeCatalogSoft(id, master), [left, right] = await Promise.all([cropReference(master, 'left'), cropReference(master, 'right')]), template = firebaseTemplate(id, instruction, catalog);
    setProgress(4, 'Gerando 2 mockups', 'Qualidade LOW fixa · cadastrando no Firebase.');
    const final = await callMake({ action: 'finalize_mug_product', request_id: id, image_base64: master, mockup_left_base64: left, mockup_right_base64: right, instruction, product_name: catalog.nome, prompt_mockup_1: buildMockupPrompt('right'), prompt_mockup_2: buildMockupPrompt('left'), firebase_url: FIREBASE_BASE, products_node: PRODUCTS_NODE, firebase_template_json: JSON.stringify(template) }, { timeout: 180000, status });
    let urls = { art: text(final.arte_horizontal_url || final.art_url || final.arte_url), m1: text(final.mockup_1_url), m2: text(final.mockup_2_url) };
    const key = text(final.firebase_key || final.product_key || id);
    if (![urls.art, urls.m1, urls.m2].every(isHttpUrl)) urls = urlsFromProduct(await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`) || {});
    if (![urls.art, urls.m1, urls.m2].every(isHttpUrl)) throw new Error('A automação terminou sem publicar a arte e os 2 mockups.');
    setProgress(5, 'Concluído', 'Produto inativo criado com nome, SEO, 2 mockups e arte horizontal.');
    await enforcePolicy(key).catch(error => console.warn('[Gerador Admin Canecas] política operacional:', error));
    showResult(catalog, urls, key); window.dispatchEvent(new CustomEvent('admin-canecas:mug-created', { detail: { key, source: BUILD } })); toast('Caneca criada pelo mesmo fluxo do Produção.');
  } catch (error) { console.error('[Gerador Admin Canecas]', error); if (status) status.textContent = `Erro: ${error.message || error}`; toast(error.message || error, true); }
  finally { setBusy(false); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureShell, { once: true }); else ensureShell();
export { BUILD, MAKE_WEBHOOK, showGenerator, generate };
