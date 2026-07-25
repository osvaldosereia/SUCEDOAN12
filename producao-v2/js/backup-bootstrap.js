import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { loadProducts } from './services/firebase.js';
import { readJsonFile } from './services/github.js';

const AUDIT_KEY = 'da_admin_v2_audit_log';
const COUPONS_PATH = 'site/cuponsativos.json';
const QUICK_PATH = 'site/compra-rapida.json';

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

function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const raw = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${raw.replace(/"/g, '""')}"`;
}

async function loadGithubJson(path, fallback) {
  const file = await readJsonFile(loadConfig(), path);
  return file?.data ?? fallback;
}

function installStyle() {
  if (document.getElementById('backupAdminStyle')) return;
  const style = document.createElement('style');
  style.id = 'backupAdminStyle';
  style.textContent = `.backup-actions{display:flex;gap:8px;flex-wrap:wrap;padding:16px}.backup-help{padding:0 16px 16px;color:var(--muted);font-size:11px;line-height:1.5}`;
  document.head.appendChild(style);
}

function start() {
  const view = document.querySelector('[data-view="maintenance"]');
  if (!view || document.getElementById('adminBackupPanel')) return;
  installStyle();
  const section = document.createElement('section');
  section.className = 'panel span-all-settings';
  section.id = 'adminBackupPanel';
  section.innerHTML = `<div class="panel-header"><div><h2>Backup, exportação e auditoria</h2><p>Baixe cópias locais dos dados sem executar gravações.</p></div><span class="badge success">Disponível</span></div><div class="backup-actions"><button class="button secondary" data-backup-products>Produtos JSON</button><button class="button secondary" data-backup-csv>Produtos CSV</button><button class="button secondary" data-backup-config>Configurações</button><button class="button secondary" data-backup-audit>Auditoria local</button><button class="button secondary" data-backup-coupons>Cupons</button><button class="button secondary" data-backup-quick>Compra Rápida</button></div><p class="backup-help">Os arquivos são gerados neste navegador. Nenhum registro é removido ou alterado durante o backup.</p>`;
  const grid = view.querySelector('.maintenance-grid') || view;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentElement('beforebegin', section);
  else grid.appendChild(section);

  section.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    button.disabled = true;
    try {
      if (button.matches('[data-backup-products],[data-backup-csv]')) {
        const products = await loadProducts(loadConfig());
        if (button.hasAttribute('data-backup-products')) {
          download(`produtos-${Date.now()}.json`, JSON.stringify(products, null, 2));
        } else {
          const headers = ['firebaseKey','codigo','nome','gtin','preco','preco_custo','estoque','validade','categoria','subcategoria','marca','ncm','embalagem','gondola','prateleira','url_imagem'];
          const rows = [headers.map(csvCell).join(';'), ...products.map(product => headers.map(header => csvCell(product[header])).join(';'))];
          download(`produtos-${Date.now()}.csv`, `\uFEFF${rows.join('\n')}`, 'text/csv;charset=utf-8');
        }
      }
      if (button.hasAttribute('data-backup-config')) download(`admin-config-${Date.now()}.json`, JSON.stringify(loadConfig(), null, 2));
      if (button.hasAttribute('data-backup-audit')) download(`admin-auditoria-${Date.now()}.json`, JSON.stringify(JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'), null, 2));
      if (button.hasAttribute('data-backup-coupons')) download(`cupons-${Date.now()}.json`, JSON.stringify(await loadGithubJson(COUPONS_PATH, []), null, 2));
      if (button.hasAttribute('data-backup-quick')) download(`compra-rapida-${Date.now()}.json`, JSON.stringify(await loadGithubJson(QUICK_PATH, {}), null, 2));
      toast('Arquivo de backup gerado.', 'success');
    } catch (error) {
      toast(error?.message || String(error), 'error');
    } finally {
      button.disabled = false;
    }
  });
  window.dispatchEvent(new CustomEvent('admin-v2-route-ready', { detail: { route: 'maintenance' } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();