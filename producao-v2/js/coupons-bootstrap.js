import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { catalogVersionPayload } from './core/catalog.js';
import { escapeHtml, money, normalizeSearch, number, text } from './core/utils.js';
import { readJsonFile, upsertText } from './services/github.js';

const COUPONS_PATH = 'site/cuponsativos.json';
const AUDIT_KEY = 'da_admin_v2_audit_log';

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 7000 : 4000);
}

function audit(action, details = {}) {
  try {
    const current = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    current.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, action, at: new Date().toISOString(), details });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(current.slice(-1000)));
  } catch {}
}

function installStyle() {
  if (document.getElementById('couponsAdminStyle')) return;
  const style = document.createElement('style');
  style.id = 'couponsAdminStyle';
  style.textContent = `
    .suite-panel{margin-bottom:16px}.suite-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 16px}.suite-toolbar .search-field{min-width:240px;flex:1}.suite-actions{display:flex;gap:6px;flex-wrap:wrap}.suite-danger{color:#9b1c1c}
    .suite-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:1300}.suite-modal{position:fixed;z-index:1301;inset:5vh max(18px,calc((100vw - 900px)/2));background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.3)}.suite-modal header,.suite-modal footer{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid #e4e5e1}.suite-modal footer{border-top:1px solid #e4e5e1;border-bottom:0;justify-content:flex-end}.suite-modal-body{padding:20px 22px;overflow:auto}.suite-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.suite-form label{display:grid;gap:6px;font-weight:700}.suite-form .wide{grid-column:1/-1}.suite-form input,.suite-form select,.suite-form textarea{padding:10px;border:1px solid #cfd2ca;border-radius:9px;font:inherit}.suite-form textarea{min-height:86px}.suite-check-row{display:flex!important;align-items:center;gap:8px}.suite-check-row input{width:auto}
    @media(max-width:800px){.suite-form{grid-template-columns:1fr}.suite-form .wide{grid-column:auto}.suite-modal{inset:0;border-radius:0}}
  `;
  document.head.appendChild(style);
}

function modal(title, subtitle = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'suite-modal-backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'suite-modal';
  dialog.innerHTML = `<header><div><span class="eyebrow">Admin oficial</span><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="icon-button" type="button" data-close>×</button></header><div class="suite-modal-body"></div><footer></footer>`;
  const close = () => { backdrop.remove(); dialog.remove(); };
  backdrop.addEventListener('click', close);
  dialog.querySelector('[data-close]').addEventListener('click', close);
  document.body.append(backdrop, dialog);
  return { dialog, body: dialog.querySelector('.suite-modal-body'), foot: dialog.querySelector('footer'), close };
}

async function loadGithubJson(path, fallback) {
  const file = await readJsonFile(loadConfig(), path);
  return file?.data ?? fallback;
}

async function saveGithubJson(path, value) {
  const config = loadConfig();
  if (!config.githubToken) throw new Error('Informe o token do GitHub em Integrações.');
  const result = await upsertText(config, path, JSON.stringify(value, null, 2), `Atualiza ${path} pelo Admin oficial`);
  await upsertText(config, config.catalogVersionPath || 'catalog-version.json', JSON.stringify(catalogVersionPayload(config, ['coupons']), null, 2), 'Atualiza versão do catálogo: coupons');
  return result;
}

