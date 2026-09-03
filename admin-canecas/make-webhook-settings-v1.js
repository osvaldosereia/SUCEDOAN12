const BUILD = '20260903-admin-canecas-make-webhook-settings-v2-ai-contingencia';
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
    // healthcheck não casa com nenhuma rota funcional do cenário SLIM.
    // O objetivo é somente confirmar que o webhook está ativo, sem chamar OpenAI ou Loja Integrada.
    const payload = {
      action: 'healthcheck',
      request_id: `MAKE-HEALTH-${Date.now().toString(36).toUpperCase()}`,
      source: BUILD,
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json,text/plain,*/*' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    return { ok: response.ok, status: response.status, raw };
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
    <div class="panel-head"><div><h2>Make · IA e contingência</h2><p>O GitHub é o motor operacional. Este webhook fica para OpenAI/personalização e comandos de reserva.</p></div></div>
    <div class="panel-body">
      <div class="notice" style="margin-bottom:12px"><b>Caminho normal: Firebase + GitHub Actions.</b><br>O Make não é mais necessário para catálogo, categorias, sincronização normal de produtos ou preparação da mídia da Loja Integrada.</div>
      <div class="notice warn" style="margin-bottom:12px"><b>Ao importar um cenário novo no Make, o endereço do webhook pode mudar.</b><br>Abra o primeiro módulo Webhooks no cenário, copie a URL e cole abaixo. O Admin usará este endereço após salvar e recarregar.</div>
      <label style="display:block">URL do webhook do cenário Make · IA/contingência
        <input id="cfMakeWebhookUrl" style="width:100%;margin-top:6px" value="${current.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" placeholder="https://hook.eu1.make.com/...">
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" class="primary" id="cfMakeWebhookSave">Salvar webhook</button>
        <button type="button" class="secondary" id="cfMakeWebhookTest">Testar webhook · sem IA</button>
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
    b.disabled = true; b.textContent = 'Testando…'; status.textContent = 'Enviando healthcheck sem OpenAI e sem Loja Integrada…';
    try {
      const result = await testWebhook(url);
      if (result.ok) {
        status.innerHTML = `<b style="color:#16803c">Make respondeu HTTP ${result.status}.</b> Webhook ativo; nenhuma rota de IA/Loja Integrada foi executada.`;
        toast('Webhook do Make respondeu. Teste feito sem IA.');
      } else {
        const msg = text(result.raw).slice(0, 220);
        status.innerHTML = `<b style="color:#b42318">O webhook respondeu HTTP ${result.status}.</b>${msg ? ` ${msg}` : ''}`;
        toast(`O webhook respondeu HTTP ${result.status}.`, true);
      }
    } catch (error) {
      status.innerHTML = `<b style="color:#b42318">Não foi possível alcançar este webhook.</b> ${String(error?.message || error).replace(/</g,'&lt;')}`;
      toast(error?.message || error, true);
    } finally { b.disabled = false; b.textContent = 'Testar webhook · sem IA'; }
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
