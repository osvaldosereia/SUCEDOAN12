const BUILD = '20260823-canecas-config-v4-1';
const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';

function installStyles() {
  if (document.getElementById('mugConfigCompactV41Styles')) return;
  const style = document.createElement('style');
  style.id = 'mugConfigCompactV41Styles';
  style.textContent = `
    #mugAutomationPanel.mugv7 .mugv7-settings-compact{
      border:1px solid #e1e4dd!important;
      border-radius:10px!important;
      padding:0!important;
      background:#fafbf8!important;
      overflow:hidden!important;
    }
    #mugAutomationPanel.mugv7 .mugv7-settings-compact>summary{
      cursor:pointer!important;
      list-style:none!important;
      padding:7px 9px!important;
      font-size:11px!important;
      font-weight:800!important;
      line-height:1.2!important;
      user-select:none!important;
    }
    #mugAutomationPanel.mugv7 .mugv7-settings-compact>summary::-webkit-details-marker{display:none!important}
    #mugAutomationPanel.mugv7 .mugv7-settings-compact>summary::before{content:'⚙ ';font-size:11px!important}
    #mugAutomationPanel.mugv7 .mugv7-settings-compact[open]>summary{border-bottom:1px solid #e5e7e1!important}
    #mugAutomationPanel.mugv7 .mugv7-settings-compact .mugv7-settings-grid{
      display:grid!important;
      grid-template-columns:1fr!important;
      gap:7px!important;
      margin:0!important;
      padding:8px!important;
    }
    #mugAutomationPanel.mugv7 .mugv7-settings-compact label{
      display:grid!important;
      gap:4px!important;
      font-size:10px!important;
      font-weight:700!important;
    }
    #mugAutomationPanel.mugv7 .mugv7-settings-compact input,
    #mugAutomationPanel.mugv7 .mugv7-settings-compact select{
      width:100%!important;
      box-sizing:border-box!important;
      padding:7px!important;
      min-height:31px!important;
      border:1px solid #ccd0c8!important;
      border-radius:8px!important;
      background:#fff!important;
      font-size:10px!important;
    }
  `;
  document.head.appendChild(style);
}

function ensureConfig() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return false;
  const panel = document.getElementById('mugAutomationPanel');
  const upload = panel?.querySelector('.mugv7-main > .mugv7-upload');
  if (!panel || !upload) return false;

  installStyles();

  let details = upload.querySelector(':scope > .mugv7-settings-compact');
  if (details) return true;

  const original = panel.querySelector('.mugv7-settings');
  const originalWebhook = original?.querySelector('#mugv7Webhook')?.value || '';
  const originalQuality = original?.querySelector('#mugv7Quality')?.value || 'high';
  original?.remove();

  details = document.createElement('details');
  details.className = 'mugv7-settings mugv7-settings-compact';
  details.innerHTML = `
    <summary>Configuração</summary>
    <div class="mugv7-settings-grid">
      <label>Webhook Make
        <input id="mugv7Webhook" type="url" placeholder="https://hook.eu1.make.com/..." autocomplete="off">
      </label>
      <label>Qualidade
        <select id="mugv7Quality">
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Teste</option>
        </select>
      </label>
    </div>`;

  const actions = upload.querySelector('.mugv7-actions');
  if (actions) upload.insertBefore(details, actions);
  else upload.appendChild(details);

  const webhook = details.querySelector('#mugv7Webhook');
  const quality = details.querySelector('#mugv7Quality');
  webhook.value = originalWebhook || localStorage.getItem(WEBHOOK_KEY) || '';
  quality.value = ['high', 'medium', 'low'].includes(originalQuality) ? originalQuality : 'high';

  webhook.addEventListener('change', () => {
    localStorage.setItem(WEBHOOK_KEY, String(webhook.value || '').trim());
  });
  webhook.addEventListener('blur', () => {
    localStorage.setItem(WEBHOOK_KEY, String(webhook.value || '').trim());
  });

  panel.dataset.mugConfigCompact = BUILD;
  return true;
}

function applyUntilReady(attempt = 0) {
  if (ensureConfig()) return;
  if (attempt < 80) setTimeout(() => applyUntilReady(attempt + 1), 100);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(() => applyUntilReady(), 0);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(() => applyUntilReady(), 0);
});

const observer = new MutationObserver(() => {
  if (window.adminV2CurrentRoute?.() === 'mug-studio') ensureConfig();
});
observer.observe(document.documentElement, { childList:true, subtree:true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => applyUntilReady(), 0), { once:true });
else setTimeout(() => applyUntilReady(), 0);

export { ensureConfig };
