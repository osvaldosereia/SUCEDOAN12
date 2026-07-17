import fs from 'node:fs/promises';

const SOURCE = 'index.html';
const OUTPUT = 'index-pagespeed-test.html';
const TEST_VERSION = '2026-07-16-pagespeed-test-v3';

let html = await fs.readFile(SOURCE, 'utf8');
const original = html;

function replaceRequired(pattern, replacement, label) {
  const before = html;
  html = html.replace(pattern, replacement);
  if (html === before) throw new Error(`Transformação não encontrada: ${label}`);
}

html = html.replace(
  /<meta name="da-build-version" content="[^"]+">/,
  `<meta name="da-build-version" content="${TEST_VERSION}">`
);
html = html.replace(
  /<meta name="robots" content="[^"]+">/,
  '<meta name="robots" content="noindex, nofollow">'
);
html = html.replace(
  /<title>(.*?)<\/title>/,
  '<title>$1 · Teste PageSpeed</title>'
);

html = html.replace(/\s*<meta http-equiv="Cache-Control"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Pragma"[^>]*>/gi, '');
html = html.replace(/\s*<meta http-equiv="Expires"[^>]*>/gi, '');

replaceRequired(
  /\s*<script>\s*\(function\(\)\{\s*'use strict';\s*const BUILD = '2026-07-16-mobile-sales-v4';[\s\S]*?\}\)\(\);\s*<\/script>/,
  `\n  <script>\n  (function(){\n    'use strict';\n    const BUILD = '${TEST_VERSION}';\n    window.__DA_BUILD_VERSION__ = BUILD;\n    window.__DA_PAGESPEED_TEST__ = true;\n    document.documentElement.classList.add('da-pagespeed-booting');\n    window.__DA_BOOT_REVEAL_TIMER__ = window.setTimeout(function(){\n      document.documentElement.classList.remove('da-pagespeed-booting');\n    }, 8000);\n  })();\n  </script>`,
  'bootstrap antigo de cache/redirecionamento'
);

html = html.replaceAll('2026-07-16-mobile-sales-v4', TEST_VERSION);

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

replaceRequired(
  /\s*const redirectedToLatest = await ensureLatestDeployment\(\);\s*if \(redirectedToLatest\) return;\s*try \{ sessionStorage\.removeItem\('da_version_reload_attempts_v1'\); \} catch\(e\) \{\}/,
  `\n      try { sessionStorage.removeItem('da_version_reload_attempts_v1'); } catch(e) {}`,
  'consulta bloqueante de versão'
);

replaceRequired(
  /\s*startDeploymentVersionWatch\(\);/,
  `\n      // Monitor da versão oficial desativado na página paralela.`,
  'monitor periódico de versão'
);

html = html.replace(
  /\s*await purgeBrowserRuntimeCaches\(\);\s*if \(!shouldReload\) return true;/,
  `\n        if (!shouldReload) return true;`
);

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

html = html.replace(
  '</style>',
  `.da-pagespeed-booting #app{visibility:hidden!important}.da-pagespeed-booting .bottom-nav{visibility:hidden!important}@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}\n</style>`
);

replaceRequired(
  /(state\.isReady\s*=\s*true;[\s\S]*?handleRoute\(\);\s*updateCartUI\(\);)/,
  `$1\n          if (window.__DA_BOOT_REVEAL_TIMER__) clearTimeout(window.__DA_BOOT_REVEAL_TIMER__);\n          requestAnimationFrame(() => {\n            document.documentElement.classList.remove('da-pagespeed-booting');\n          });`,
  'revelação única após primeira renderização completa'
);

html = html.replace(
  '</body>',
  `\n<!-- DA_PAGESPEED_TEST: versão v3 com revelação única após a primeira renderização completa. -->\n</body>`
);

if (html === original) throw new Error('Nenhuma transformação foi aplicada.');
await fs.writeFile(OUTPUT, html, 'utf8');
console.log(`Gerado ${OUTPUT}: ${Buffer.byteLength(html)} bytes`);
