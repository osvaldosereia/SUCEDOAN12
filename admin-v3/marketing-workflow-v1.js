(function () {
  'use strict';

  const C = window.DA_ADMIN_V3_CONFIG || {};
  const AUTH_KEY = 'da_admin_v3_auth';
  let root = null;
  let role = '';
  let data = { assets: [], jobs: [], calendar: [] };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

  const fmt = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';

  function auth() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    } catch {
      return null;
    }
  }

  async function call(action, payload = {}) {
    const session = auth();
    if (!session?.access_token) throw new Error('Faça login.');

    const response = await fetch(
      `${C.supabaseUrl}/functions/v1/${C.marketingWorkflowEdgeFunction || 'admin-marketing-workflow-v1'}`,
      {
        method: 'POST',
        headers: {
          apikey: C.supabasePublishableKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...payload })
      }
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new Error(body.detail || body.error || `Erro ${response.status}`);
    }
    return body;
  }

  function notify(message) {
    const box = document.getElementById('toastRegion');
    if (!box) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    box.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function addUi() {
    root = document.getElementById('marketingCenterMount');
    if (!root) return false;

    const tabs = root.querySelector('.marketing-tabs');
    if (!tabs || root.querySelector('[data-mkt-tab="calendar"]')) return Boolean(tabs);

    const button = document.createElement('button');
    button.className = 'marketing-tab';
    button.dataset.mktTab = 'calendar';
    button.textContent = 'Calendário e aprovação';
    tabs.appendChild(button);

    const pane = document.createElement('section');
    pane.className = 'marketing-pane';
    pane.dataset.mktPane = 'calendar';
    pane.innerHTML = `
      <div class="marketing-grid">
        <section class="panel">
          <div class="panel-head">
            <div><div class="eyebrow">Revisão</div><h2>Conteúdos para aprovação</h2></div>
            <button id="mktWfReload" class="button secondary small" type="button">Atualizar</button>
          </div>
          <div id="mktReviewList" class="marketing-list"></div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div><div class="eyebrow">Agenda</div><h2>Programar conteúdos aprovados</h2></div>
            <span class="marketing-pill off">sem publicação</span>
          </div>
          <div id="mktApprovedJobs" class="marketing-list"></div>
        </section>
      </div>
      <section class="panel">
        <div class="panel-head">
          <div><div class="eyebrow">Calendário editorial</div><h2>Próximos 31 dias</h2></div>
        </div>
        <div id="mktCalendarGrid" class="marketing-calendar"></div>
      </section>`;

    root.querySelector('.marketing-center').appendChild(pane);

    button.onclick = () => {
      root.querySelectorAll('[data-mkt-tab]').forEach((item) => item.classList.toggle('active', item === button));
      root.querySelectorAll('[data-mkt-pane]').forEach((item) => item.classList.toggle('active', item === pane));
      load().catch((error) => notify(error.message));
    };

    pane.querySelector('#mktWfReload').onclick = () => load().catch((error) => notify(error.message));
    return true;
  }

  function render() {
    if (!root) return;

    const review = root.querySelector('#mktReviewList');
    const approved = root.querySelector('#mktApprovedJobs');
    const calendar = root.querySelector('#mktCalendarGrid');
    if (!review || !approved || !calendar) return;

    const reviewable = data.assets.filter((asset) => ['draft', 'rendered', 'review'].includes(asset.status));
    review.innerHTML = reviewable.length
      ? reviewable.map((asset) => `
        <div class="marketing-item">
          <div class="marketing-item-head">
            <div>
              <strong>${esc(asset.title)}</strong>
              <small>${esc(asset.media_kind)} · ${esc(asset.generation_mode)} · ${esc(asset.status)}</small>
            </div>
            <span class="marketing-pill ${asset.status === 'review' ? 'ai' : 'off'}">${esc(asset.status)}</span>
          </div>
          <div class="marketing-actions">
            ${['draft', 'rendered'].includes(asset.status) ? `<button class="button secondary small" type="button" data-submit-review="${asset.id}">Enviar para revisão</button>` : ''}
            ${asset.status === 'review' && role === 'owner' ? `<button class="button primary small" type="button" data-approve="${asset.id}">Aprovar</button>` : ''}
          </div>
        </div>`).join('')
      : '<div class="marketing-empty">Nada aguardando revisão.</div>';

    const jobs = data.jobs.filter((job) => ['approved', 'scheduled'].includes(job.status));
    approved.innerHTML = jobs.length
      ? jobs.map((job) => `
        <div class="marketing-item">
          <div class="marketing-item-head">
            <div>
              <strong>${esc(job.title || job.channel)}</strong>
              <small>${esc(job.channel)} · ${esc(job.status)}${job.scheduled_for ? ` · ${fmt(job.scheduled_for)}` : ''}</small>
            </div>
            <span class="marketing-pill ${job.status === 'scheduled' ? 'no-ai' : 'off'}">${esc(job.status)}</span>
          </div>
          ${role === 'owner' ? `
            <div class="marketing-schedule-row">
              ${job.status === 'approved'
                ? `<input type="datetime-local" data-when="${job.id}"><button class="button primary small" type="button" data-schedule="${job.id}">Agendar</button>`
                : `<button class="button secondary small" type="button" data-unschedule="${job.id}">Desagendar</button>`}
            </div>` : ''}
        </div>`).join('')
      : '<div class="marketing-empty">Nenhum job aprovado para agendar.</div>';

    const grouped = {};
    for (const item of data.calendar) {
      const key = new Date(item.scheduled_for).toLocaleDateString('pt-BR');
      (grouped[key] || (grouped[key] = [])).push(item);
    }

    calendar.innerHTML = Object.keys(grouped).length
      ? Object.entries(grouped).map(([day, items]) => `
        <article class="marketing-day">
          <strong>${day}</strong>
          ${items.map((item) => `
            <div>
              <span>${new Date(item.scheduled_for).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <small>${esc(item.title)} · ${esc(item.channel)}</small>
            </div>`).join('')}
        </article>`).join('')
      : '<div class="marketing-empty">Nenhum conteúdo agendado.</div>';

    root.querySelectorAll('[data-submit-review]').forEach((button) => {
      button.onclick = () => act('submit_review', { asset_id: button.dataset.submitReview }, 'Enviado para revisão.');
    });

    root.querySelectorAll('[data-approve]').forEach((button) => {
      button.onclick = () => act('approve_asset', { asset_id: button.dataset.approve, note: 'Aprovado no Admin Marketing' }, 'Conteúdo aprovado.');
    });

    root.querySelectorAll('[data-schedule]').forEach((button) => {
      button.onclick = () => {
        const input = root.querySelector(`[data-when="${button.dataset.schedule}"]`);
        if (!input?.value) return notify('Escolha data e horário.');
        return act(
          'schedule_job',
          { job_id: button.dataset.schedule, scheduled_for: new Date(input.value).toISOString() },
          'Conteúdo agendado. Nenhuma publicação foi feita.'
        );
      };
    });

    root.querySelectorAll('[data-unschedule]').forEach((button) => {
      button.onclick = () => act('unschedule_job', { job_id: button.dataset.unschedule }, 'Agendamento removido.');
    });
  }

  async function act(action, payload, message) {
    try {
      await call(action, payload);
      notify(message);
      await load();
    } catch (error) {
      notify(error.message);
    }
  }

  async function load() {
    const response = await call('workflow_overview');
    role = response.user?.role || '';
    data = {
      assets: response.assets || [],
      jobs: response.jobs || [],
      calendar: response.calendar || []
    };
    render();
  }

  function boot() {
    if (!addUi()) {
      setTimeout(boot, 250);
      return;
    }
    load().catch(() => {});
  }

  boot();
})();
