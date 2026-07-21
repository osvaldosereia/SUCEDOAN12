import { readFile, writeFile } from 'node:fs/promises';

const INDEX_PATH = 'index.html';
const SYNC_PATH = 'scripts/sincronizar-produtos-home-firebase.mjs';
const NEW_VERSION = '2026-07-21-carregamento-simples-v18';

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Não encontrei o trecho obrigatório: ${label}`);
  return next;
}

async function updateIndex() {
  let source = await readFile(INDEX_PATH, 'utf8');

  source = source.replaceAll('2026-07-17-compra-rapida-v15', NEW_VERSION);
  source = replaceRequired(source, "APP_VERSION: '2026-07-21-firebase-unico-v17'", `APP_VERSION: '${NEW_VERSION}'`, 'versão do aplicativo');
  source = source.replace(/\s*<link rel="preconnect" href="https:\/\/raw\.githubusercontent\.com" crossorigin>\n?/g, '\n');
  source = source.replace(/\s*<link rel="dns-prefetch" href="\/\/raw\.githubusercontent\.com">\n?/g, '\n');
  source = source.replace(/\s*<link rel="preload" href="site\/produtos-home\.json[^\n]+\n?/g, '\n');
  source = replaceRequired(
    source,
    "PRODUCT_HOME_URLS: ['site/produtos-home.json', 'produtos-home.json']",
    "PRODUCT_HOME_URLS: ['/site/produtos-home.json']",
    'URL única do catálogo público'
  );

  const assetBlock = `    const PUBLIC_ASSET_LOGO = \`\${location.origin}/img/logoantonia5.png\`;
    const REPOSITORY_RAW_BASE = 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main';

    function normalizePublicAsset(value) {
      const source = String(value || '').trim();
      if (!source) return { path: 'img/logoantonia5.png', external: '' };
      if (/^data:/i.test(source)) return { path: '', external: source };

      let clean = source;
      if (/^https?:\\/\\//i.test(source)) {
        const rawMatch = source.match(/^https:\\/\\/raw\\.githubusercontent\\.com\\/osvaldosereia\\/SUCEDOAN12\\/(?:main|master)\\/(.+)$/i);
        if (rawMatch) {
          clean = rawMatch[1];
        } else {
          try {
            const parsed = new URL(source, location.href);
            if (parsed.hostname === location.hostname || /^(?:www\\.)?donaantonia\\.com\\.br$/i.test(parsed.hostname)) {
              clean = parsed.pathname.replace(/^\\/+/, '');
            } else {
              return { path: '', external: source };
            }
          } catch (_) {
            return { path: '', external: source };
          }
        }
      }

      clean = clean.replace(/^(?:\\.\\.\\/|\\.\\/)+/g, '').replace(/^\\/+/, '');
      if (/^img\\/(produtos_3|produtos_2|produtos|kits)\\//i.test(clean)) clean = \`site/\${clean}\`;
      return { path: clean || 'img/logoantonia5.png', external: '' };
    }

    function assetCandidates(value) {
      const normalized = normalizePublicAsset(value);
      if (normalized.external) return [normalized.external];
      const path = normalized.path || 'img/logoantonia5.png';
      const candidates = [\`\${location.origin}/\${path}\`];
      if (/^(?:site\\/img\\/(?:produtos_3|produtos_2|produtos|kits)\\/|site\\/banners\\/)/i.test(path)) {
        candidates.push(\`\${REPOSITORY_RAW_BASE}/\${path}\`);
      }
      return Array.from(new Set(candidates));
    }

    function siteAssetUrl(value) {
      return assetCandidates(value)[0] || PUBLIC_ASSET_LOGO;
    }

    function productImagesFor(raw, product) {
      const list = [];
      const push = value => {
        const source = String(value || '').trim();
        if (!source || /site\\/tmp\\/ia-referencias\\//i.test(source)) return;
        assetCandidates(source).forEach(url => {
          if (url && !/ia-referencias/i.test(url) && !list.includes(url)) list.push(url);
        });
      };

      push(raw.url_imagem || '');
      push(raw.imagem_url || raw.urlImagem || '');
      push(raw.imagem || raw.image || raw.img || raw.foto || raw.foto_url || '');
      if (Array.isArray(raw.imagens)) raw.imagens.forEach(push);
      if (Array.isArray(raw.images)) raw.images.forEach(push);
      if (raw.imagem_path) push(raw.imagem_path);

      const code = String(product.codigo || product.id || product.firebaseKey || '').trim();
      if (code) {
        push(\`site/img/produtos_2/\${encodeURIComponent(code)}.webp\`);
        push(\`site/img/produtos/\${encodeURIComponent(code)}.webp\`);
      }
      if (!list.length) list.push(PUBLIC_ASSET_LOGO);
      return list;
    }

    function extractVolume(text) {`;

  source = replaceRequired(
    source,
    /    function siteAssetUrl\(value\) \{[\s\S]*?\n    function extractVolume\(text\) \{/,
    assetBlock,
    'normalização das imagens'
  );

  const cacheBustBlock = `    function withCacheBust(url, forceFresh) {
      const source = String(url || '');
      const separator = source.includes('?') ? '&' : '?';
      const liveCatalog = /(?:^|\\/)produtos-home\\.json(?:\\?|$)/i.test(source);
      const fiveMinuteVersion = Math.floor(Date.now() / (5 * 60 * 1000));
      const version = forceFresh ? Date.now() : (liveCatalog ? fiveMinuteVersion : CONFIG.APP_VERSION);
      return \`\${source}\${separator}v=\${encodeURIComponent(version)}\`;
    }

    function sleep(ms) {`;

  source = replaceRequired(
    source,
    /    function withCacheBust\(url, forceFresh\) \{[\s\S]*?\n    function sleep\(ms\) \{/,
    cacheBustBlock,
    'cache simples do catálogo'
  );

  const fetchJsonBlock = `    async function fetchJson(url, timeoutMs, options) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 10000) : null;
      try {
        const requestOptions = {
          cache: options && options.cache ? options.cache : 'default',
          headers: { Accept: 'application/json' }
        };
        if (controller) requestOptions.signal = controller.signal;
        const res = await fetch(url, requestOptions);
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        return await res.json();
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    function couponIsValid(coupon) {`;

  source = replaceRequired(
    source,
    /    async function fetchJson\(url, timeoutMs, options\) \{[\s\S]*?\n    function couponIsValid\(coupon\) \{/,
    fetchJsonBlock,
    'fetch compatível com celulares antigos'
  );

  const productsBlock = `    async function loadHomeProducts(options) {
      const forceFresh = !!(options && options.forceFresh);
      const cacheKey = CONFIG.PRODUCT_HOME_CACHE_KEY || 'da_produtos_home_cache_v2';
      const cache = readCache(cacheKey);
      let lastError = null;
      const urls = Array.isArray(CONFIG.PRODUCT_HOME_URLS) && CONFIG.PRODUCT_HOME_URLS.length
        ? CONFIG.PRODUCT_HOME_URLS
        : ['/site/produtos-home.json'];

      for (const url of urls) {
        try {
          const data = await fetchJson(withCacheBust(url, forceFresh), 12000, { cache: forceFresh ? 'no-store' : 'default' });
          normalizeProducts(data, { mode: 'compact-full' });
          state.catalogLoadedAt = Date.now();
          state.catalogSource = 'site-compact';
          state.catalogMode = 'compact-full';
          writeCache(cacheKey, { savedAt: Date.now(), appVersion: CONFIG.APP_VERSION, data });
          return true;
        } catch (error) {
          lastError = error;
        }
      }

      if (cache && cache.data) {
        normalizeProducts(cache.data, { mode: 'compact-cache' });
        state.catalogLoadedAt = Number(cache.savedAt || 0);
        state.catalogSource = 'site-compact-cache';
        state.catalogMode = 'compact-cache';
        return true;
      }

      if (lastError) console.warn('Catálogo público indisponível:', lastError.message || lastError);
      throw lastError || new Error('Catálogo público indisponível');
    }

    async function loadProducts(options) {
      const forceFresh = !!(options && options.forceFresh);
      try {
        await loadHomeProducts({ forceFresh });
        return true;
      } catch (compactError) {
        console.warn('Catálogo público indisponível; usando Firebase como emergência:', compactError && compactError.message ? compactError.message : compactError);
      }

      const cache = readCache(CONFIG.PRODUCT_CACHE_KEY);
      try {
        const data = await fetchJson(withCacheBust(CONFIG.PRODUCT_URL, forceFresh), 12000, { cache: forceFresh ? 'no-store' : 'default' });
        normalizeProducts(data, { mode: 'firebase-emergency' });
        state.catalogLoadedAt = Date.now();
        state.catalogSource = 'firebase-emergency';
        state.catalogMode = 'firebase-emergency';
        state.catalogVerifiedAt = state.catalogLoadedAt;
        state.catalogVerifiedAll = true;
        state.catalogVerifiedItemIds = state.products.map(product => String(product.id));
        writeCache(CONFIG.PRODUCT_CACHE_KEY, { savedAt: Date.now(), appVersion: CONFIG.APP_VERSION, data });
        return true;
      } catch (error) {
        if (cache && cache.data) {
          normalizeProducts(cache.data, { mode: 'firebase-cache' });
          state.catalogLoadedAt = Number(cache.savedAt || 0);
          state.catalogSource = 'firebase-cache';
          state.catalogMode = 'firebase-cache';
          return true;
        }
        throw error;
      }
    }

    function applyCestasData(data) {`;

  source = replaceRequired(
    source,
    /    async function loadHomeProducts\(\) \{[\s\S]*?\n    function applyCestasData\(data\) \{/,
    productsBlock,
    'carregamento único dos produtos'
  );

  const fallbackBlock = `    function fallbackImg(el) {
      if (!el) return;
      const current = String(el.currentSrc || el.src || '').trim();
      const declared = String(el.getAttribute('data-fallback-images') || '')
        .split('|')
        .map(value => value.trim())
        .filter(Boolean);
      if (!declared.includes(PUBLIC_ASSET_LOGO)) declared.push(PUBLIC_ASSET_LOGO);

      const used = new Set(String(el.getAttribute('data-fallback-used') || '').split('|').filter(Boolean));
      if (current) used.add(current);
      const next = declared.find(url => url && url !== current && !used.has(url));

      if (next) {
        el.setAttribute('data-fallback-used', Array.from(used).join('|'));
        el.src = next;
        return;
      }

      el.onerror = null;
      el.src = PUBLIC_ASSET_LOGO;
    }
    window.__daFallbackImg = fallbackImg;`;

  source = replaceRequired(
    source,
    /    function fallbackImg\(el\) \{[\s\S]*?\n    window\.__daFallbackImg = fallbackImg;/,
    fallbackBlock,
    'fallback sequencial de imagens'
  );

  source = replaceRequired(
    source,
    /\n<script id="da-fast-home-runtime">[\s\S]*?<\/script>\n<!-- DA_PRODUCTION_FAST_HOME_V2 -->/,
    '\n<!-- DA_CARREGAMENTO_NATIVO_SIMPLES_V18: imagens abaixo da tela usam loading="lazy" do navegador -->',
    'remoção do pré-carregador agressivo'
  );

  const required = [
    NEW_VERSION,
    "PRODUCT_HOME_URLS: ['/site/produtos-home.json']",
    "state.catalogSource = 'site-compact'",
    "typeof AbortController !== 'undefined'",
    'DA_CARREGAMENTO_NATIVO_SIMPLES_V18',
    'REPOSITORY_RAW_BASE'
  ];
  required.forEach(value => {
    if (!source.includes(value)) throw new Error(`Validação do index falhou: ${value}`);
  });
  if (source.includes('id="da-fast-home-runtime"')) throw new Error('O pré-carregador antigo ainda está presente.');
  if (source.includes('rel="preload" href="site/produtos-home.json')) throw new Error('O preload duplicado do catálogo ainda está presente.');

  await writeFile(INDEX_PATH, source, 'utf8');
}

async function updateSynchronizer() {
  let source = await readFile(SYNC_PATH, 'utf8');

  const replacement = `function publicImageValue(value) {
  const source = text(value);
  if (!source) return '';

  const rawMatch = source.match(/^https:\\/\\/raw\\.githubusercontent\\.com\\/osvaldosereia\\/SUCEDOAN12\\/(?:main|master)\\/(.+)$/i);
  if (rawMatch) return rawMatch[1];

  if (/^https?:\\/\\//i.test(source)) {
    try {
      const parsed = new URL(source);
      if (/^(?:www\\.)?donaantonia\\.com\\.br$/i.test(parsed.hostname)) return parsed.pathname.replace(/^\\/+/, '');
      return source;
    } catch (_) {
      return source;
    }
  }

  let clean = source.replace(/^(?:\\.\\.\\/|\\.\\/)+/g, '').replace(/^\\/+/, '');
  if (/^img\\/(produtos_3|produtos_2|produtos|kits)\\//i.test(clean)) clean = \`site/\${clean}\`;
  return clean;
}

function publicPrice(product) {
  return money(product?.preco ?? product?.price ?? product?.valor);
}

function publicStock(product) {
  return Math.max(0, Math.floor(number(product?.estoque)));
}

function isPubliclyAvailable(product) {
  return isActive(product) && publicStock(product) > 0 && publicPrice(product) > 0;
}

function compactProduct(key, product = {}) {
  const compact = {
    firebaseKey: key,
    id: text(product.id || key),
    codigo: text(product.codigo || product.sku || product.id || key),
    nome: text(product.nome || product.name || product.titulo),
    categoria: text(product.categoria),
    subcategoria: text(product.subcategoria),
    subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca),
    embalagem: text(product.embalagem),
    preco: publicPrice(product),
    preco_oferta: money(product.preco_oferta ?? product.precoOferta),
    estoque: publicStock(product),
    situacao: 'A',
    url_imagem: publicImageValue(product.url_imagem || product.imagem_url || product.imagem || product.image || product.img || product.foto || product.foto_url || product.imagem_path),
    descricao_curta: text(product.descricao_curta || product.descricao).slice(0, 180),
    validade: text(product.validade || product.data_validade),
    validade_oferta: text(product.validade_oferta || product.validadeOferta),
    gtin: text(product.gtin || product.ean),
    gondola: text(product.gondola || product['gôndola']),
    prateleira: text(product.prateleira),
    localizacao: text(product.localizacao)
  };

  return Object.fromEntries(
    Object.entries(compact).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  );
}

async function run() {
  const products = await loadFirebaseProducts();
  const entries = Object.entries(products);
  const visibleEntries = entries.filter(([, product]) => isPubliclyAvailable(product));
  const compact = Object.fromEntries(visibleEntries.map(([key, product]) => [key, compactProduct(key, product)]));

  if (Object.keys(compact).length !== visibleEntries.length) {
    throw new Error('A quantidade de produtos públicos compactados diverge da seleção do Firebase.');
  }

  await writeFile(PRODUCTS_HOME_PATH, \`\${JSON.stringify(compact)}\\n\`, 'utf8');
  console.log(\`\${PRODUCTS_HOME_PATH} sincronizado com \${visibleEntries.length} produtos disponíveis de \${entries.length} produtos do Firebase.\`);
}`;

  source = replaceRequired(
    source,
    /function compactProduct\(key, product = \{\}\) \{[\s\S]*?\nasync function run\(\) \{[\s\S]*?\n\}/,
    replacement,
    'compactação pública do catálogo'
  );

  const required = ['publicImageValue', 'isPubliclyAvailable', 'JSON.stringify(compact)', 'gondola:', 'prateleira:', 'localizacao:'];
  required.forEach(value => {
    if (!source.includes(value)) throw new Error(`Validação do sincronizador falhou: ${value}`);
  });

  await writeFile(SYNC_PATH, source, 'utf8');
}

await updateIndex();
await updateSynchronizer();
console.log('Carregamento de produtos e imagens simplificado com sucesso.');
