(() => {
  'use strict';

  const BUILD = '20260901-li-personalizador-inline-v1';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const WAIT_MS = 180000;
  const POLL_MS = 1800;
  const TEST_PARAM = 'cf_personalizador';
  const TEST_VALUE = 'teste';

  if (window.__CF_LI_PERSONALIZADOR_INLINE__ === BUILD) return;
  window.__CF_LI_PERSONALIZADOR_INLINE__ = BUILD;

  const params = new URLSearchParams(location.search);
  if (params.get(TEST_PARAM) !== TEST_VALUE) return;

  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  let product = null;
  let config = null;
  let productKey = '';
  let generatedSource = '';
  const files = {};

  function style() {
    if (document.getElementById('cfInlinePersonalizerStyles')) return;
    const node = document.createElement('style');
    node.id = 'cfInlinePersonalizerStyles';
    node.textContent = `
      #cfInlinePersonalizer{margin:16px 0;border:1px solid #e4e6df;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 8px 28px rgba(20,24,20,.05)}
      #cfInlinePersonalizer *{box-sizing:border-box}
      .cfip-head{padding:15px 16px 13px;background:#fafbf8;border-bottom:1px solid #eceee8}
      .cfip-head strong{display:block;font-size:17px;line-height:1.2;color:#20231f}
      .cfip-head span{display:block;margin-top:5px;font-size:13px;line-height:1.45;color:#697068}
      .cfip-test{display:inline-flex!important;width:auto!important;margin:0 0 8px!important;padding:4px 8px!important;border-radius:99px;background:#fff3cd;color:#785b00!important;font-weight:700;font-size:10px!important;letter-spacing:.04em}
      .cfip-body{padding:15px 16px}
      .cfip-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
      .cfip-field{display:block;margin:0;color:#30352f;font-size:12px;font-weight:700}
      .cfip-field.wide{grid-column:1/-1}
      .cfip-field input{display:block;width:100%;height:44px;margin-top:5px;padding:9px 11px;border:1px solid #d8dcd4;border-radius:9px;background:#fff;color:#20231f;font:inherit;font-size:14px;font-weight:500;outline:none}
      .cfip-field input:focus{border-color:#747d70;box-shadow:0 0 0 3px rgba(90,104,88,.1)}
      .cfip-field input[type=file]{height:auto;min-height:44px;padding:8px;background:#fafbf8}
      .cfip-field small{display:block;margin-top:4px;color:#858b84;font-size:10px;font-weight:500}
      .cfip-actions{display:flex;gap:8px;margin-top:14px;align-items:center}
      .cfip-primary,.cfip-secondary{border:0;border-radius:9px;padding:12px 14px;min-height:44px;font-weight:800;cursor:pointer}
      .cfip-primary{flex:1;background:#191c19;color:#fff}
      .cfip-secondary{background:#f0f2ed;color:#343934}
      .cfip-primary[disabled],.cfip-secondary[disabled]{opacity:.55;cursor:not-allowed}
      .cfip-status{margin-top:12px;padding:10px 11px;border-radius:9px;background:#f6f7f4;color:#5f665f;font-size:12px;line-height:1.45}
      .cfip-status.error{background:#fff0f0;color:#8a2424}
      .cfip-result{margin-top:14px;border-top:1px solid #eceee8;padding-top:14px}
      .cfip-result img{display:block;width:100%;height:auto;border-radius:10px;background:#f5f5f2}
      .cfip-result strong{display:block;margin:10px 0 2px;color:#20231f}
      .cfip-result p{margin:0;color:#6b716a;font-size:12px;line-height:1.45}
      .cfip-buy-note{margin:11px 0 0;padding:9px 10px;border:1px dashed #d7d9d3;border-radius:9px;color:#71776f;font-size:11px;line-height:1.4}
      @media(max-width:680px){
        #cfInlinePersonalizer{margin:12px 0;border-radius:12px}
        .cfip-head{padding:13px 14px 11px}.cfip-body{padding:13px 14px}
        .cfip-grid{grid-template-columns:1fr;gap:9px}.cfip-field.wide{grid-column:auto}
        .cfip-actions{display:grid;grid-template-columns:1fr}.cfip-primary,.cfip-secondary{width:100%}
      }
    `;
    document.head.appendChild(node);
  }

  function productIdFromPage() {
    const buy = document.querySelector('a[href*="/carrinho/produto/"][href*="/adicionar"]');
    const match = buy?.getAttribute('href')?.match(/\/carrinho\/produto\/(\d+)\/adicionar/i);
    if (match) return match[1];
    const html = document.documentElement.innerHTML;
    return html.match(/PRODUTO_ID\s*[=:]\s*["']?(\d+)/i)?.[1] || '';
  }

  function skuFromPage() {
    const selectors = [
      '[itemprop="sku"]', '[data-sku]', '.codigo-produto', '.produto-codigo', '.sku', '[class*="codigo"]'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const raw = text(el?.getAttribute?.('content') || el?.dataset?.sku || el?.textContent);
      const cleaned = raw.replace(/^.*?(?:c[oó]digo|sku)\s*[:#-]?\s*/i, '').trim();
      if (/^[A-Za-z0-9._-]{3,40}$/.test(cleaned)) return cleaned;
    }
    const html = document.documentElement.innerHTML;
    return text(
      html.match(/["']sku["']\s*:\s*["']([^"']+)["']/i)?.[1]
      || html.match(/SKU\s*[=:]\s*["']([^"']+)["']/i)?.[1]
    );
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function findProduct() {
    const sku = skuFromPage();
    const liId = productIdFromPage();
    if (!sku) throw new Error('Não consegui identificar o SKU desta página.');
    const url = new URL(`${FIREBASE}/produtos.json`);
    url.searchParams.set('orderBy', JSON.stringify('codigo'));
    url.searchParams.set('equalTo', JSON.stringify(sku));
    const data = await fetchJson(url);
    const rows = Object.entries(data || {}).map(([key, value]) => ({ __key: key, ...(value || {}) }));
    if (!rows.length) throw new Error(`SKU ${sku} não foi localizado no CanecaFácil.`);
    if (rows.length > 1) throw new Error(`SKU ${sku} está duplicado no cadastro.`);
    const row = rows[0];
    const savedId = text(row?.loja_integrada?.produto_id || row?.loja_integrada_produto_id);
    if (liId && savedId && liId !== savedId) throw new Error(`A página e o cadastro apontam para produtos diferentes (${liId} / ${savedId}).`);
    return row;
  }

  function normalizeConfig(p = {}) {
    const raw = p.personalizacao && typeof p.personalizacao === 'object' ? p.personalizacao : {};
    const defs = {
      nome: ['text', 'Nome', 80],
      foto: ['image', 'Foto', 0],
      logo: ['image', 'Logo', 0],
      endereco: ['text', 'Endereço', 180],
      telefone: ['text', 'Telefone', 40],
      site: ['text', 'Site', 120]
    };
    const fields = [];
    for (const [id, [type, defaultLabel, max]] of Object.entries(defs)) {
      const item = raw.campos?.[id] || {};
      if (item.ativo !== true) continue;
      fields.push({
        id,
        tipo: type,
        rotulo: text(item.rotulo) || defaultLabel,
        obrigatorio: item.obrigatorio === true,
        max
      });
    }
    return {
      ativa: raw.ativa === true,
      obrigatoria: raw.ativa === true && raw.obrigatoria === true,
      campos: fields,
      prompt_base_id: text(raw.prompt_base_id),
      prompt_base_nome: text(raw.prompt_base_nome),
      prompt_base_texto: text(raw.prompt_base_texto),
      prompt_base_versao: Number(raw.prompt_base_versao || 0) || 0,
      prompt_especifico: text(raw.prompt_especifico),
      config_version: Number(raw.config_version || 0) || 0
    };
  }

  function buildPrompt(values = {}, fileFlags = {}) {
    const allowed = [];
    const data = [];
    for (const field of config.campos) {
      allowed.push(`${field.id} (${field.rotulo})`);
      if (field.tipo === 'image') {
        if (fileFlags[field.id]) data.push(`${field.rotulo}: arquivo enviado pelo cliente.`);
      } else if (text(values[field.id])) {
        data.push(`${field.rotulo}: ${text(values[field.id])}`);
      }
    }
    return [
      'REGRA OBRIGATÓRIA: altere exclusivamente os elementos autorizados abaixo.',
      'Preserve integralmente todos os elementos que não foram autorizados para alteração.',
      'Não acrescente elementos, textos, personagens, cores ou instruções não autorizadas.',
      `ELEMENTOS AUTORIZADOS: ${allowed.join(', ')}.`,
      config.prompt_base_texto ? `INSTRUÇÃO PADRÃO:\n${config.prompt_base_texto}` : '',
      config.prompt_especifico ? `INSTRUÇÃO ESPECÍFICA DESTE MODELO:\n${config.prompt_especifico}` : '',
      data.length ? `DADOS DO CLIENTE:\n${data.join('\n')}` : ''
    ].filter(Boolean).join('\n\n');
  }

  function modelArt(p = {}) {
    return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(text(reader.result));
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
      reader.readAsDataURL(file);
    });
  }

  async function urlToDataUrl(url) {
    if (/^data:image\//i.test(url)) return url;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar a arte-base.');
    return fileToDataUrl(await response.blob());
  }

  function userEmail() {
    const match = document.cookie.match(/(?:^|;\s*)user_email=([^;]+)/i);
    if (!match) return '';
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }

  function fieldHtml(field) {
    const required = field.obrigatorio ? 'required' : '';
    const star = field.obrigatorio ? ' *' : '';
    if (field.tipo === 'image') {
      return `<label class="cfip-field">${esc(field.rotulo)}${star}<input data-cf-field="${esc(field.id)}" type="file" accept="image/png,image/jpeg,image/webp" ${required}><small>PNG, JPG ou WebP</small></label>`;
    }
    return `<label class="cfip-field">${esc(field.rotulo)}${star}<input data-cf-field="${esc(field.id)}" type="text" maxlength="${field.max || 180}" ${required}></label>`;
  }

  function placePanel(panel) {
    document.querySelectorAll('.cf-personalizer-box').forEach(el => { el.style.display = 'none'; });
    const buy = document.querySelector('.acoes-produto .comprar, .acoes-produto [class*="comprar"], a[href*="/carrinho/produto/"][href*="/adicionar"]');
    const anchor = buy?.closest('.comprar') || buy;
    if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else {
      const details = document.querySelector('.produto .principal, .produto-detalhes, .info-principal-produto, main');
      (details || document.body).appendChild(panel);
    }
  }

  function render() {
    style();
    const fields = config.campos.map(fieldHtml).join('');
    const allowedText = config.campos.map(f => f.rotulo.toLowerCase()).join(', ');
    const panel = document.createElement('section');
    panel.id = 'cfInlinePersonalizer';
    panel.innerHTML = `
      <div class="cfip-head">
        <span class="cfip-test">HOMOLOGAÇÃO · SOMENTE VOCÊ VÊ COM ?cf_personalizador=teste</span>
        <strong>Personalize esta caneca</strong>
        <span>${allowedText ? `Neste modelo você pode alterar: ${esc(allowedText)}.` : 'Este modelo ainda não possui campos liberados.'}</span>
      </div>
      <div class="cfip-body">
        <form id="cfipForm">
          <div class="cfip-grid">
            <label class="cfip-field wide">Seu e-mail *<input id="cfipEmail" type="email" autocomplete="email" value="${esc(userEmail())}" required><small>Usamos o e-mail para identificar e recuperar sua criação.</small></label>
            ${fields}
          </div>
          <div class="cfip-actions">
            <button class="cfip-primary" id="cfipGenerate" type="submit">GERAR MINHA ARTE</button>
          </div>
          <div class="cfip-status" id="cfipStatus">Teste seguro: a geração funciona aqui, mas a compra personalizada ainda está desativada nesta homologação.</div>
        </form>
        <div class="cfip-result" id="cfipResult" hidden>
          <img id="cfipResultImage" alt="Arte personalizada gerada">
          <strong>Sua arte ficou pronta</strong>
          <p>Confira com atenção. Nesta etapa de homologação ainda não enviaremos a caneca personalizada ao carrinho.</p>
          <div class="cfip-actions">
            <button class="cfip-secondary" id="cfipAgain" type="button">ALTERAR / GERAR NOVAMENTE</button>
            <button class="cfip-primary" type="button" disabled>APROVAR E COMPRAR · EM BREVE</button>
          </div>
        </div>
        <div class="cfip-buy-note">${config.obrigatoria ? 'Neste modelo a personalização será obrigatória quando entrarmos em produção.' : 'Neste modelo a personalização é opcional; a compra sem alterações continuará disponível.'}</div>
      </div>`;
    placePanel(panel);

    if (config.obrigatoria) {
      const buy = document.querySelector('.acoes-produto .comprar, a[href*="/carrinho/produto/"][href*="/adicionar"]')?.closest('.comprar')
        || document.querySelector('a[href*="/carrinho/produto/"][href*="/adicionar"]');
      if (buy) {
        buy.dataset.cfHomologacaoOriginalDisplay = buy.style.display || '';
        buy.style.display = 'none';
      }
    }

    panel.querySelectorAll('input[type=file][data-cf-field]').forEach(input => {
      input.addEventListener('change', () => { files[input.dataset.cfField] = input.files?.[0] || null; });
    });
    panel.querySelector('#cfipForm').addEventListener('submit', generate);
    panel.querySelector('#cfipAgain').addEventListener('click', () => {
      generatedSource = '';
      panel.querySelector('#cfipResult').hidden = true;
      panel.querySelector('#cfipForm').hidden = false;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function collectValues() {
    const values = {};
    const fileFlags = {};
    for (const field of config.campos) {
      const input = document.querySelector(`[data-cf-field="${CSS.escape(field.id)}"]`);
      if (field.tipo === 'image') fileFlags[field.id] = Boolean(files[field.id]);
      else values[field.id] = text(input?.value);
    }
    return { values, fileFlags };
  }

  function validate(values, fileFlags) {
    const errors = [];
    for (const field of config.campos) {
      if (!field.obrigatorio) continue;
      if (field.tipo === 'image' && !fileFlags[field.id]) errors.push(`${field.rotulo} é obrigatório.`);
      if (field.tipo !== 'image' && !text(values[field.id])) errors.push(`${field.rotulo} é obrigatório.`);
    }
    return errors;
  }

  function imageSource(record) {
    if (!record || typeof record !== 'object') return '';
    const nested = record.result && typeof record.result === 'object' ? record.result : {};
    const value = text(record.art_source_url || record.art_url || record.result_url || record.arte_horizontal_url || record.arte_horizontal || record.art_source_base64 || record.image_base64 || nested.art_source_url || nested.art_source_base64);
    if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 1000) return `data:image/webp;base64,${value.replace(/\s+/g, '')}`;
    return '';
  }

  async function waitResult(requestId) {
    const started = Date.now();
    while (Date.now() - started < WAIT_MS) {
      setStatus(`Gerando sua arte… ${Math.max(1, Math.round((Date.now() - started) / 1000))}s`);
      const record = await fetchJson(`${FIREBASE}/canecas/geracoes/${safeKey(requestId)}.json?_=${Date.now()}`).catch(() => null);
      if (record?.ok === false || record?.error || record?.erro) throw new Error(record.error || record.erro || 'A geração falhou.');
      const source = imageSource(record);
      if (source) return source;
      await sleep(POLL_MS);
    }
    throw new Error('A geração demorou mais de 3 minutos. Tente novamente.');
  }

  function setStatus(message, error = false) {
    const node = document.getElementById('cfipStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `cfip-status${error ? ' error' : ''}`;
  }

  async function generate(event) {
    event.preventDefault();
    const button = document.getElementById('cfipGenerate');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const email = text(document.getElementById('cfipEmail')?.value).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Digite um e-mail válido.');
      const { values, fileFlags } = collectValues();
      const errors = validate(values, fileFlags);
      if (errors.length) throw new Error(errors[0]);
      const art = modelArt(product);
      if (!art) throw new Error('Este modelo não possui arte-base disponível.');
      setStatus('Preparando a arte-base…');
      const base64 = await urlToDataUrl(art);
      const images = [];
      for (const field of config.campos.filter(f => f.tipo === 'image')) {
        if (!files[field.id]) continue;
        images.push({ field_id: field.id, label: field.rotulo, image_base64: await fileToDataUrl(files[field.id]) });
      }
      const requestId = `INLINE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const prompt = buildPrompt(values, fileFlags);
      const payload = {
        action: 'personalize_mug_model',
        request_id: requestId,
        model_id: productKey,
        mode: 'loja_integrada_inline',
        origin: 'loja_integrada',
        store_domain: location.hostname,
        customer_email: email,
        customer_name: '',
        customer_whatsapp: '',
        fields_json: JSON.stringify(values),
        images_json: JSON.stringify(images),
        image_base64: base64,
        instruction: '',
        prompt_art: prompt,
        personalizacao_config_version: config.config_version,
        prompt_base_id: config.prompt_base_id,
        prompt_base_versao: config.prompt_base_versao,
        firebase_url: FIREBASE,
        products_node: 'produtos',
        quality: 'low',
        client_contract: BUILD
      };
      setStatus('Enviando sua personalização…');
      const response = await fetch(MAKE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ payload: JSON.stringify(payload) })
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`Automação respondeu HTTP ${response.status}.`);
      let source = '';
      if (raw && !/^accepted\.?$/i.test(text(raw))) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.ok === false) throw new Error(parsed.error || 'A automação recusou a geração.');
          source = imageSource(parsed);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      if (!source) source = await waitResult(requestId);
      generatedSource = source;
      document.getElementById('cfipResultImage').src = source;
      document.getElementById('cfipForm').hidden = true;
      document.getElementById('cfipResult').hidden = false;
      setStatus('Arte gerada com sucesso.');
      document.getElementById('cfInlinePersonalizer').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      console.error('[CanecaFácil inline]', error);
      setStatus(error?.message || String(error), true);
    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    try {
      product = await findProduct();
      productKey = product.__key;
      config = normalizeConfig(product);
      if (!config.ativa) {
        console.info(`[CanecaFácil] ${productKey}: personalização desativada.`);
        return;
      }
      if (!config.campos.length) throw new Error('A personalização está ativa, mas nenhum campo foi liberado no Admin.');
      render();
      console.info(`CanecaFácil · personalizador inline ${BUILD} · modelo ${productKey}`);
    } catch (error) {
      console.warn('[CanecaFácil inline] homologação não iniciada:', error?.message || error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
