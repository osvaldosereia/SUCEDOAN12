from pathlib import Path
import re

# Catálogo normal: mockup 1 + mockup 2 + recorte esquerdo + recorte direito.
sync = Path('scripts/sincronizar-loja-integrada.mjs')
s = sync.read_text(encoding='utf-8')
old = '''function storefrontImages(p = {}) {
  return [
    p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda,
    p.vitrine_recorte_direita || p.vitrine_recortes?.direita,
  ].map(text);
}'''
new = '''function storefrontImages(p = {}) {
  return [
    p.mockup_1,
    p.mockup_2,
    p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda,
    p.vitrine_recorte_direita || p.vitrine_recortes?.direita,
  ].map(text).filter(Boolean);
}
function storefrontCrops(p = {}) {
  return [
    p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda,
    p.vitrine_recorte_direita || p.vitrine_recortes?.direita,
  ].map(text);
}'''
if old not in s:
    raise SystemExit('storefrontImages antigo não encontrado')
s = s.replace(old, new)
s = s.replace(
    "if (storefrontImages(p).some(url => !/^https?:\\/\\//i.test(url))) missing.push('2 recortes da vitrine');",
    "if (storefrontCrops(p).some(url => !/^https?:\\/\\//i.test(url))) missing.push('2 recortes da vitrine');"
)
sync.write_text(s, encoding='utf-8')

# Personalizador: o webhook do Make pode responder Accepted antes de terminar.
app = Path('loja-integrada/personalizar/app-v13.js')
a = app.read_text(encoding='utf-8')
a = a.replace(
    "const BUILD = '20260901-loja-integrada-personalizador-v5.2-horizontal-2-crops';",
    "const BUILD = '20260901-loja-integrada-personalizador-v5.3-horizontal-2-crops-async-cart';"
)

replacement = r'''async function waitTemporaryProduct(code, initial = {}) {
  const immediateId = text(initial?.produto_id || initial?.product_id || initial?.id);
  if (immediateId) return immediateId;

  const started = Date.now();
  const timeout = 180000;
  while (Date.now() - started < timeout) {
    const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
    setProgress('Arte pronta', `Preparando sua caneca no carrinho · ${elapsed}s`);
    try {
      const creation = await fetchJson(`${CREATIONS_NODE}/${safeKey(code)}`);
      const liSync = creation?.loja_integrada && typeof creation.loja_integrada === 'object' ? creation.loja_integrada : {};
      const temp = creation?.loja_integrada_temporario && typeof creation.loja_integrada_temporario === 'object' ? creation.loja_integrada_temporario : {};
      const productId = text(temp.produto_id || liSync.produto_id || liSync.product_id);
      const status = text(temp.status || liSync.sync_status).toLowerCase();
      const syncError = text(temp.erro || temp.erro_tecnico || liSync.sync_error || liSync.erro);
      if (syncError && ['erro','revisar','falhou','failed'].some(flag => status.includes(flag))) throw new Error(syncError);
      if (productId && ['ativo','sincronizado','concluido','concluído','pronto'].some(flag => status.includes(flag))) return productId;
    } catch (error) {
      if (!/Firebase 404/i.test(error?.message || '')) console.debug('Aguardando produto temporário:', error?.message || error);
    }
    await sleep(POLL_MS);
  }
  throw new Error('Sua arte ficou pronta, mas a loja demorou para preparar o carrinho. Tente novamente em alguns instantes.');
}

async function createTemporaryProduct(code, crops) {
  setProgress('Arte pronta', 'Preparando sua caneca no carrinho…');
  const payload = temporaryProductPayload(code, crops);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100000);
  try {
    const response = await fetch(MAKE_WEBHOOK, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify({ payload:JSON.stringify(payload) }),
      signal:controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.ok === false) {
      const technical = text(data.error || data.error_message || data.message || raw).slice(0, 420);
      const failure = new Error('Não foi possível preparar sua caneca no carrinho. Tente novamente em instantes.');
      failure.technical = `Make HTTP ${response.status}${technical ? ` · ${technical}` : ''}`;
      failure.httpStatus = response.status;
      throw failure;
    }

    const productId = await waitTemporaryProduct(code, data);
    const at = new Date().toISOString();
    await writeJson(`${CREATIONS_NODE}/${safeKey(code)}/loja_integrada_temporario`, {
      status:'ativo',
      sku:payload.sku,
      produto_id:productId,
      alias:JSON.parse(payload.alias_json).absolute_path.replace(/^\//,''),
      produto_base_key:modelId,
      criado_em:at,
      ativado_em:at,
      atualizado_em:at,
      expira_em:isoAfterDays(TEMP_DAYS),
      dias_sem_compra:TEMP_DAYS,
      dias_pos_compra:30,
      privacidade:'sem_arte_ou_dados_pessoais_na_loja_integrada',
      origem:'personalizador_web_assincrono',
      erro:'',
      erro_tecnico:''
    }, 'PATCH');
    return productId;
  } catch (error) {
    const technical = error?.name === 'AbortError'
      ? 'timeout_make_100s'
      : text(error?.technical || error?.message || error).slice(0, 500);
    try {
      await writeJson(`${CREATIONS_NODE}/${safeKey(code)}/loja_integrada_temporario`, {
        status:'erro',
        etapa:'make_v13_produto_temporario',
        atualizado_em:new Date().toISOString(),
        erro_tecnico:technical,
        http_status:Number(error?.httpStatus || 0) || 0
      }, 'PATCH');
    } catch {}
    if (error?.name === 'AbortError') throw new Error('A preparação do carrinho demorou mais que o esperado. Tente novamente.');
    throw error;
  } finally { clearTimeout(timer); }
}
'''

pattern = r"async function createTemporaryProduct\(code, crops\) \{[\s\S]*?\n\}\nfunction cartUrl\("
if not re.search(pattern, a):
    raise SystemExit('createTemporaryProduct não encontrado')
a = re.sub(pattern, replacement + '\nfunction cartUrl(', a, count=1)
app.write_text(a, encoding='utf-8')

index = Path('loja-integrada/personalizar/index.html')
h = index.read_text(encoding='utf-8').replace('./app-v13.js?v=20260901-3', './app-v13.js?v=20260901-4')
index.write_text(h, encoding='utf-8')

print('Patch V13 aplicado com sucesso.')
