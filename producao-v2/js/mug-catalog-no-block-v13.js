const BUILD = '20260825-mug-v13-catalog-no-block';
const FALLBACK_THEME = 'Arte Criativa';
const BAD_WORDS = ['comando salvo', 'i.a. criativa', 'sequência', 'sequencia', 'prompt', 'firebase', 'webhook', 'use sua criatividade'];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hasBadWords(value) {
  const source = text(value).toLowerCase();
  return BAD_WORDS.some(word => source.includes(word));
}

function fallbackCatalog(reason = '') {
  const manual = text(document.querySelector('#mugv7Instruction')?.value);
  const theme = manual && !hasBadWords(manual) ? 'Arte Personalizada' : FALLBACK_THEME;
  const name = `Caneca de Porcelana ${theme} - 350ml`;
  return {
    tema: theme,
    nome: name,
    subcategoria: theme,
    descricao: `${name}. Caneca de porcelana branca 350ml com arte exclusiva, ideal para uso pessoal ou presente.`,
    tags: ['caneca de porcelana', 'caneca 350ml', 'arte criativa', 'presente'],
    seo_title: name,
    seo_description: 'Caneca de porcelana branca 350ml com arte exclusiva, ideal para presente e uso pessoal.',
    texto_identificado: '',
    confianca_tema: 0.1,
    catalogacao_fallback: true,
    catalogacao_erro: text(reason).slice(0, 180),
  };
}

function requestAction(init = {}) {
  try {
    const outer = JSON.parse(String(init?.body || '{}'));
    const inner = typeof outer.payload === 'string' ? JSON.parse(outer.payload) : outer.payload;
    return text(inner?.action);
  } catch {
    return '';
  }
}

function catalogLooksUsable(parsed) {
  try {
    if (!parsed || parsed.ok === false) return false;
    let raw = parsed.catalog || parsed.catalog_json || parsed.metadata || parsed.metadata_json || parsed.result;
    if (typeof raw === 'string') raw = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const theme = text(raw.tema);
    if (theme.length < 3) return false;
    if (hasBadWords([theme, raw.subcategoria, raw.nome, raw.descricao].map(text).join(' '))) return false;
    return true;
  } catch {
    return false;
  }
}

function syntheticResponse(reason = '') {
  const body = JSON.stringify({
    ok: true,
    action: 'analyze_mug_product',
    catalog_json: JSON.stringify(fallbackCatalog(reason)),
    fallback: true,
  });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function install() {
  if (window.__daMugCatalogNoBlock === BUILD) return;
  window.__daMugCatalogNoBlock = BUILD;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function mugCatalogSafeFetch(input, init) {
    if (requestAction(init) !== 'analyze_mug_product') return originalFetch(input, init);

    try {
      const response = await originalFetch(input, init);
      const raw = await response.clone().text();
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch {}

      if (response.ok && catalogLooksUsable(parsed)) return response;

      console.warn('Catalogador visual falhou ou devolveu conteúdo inadequado; usando cadastro automático e continuando até o final.', {
        status: response.status,
        body: raw.slice(0, 300),
      });
      return syntheticResponse(`HTTP ${response.status}${raw ? `: ${raw.slice(0, 100)}` : ''}`);
    } catch (error) {
      console.warn('Falha de rede no catalogador visual; usando cadastro automático e continuando até o final.', error);
      return syntheticResponse(error?.message || String(error));
    }
  };
}

install();

export { install, fallbackCatalog };