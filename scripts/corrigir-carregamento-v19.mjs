import { readFile, writeFile } from 'node:fs/promises';

const INDEX_PATH = 'index.html';
const VERSION_PATH = 'site/app-version.json';
const OLD_VERSION = '2026-07-21-carregamento-simples-v18';
const NEW_VERSION = '2026-07-21-carregamento-imediato-v19';

function replaceRequired(source, search, replacement, label) {
  const next = typeof search === 'string' ? source.replace(search, replacement) : source.replace(search, replacement);
  if (next === source) throw new Error(`Trecho não encontrado: ${label}`);
  return next;
}

let html = await readFile(INDEX_PATH, 'utf8');
html = html.split(OLD_VERSION).join(NEW_VERSION);

html = replaceRequired(
  html,
  `        if (current !== CONFIG.APP_VERSION) {\n          clearSavedCatalogAndCart();\n          localStorage.setItem(CONFIG.VERSION_STORAGE_KEY, CONFIG.APP_VERSION);\n        }`,
  `        if (current !== CONFIG.APP_VERSION) {\n          // Atualização do código não deve apagar catálogos já baixados.\n          // O cache existente permite que celulares lentos abram a loja imediatamente.\n          localStorage.setItem(CONFIG.VERSION_STORAGE_KEY, CONFIG.APP_VERSION);\n        }`,
  'preservar cache entre versões'
);

html = replaceRequired(
  html,
  `      let lastError = null;\n      const urls = Array.isArray(CONFIG.PRODUCT_HOME_URLS) && CONFIG.PRODUCT_HOME_URLS.length\n        ? CONFIG.PRODUCT_HOME_URLS\n        : ['/site/produtos-home.json'];\n\n      for (const url of urls) {`,
  `      let lastError = null;\n      const urls = Array.isArray(CONFIG.PRODUCT_HOME_URLS) && CONFIG.PRODUCT_HOME_URLS.length\n        ? CONFIG.PRODUCT_HOME_URLS\n        : ['/site/produtos-home.json'];\n      const cacheAge = cache ? Date.now() - Number(cache.savedAt || 0) : Infinity;\n\n      // Abre imediatamente com o catálogo recente já salvo no aparelho.\n      // A cada dez minutos o arquivo público volta a ser consultado.\n      if (!forceFresh && cache && cache.data && cacheAge <= 10 * 60 * 1000) {\n        normalizeProducts(cache.data, { mode: 'compact-cache-fast' });\n        state.catalogLoadedAt = Number(cache.savedAt || 0);\n        state.catalogSource = 'site-compact-cache-fast';\n        state.catalogMode = 'compact-cache-fast';\n        return true;\n      }\n\n      for (const url of urls) {`,
  'catálogo cache-first'
);

html = replaceRequired(
  html,
  `    function applyCestasData(data) {\n      const list = Array.isArray(data) ? data : Object.values(data || {});\n      state.cestas = list.filter(c => c && c.id && c.nome && Array.isArray(c.produtos)).map(c => ({\n        id: String(c.id),\n        nome: String(c.nome || 'Cesta Básica'),\n        descricao: String(c.descricao || c.description || 'Kit de produtos selecionados.'),\n        imagem: normalizeRelativeImage(c.imagem || c.img || c.url_imagem || 'img/logoantonia5.png'),`,
  `    function applyCestasData(data) {\n      const list = Array.isArray(data) ? data : Object.values(data || {});\n      state.cestas = list.filter(c => c && c.id && c.nome && Array.isArray(c.produtos)).map(c => ({\n        id: String(c.id),\n        nome: String(c.nome || 'Cesta Básica'),\n        descricao: String(c.descricao || c.description || 'Kit de produtos selecionados.'),\n        imagem: normalizeRelativeImage(c.imagem || c.img || c.url_imagem || 'img/logoantonia5.png'),\n        imagens: assetCandidates(c.imagem || c.img || c.url_imagem || 'img/logoantonia5.png'),`,
  'fallback de imagem das cestas'
);

html = replaceRequired(
  html,
  `    async function loadCestas() {\n      const cache = readCache(CONFIG.BASKET_CACHE_KEY);`,
  `    async function loadCestas(options) {\n      const forceFresh = !!(options && options.forceFresh);\n      const cache = readCache(CONFIG.BASKET_CACHE_KEY);\n      if (!forceFresh && cache && cache.data) {\n        applyCestasData(cache.data);\n        setTimeout(() => loadCestas({ forceFresh: true }).then(() => {\n          if (state.isReady && /^(#\\/(?:$|cestas|cesta\\/))/.test(location.hash || '#/')) handleRoute();\n        }).catch(() => {}), 80);\n        return;\n      }`,
  'cestas cache-first'
);

html = replaceRequired(
  html,
  `          const data = await fetchJson(withCacheBust(url), 5000, { cache: 'default' });\n          applyCestasData(data);`,
  `          const data = await fetchJson(withCacheBust(url, forceFresh), 8000, { cache: forceFresh ? 'no-store' : 'default' });\n          applyCestasData(data);`,
  'atualização das cestas'
);

html = replaceRequired(
  html,
  `          imagem: normalizeRelativeImage(k.imagem || k.img || k.url_imagem || 'img/logoantonia5.png'),\n          preco,`,
  `          imagem: normalizeRelativeImage(k.imagem || k.img || k.url_imagem || 'img/logoantonia5.png'),\n          imagens: assetCandidates(k.imagem || k.img || k.url_imagem || 'img/logoantonia5.png'),\n          preco,`,
  'fallback de imagem dos kits'
);

