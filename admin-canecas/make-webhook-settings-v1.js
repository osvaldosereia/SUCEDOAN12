const BUILD = '20260831-admin-canecas-make-webhook-settings-v1';
const STORAGE_KEY = 'canecafacil_make_webhook';
const DEFAULT_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const $ = (s, r = document) => r.querySelector(s);

function text(v) { return String(v ?? '').trim(); }
function validWebhook(v) { return /^https:\/\/hook\.[a-z0-9-]+\.make\.com\/[A-Za-z0-9_-]+$/i.test(text(v)); }
function currentWebhook() { return text(localStorage.getItem(STORAGE_KEY) || window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || DEFAULT_WEBHOOK); }
function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return alert(message);
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 4000);
}
function maskUrl(url) {
  const v = text(url);
  if (!v) return '—';
  const p = v.split('/');
  const token = p.pop() || '';
  return `${p.join('/')}/${token.slice(0, 5)}…${token.slice(-4)}`;
}
async function testWebhook(url) {
  if (!validWebhook(url)) throw new Error('Cole uma URL válida de webhook do Make, começando com https://hook...make.com/.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const payload = {
      action: 'loja_integrada_catalog_refs',
      request_id: `LI-TEST-${Date.now().toString(36).toUpperCase()}`,
      source: BUILD,
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    return { ok: response.ok && data?.ok !== false, status: response.status, raw, data };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('O webhook não respondeu em 30 segundos. Confirme que o cenário está ativo e o webhook é o correto.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function render() {
  const root = $('#settings');
  if (!root || $('#cfMakeWebhookSettings', root)) return;
  const current = currentWebhook();
  const section = document.createElement('section');
  section.id = 'cfMakeWebhookSettings';
  section.className = 'panel';
  section.style.margin = '14px 0';
  section.innerHTML = `
    <div class="panel-head"><div><h2>Make · webhook principal</h2><p>Usado para IA, personalização e sincronização com a Loja Integrada.</p></div></div>
    <div class="panel-body">
      <div class="notice warn" style="margin-bottom:12px"><b>Ao importar um cenário novo no Make, o endereço do webhook pode mudar.</b><br>Abra o primeiro módulo Webhooks no cenário, copie a URL e cole abaixo. O Admin usará este endereço após salvar e recarregar.</div>
      <label style="display:block">URL do webhook do cenário Make
        <input id="cfMakeWebhookUrl" style="width:100%;margin-top:6px" value="${current.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" placeholder="https://hook.eu1.make.com/...">
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" class="primary" id="cfMakeWebhookSave">Salvar webhook</button>
        <button type="button" class="secondary" id="cfMakeWebhookTest">Testar conexão</button>
        <button type="button" class="secondary" id="cfMakeWebhookOld">Usar endereço antigo</button>
      </div>
      <div id="cfMakeWebhookStatus" style="margin-top:10px;font-size:12px;color:#687068">Em uso nesta página: ${maskUrl(window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || current)}</div>
    </div>`;
  root.prepend(section);
  $('#cfMakeWebhookSave', section).onclick = () => {
    const url = text($('#cfMakeWebhookUrl', section).value);
    if (!validWebhook(url)) return toast('Webhook inválido. Copie a URL diretamente do primeiro módulo Webhooks no Make.', true);
    localStorage.setItem(STORAGE_KEY, url);
    $('#cfMakeWebhookStatus', section).innerHTML = `<b>Salvo:</b> ${maskUrl(url)} · recarregando o Admin…`;
    toast('Webhook salvo. O Admin será recarregado para usar o novo endereço.');
    setTimeout(() => location.reload(), 800);
  };
  $('#cfMakeWebhookOld', section).onclick = () => { $('#cfMakeWebhookUrl', section).value = DEFAULT_WEBHOOK; };
  $('#cfMakeWebhookTest', section).onclick = async e => {
    const b = e.currentTarget, status = $('#cfMakeWebhookStatus', section), url = text($('#cfMakeWebhookUrl', section).value);
    b.disabled = true; b.textContent = 'Testando…'; status.textContent = 'Enviando uma consulta somente de leitura para o cenário Make…';
    try {
      const result = await testWebhook(url);
      if (result.ok) {
        status.innerHTML = `<b style="color:#16803c">Make respondeu HTTP ${result.status}.</b> O webhook está chegando ao cenário.`;
        toast('Webhook do Make respondeu corretamente.');
      } else {
        const msg = text(result.data?.error || result.data?.error_message || result.raw).slice(0, 220);
        status.innerHTML = `<b style="color:#b42318">O Make recebeu a chamada, mas respondeu HTTP ${result.status}.</b>${msg ? ` ${msg}` : ''}`;
        toast(`O cenário foi acionado, mas respondeu HTTP ${result.status}.`, true);
      }
    } catch (error) {
      status.innerHTML = `<b style="color:#b42318">Não foi possível alcançar este webhook.</b> ${String(error?.message || error).replace(/</g,'&lt;')}`;
      toast(error?.message || error, true);
    } finally { b.disabled = false; b.textContent = 'Testar conexão'; }
  };
}
function schedule() { setTimeout(render, 80); }
window.addEventListener('admin-canecas:route', e => { if (e.detail?.route === 'settings') schedule(); });
window.addEventListener('admin-canecas:settings-rendered', schedule);
window.addEventListener('hashchange', () => { if (location.hash.includes('settings')) schedule(); });
document.addEventListener('DOMContentLoaded', () => { if (location.hash.includes('settings')) schedule(); });
setTimeout(() => { if (location.hash.includes('settings')) render(); }, 250);
document.documentElement.dataset.cfMakeWebhookSettings = BUILD;
export { BUILD, currentWebhook, testWebhook };
