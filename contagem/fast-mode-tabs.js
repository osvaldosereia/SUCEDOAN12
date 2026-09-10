(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const STOCK_OPERATION_KEY = 'da_fast_stock_operation_v1';
  const AUTOSAVE_LAST_TOTAL_KEY = 'da_fast_autosave_last_total_v1';
  const AUTOSAVE_FINALIZED_KEY = 'da_fast_autosave_finalized_v1';
  const AUTOSAVE_FINALIZED_BASELINE_KEY = 'da_fast_autosave_finalized_baseline_v1';

  function readLocal(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function modeIsFast() {
    return $('app')?.classList.contains('fast-mode-on') || localStorage.getItem('da_count_fast_mode') === 'fast';
  }

  function render() {
    const app = $('app');
    const tabs = $('countModeTabs');
    const detail = $('detailModeTab');
    const fast = $('fastModeTab');
    if (!app || !tabs || !detail || !fast) return;

    tabs.classList.toggle('hidden', app.classList.contains('hidden'));
    const isFast = modeIsFast();
    detail.classList.toggle('active', !isFast);
    fast.classList.toggle('active', isFast);
    detail.setAttribute('aria-selected', String(!isFast));
    fast.setAttribute('aria-selected', String(isFast));
  }

  function select(wantFast) {
    const toggle = $('modeToggleButton');
    if (!toggle) return;
    const current = modeIsFast();
    if (current !== wantFast) toggle.click();
    setTimeout(render, 0);
  }

  function stockTotalReads() {
    const known = readLocal('da_count_fast_known_v1', []);
    const unknown = readLocal('da_count_fast_unknown_v1', []);
    return [...known, ...unknown].reduce((sum, row) => sum + Math.max(0, Number(row?.quantity || 0)), 0);
  }

  function stockModeLabel(mode) {
    return mode === 'add' ? 'ADICIONAR' : 'BALANÇO';
  }

  function renderStockMode(mode, reads) {
    document.querySelectorAll('[data-fast-stock-mode]').forEach(button => {
      const active = button.dataset.fastStockMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const badge = $('fastStockModeBadge');
    if (badge) {
      badge.textContent = stockModeLabel(mode);
      badge.className = `fast-stock-mode-badge ${mode}`;
    }

    const hint = $('fastStockOperationHint');
    if (hint) {
      hint.textContent = reads > 0
        ? `Modo alterado para ${stockModeLabel(mode)}. As ${reads} leitura(s) existentes foram mantidas e serão aplicadas neste modo ao salvar.`
        : (mode === 'add'
          ? 'ADICIONAR soma o total lido ao estoque atual. Produto fora do banco novo fica em pendências.'
          : 'BALANÇO substitui o estoque de cada EAN lido pelo total contado. Produtos não lidos não são zerados automaticamente.');
      hint.className = `fast-stock-operation-hint ${reads > 0 ? 'warning' : 'success'}`;
    }

    const status = $('fastStatus');
    if (status) {
      status.textContent = mode === 'add'
        ? `ADICIONAR ativo${reads > 0 ? ` · ${reads} leitura(s) mantidas` : ''} · a quantidade será somada ao estoque.`
        : `BALANÇO ativo${reads > 0 ? ` · ${reads} leitura(s) mantidas` : ''} · o total contado será o novo estoque.`;
      status.className = `note ${reads > 0 ? 'warning' : 'success'}`;
    }
  }

  function setStockModeUnlocked(next) {
    if (next !== 'add' && next !== 'balance') return;
    const current = sessionStorage.getItem(STOCK_OPERATION_KEY);
    const reads = stockTotalReads();

    sessionStorage.setItem(STOCK_OPERATION_KEY, next);

    // Uma mudança de interpretação precisa gerar um novo checkpoint no Supabase.
    // As leituras são preservadas; somente o modo do lote muda.
    if (current !== next && reads > 0) {
      sessionStorage.setItem(AUTOSAVE_LAST_TOTAL_KEY, '0');
      sessionStorage.removeItem(AUTOSAVE_FINALIZED_KEY);
      sessionStorage.removeItem(AUTOSAVE_FINALIZED_BASELINE_KEY);
    }

    renderStockMode(next, reads);
    window.dispatchEvent(new CustomEvent('da:fast-stock-mode-changed', {
      detail: { mode: next, previousMode: current || null, reads }
    }));

    try { $('fastScanInput')?.focus({ preventScroll: true }); }
    catch { try { $('fastScanInput')?.focus(); } catch {} }
  }

  function interceptStockMode(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-fast-stock-mode]') : null;
    if (!target) return;
    const next = target.dataset.fastStockMode;
    if (next !== 'add' && next !== 'balance') return;

    // O handler legado bloqueava a troca quando havia leituras. Interceptamos antes dele
    // para manter as leituras e permitir a mudança solicitada pelo operador.
    event.preventDefault();
    event.stopImmediatePropagation();
    setStockModeUnlocked(next);
  }

  function bind() {
    $('detailModeTab')?.addEventListener('click', () => select(false));
    $('fastModeTab')?.addEventListener('click', () => select(true));

    // Captura antes do listener legado presente em fast-stock-operation.js.
    document.addEventListener('click', interceptStockMode, true);

    const app = $('app');
    if (app) new MutationObserver(render).observe(app, { attributes: true, attributeFilter: ['class'] });

    const toggle = $('modeToggleButton');
    if (toggle) new MutationObserver(render).observe(toggle, { attributes: true, attributeFilter: ['class'] });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
