import fs from 'node:fs/promises';

const SOURCE = 'index.html';
const OUTPUT = 'index-pagespeed-test.html';

let html = await fs.readFile(SOURCE, 'utf8');
const original = html;

function replaceRequired(pattern, replacement, label) {
  const before = html;
  html = html.replace(pattern, replacement);
  if (html === before) throw new Error(`Transformação não encontrada: ${label}`);
}

// Identificação inequívoca da página de testes.
html = html.replace(
  /<meta name="da-build-version" content="[^"]+">/,
  '<meta name="da-build-version" content="2026-07-16-pagespeed-test-v1">\n  <meta name="robots" content="noindex, nofollow">'
);
html = html.replace(
  /<title>(.*?)<\/title>/,
  '<title>$1 · Teste PageSpeed</title>'
);

// O HTML de teste não força no-store por meta tags. A atualização continua controlada pela versão dos recursos.
html = html.replace(/\s*<meta http-equiv="Cache-Control"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Pragma"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Expires"[^>]*>/gi, '');

// Remove o redirecionamento obrigatório com timestamp e a limpeza destrutiva de SW/Cache Storage no primeiro paint.
replaceRequired(
  /\s*<script>\s*\(function\(\)\{\s*'use strict';\s*const BUILD = '2026-07-16-mobile-sales-v4';[\s\S]*?\}\)\(\);\s*<\/script>/,
  `\n  <script>\n  (function(){\n    'use strict';\n    const BUILD = '2026-07-16-pagespeed-test-v1';\n    window.__DA_BUILD_VERSION__ = BUILD;\n  })();\n  </script>`,
  'bootstrap antigo de cache/redirecionamento'
);

// Ajusta a versão interna e mantém URLs versionadas estáveis.
html = html.replaceAll('2026-07-16-mobile-sales-v4', '2026-07-16-pagespeed-test-v1');

// Preload e fetch local passam a usar a mesma política e URL versionada.
html = html.replace(
  /cache: options && options\.cache \? options\.cache : 'no-store'/,
  "cache: options && options.cache ? options.cache : 'default'"
);
html = html.replace(
  /headers:\s*\{\s*Accept: 'application\/json',\s*'Cache-Control': 'no-cache, no-store, max-age=0',\s*Pragma: 'no-cache'\s*\}/,
  "headers: { Accept: 'application/json' }"
);
html = html.replaceAll("{ cache: 'no-cache' }", "{ cache: 'default' }");

// A consulta de versão deixa de bloquear o carregamento inicial.
replaceRequired(
  /\s*const redirectedToLatest = await ensureLatestDeployment\(\);\s*if \(redirectedToLatest\) return;\s*try \{ sessionStorage\.removeItem\('da_version_reload_attempts_v1'\); \} catch\(e\) \{\}/,
  `\n      try { sessionStorage.removeItem('da_version_reload_attempts_v1'); } catch(e) {}\n      const scheduleVersionCheck = () => ensureLatestDeployment().catch(() => false);\n      if ('requestIdleCallback' in window) requestIdleCallback(scheduleVersionCheck, { timeout: 5000 });\n      else setTimeout(scheduleVersionCheck, 2500);`,
  'consulta bloqueante de versão'
);

// O catálogo leve passa a liberar a primeira renderização sem aguardar dados secundários.
replaceRequired(
  /const auxPromise = Promise\.allSettled\(\[loadBanners\(\), loadCestas\(\), loadKits\(\), loadCoupons\(\)\]\);([\s\S]*?)await auxPromise;([\s\S]*?)if \(homeCatalogError\) console\.info\('Home carregada pelo catálogo completo após falha do catálogo leve\.'\);\s*return;/,
  `const auxPromise = Promise.allSettled([loadBanners(), loadCestas(), loadKits(), loadCoupons()]);$1$2if (homeCatalogError) console.info('Home carregada pelo catálogo completo após falha do catálogo leve.');\n          auxPromise.then(() => {\n            if (!isHomeRoute()) return;\n            renderSiteMenuContent();\n            handleRoute();\n            updateCartUI();\n          });\n          return;`,
  'bloqueio por dados auxiliares da home'
);

// Evita novo purge destrutivo quando uma versão diferente for detectada nesta página de testes.
html = html.replace(
  /\s*await purgeBrowserRuntimeCaches\(\);\s*if \(!shouldReload\) return true;/,
  `\n        clearSavedCatalogAndCart();\n        if (!shouldReload) return true;`
);

// Melhora reserva de espaço e prioridade das imagens visíveis sem alterar os fallbacks existentes.
html = html.replace(
  /<img loading="lazy" decoding="async" src="\$\{escapeHtml\(p\.img\)\}"/g,
  '<img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(p.img)}"'
);
html = html.replace(
  /<img loading="lazy" decoding="async" src="\$\{escapeHtml\(cesta\.imagem\)\}"/g,
  '<img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(cesta.imagem)}"'
);
html = html.replace(
  /<img loading="lazy" decoding="async" src="\$\{escapeHtml\(kit\.imagem\)\}"/g,
  '<img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(kit.imagem)}"'
);
html = html.replace(
  /<img class="\$\{className \|\| ''\}" loading="lazy" decoding="async"/g,
  '<img class="${className || \'\'}" loading="lazy" decoding="async" width="300" height="300"'
);

// Reduz custo de animações e blur em dispositivos limitados e durante auditorias.
html = html.replace(
  '</style>',
  `@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}\n</style>`
);

// Marcador de diagnóstico visível apenas no código-fonte.
html = html.replace(
  '</body>',
  `\n<!-- DA_PAGESPEED_TEST: index público preservado; versão paralela gerada automaticamente. -->\n</body>`
);

if (html === original) throw new Error('Nenhuma transformação foi aplicada.');
await fs.writeFile(OUTPUT, html, 'utf8');
console.log(`Gerado ${OUTPUT}: ${Buffer.byteLength(html)} bytes`);
