(() => {
  'use strict';

  if (window.__adminV2CampaignHistoryInstalled) return;
  window.__adminV2CampaignHistoryInstalled = true;

  const TIME_ZONE = 'America/Cuiaba';
  const HISTORY_ID = 'campaignExecutionHistoryDetailed';
  const STATE_PATH = '../site/ofertas-automaticas-estado.json';
  let loading = false;
  let refreshTimer = null;
  let lastSignature = '';

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function escapeHtml(value = '') {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function executionCounts(execution = {}) {
    const summary = execution.resumo && typeof execution.resumo === 'object' ? execution.resumo : {};
    const created = number(summary.ofertas_criadas);
    const closed = number(summary.ofertas_encerradas);
    const reactivated = number(summary.ofertas_reativadas);
    const explicit = Number(summary.produtos_alterados);
    const changed = Number.isFinite(explicit) ? explicit : created + closed + reactivated;
    return {
      changed,
      created,
      closed,
      reactivated,
      requested: number(summary.ofertas_solicitadas),
      notCreated: number(summary.ofertas_nao_criadas),
      expired: number(summary.vencidos),
      failed: number(summary.reativacoes_com_falha),
    };
  }

  function dateParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { day: String(value || 'Data não registrada'), time: '—' };
    return {
      day: date.toLocaleDateString('pt-BR', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString('pt-BR', {
        timeZone: TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  }

  function originLabel(value) {
    const origin = String(value || '').toLowerCase();
    if (origin.includes('manual') || origin.includes('workflow_dispatch')) return 'Processamento manual';
    if (origin.includes('schedule') || origin.includes('cron')) return 'Agendamento automático';
    if (origin.includes('dispatch')) return 'Acionamento externo';
    if (origin.includes('make')) return 'Automação de ofertas';
    if (origin.includes('github')) return 'GitHub Actions';
    return value ? String(value) : 'Automação de ofertas';
  }

  function executionCard(execution) {
    const counts = executionCounts(execution);
    const { day, time } = dateParts(execution.executado_em);
    const kind = counts.changed > 0 ? 'success' : 'neutral';
    const details = [
      `${counts.created} criada${counts.created === 1 ? '' : 's'}`,
      `${counts.closed} encerrada${counts.closed === 1 ? '' : 's'}`,
      `${counts.reactivated} reativada${counts.reactivated === 1 ? '' : 's'}`,
    ];
    if (counts.notCreated > 0) details.push(`${counts.notCreated} não criada${counts.notCreated === 1 ? '' : 's'}`);
    if (counts.failed > 0) details.push(`${counts.failed} falha${counts.failed === 1 ? '' : 's'}`);

    return `<article class="campaign-history-row ${kind}">
      <div class="campaign-history-date"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(time)}</span></div>
      <div class="campaign-history-result"><strong>${counts.changed} produto${counts.changed === 1 ? '' : 's'} alterado${counts.changed === 1 ? '' : 's'}</strong><span>${escapeHtml(details.join(' · '))}</span><small>${escapeHtml(originLabel(execution.origem))} · ${escapeHtml(execution.modo || 'completo')}</small></div>
      <span class="badge ${kind === 'success' ? 'success' : 'neutral'}">${counts.changed > 0 ? 'Alterou' : 'Sem mudanças'}</span>
    </article>`;
  }

  function installStyle() {
    if (document.getElementById('campaignExecutionHistoryStyle')) return;
    const style = document.createElement('style');
    style.id = 'campaignExecutionHistoryStyle';
    style.textContent = `
      #${HISTORY_ID}{margin-top:16px;border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}
      #${HISTORY_ID} .campaign-history-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:15px 16px;border-bottom:1px solid var(--line);background:#fafbf9}
      #${HISTORY_ID} .campaign-history-head h3{margin:0;font-size:16px}
      #${HISTORY_ID} .campaign-history-head p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.45}
      #${HISTORY_ID} .campaign-history-list{display:grid}
      #${HISTORY_ID} .campaign-history-row{display:grid;grid-template-columns:130px minmax(0,1fr) auto;gap:14px;align-items:center;padding:13px 16px;border-bottom:1px solid var(--line)}
      #${HISTORY_ID} .campaign-history-row:last-child{border-bottom:0}
      #${HISTORY_ID} .campaign-history-row.success{border-left:4px solid #76a85d}
      #${HISTORY_ID} .campaign-history-row.neutral{border-left:4px solid #b9bdb5}
      #${HISTORY_ID} .campaign-history-date strong,#${HISTORY_ID} .campaign-history-date span,#${HISTORY_ID} .campaign-history-result strong,#${HISTORY_ID} .campaign-history-result span,#${HISTORY_ID} .campaign-history-result small{display:block}
      #${HISTORY_ID} .campaign-history-date strong{font-size:13px}
      #${HISTORY_ID} .campaign-history-date span{margin-top:3px;color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
      #${HISTORY_ID} .campaign-history-result strong{font-size:13px}
      #${HISTORY_ID} .campaign-history-result span{margin-top:4px;color:#3e463d;font-size:11px}
      #${HISTORY_ID} .campaign-history-result small{margin-top:4px;color:var(--muted);font-size:10px}
      #${HISTORY_ID} .campaign-history-empty{padding:22px;text-align:center;color:var(--muted);font-size:12px}
      #campaignOffersPanel>.campaign-history:not(#${HISTORY_ID}){display:none!important}
      @media(max-width:720px){#${HISTORY_ID} .campaign-history-row{grid-template-columns:1fr auto;gap:8px}#${HISTORY_ID} .campaign-history-date{grid-column:1/-1;display:flex;align-items:center;gap:8px}#${HISTORY_ID} .campaign-history-date span{margin-top:0}}
    `;
    document.head.appendChild(style);
  }

  function stateUrl() {
    const url = new URL(STATE_PATH, window.location.href);
    url.searchParams.set('_history', String(Date.now()));
    return url.href;
  }

  async function readExecutions() {
    const response = await fetch(stateUrl(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Histórico retornou ${response.status}`);
    const data = await response.json();
    return Array.isArray(data?.execucoes) ? data.execucoes : [];
  }

  function signature(executions) {
    return JSON.stringify(executions.slice(-30).map(item => [item.id, item.executado_em, item.resumo]));
  }

  function routeActive() {
    return (window.adminV2CurrentRoute?.() || document.querySelector('.view.active')?.dataset.view) === 'offers-rules';
  }

  async function renderHistory() {
    const panel = document.getElementById('campaignOffersPanel');
    if (!routeActive() || !panel || panel.hidden || loading) return;
    loading = true;
    try {
      installStyle();
      const executions = await readExecutions();
      const recent = executions.slice(-30).reverse();
      const nextSignature = signature(recent);
      let section = document.getElementById(HISTORY_ID);
      if (!section) {
        section = document.createElement('section');
        section.id = HISTORY_ID;
        panel.appendChild(section);
      } else if (section.parentElement !== panel) {
        panel.appendChild(section);
      }
      if (lastSignature === nextSignature && section.dataset.ready === '1') return;
      lastSignature = nextSignature;
      section.dataset.ready = '1';
      section.innerHTML = `<div class="campaign-history-head"><div><h3>Histórico das rodadas</h3><p>Data e hora no fuso de Cuiabá, com a quantidade de produtos alterados em cada processamento.</p></div><span class="badge info">${recent.length} rodada${recent.length === 1 ? '' : 's'}</span></div><div class="campaign-history-list">${recent.length ? recent.map(executionCard).join('') : '<div class="campaign-history-empty">Nenhuma rodada registrada.</div>'}</div>`;
      panel.appendChild(section);
    } catch (error) {
      console.error('Não foi possível carregar o histórico das ofertas por regra.', error);
    } finally {
      loading = false;
    }
  }

  function scheduleRefresh(delay = 120) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(renderHistory, delay);
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-route="offers-rules"], [data-campaign-reload], [data-campaign-run]')) {
      scheduleRefresh(event.target.closest?.('[data-campaign-run]') ? 3500 : 250);
    }
  }, true);

  window.addEventListener('admin-v2-route-ready', event => {
    if (event.detail?.route === 'offers-rules') scheduleRefresh(200);
  });

  window.addEventListener('focus', () => {
    if (routeActive()) scheduleRefresh(120);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && routeActive()) scheduleRefresh(120);
  });

  if (routeActive()) scheduleRefresh(300);
})();
