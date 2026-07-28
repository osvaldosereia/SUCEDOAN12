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
      description.textContent = 'Fluxo simples: salve as regras, simule sem alterar nada e aplique quando estiver pronto. Recarregar e corrigir divergencia sao apenas apoio.';
    }

    renameButton(toolbar, '[data-campaign-reload]', 'Recarregar painel');
    renameButton(toolbar, '[data-campaign-simulate]', 'Simular sem alterar');
    renameButton(toolbar, '[data-campaign-reconcile]', 'Corrigir divergencia');
    renameButton(toolbar, '[data-campaign-run]', 'Aplicar agora');
    renameButton(panel, '[data-campaign-save-settings]', 'Salvar regras');
    renameButton(panel, '[data-campaign-use-test-branch]', 'Testar em homologacao');
    const actionHelp = [
      ['[data-campaign-reload]', 'Atualiza a tela com os dados mais recentes do GitHub e Firebase. Nao altera produtos.'],
      ['[data-campaign-simulate]', 'Testa as regras e mostra produtos elegiveis. Nao salva e nao muda precos.'],
      ['[data-campaign-reconcile]', 'Uso raro: corrige diferenca entre estado salvo e ofertas reais no Firebase.'],
      ['[data-campaign-run]', 'Executa de verdade: cria ofertas, encerra regras canceladas e publica o catalogo.'],
      ['[data-campaign-save-settings]', 'Salva regras e configuracoes no GitHub. Nao mexe nos produtos ate processar.'],
    ];
    actionHelp.forEach(([selector, title]) => {
      const button = panel.querySelector(selector);
      if (button) button.title = title;
    });
    panel.querySelectorAll('[data-campaign-cancel]').forEach(button => {
      button.textContent = 'Cancelar regra e ofertas';
      button.classList.add('danger-action');
      button.title = 'Ao salvar e processar, todas as ofertas ativas criadas por esta regra serao encerradas.';
    });

    let guide = panel.querySelector('.rules-guide');
    if (!guide) {
      guide = document.createElement('section');
      guide.className = 'rules-guide rules-guide-didactic';
      toolbar.insertAdjacentElement('afterend', guide);
    }
    if (!guide.dataset.didacticReady) {
      guide.dataset.didacticReady = '1';
      guide.className = 'rules-guide rules-guide-didactic';
      guide.innerHTML = `
        <article><strong>1. Salvar regras</strong><span>Grava categoria, desconto, quantidade e cancelamentos no GitHub. Ainda nao muda produto.</span></article>
        <article><strong>2. Simular sem alterar</strong><span>Mostra o que aconteceria se processar agora. Seguro para conferir antes.</span></article>
        <article class="is-primary"><strong>3. Aplicar agora</strong><span>Roda a automacao oficial. Aqui as ofertas entram, saem ou sao canceladas.</span></article>
        <article class="is-danger"><strong>Cancelar regra</strong><span>Marca a regra para parar e encerrar as ofertas criadas por ela no proximo processamento.</span></article>
      `;
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