html = replaceRequired(
  html,
  `    async function loadKits() {\n      const cache = readCache(CONFIG.KIT_CACHE_KEY);`,
  `    async function loadKits(options) {\n      const forceFresh = !!(options && options.forceFresh);\n      const cache = readCache(CONFIG.KIT_CACHE_KEY);\n      if (!forceFresh && cache && cache.data) {\n        applyKitsData(cache.data);\n        setTimeout(() => loadKits({ forceFresh: true }).then(() => {\n          if (state.isReady && /^(#\\/(?:$|kits|kit\\/))/.test(location.hash || '#/')) handleRoute();\n        }).catch(() => {}), 100);\n        return;\n      }`,
  'kits cache-first'
);

html = replaceRequired(
  html,
  `          const data = await fetchJson(withCacheBust(url), 5000, { cache: 'default' });\n          applyKitsData(data);`,
  `          const data = await fetchJson(withCacheBust(url, forceFresh), 8000, { cache: forceFresh ? 'no-store' : 'default' });\n          applyKitsData(data);`,
  'atualização dos kits'
);

html = replaceRequired(
  html,
  `    function normalizeRelativeImage(value) {\n      const img = String(value || '').trim();\n      if (!img) return 'https://donaantonia.com.br/img/logoantonia5.png';\n      if (/site\\/tmp\\/ia-referencias\\//i.test(img)) return 'https://donaantonia.com.br/img/logoantonia5.png';\n      if (/^(https?:|data:)/i.test(img)) return img;\n      const clean = img.replace(/^(\\.\\.\\/|\\.\\/)+/g, '').replace(/^\\/+/, '');\n      return siteAssetUrl(clean);\n    }`,
  `    function normalizeRelativeImage(value) {\n      const img = String(value || '').trim();\n      if (!img) return PUBLIC_ASSET_LOGO;\n      if (/site\\/tmp\\/ia-referencias\\//i.test(img)) return PUBLIC_ASSET_LOGO;\n      if (/^data:/i.test(img)) return img;\n      return siteAssetUrl(img);\n    }`,
  'origem principal das imagens auxiliares'
);

html = replaceRequired(
  html,
  `      if (!declared.includes(PUBLIC_ASSET_LOGO)) declared.push(PUBLIC_ASSET_LOGO);`,
  `      // Mesmo imagens de kit/cesta sem lista declarada ganham uma segunda origem.\n      if (current) {\n        const normalizedCurrent = normalizePublicAsset(current);\n        if (normalizedCurrent.path) assetCandidates(normalizedCurrent.path).forEach(url => {\n          if (url && !declared.includes(url)) declared.push(url);\n        });\n      }\n      if (!declared.includes(PUBLIC_ASSET_LOGO)) declared.push(PUBLIC_ASSET_LOGO);`,
  'fallback automático das imagens'
);

html = html.replaceAll(
  `src="\${escapeHtml(cesta.imagem)}" alt="\${escapeHtml(cesta.nome)}"`,
  `src="\${escapeHtml(cesta.imagem)}" data-fallback-images="\${escapeHtml(imageFallbackList(cesta.imagens))}" alt="\${escapeHtml(cesta.nome)}"`
);
html = html.replaceAll(
  `src="\${escapeHtml(kit.imagem)}" alt="\${escapeHtml(kit.nome)}"`,
  `src="\${escapeHtml(kit.imagem)}" data-fallback-images="\${escapeHtml(imageFallbackList(kit.imagens))}" alt="\${escapeHtml(kit.nome)}"`
);

html = replaceRequired(
  html,
  `          await auxPromise;\n\n          state.isReady = true;`,
  `          // Produtos aparecem assim que o catálogo estiver pronto.\n          // Kits, cestas e cupons continuam carregando sem bloquear a vitrine.\n          state.isReady = true;`,
  'home sem bloqueio auxiliar'
);

html = replaceRequired(
  html,
  `          if (homeCatalogError) console.info('Home carregada pelo catálogo completo após falha do catálogo leve.');\n          return;`,
  `          auxPromise.then(() => {\n            if (!state.isReady || !isHomeRoute()) return;\n            renderSiteMenuContent();\n            handleRoute();\n            updateCartUI();\n          });\n          if (homeCatalogError) console.info('Home carregada pelo catálogo completo após falha do catálogo leve.');\n          return;`,
  'atualização posterior da home'
);

html = replaceRequired(
  html,
  `        // Rotas de produto/categoria/busca entram com o catálogo completo para evitar detalhe incompleto.\n        await Promise.all([\n          loadProducts(),\n          Promise.allSettled([loadCestas(), loadKits(), loadCoupons()])\n        ]);\n        state.isReady = true;`,
  `        // Nenhuma rota deve esperar kits, cestas ou cupons para mostrar produtos.\n        const auxPromise = Promise.allSettled([loadCestas(), loadKits(), loadCoupons()]);\n        await loadProducts();\n        state.isReady = true;`,
  'rotas sem bloqueio auxiliar'
);

html = replaceRequired(
  html,
  `        handleRoute();\n        updateCartUI();\n      } catch(err) {`,
  `        handleRoute();\n        updateCartUI();\n        auxPromise.then(() => {\n          if (!state.isReady) return;\n          const hash = location.hash || '#/';\n          if (/^#\\/(?:kits|kit\\/|cestas|cesta\\/)/.test(hash)) handleRoute();\n          renderSiteMenuContent();\n          updateCartUI();\n        });\n      } catch(err) {`,
  'atualização posterior das rotas'
);

await writeFile(INDEX_PATH, html, 'utf8');
await writeFile(VERSION_PATH, JSON.stringify({
  version: NEW_VERSION,
  updatedAt: new Date().toISOString(),
  purpose: 'Carregamento imediato por cache; kits e cestas com duas origens de imagem'
}, null, 2) + '\n', 'utf8');

console.log(`Carregamento corrigido para ${NEW_VERSION}.`);
