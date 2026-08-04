(() => {
  'use strict';

  const DEFAULT_FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CONFIG_KEY = 'da_admin_v2_config';
  let selectedKey = '';
  let deleting = false;

  const text = value => String(value == null ? '' : value).trim();

  function config() {
    try {
      const value = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return {
        firebaseUrl: text(value.firebaseUrl || DEFAULT_FIREBASE).replace(/\/+$/, ''),
        productsNode: text(value.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, ''),
        writeMode: Boolean(document.getElementById('writeModeSetting')?.checked || value.writeMode),
        auth: text(value.firebaseAuth || value.auth || ''),
      };
    } catch {
      return { firebaseUrl: DEFAULT_FIREBASE, productsNode: 'produtos', writeMode: false, auth: '' };
    }
  }

  function url(path, query = {}) {
    const cfg = config();
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== '' && value != null) params.set(key, String(value));
    });
    if (cfg.auth) params.set('auth', cfg.auth);
    const suffix = params.toString();
    return `${cfg.firebaseUrl}/${String(path).replace(/^\/+|\/+$/g, '')}.json${suffix ? `?${suffix}` : ''}`;
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(path, { cache: 'no-store', ...options, signal: controller.signal });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Firebase retornou ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
      }
      return response.status === 204 ? null : response.json().catch(() => null);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao excluir o produto.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function toast(message, type = '') {
    const region = document.getElementById('toastRegion');
    if (!region) {
      alert(message);
      return;
    }
    const node = document.createElement('div');
    node.className = `toast ${type}`.trim();
    node.textContent = message;
    region.appendChild(node);
    setTimeout(() => node.remove(), type === 'error' ? 6500 : 4200);
  }

  function hasPendingChanges() {
    return document.getElementById('dirtyIndicator')?.classList.contains('active');
  }

  function productInfoFromRow(key) {
    const button = [...document.querySelectorAll('#productsTableBody [data-product-key]')]
      .find(item => text(item.dataset.productKey) === text(key));
    const row = button?.closest('tr');
    return {
      row,
      name: text(row?.querySelector('.product-cell strong')?.textContent) || 'Produto',
      code: text(row?.querySelector('.cell-stack strong')?.textContent) || text(key),
    };
  }

  function inferEditorKey() {
    if (selectedKey) return selectedKey;
    const title = text(document.getElementById('editorTitle')?.textContent);
    const subtitle = text(document.getElementById('editorSubtitle')?.textContent);
    for (const button of document.querySelectorAll('#productsTableBody [data-product-key]')) {
      const row = button.closest('tr');
      const rowName = text(row?.querySelector('.product-cell strong')?.textContent);
      const rowCode = text(row?.querySelector('.cell-stack strong')?.textContent);
      if (rowName === title && (!rowCode || subtitle.includes(rowCode))) {
        selectedKey = text(button.dataset.productKey);
        break;
      }
    }
    return selectedKey;
  }

  async function archiveAndDelete(key, info, button) {
    if (deleting) return;
    const cfg = config();
    if (!cfg.writeMode) {
      toast('Ative o modo de gravação nas configurações antes de excluir produtos.', 'error');
      return;
    }
    if (hasPendingChanges()) {
      toast('Salve ou descarte todas as alterações pendentes antes de excluir um produto.', 'error');
      return;
    }

    const normalizedKey = text(key);
    if (!normalizedKey) {
      toast('Não foi possível identificar a chave do produto.', 'error');
      return;
    }
    const name = text(info?.name) || 'Produto';
    const code = text(info?.code) || normalizedKey;
    const first = confirm(
      `Excluir o produto "${name}"?\n\nCódigo: ${code}\n\nEle será removido de /produtos e guardado em /produtos_excluidos para possível recuperação.`,
    );
    if (!first) return;
    const typed = prompt('Confirmação final: digite EXCLUIR para continuar.');
    if (text(typed).toUpperCase() !== 'EXCLUIR') {
      toast('Exclusão cancelada. Era necessário digitar EXCLUIR.', 'error');
      return;
    }

    const original = button?.textContent || 'Excluir';
    deleting = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Excluindo...';
    }
    try {
      const encodedKey = encodeURIComponent(normalizedKey);
      const productPath = `${cfg.productsNode}/${encodedKey}`;
      const remote = await request(url(productPath, { _: Date.now() }));
      if (!remote || typeof remote !== 'object') throw new Error('Produto não encontrado no Firebase. Atualize a lista.');

      const archivedAt = new Date().toISOString();
      const archived = {
        ...remote,
        firebaseKey: normalizedKey,
        id: text(remote.id || normalizedKey),
        situacao_anterior: remote.situacao || remote.status || 'A',
        arquivado_em: archivedAt,
        arquivado_motivo: 'Excluído pelo Admin Produção V2',
        arquivado_origem: 'admin-produtivo-v2',
      };
      await request(url(`produtos_excluidos/${encodedKey}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(archived),
      });
      await request(url(productPath), { method: 'DELETE' });

      request(url('logs_admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'produto_arquivado',
          origem: 'admin-produtivo-v2',
          criado_em: archivedAt,
          timestamp: Date.now(),
          details: { key: normalizedKey, codigo: remote.codigo || code, nome: remote.nome || name },
        }),
      }).catch(error => console.warn('Não foi possível registrar logs_admin:', error));

      document.getElementById('closeEditorButton')?.click();
      toast(`${name} foi excluído e enviado para produtos_excluidos.`, 'success');
      setTimeout(() => document.getElementById('reloadButton')?.click(), 350);
    } catch (error) {
      console.error(error);
      toast(error?.message || String(error), 'error');
      if (button?.isConnected) button.disabled = false;
    } finally {
      deleting = false;
      if (button?.isConnected) button.textContent = original;
    }
  }

  function enhanceRows() {
    document.querySelectorAll('#productsTableBody tr').forEach(row => {
      const editButton = row.querySelector('[data-product-key]');
      const actions = row.querySelector('.row-actions');
      if (!editButton || !actions || actions.querySelector('[data-safe-delete-product]')) return;
      const key = text(editButton.dataset.productKey);
      const button = document.createElement('button');
      button.className = 'row-action safe-delete-action';
      button.type = 'button';
      button.dataset.safeDeleteProduct = key;
      button.textContent = 'Excluir';
      button.title = 'Excluir o produto do catálogo e guardar uma cópia em produtos_excluidos';
      button.disabled = !config().writeMode;
      actions.appendChild(button);
    });
  }

  function enhanceEditor() {
    const footer = document.querySelector('#productEditor .editor-footer');
    if (!footer || footer.querySelector('[data-safe-delete-editor]')) return;
    const button = document.createElement('button');
    button.className = 'button danger safe-delete-editor';
    button.type = 'button';
    button.dataset.safeDeleteEditor = '1';
    button.textContent = 'Excluir produto';
    button.title = 'Excluir o produto do catálogo e guardar uma cópia em produtos_excluidos';
    button.disabled = !config().writeMode;
    footer.insertBefore(button, footer.firstChild);
  }

  function refreshButtons() {
    const enabled = config().writeMode;
    document.querySelectorAll('[data-safe-delete-product],[data-safe-delete-editor]').forEach(button => {
      if (!deleting) button.disabled = !enabled;
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .button.danger{border-color:#d89b96;background:#fff0ee;color:#a6322c}
    .button.danger:hover{border-color:#a6322c;background:#ffe3e0;box-shadow:0 5px 14px rgba(166,50,44,.12)}
    .row-actions{flex-wrap:wrap;min-width:210px}
    .row-action.safe-delete-action{border-color:#e2b7b3;background:#fff0ee;color:#a6322c}
    .row-action.safe-delete-action:hover{border-color:#a6322c;background:#ffe3e0}
    .editor-footer .safe-delete-editor{margin-right:auto}
    @media(max-width:560px){
      .editor-footer{display:grid!important;grid-template-columns:1fr 1fr;gap:8px}
      .editor-footer .safe-delete-editor{grid-column:1/-1;margin-right:0}
      .editor-footer .button{width:100%}
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('click', event => {
    const edit = event.target.closest?.('[data-product-key]');
    if (edit) selectedKey = text(edit.dataset.productKey);

    const rowDelete = event.target.closest?.('[data-safe-delete-product]');
    if (rowDelete) {
      event.preventDefault();
      event.stopPropagation();
      const key = text(rowDelete.dataset.safeDeleteProduct);
      archiveAndDelete(key, productInfoFromRow(key), rowDelete);
      return;
    }

    const editorDelete = event.target.closest?.('[data-safe-delete-editor]');
    if (editorDelete) {
      event.preventDefault();
      const key = inferEditorKey();
      const info = productInfoFromRow(key);
      if (!info.name || info.name === 'Produto') info.name = text(document.getElementById('editorTitle')?.textContent) || 'Produto';
      if (!info.code || info.code === key) info.code = text(document.getElementById('editorSubtitle')?.textContent).split('·')[0].trim() || key;
      archiveAndDelete(key, info, editorDelete);
    }
  });

  window.addEventListener('admin-v2-open-product', event => {
    selectedKey = text(event.detail?.key);
  });
  document.getElementById('writeModeSetting')?.addEventListener('change', refreshButtons);

  const observer = new MutationObserver(() => {
    enhanceRows();
    enhanceEditor();
    refreshButtons();
  });
  const start = () => {
    enhanceRows();
    enhanceEditor();
    refreshButtons();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