function couponForm(coupon = {}) {
  return `<form class="suite-form" id="couponForm">
    <label>Código<input name="codigo" required value="${escapeHtml(coupon.codigo || '')}"></label>
    <label>Posição<input name="posicao" type="number" min="1" step="1" value="${escapeHtml(coupon.posicao || 1)}"></label>
    <label>Tipo<select name="tipo"><option value="percentual" ${coupon.tipo !== 'fixo' ? 'selected' : ''}>Percentual</option><option value="fixo" ${coupon.tipo === 'fixo' ? 'selected' : ''}>Valor fixo</option></select></label>
    <label>Desconto<input name="desconto" type="number" min="0" step="0.01" required value="${escapeHtml(coupon.desconto || 0)}"></label>
    <label>Valor mínimo<input name="valorMinimo" type="number" min="0" step="0.01" value="${escapeHtml(coupon.valorMinimo || 0)}"></label>
    <label>Validade<input name="validade" type="date" value="${escapeHtml(String(coupon.validade || '').slice(0, 10))}"></label>
    <label class="wide suite-check-row"><input name="ativo" type="checkbox" ${coupon.ativo !== false ? 'checked' : ''}> Cupom ativo</label>
    <label class="wide">Título<input name="tituloBanner" value="${escapeHtml(coupon.tituloBanner || '')}"></label>
    <label class="wide">Descrição<textarea name="descricao">${escapeHtml(coupon.descricao || '')}</textarea></label>
    <label class="wide">Categorias<textarea name="categorias" placeholder="Uma por linha ou separadas por vírgula">${escapeHtml((coupon.categorias || []).join('\n'))}</textarea></label>
    <label class="wide">Marcas<textarea name="marcas">${escapeHtml((coupon.marcas || []).join('\n'))}</textarea></label>
    <label class="wide">Palavras-chave<textarea name="palavras_chave">${escapeHtml((coupon.palavras_chave || []).join('\n'))}</textarea></label>
  </form>`;
}

function listValues(value) {
  return [...new Set(String(value || '').split(/[,;\n|]/).map(item => item.trim()).filter(Boolean))];
}

class CouponsPanel {
  constructor(container) {
    this.container = container;
    this.coupons = [];
    this.renderShell();
    this.reload();
  }

  renderShell() {
    this.container.innerHTML = `<section class="panel suite-panel"><div class="panel-header"><div><span class="eyebrow">Promoções</span><h2>Cupons de desconto</h2><p>Crie, edite, desative e publique os cupons usados pelo checkout.</p></div><button class="button primary" type="button" data-coupon-new>Novo cupom</button></div><div class="suite-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Buscar cupom" data-coupon-search></div><button class="button secondary" type="button" data-coupon-reload>Atualizar</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Código</th><th>Desconto</th><th>Mínimo</th><th>Validade</th><th>Status</th><th></th></tr></thead><tbody data-coupon-rows></tbody></table></div></section>`;
    this.container.querySelector('[data-coupon-new]').addEventListener('click', () => this.openEditor());
    this.container.querySelector('[data-coupon-reload]').addEventListener('click', () => this.reload());
    this.container.querySelector('[data-coupon-search]').addEventListener('input', () => this.renderRows());
    this.container.querySelector('[data-coupon-rows]').addEventListener('click', event => {
      const edit = event.target.closest('[data-coupon-edit]');
      const remove = event.target.closest('[data-coupon-delete]');
      if (edit) this.openEditor(this.coupons[Number(edit.dataset.couponEdit)]);
      if (remove) this.remove(Number(remove.dataset.couponDelete));
    });
  }

