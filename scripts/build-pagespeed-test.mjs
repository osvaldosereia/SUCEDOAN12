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
  '<meta name="da-build-version" content="2026-07-16-pagespeed-test-v2">'
);
html = html.replace(
  /<meta name="robots" content="[^"]+">/,
  '<meta name="robots" content="noindex, nofollow">'
);
html = html.replace(
  /<title>(.*?)<\/title>/,
  '<title>$1 · Teste PageSpeed</title>'
);

// A página paralela não força no-store por meta tags.
html = html.replace(/\s*<meta http-equiv="Cache-Control"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Pragma"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Expires"[^>]*>/gi, '');

// Remove redirecionamento obrigatório, bfcache reload e limpeza destrutiva do primeiro paint.
replaceRequired(
  /\s*<script>\s*\(function\(\)\{\s*'use strict';\s*const BUILD = '2026-07-16-mobile-sales-v4';[\s\S]*?\}\)\(\);\s*<\/script>/,
  `\n  <script>\n  (function(){\n    'use strict';\n    const BUILD = '2026-07-16-pagespeed-test-v2';\n    window.__DA_BUILD_VERSION__ = BUILD;\n    window.__DA_PAGESPEED_TEST__ = true;\n  })();\n  </script>`,
  'bootstrap antigo de cache/redirecionamento'
);

// Versão estável e exclusiva da página paralela.
html = html.replaceAll('2026-07-16-mobile-sales-v4', '2026-07-16-pagespeed-test-v2');

// Política de cache normal para recursos versionados.
html = html.replace(
  /cache: options && options\.cache \? options\.cache : 'no-store'/g,
  "cache: options && options.cache ? options.cache : 'default'"
);
html = html.replaceAll("{ cache: 'no-cache' }", "{ cache: 'default' }");
html = html.replaceAll("cache: 'no-store'", "cache: 'default'");
html = html.replace(
  /headers:\s*\{\s*Accept: 'application\/json',\s*'Cache-Control': 'no-cache, no-store, max-age=0',\s*Pragma: 'no-cache'\s*\}/g,
  "headers: { Accept: 'application/json' }"
);

// A página de teste nunca compara sua versão com o app-version.json da produção.
// Isso elimina o loop pagespeed-test -> versão oficial -> pagespeed-test.
replaceRequired(
  /\s*const redirectedToLatest = await ensureLatestDeployment\(\);\s*if \(redirectedToLatest\) return;\s*try \{ sessionStorage\.removeItem\('da_version_reload_attempts_v1'\); \} catch\(e\) \{\}/,
  `\n      try { sessionStorage.removeItem('da_version_reload_attempts_v1'); } catch(e) {}`,
  'consulta bloqueante de versão'
);

// Desativa o observador periódico da versão oficial somente na página paralela.
replaceRequired(
  /\s*startDeploymentVersionWatch\(\);/,
  `\n      // Monitor da versão oficial desativado na página paralela.`,
  'monitor periódico de versão'
);

// Mantém uma única renderização completa da home nesta fase de estabilização.
// A otimização progressiva será refeita depois por atualização de seções, sem substituir app.innerHTML.

// Evita purge destrutivo caso a função de versão seja chamada manualmente.
html = html.replace(
  /\s*await purgeBrowserRuntimeCaches\(\);\s*if \(!shouldReload\) return true;/,
  `\n        if (!shouldReload) return true;`
);

// Reserva espaço das imagens e reduz CLS.
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

// Movimento reduzido e blur mais barato quando solicitado pelo dispositivo.
html = html.replace(
  '</style>',
  `@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}\n</style>`
);

html = html.replace(
  '</body>',
  `\n<!-- DA_PAGESPEED_TEST: versão v2 estável, sem monitor de versão oficial e sem recarga automática. -->\n</body>`
);

if (html === original) throw new Error('Nenhuma transformação foi aplicada.');
await fs.writeFile(OUTPUT, html, 'utf8');
console.log(`Gerado ${OUTPUT}: ${Buffer.byteLength(html)} bytes`);
