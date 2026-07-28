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
        align-items:center;
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

  function ensureTabs(workspace) {
    let tabs = document.getElementById('offerManagerTabs');
    if (tabs) return tabs;

    const header = workspace.querySelector('.panel-header');
    if (!header) return null;

    tabs = document.createElement('div');
    tabs.className = 'offer-manager-tabs rules-section-tabs';
    tabs.id = 'offerManagerTabs';
    tabs.innerHTML = `
      <button class="active" type="button" data-offer-tab="automatic">Ofertas por validade</button>
      <button type="button" data-offer-tab="campaign">Ofertas automaticas por regras</button>
    `;
    header.insertAdjacentElement('afterend', tabs);
    return tabs;
  }

  function renameButton(root, selector, label) {
    const button = root.querySelector(selector);
    if (button) button.textContent = label;
  }

  function enhanceCampaignPanel(workspace, panel) {
    panel.classList.add('rules-section-page');
    panel.hidden = false;

    const validityEnd = workspace.querySelector('.offer-apply-area');
    if (validityEnd && validityEnd.nextElementSibling !== panel) {
      validityEnd.insertAdjacentElement('afterend', panel);
    } else if (!validityEnd && panel.parentElement !== workspace) {
      workspace.appendChild(panel);
    }

    const toolbar = panel.querySelector('.campaign-toolbar');
    if (!toolbar) return;

    workspace.querySelectorAll('.offer-auto-panel').forEach(node => {
      node.hidden = false;
    });
    const manualPanel = document.getElementById('manualOffersPanel');
    if (manualPanel) manualPanel.hidden = true;

    const eyebrow = toolbar.querySelector('.eyebrow');
    const title = toolbar.querySelector('h3');
    const description = toolbar.querySelector('p');
    if (eyebrow) eyebrow.textContent = 'Automacao de ofertas';
    if (title) title.textContent = 'Ofertas automaticas por regras';
    if (description) {
      description.textContent = 'Crie regras por categoria para a automacao gerar ofertas, alternar produtos e respeitar ofertas manuais.';
    }

    renameButton(toolbar, '[data-campaign-reload]', 'Atualizar dados');
    renameButton(toolbar, '[data-campaign-reconcile]', 'Sincronizar estado');
    renameButton(toolbar, '[data-campaign-run]', 'Processar agora');
    renameButton(panel, '[data-campaign-save-settings]', 'Salvar regras');
    renameButton(panel, '[data-campaign-use-test-branch]', 'Testar em homologacao');
    panel.querySelectorAll('[data-campaign-cancel]').forEach(button => {
      button.textContent = 'Cancelar regra e ofertas';
      button.classList.add('danger-action');
      button.title = 'Ao salvar e processar, todas as ofertas ativas criadas por esta regra serao encerradas.';
    });

    if (!panel.querySelector('.rules-guide')) {
      const guide = document.createElement('section');
      guide.className = 'rules-guide';
      guide.innerHTML = `
        <article><strong>1. Regra</strong><span>Escolha categoria, desconto, duracao e quantidade por rodada.</span></article>
        <article><strong>2. Simular</strong><span>Confira os produtos elegiveis antes de salvar ou processar.</span></article>
        <article><strong>3. Processar</strong><span>Execute a automacao quando as regras estiverem revisadas.</span></article>
      `;
      toolbar.insertAdjacentElement('afterend', guide);
    }

    if (!panel.querySelector('.rules-cancel-notice')) {
      const notice = document.createElement('section');
      notice.className = 'rules-cancel-notice';
      notice.innerHTML = `
        <strong>Cancelar regra</strong>
        <span>Quando uma regra for cancelada, ela fica marcada para encerramento. Ao salvar e processar, todas as ofertas ativas criadas por essa regra tambem sao canceladas.</span>
      `;
      const guide = panel.querySelector('.rules-guide');
      (guide || toolbar).insertAdjacentElement('afterend', notice);
    }
  }

  function refreshRulesSection() {
    const workspace = document.getElementById('offersWorkspace');
    if (!workspace) return;

    installStyle();
    const tabs = ensureTabs(workspace);
    const campaignTab = tabs?.querySelector('[data-offer-tab="campaign"]');
    const panel = document.getElementById('campaignOffersPanel');

    if (!panel) return;

    if (!panel.dataset.rulesSectionLoaded && campaignTab) {
      panel.dataset.rulesSectionLoaded = '1';
      campaignTab.click();
    }

    enhanceCampaignPanel(workspace, panel);
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
    if (event.target.closest?.('[data-route="offers"], [data-view="offers"], [data-view="promotions"]')) {
      scheduleRefresh(150);
    }
  }, true);
  window.addEventListener('hashchange', () => scheduleRefresh(150));

  new MutationObserver(() => scheduleRefresh()).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(refreshRulesSection, 1500);
  scheduleRefresh(0);
})();