  async reload() {
    const rows = this.container.querySelector('[data-coupon-rows]');
    rows.innerHTML = '<tr><td colspan="6">Carregando…</td></tr>';
    try {
      const data = await loadGithubJson(COUPONS_PATH, []);
      this.coupons = (Array.isArray(data) ? data : Object.values(data || {})).filter(Boolean).sort((a, b) => number(a.posicao || 999) - number(b.posicao || 999));
      this.renderRows();
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="6">${escapeHtml(error?.message || String(error))}</td></tr>`;
    }
  }

  renderRows() {
    const query = normalizeSearch(this.container.querySelector('[data-coupon-search]').value);
    const visible = this.coupons.map((coupon, index) => ({ coupon, index })).filter(({ coupon }) => !query || normalizeSearch([coupon.codigo, coupon.descricao, ...(coupon.categorias || []), ...(coupon.marcas || [])].join(' ')).includes(query));
    this.container.querySelector('[data-coupon-rows]').innerHTML = visible.length ? visible.map(({ coupon, index }) => `<tr><td><strong>${escapeHtml(coupon.codigo)}</strong><small>${escapeHtml(coupon.tituloBanner || coupon.descricao || '')}</small></td><td>${coupon.tipo === 'fixo' ? money(coupon.desconto) : `${number(coupon.desconto)}%`}</td><td>${money(coupon.valorMinimo || 0)}</td><td>${escapeHtml(coupon.validade || 'Sem limite')}</td><td><span class="badge ${coupon.ativo !== false ? 'success' : 'neutral'}">${coupon.ativo !== false ? 'Ativo' : 'Inativo'}</span></td><td><div class="suite-actions"><button class="row-action" type="button" data-coupon-edit="${index}">Editar</button><button class="row-action suite-danger" type="button" data-coupon-delete="${index}">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Nenhum cupom encontrado.</td></tr>';
  }

  openEditor(coupon = null) {
    const view = modal(coupon ? `Editar ${coupon.codigo}` : 'Novo cupom');
    view.body.innerHTML = couponForm(coupon || {});
    view.foot.innerHTML = '<button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-save>Salvar cupom</button>';
    view.foot.querySelector('[data-cancel]').addEventListener('click', view.close);
    view.foot.querySelector('[data-save]').addEventListener('click', async event => {
      const form = view.body.querySelector('form');
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form).entries());
      const code = text(values.codigo).toUpperCase().replace(/\s+/g, '');
      if (!code) return;
      const existingIndex = coupon ? this.coupons.indexOf(coupon) : this.coupons.findIndex(item => text(item.codigo).toUpperCase() === code);
      if (!coupon && existingIndex >= 0) return toast('Já existe um cupom com este código.', 'error');
      const next = {
        ...(coupon || {}), codigo: code, ativo: form.elements.ativo.checked, tipo: values.tipo === 'fixo' ? 'fixo' : 'percentual',
        desconto: Math.max(0, number(values.desconto)), valorMinimo: Math.max(0, number(values.valorMinimo)), validade: text(values.validade),
        posicao: Math.max(1, Math.floor(number(values.posicao) || this.coupons.length + 1)), tituloBanner: text(values.tituloBanner), descricao: text(values.descricao),
        categorias: listValues(values.categorias), marcas: listValues(values.marcas), palavras_chave: listValues(values.palavras_chave), atualizadoEm: new Date().toISOString(),
      };
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (existingIndex >= 0) this.coupons[existingIndex] = next; else this.coupons.push(next);
        this.coupons.sort((a, b) => number(a.posicao) - number(b.posicao));
        await saveGithubJson(COUPONS_PATH, this.coupons);
        audit('cupom_salvo', { codigo: code });
        toast(`Cupom ${code} publicado.`, 'success');
        view.close();
        this.renderRows();
      } catch (error) {
        toast(error?.message || String(error), 'error');
        button.disabled = false;
      }
    });
  }

  async remove(index) {
    const coupon = this.coupons[index];
    if (!coupon || !confirm(`Excluir o cupom ${coupon.codigo}?`)) return;
    const previous = [...this.coupons];
    this.coupons.splice(index, 1);
    try {
      await saveGithubJson(COUPONS_PATH, this.coupons);
      audit('cupom_excluido', { codigo: coupon.codigo });
      toast('Cupom excluído.', 'success');
      this.renderRows();
    } catch (error) {
      this.coupons = previous;
      toast(error?.message || String(error), 'error');
    }
  }
}

function start() {
  const view = document.querySelector('[data-view="coupons"]');
  if (!view || document.getElementById('couponsAdminRoot')) return;
  installStyle();
  const root = document.createElement('div');
  root.id = 'couponsAdminRoot';
  view.appendChild(root);
  new CouponsPanel(root);
  window.dispatchEvent(new CustomEvent('admin-v2-route-ready', { detail: { route: 'coupons' } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();