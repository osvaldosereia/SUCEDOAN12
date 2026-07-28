(() => {
  'use strict';

  let refreshTimer = null;

  function installStyle() {
    if (document.getElementById('campaignRulesSectionStyle')) return;
    const style = document.createElement('style');
    style.id = 'campaignRulesSectionStyle';
    style.textContent = `
      #offerManagerTabs.rules-section-tabs{display:none!important}
      #campaignOffersPanel.rules-section-page{
        display:block;
        margin:16px;
        padding:18px;
        border:1px solid var(--line);
        border-radius:14px;
        background:#fff;
      }
      #campaignOffersPanel.rules-section-page[hidden]{display:none!important}
      #campaignOffersPanel.rules-section-page .campaign-toolbar{
        align-items:flex-start;
        padding-bottom:16px;
      }
      #campaignOffersPanel.rules-section-page .campaign-toolbar h3{
        font-size:20px;
      }
      #campaignOffersPanel.rules-section-page .campaign-toolbar p{
        max-width:780px;
        font-size:12px;
        line-height:1.45;
      }
      #campaignOffersPanel.rules-section-page .rules-guide{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:10px;
        margin:0 0 14px;
      }
      #campaignOffersPanel.rules-section-page .rules-guide article{
        padding:12px;
        border:1px solid var(--line);
        border-radius:10px;
        background:#fafbf9;
      }
      #campaignOffersPanel.rules-section-page .rules-guide strong,
      #campaignOffersPanel.rules-section-page .rules-guide span{
        display:block;
      }
      #campaignOffersPanel.rules-section-page .rules-guide strong{
        font-size:13px;
      }
      #campaignOffersPanel.rules-section-page .rules-guide span{
        margin-top:5px;
        color:var(--muted);
        font-size:10px;
        line-height:1.45;
      }
      #campaignOffersPanel.rules-section-page .campaign-sources{
        display:none;
      }
      #campaignOffersPanel.rules-section-page .campaign-toolbar-actions{
        display:grid!important;
        grid-template-columns:repeat(2,minmax(170px,1fr));
        gap:8px;
        min-width:min(520px,45vw);
      }
      #campaignOffersPanel.rules-section-page .campaign-toolbar-actions .button{
        min-height:44px;
        justify-content:center;
      }
      #campaignOffersPanel.rules-section-page .campaign-toolbar-actions [data-campaign-run]{
        grid-column:1/-1;
      }
      #campaignOffersPanel.rules-section-page .campaign-toolbar-actions [data-campaign-reconcile]{
        border-color:#d8c891;
        background:#fffaf0;
        color:#8a650d;
      }
      #campaignOffersPanel.rules-section-page .rules-guide.rules-guide-didactic{
        grid-template-columns:repeat(4,minmax(0,1fr));
      }
      #campaignOffersPanel.rules-section-page .rules-guide article.is-primary{
        border-color:#c9ddb9;
        background:#f5fbf1;
      }
      #campaignOffersPanel.rules-section-page .rules-guide article.is-danger{
        border-color:#efc9c5;
        background:#fff5f4;
      }
      #campaignOffersPanel.rules-section-page .rules-cancel-notice{
        display:grid;
        grid-template-columns:auto 1fr;
        gap:10px;
        align-items:start;
        margin:0 0 14px;
        padding:12px 14px;
        border:1px solid #e7c473;
        border-radius:10px;
        background:#fff8e6;
      }
      #campaignOffersPanel.rules-section-page .rules-cancel-notice strong,
      #campaignOffersPanel.rules-section-page .rules-cancel-notice span{
        display:block;
      }
      #campaignOffersPanel.rules-section-page .rules-cancel-notice strong{
        font-size:13px;
      }
      #campaignOffersPanel.rules-section-page .rules-cancel-notice span{
        margin-top:4px;
        color:var(--muted);
        font-size:11px;
        line-height:1.45;
      }
    `;
    document.head.appendChild(style);
  }

  function renameButton(root, selector, label) {
    const button = root.querySelector(selector);
    if (button) button.textContent = label;
  }

  function enhanceCampaignPanel(panel) {
    panel.classList.add('rules-section-page');
    const routeHost = document.querySelector('.view[data-view="offers-rules"]');
    if (routeHost && panel.parentElement !== routeHost) routeHost.appendChild(panel);
    panel.hidden = false;

    const toolbar = panel.querySelector('.campaign-toolbar');
    if (!toolbar) return;

    const eyebrow = toolbar.querySelector('.eyebrow');
    const title = toolbar.querySelector('h3');
    const description = toolbar.querySelector('p');
    if (eyebrow) eyebrow.textContent = 'Campanhas por categoria';
    if (title) title.textContent = 'Ofertas por regra';
    if (description) {
      description.textContent = 'Crie regras, simule e processe. Cancelar remove a regra da lista e encerra as ofertas criadas por ela.';
    }

    renameButton(toolbar, '[data-campaign-reload]', 'Atualizar');
    renameButton(toolbar, '[data-campaign-simulate]', 'Simular');
    toolbar.querySelectorAll('[data-campaign-reconcile]').forEach(button => button.remove());
    renameButton(toolbar, '[data-campaign-run]', 'Processar agora');
    renameButton(panel, '[data-campaign-save-settings]', 'Salvar regras');
    panel.querySelectorAll('[data-campaign-use-test-branch]').forEach(button => button.remove());
    const actionHelp = [
      ['[data-campaign-reload]', 'Atualiza a tela.'],
      ['[data-campaign-simulate]', 'Mostra produtos elegiveis sem alterar nada.'],
      ['[data-campaign-run]', 'Executa as regras e remove ofertas de regras canceladas.'],
      ['[data-campaign-save-settings]', 'Salva as regras.'],
    ];
    actionHelp.forEach(([selector, title]) => {
      const button = panel.querySelector(selector);
      if (button) button.title = title;
    });
    panel.querySelectorAll('[data-campaign-cancel]').forEach(button => {
      button.textContent = 'Cancelar regra e ofertas';
      button.classList.add('danger-action');
      button.title = 'Remove a regra da lista e inicia o encerramento das ofertas criadas por ela.';
    });
  }

  function refreshRulesSection() {
    installStyle();
    const panel = document.getElementById('campaignOffersPanel');
    if (!panel) return;
    enhanceCampaignPanel(panel);
  }

  function scheduleRefresh(delay = 120) {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshRulesSection();
      setTimeout(refreshRulesSection, 500);
    }, delay);
  }

  document.addEventListener('DOMContentLoaded', () => scheduleRefresh(0), { once: true });
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-route="offers-rules"], [data-view="offers-rules"]')) {
      scheduleRefresh(150);
    }
  }, true);
  window.addEventListener('hashchange', () => scheduleRefresh(150));

  new MutationObserver(() => scheduleRefresh()).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(refreshRulesSection, 1500);
  scheduleRefresh(0);
})();
