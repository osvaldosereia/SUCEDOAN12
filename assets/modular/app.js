
  (function(){
    'use strict';

    const CONFIG = {
      SITE_BASE_URL: 'https://www.donaantonia.com.br',
      PRODUCT_URL: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos.json',
      PRODUCT_ITEM_BASE_URL: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos',
      PRODUCT_HOME_URLS: ['site/produtos-home.json', 'produtos-home.json'],
      MAKE_WEBHOOK_URL: 'https://hook.eu1.make.com/cmjv3cc829ocf26vo1h8fs61n5lkt6hc',
      FIREBASE_ORDERS_URL: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/pedidos',
      ORDER_DELIVERY_QUEUE_KEY: 'da_pedidos_pendentes_v2',
      ORDER_DELIVERY_MAX_ITEMS: 20,
      ORDER_DELIVERY_RETRY_MS: 10 * 60 * 1000,
      CLIENT_LOOKUP_WEBHOOK_URL: 'https://hook.eu1.make.com/1wfehhacklarj1h4c78xrh4f7yjdlp9v',
      WHATSAPP_NUMBER: '5565998150975',
      APP_VERSION: '2026-07-17-imagens-mobile-v14',
      VERSION_STORAGE_KEY: 'da_app_version_v1',
      VERSION_URL: 'site/app-version.json',
      PRODUCT_CACHE_KEY: 'da_produtos_cache_v5',
      PRODUCT_HOME_CACHE_KEY: 'da_produtos_home_cache_v2',
      BASKET_CACHE_KEY: 'da_cestas_cache_v5',
      KIT_CACHE_KEY: 'da_kits_cache_v1',
      CART_STORAGE_KEY: 'da_carrinho_v1',
      CHECKOUT_CLIENT_KEY: 'da_checkout_cliente_v1',
      COUPON_STORAGE_KEY: 'da_cupom_ativo_v1',
      FAVORITES_STORAGE_KEY: 'da_favoritos_v1',
      COUPON_URLS: ['site/cuponsativos.json', 'cuponsativos.json'],
      CART_MAX_AGE_MS: 6 * 60 * 60 * 1000,
      MIN_ORDER: 75,
      DEFAULT_DDD: '65'
    };

    const ROUTINES = {
      'compra-mes': { title: 'Compra do mês', subtitle: 'Básicos para encher a despensa', terms: ['arroz','feijao','oleo','acucar','cafe','leite','macarrao','molho','farinha','sal'] },
      'limpeza': { title: 'Limpeza da casa', subtitle: 'Lavanderia, banheiro e cozinha', terms: ['sabao','detergente','desinfetante','amaciante','agua sanitaria','limpa','multiuso','esponja','papel higienico'] },
      'cafe': { title: 'Café da manhã', subtitle: 'Café, leite, achocolatado e biscoitos', terms: ['cafe','leite','nescau','toddy','biscoito','bolacha','margarina','achocolatado','pao'] },
      'higiene': { title: 'Higiene e beleza', subtitle: 'Cuidados pessoais do dia a dia', terms: ['sabonete','shampoo','condicionador','creme dental','desodorante','absorvente','hidratante','escova'] }
    };

    const state = {
      products: [],
      productMap: new Map(),
      productCodeMap: new Map(),
      cestas: [],
      kits: [],
      favorites: new Set(),
      cart: {},
      cartOrder: [],
      basketCustomizations: {},
      basketDrafts: {},
      virtualFees: {},
      activeCategory: 'Todos',
      searchQuery: '',
      searchTimer: null,
      coupons: [],
      activeCouponCode: '',
      couponMessage: '',
      couponMessageType: '',
      customerLookupStatus: 'unknown',
      customerLookupCpf: '',
      checkoutOfferLimit: 12,
      checkoutOfferScrollLeft: 0,
      catalogLoadedAt: 0,
      catalogSource: '',
      catalogMode: '',
      catalogVerifiedAt: 0,
      catalogVerifiedAll: false,
      catalogVerifiedItemIds: [],
      isReady: false
    };

    const $ = id => document.getElementById(id);
    const app = $('app');

    function fmt(value) {
      return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    }

    function codeVariants(value) {
      const raw = String(value == null ? '' : value).trim();
      const base = norm(raw);
      if (!base) return [];
      const compact = base.replace(/[^a-z0-9]/g, '');
      const noPrefixZeros = compact.replace(/^([a-z]+)0+(\d+)$/, '$1$2');
      const onlyNumber = compact.replace(/^[a-z]+0*(\d+)$/, '$1');
      const noLeadingZeros = compact.replace(/^0+(\d+)$/, '$1');
      return Array.from(new Set([base, compact, noPrefixZeros, onlyNumber, noLeadingZeros].filter(Boolean)));
    }

    function words(value) {
      return norm(value).split(/[^a-z0-9]+/g).filter(Boolean);
    }

    function slug(value) {
      return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function parseMoney(value) {
      if (typeof value === 'number') return value;
      const str = String(value || '').trim();
      if (!str) return 0;
      const normalized = str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str;
      return Number(normalized) || 0;
    }

    function formatName(value) {
      const raw = String(value || 'Produto').trim().replace(/\s+/g, ' ');
      if (!raw) return 'Produto';
      return raw.toLowerCase().replace(/(^|\s|[-/])([a-záéíóúâêôãõç])/g, (m, sep, chr) => sep + chr.toUpperCase()).replace(/\b(kg|g|ml|l|un|und|pct|cx)\b/gi, m => m.toLowerCase());
    }

    function siteAssetUrl(value) {
      const img = String(value || '').trim();
      const siteBase = 'https://donaantonia.com.br';
      const githubRawBase = 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main';
      if (!img) return `${siteBase}/img/logoantonia5.png`;
      if (/^data:/i.test(img)) return img;
      if (/^https?:\/\//i.test(img)) return img;
      const clean = img.replace(/^(\.\.\/|\.\/)+/g, '').replace(/^\/+/, '');
      if (!clean) return `${siteBase}/img/logoantonia5.png`;
      // Imagens novas e arquivos publicados pelo admin/Make ficam no GitHub.
      // Usar raw evita depender de deploy do domínio para cada imagem nova.
      if (/^(site\/img\/(produtos_3|produtos_2|produtos|kits)\/|site\/banners\/)/i.test(clean)) {
        return `${githubRawBase}/${clean}`;
      }
      // Caminhos antigos sem o prefixo site/ continuam aceitos como legado.
      if (/^img\/(produtos_3|produtos_2|produtos|kits)\//i.test(clean)) {
        return `${githubRawBase}/site/${clean}`;
      }
      if (clean.startsWith('site/')) return `${siteBase}/${clean}`;
      return `${siteBase}/${clean}`;
    }

    function productImagesFor(raw, product) {
      const list = [];
      const push = value => {
        const src = String(value || '').trim();
        if (!src) return;
        // Nunca usar referência temporária como imagem pública do produto.
        if (/site\/tmp\/ia-referencias\//i.test(src) || /\/site\/tmp\/ia-referencias\//i.test(src)) return;
        const url = siteAssetUrl(src);
        if (url && !/ia-referencias/i.test(url) && !list.includes(url)) list.push(url);
      };
      // Ordem oficial da estratégia nova: URL final salva no Firebase primeiro.
      push(raw.url_imagem || '');
      push(raw.imagem_url || raw.urlImagem || '');
      push(raw.imagem || raw.image || raw.img || raw.foto || raw.foto_url || '');
      if (Array.isArray(raw.imagens)) raw.imagens.forEach(push);
      if (Array.isArray(raw.images)) raw.images.forEach(push);
      // Se o admin salvou apenas o path novo, montar a URL raw do GitHub.
      if (!list.length && raw.imagem_path) push(raw.imagem_path);
      const code = String(product.codigo || product.id || product.firebaseKey || '').trim();
      if (!list.length && code) {
        push(`img/produtos_2/${encodeURIComponent(code)}.webp`);
        push(`img/produtos/${encodeURIComponent(code)}.webp`);
      }
      if (!list.length) push('img/logoantonia5.png');
      return list;
    }

    function extractVolume(text) {
      const m = String(text || '').match(/(\d+[\.,]?\d*)\s?(kg|g|ml|l|lt|un|und|pct|cx)\b/i);
      return m ? m[0].replace(',', '.') : '';
    }

    function productExpiryValue(raw) {
      const candidates = [
        raw.validade, raw.vencimento, raw.data_validade, raw.validade_produto,
        raw.dataValidade, raw.expiry, raw.expiry_date, raw.expiration_date
      ];
      [raw.lotes, raw.lotes_estoque, raw.estoque_lotes, raw.batches].forEach(collection => {
        if (Array.isArray(collection)) collection.forEach(lot => candidates.push(lot?.validade, lot?.vencimento, lot?.data_validade, lot?.expiry_date));
        else if (collection && typeof collection === 'object') Object.values(collection).forEach(lot => candidates.push(lot?.validade, lot?.vencimento, lot?.data_validade, lot?.expiry_date));
      });
      return candidates.find(value => String(value ?? '').trim()) || '';
    }

    function normalizeProduct(raw, key, index) {
      const name = formatName(raw.nome || raw.name || raw.descricao || 'Produto');
      const id = String(raw.codigo || raw.id || key || index || slug(name)).trim();
      const oldPrice = parseMoney(raw.preco || raw.price || raw.valor || 0);
      const product = {
        id,
        firebaseKey: String(key || raw.firebaseKey || raw.id || raw.codigo || ''),
        codigo: String(raw.codigo || raw.sku || id),
        name,
        slug: slug(name),
        price: oldPrice,
        oldPrice,
        stock: parseInt(raw.estoque, 10) || 0,
        situacao: String(raw.situacao || '').trim(),
        categoria: String(raw.categoria || raw.category || 'Outros').trim() || 'Outros',
        subcategoria: String(raw.subcategoria || '').trim(),
        subsubcategoria: String(raw.subsubcategoria || '').trim(),
        marca: String(raw.marca || '').trim(),
        embalagem: String(raw.embalagem || extractVolume(raw.nome || name)).trim(),
        descricao: String(raw.descricao || raw.descricao_curta || raw.description || '').trim(),
        gtin: String(raw.gtin || raw.ean || '').trim(),
        ean: String(raw.ean || raw.gtin || '').trim(),
        gondola: String(raw.gondola || raw['gôndola'] || '').trim(),
        prateleira: String(raw.prateleira || '').trim(),
        localizacao: String(raw.localizacao || '').trim(),
        preco_oferta: parseMoney(raw.preco_oferta || raw.precoOferta || 0),
        validade_oferta: raw.validade_oferta || raw.validadeOferta || '',
        validade: productExpiryValue(raw),
        tag_global: raw.tag_global || raw.tagGlobal || raw.tags || raw.tag || raw.global || '',
        rawProduto: raw
      };
      product.images = productImagesFor(raw, product);
      product.img = product.images[0];
      product.url_imagem = product.img;
      product.searchTokens = buildSearchTokens(product);
      applyProductDiscount(product);
      return product;
    }

    function buildSearchTokens(p) {
      const core = [p.name, p.marca, p.embalagem, p.categoria, p.subcategoria, p.subsubcategoria, p.codigo, p.gtin, p.ean].join(' ');
      const tokens = words(core);
      return { text: norm(core), tokens, code: norm([p.codigo, p.gtin, p.ean].join(' ')) };
    }

    function parseOfferEndDate(value) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        const date = new Date(year, month - 1, day, 23, 59, 59, 999);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
      }
      match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(year, month - 1, day, 23, 59, 59, 999);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
      }
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function applyProductDiscount(p) {
      p.discountPercent = 0;
      p.hasExplicitOffer = false;
      p.oldPrice = Number(p.oldPrice || p.price || 0);
      p.price = Number(p.oldPrice || p.price || 0);

      if (p.preco_oferta && p.validade_oferta) {
        const valid = parseOfferEndDate(p.validade_oferta);
        if (valid && valid >= new Date() && p.preco_oferta < p.oldPrice) {
          p.price = p.preco_oferta;
          p.hasExplicitOffer = true;
          p.discountPercent = Math.round(((p.oldPrice - p.price) / Math.max(p.oldPrice, .01)) * 100);
        }
      }
    }

    function isAvailable(p) {
      if (!p) return false;
      if (String(p.situacao || '').toUpperCase() === 'I') return false;
      if (Number(p.stock || 0) <= 0 && !p.isFee) return false;
      if (Number(p.price || 0) <= 0 && !p.isFee) return false;
      return true;
    }

    function readCache(key) {
      try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { return null; }
    }

    function writeCache(key, data) {
      try {
        if (key === CONFIG.PRODUCT_CACHE_KEY) return; // catálogo completo é grande demais para localStorage.
        localStorage.setItem(key, JSON.stringify(data));
      } catch(e) {
        try { localStorage.removeItem(key); } catch(_) {}
      }
    }

    function clearSavedCatalogAndCart() {
      // Nome mantido por compatibilidade. Não apaga carrinho nem dados do cliente.
      try {
        localStorage.removeItem(CONFIG.PRODUCT_CACHE_KEY);
        localStorage.removeItem(CONFIG.PRODUCT_HOME_CACHE_KEY);
        localStorage.removeItem(CONFIG.BASKET_CACHE_KEY);
        localStorage.removeItem(CONFIG.KIT_CACHE_KEY);
      } catch(e) {}
    }

    function enforceAppVersion() {
      try {
        const current = localStorage.getItem(CONFIG.VERSION_STORAGE_KEY);
        if (current !== CONFIG.APP_VERSION) {
          clearSavedCatalogAndCart();
          localStorage.setItem(CONFIG.VERSION_STORAGE_KEY, CONFIG.APP_VERSION);
        }
      } catch(e) {}
    }

    async function purgeBrowserRuntimeCaches() {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration => registration.unregister()));
        }
      } catch(e) {}
      try {
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        }
      } catch(e) {}
      clearSavedCatalogAndCart();
    }

    async function ensureLatestDeployment(options) {
      const shouldReload = !options || options.reload !== false;
      try {
        const separator = String(CONFIG.VERSION_URL).includes('?') ? '&' : '?';
        const response = await fetch(`${CONFIG.VERSION_URL}${separator}t=${Date.now()}`, {
          cache: 'default',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return false;
        const data = await response.json();
        const latest = String(data && (data.version || data.build || data.appVersion) || '').trim();
        if (!latest || latest === CONFIG.APP_VERSION) return false;
        if (!shouldReload) return true;

        const attemptsKey = 'da_version_reload_attempts_v1';
        const attempts = Number(sessionStorage.getItem(attemptsKey) || 0);
        if (attempts >= 3) {
          console.warn('Nova versão detectada, mas o provedor ainda não entregou o novo index.html.');
          return false;
        }
        sessionStorage.setItem(attemptsKey, String(attempts + 1));
        const url = new URL(window.location.href);
        url.searchParams.set('__da_v', latest);
        url.searchParams.set('__da_r', String(Date.now()));
        window.location.replace(url.pathname + url.search + url.hash);
        return true;
      } catch(e) {
        // A falta temporária do arquivo de versão nunca pode derrubar a loja.
        return false;
      }
    }

    function startDeploymentVersionWatch() {
      if (window.__daVersionWatchStarted) return;
      window.__daVersionWatchStarted = true;
      const check = () => ensureLatestDeployment().catch(() => false);
      window.setInterval(check, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);
    }

    function withCacheBust(url, forceFresh) {
      const separator = String(url).includes('?') ? '&' : '?';
      const version = forceFresh ? Date.now() : CONFIG.APP_VERSION;
      return `${url}${separator}v=${encodeURIComponent(version)}`;
    }

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function isHomeRoute() {
      const hash = location.hash || '#/';
      const clean = hash.replace(/^#\/?/, '').split('?')[0];
      return !clean || clean === '/';
    }

    async function fetchJson(url, timeoutMs, options) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs || 6500);
      try {
        const res = await fetch(url, {
          cache: options && options.cache ? options.cache : 'default',
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally { clearTimeout(timer); }
    }

    function couponIsValid(coupon) {
      if (!coupon || coupon.ativo !== true) return false;
      if (!coupon.validade) return true;
      const end = new Date(`${coupon.validade}T23:59:59`);
      return !isNaN(end.getTime()) && end >= new Date();
    }

    function getCouponByCode(code) {
      const wanted = norm(code).replace(/\s+/g, '');
      return state.coupons.find(c => norm(c.codigo).replace(/\s+/g, '') === wanted) || null;
    }

    function getActiveCoupon() {
      const coupon = getCouponByCode(state.activeCouponCode);
      return couponIsValid(coupon) ? coupon : null;
    }

    async function loadCoupons() {
      let data = null;
      for (const url of CONFIG.COUPON_URLS) {
        try {
          data = await fetchJson(withCacheBust(url), 5000, { cache: 'default' });
          break;
        } catch(e) {}
      }
      state.coupons = (Array.isArray(data) ? data : Object.values(data || {}))
        .filter(c => c && c.codigo)
        .sort((a,b) => Number(a.posicao || 99) - Number(b.posicao || 99));
      const saved = readCache(CONFIG.COUPON_STORAGE_KEY);
      const savedCode = saved && saved.codigo ? String(saved.codigo) : '';
      if (couponIsValid(getCouponByCode(savedCode))) state.activeCouponCode = savedCode.toUpperCase();
    }

    function normalizeProducts(raw, options) {
      const entries = Array.isArray(raw)
        ? raw.map((value, index) => [String(index), value]).filter(([, value]) => value)
        : Object.entries(raw || {});
      const products = entries.map(([key, value], index) => normalizeProduct(value || {}, key, index)).filter(p => String(p.situacao || '').toUpperCase() !== 'I');
      products.sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
      state.productMap = new Map(products.map(p => [String(p.id), p]));
      state.productCodeMap = new Map();
      products.forEach(p => {
        [p.id, p.codigo, p.firebaseKey, p.gtin, p.ean].forEach(value => {
          codeVariants(value).forEach(key => {
            if (key && !state.productCodeMap.has(key)) state.productCodeMap.set(key, p);
          });
        });
      });
      state.products = products;
      state.catalogMode = options && options.mode ? options.mode : state.catalogMode;
      rebuildVirtualFees();
    }

    async function loadHomeProducts() {
      const cache = readCache(CONFIG.PRODUCT_HOME_CACHE_KEY || 'da_produtos_home_cache_v1');
      let lastError = null;
      const urls = Array.isArray(CONFIG.PRODUCT_HOME_URLS) && CONFIG.PRODUCT_HOME_URLS.length ? CONFIG.PRODUCT_HOME_URLS : ['site/produtos-home.json'];
      for (const url of urls) {
        try {
          const data = await fetchJson(withCacheBust(url), 6500, { cache: 'default' });
          normalizeProducts(data, { mode: 'compact-full' });
          state.catalogLoadedAt = Date.now();
          state.catalogSource = 'github-compact';
          state.catalogMode = 'compact-full';
          writeCache(CONFIG.PRODUCT_HOME_CACHE_KEY || 'da_produtos_home_cache_v1', { savedAt: Date.now(), appVersion: CONFIG.APP_VERSION, data });
          return true;
        } catch (e) {
          lastError = e;
        }
      }
      if (cache && cache.data) {
        normalizeProducts(cache.data, { mode: 'compact-full' });
        state.catalogLoadedAt = Number(cache.savedAt || 0);
        state.catalogSource = 'github-compact-cache';
        state.catalogMode = 'compact-full';
        return true;
      }
      if (lastError) console.warn('produtos-home.json indisponivel:', lastError.message || lastError);
      throw lastError || new Error('produtos-home indisponivel');
    }

    async function loadProducts(options) {
      const cache = readCache(CONFIG.PRODUCT_CACHE_KEY);
      const forceFresh = !!(options && options.forceFresh);
      if (!forceFresh && state.catalogMode === 'compact-full' && state.products.length) return true;

      if (!forceFresh) {
        try {
          await loadHomeProducts();
          return true;
        } catch (compactError) {
          console.warn('Catálogo compacto indisponível; tentando Firebase:', compactError && compactError.message ? compactError.message : compactError);
        }
      }

      try {
        const data = await fetchJson(withCacheBust(CONFIG.PRODUCT_URL, forceFresh), 9000, { cache: forceFresh ? 'no-store' : 'no-cache' });
        normalizeProducts(data, { mode: 'full' });
        state.catalogLoadedAt = Date.now();
        state.catalogSource = 'firebase-live';
        state.catalogMode = 'full';
        state.catalogVerifiedAt = state.catalogLoadedAt;
        state.catalogVerifiedAll = true;
        state.catalogVerifiedItemIds = state.products.map(product => String(product.id));
        writeCache(CONFIG.PRODUCT_CACHE_KEY, { savedAt: Date.now(), appVersion: CONFIG.APP_VERSION, data });
      } catch (err) {
        if (cache && cache.data) {
          normalizeProducts(cache.data, { mode: 'full-cache' });
          state.catalogLoadedAt = Number(cache.savedAt || 0);
          state.catalogSource = 'cache-fallback';
          state.catalogMode = 'full-cache';
          console.warn('Firebase indisponivel. Usando cache de produtos:', err.message || err);
          return;
        }
        state.catalogLoadedAt = 0;
        state.catalogSource = '';
        console.error('Erro ao carregar Firebase:', err);
        throw err;
      }
    }

    function applyCestasData(data) {
      const list = Array.isArray(data) ? data : Object.values(data || {});
      state.cestas = list.filter(c => c && c.id && c.nome && Array.isArray(c.produtos)).map(c => ({
        id: String(c.id),
        nome: String(c.nome || 'Cesta Básica'),
        descricao: String(c.descricao || c.description || 'Kit de produtos selecionados.'),
        imagem: normalizeRelativeImage(c.imagem || c.img || c.url_imagem || 'img/logoantonia5.png'),
        preco: parseMoney(c.preco || c.price || 0),
        precoOriginal: parseMoney(c.precoOriginal || c.preco_original || 0),
        produtos: c.produtos || [],
        validade: c.validade || ''
      }));
    }

    async function loadCestas() {
      const cache = readCache(CONFIG.BASKET_CACHE_KEY);
      const urls = [
        'site/produtos-cesta-basica.json',
        'site/cestas.json',
        'cestas.json'
      ];
      let lastError = null;
      for (const url of urls) {
        try {
          const data = await fetchJson(withCacheBust(url), 5000, { cache: 'default' });
          applyCestasData(data);
          writeCache(CONFIG.BASKET_CACHE_KEY, { savedAt: Date.now(), data });
          return;
        } catch(e) {
          lastError = e;
        }
      }

      if (cache && cache.data) {
        applyCestasData(cache.data);
        return;
      }
      state.cestas = [];
      if (lastError) console.warn('Cestas não disponíveis:', lastError.message || lastError);
    }

    function applyKitsData(data) {
      const list = Array.isArray(data) ? data : Object.values(data || {});
      state.kits = list.filter(k => k && (k.id || k.codigo) && k.nome && Array.isArray(k.produtos)).map(k => {
        const preco = parseMoney(k.preco || k.price || k.preco_promocional || 0);
        return {
          id: String(k.id || k.codigo),
          codigo: String(k.codigo || k.id || ''),
          nome: String(k.nome || 'Kit promocional'),
          descricao: String(k.descricao || k.description || k.descricao_oferta || k.detalhes || k.observacoes || k.obs || 'Kit promocional por tempo limitado.'),
          imagem: normalizeRelativeImage(k.imagem || k.img || k.url_imagem || 'img/logoantonia5.png'),
          preco,
          precoOriginal: parseMoney(k.precoOriginal || k.preco_original || k.soma_avulsa || k.valor_original || 0),
          produtos: k.produtos || [],
          limiteKits: Math.max(0, Math.floor(parseMoney(k.limite_kits || k.limiteKits || 0))),
          estoqueDisponivel: Math.max(0, Math.floor(parseMoney(k.estoque_disponivel || k.estoqueDisponivel || 0))),
          descontoPercentual: parseMoney(k.desconto_percentual || k.descontoPercentual || 0),
          dataInicio: String(k.data_inicio || k.dataInicio || ''),
          dataFim: String(k.data_fim || k.dataFim || ''),
          ativo: k.ativo !== false
        };
      });
    }

    async function loadKits() {
      const cache = readCache(CONFIG.KIT_CACHE_KEY);
      const urls = [
        'site/kits.json',
        'kits.json'
      ];
      let lastError = null;
      for (const url of urls) {
        try {
          const data = await fetchJson(withCacheBust(url), 5000, { cache: 'default' });
          applyKitsData(data);
          writeCache(CONFIG.KIT_CACHE_KEY, { savedAt: Date.now(), data });
          return;
        } catch(e) {
          lastError = e;
        }
      }

      if (cache && cache.data) {
        applyKitsData(cache.data);
        return;
      }
      state.kits = [];
      if (lastError) console.warn('Kits nao disponiveis:', lastError.message || lastError);
    }

    function normalizeRelativeImage(value) {
      const img = String(value || '').trim();
      if (!img) return 'https://donaantonia.com.br/img/logoantonia5.png';
      if (/site\/tmp\/ia-referencias\//i.test(img)) return 'https://donaantonia.com.br/img/logoantonia5.png';
      if (/^(https?:|data:)/i.test(img)) return img;
      const clean = img.replace(/^(\.\.\/|\.\/)+/g, '').replace(/^\/+/, '');
      return siteAssetUrl(clean);
    }

    function normalizeBannerImage() { return ''; }
    function applyBannersData() {}
    async function loadBanners() {}
    function bannerIsCurrent() { return false; }
    function getBanners() { return []; }
    function bannerCardHtml() { return ''; }
    function scheduleBannerSetup() {}
    function bannersInAccessOrder() { return []; }
    function bannerSlotHtml() { return ''; }
    function setupBannerCarousels() {}

    function loadFavorites() {
      try {
        const saved = JSON.parse(localStorage.getItem(CONFIG.FAVORITES_STORAGE_KEY) || '[]');
        state.favorites = new Set(Array.isArray(saved) ? saved.map(String) : []);
      } catch(e) {
        state.favorites = new Set();
      }
    }

    function saveFavorites() {
      try { localStorage.setItem(CONFIG.FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(state.favorites))); } catch(e) {}
    }

    function favoriteStorageKey(id, kind) {
      const type = kind === 'kit' ? 'kit' : 'product';
      return type === 'kit' ? `kit:${String(id || '')}` : String(id || '');
    }

    function isFavorite(id, kind) {
      return state.favorites.has(favoriteStorageKey(id, kind));
    }

    function favoriteButtonHtml(id, detail, kind) {
      const favoriteKind = kind === 'kit' ? 'kit' : 'product';
      const active = isFavorite(id, favoriteKind);
      return `<button class="favorite-btn ${active ? 'active' : ''}${detail ? ' detail-favorite-btn' : ''}" type="button" data-action="toggle-favorite" data-id="${escapeHtml(id)}" data-favorite-kind="${favoriteKind}" aria-label="${active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${active ? 'true' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path></svg></button>`;
    }

    function favoriteCollections() {
      const products = [];
      const kits = [];
      state.favorites.forEach(key => {
        const raw = String(key || '');
        if (raw.startsWith('kit:')) {
          const id = raw.slice(4);
          const kit = state.kits.find(item => String(item.id) === id || String(item.codigo) === id);
          if (kit && kitIsVisible(kit)) kits.push(kit);
          return;
        }
        const product = getProductById(raw);
        if (product && isAvailable(product)) products.push(product);
      });
      return { products, kits, total: products.length + kits.length };
    }

    function updateFavoritesUI() {
      const total = favoriteCollections().total;
      const badge = $('favorites-badge');
      const headerBadge = $('header-favorites-count');
      const headerButton = $('header-favorites-btn');
      if (badge) {
        badge.textContent = String(total);
        badge.style.display = total > 0 ? 'inline-flex' : 'none';
      }
      if (headerBadge) {
        headerBadge.textContent = String(total);
        headerBadge.style.display = total > 0 ? 'inline-flex' : 'none';
      }
      if (headerButton) {
        headerButton.classList.toggle('has-favorites', total > 0);
        headerButton.setAttribute('aria-label', total > 0 ? `Ver ${total} favorito(s)` : 'Ver favoritos');
      }
    }

    function syncFavoriteButtons(id, kind) {
      const wantedKind = kind === 'kit' ? 'kit' : 'product';
      document.querySelectorAll('[data-action="toggle-favorite"]').forEach(btn => {
        const btnKind = btn.getAttribute('data-favorite-kind') === 'kit' ? 'kit' : 'product';
        if (id && (String(btn.getAttribute('data-id')) !== String(id) || btnKind !== wantedKind)) return;
        const active = isFavorite(btn.getAttribute('data-id'), btnKind);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.setAttribute('aria-label', active ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      });
      updateFavoritesUI();
    }

    function toggleFavorite(id, kind) {
      const favoriteKind = kind === 'kit' ? 'kit' : 'product';
      const key = favoriteStorageKey(id, favoriteKind);
      if (!key) return;
      if (state.favorites.has(key)) {
        state.favorites.delete(key);
        showToast('Removido dos favoritos.');
      } else {
        state.favorites.add(key);
        showToast(favoriteKind === 'kit' ? 'Kit salvo nos favoritos.' : 'Produto salvo nos favoritos.');
      }
      saveFavorites();
      syncFavoriteButtons(id, favoriteKind);
      renderSiteMenuContent();
      if ((location.hash || '').startsWith('#/favoritos')) renderFavorites();
    }

    function loadCart() {
      state.cart = {};
      state.cartOrder = [];
      state.basketCustomizations = {};
      state.basketDrafts = {};
      try {
        const saved = JSON.parse(localStorage.getItem(CONFIG.CART_STORAGE_KEY) || 'null');
        if (!saved || typeof saved !== 'object') return;
        const savedAt = Number(saved.savedAt || 0);
        const expired = !savedAt || (Date.now() - savedAt) > CONFIG.CART_MAX_AGE_MS;
        if (expired) {
          localStorage.removeItem(CONFIG.CART_STORAGE_KEY);
          return;
        }
        const cart = saved.cart && typeof saved.cart === 'object' ? saved.cart : {};
        const order = Array.isArray(saved.cartOrder) ? saved.cartOrder : Object.keys(cart);
        order.concat(Object.keys(cart)).forEach(id => {
          const key = String(id);
          const qty = Math.max(0, parseInt(cart[key], 10) || 0);
          if (qty > 0 && !state.cartOrder.includes(key)) {
            state.cart[key] = qty;
            state.cartOrder.push(key);
          }
        });
        state.basketCustomizations = saved.basketCustomizations && typeof saved.basketCustomizations === 'object' ? saved.basketCustomizations : {};
        state.basketDrafts = saved.basketDrafts && typeof saved.basketDrafts === 'object' ? saved.basketDrafts : {};
      } catch(e) { localStorage.removeItem(CONFIG.CART_STORAGE_KEY); }
    }

    function saveCart() {
      writeCache(CONFIG.CART_STORAGE_KEY, {
        savedAt: Date.now(),
        appVersion: CONFIG.APP_VERSION,
        cart: state.cart,
        cartOrder: state.cartOrder,
        basketCustomizations: state.basketCustomizations,
        basketDrafts: state.basketDrafts
      });
    }

    function getProductById(id) {
      const key = String(id);
      return state.productMap.get(key) || state.virtualFees[key] || null;
    }

    function getCartItems() {
      return state.cartOrder.map(id => {
        const product = getProductById(id);
        const qty = Number(state.cart[id] || 0);
        return product && qty > 0 ? { id, product, qty } : null;
      }).filter(Boolean);
    }

    function subtotalCart(includeFees) {
      return cartPricing(includeFees).total;
    }

    function feeCountsInTotal(item, kitContext) {
      if (!item || !item.product || !item.product.isFee) return false;
      const id = String(item.id || '');
      if (id.indexOf('fee_kit:') === 0 && kitContext && !kitContext.activeFeeIds.has(id)) return false;
      return true;
    }

    function isKitFeeItem(item) {
      return !!(item && item.product && item.product.isFee && String(item.id || '').indexOf('fee_kit:') === 0);
    }

    function feeTotalByKind(cartItems, kitContext, kind) {
      return roundMoney((cartItems || []).reduce((sum, item) => {
        if (!feeCountsInTotal(item, kitContext)) return sum;
        const isKitFee = isKitFeeItem(item);
        if (kind === 'kit' && !isKitFee) return sum;
        if (kind === 'basket' && isKitFee) return sum;
        return sum + Number(item.product.price || 0) * Number(item.qty || 0);
      }, 0));
    }

    function couponMatchesProduct(coupon, product) {
      if (!coupon || !product || product.isFee) return false;
      const categories = (coupon.categorias || []).map(norm).filter(Boolean);
      const brands = (coupon.marcas || []).map(norm).filter(Boolean);
      const keywords = (coupon.palavras_chave || []).map(norm).filter(Boolean);
      if (!categories.length && !brands.length && !keywords.length) return true;
      const categoryText = norm([product.categoria, product.subcategoria, product.subsubcategoria].join(' '));
      const brandText = norm(product.marca);
      const productText = norm([product.name, product.marca, product.categoria, product.subcategoria, product.subsubcategoria].join(' '));
      return categories.some(v => categoryText.includes(v) || v.includes(categoryText))
        || brands.some(v => brandText === v || productText.includes(v))
        || keywords.some(v => productText.includes(v));
    }

    function couponEligibility(coupon, rawSubtotal) {
      if (!coupon) return { eligible: false, reason: 'Cupom não encontrado.' };
      if (!couponIsValid(coupon)) return { eligible: false, reason: 'Este cupom está inativo ou vencido.' };
      const minimum = Number(coupon.valorMinimo || 0);
      if (rawSubtotal < minimum) return { eligible: false, pending: true, reason: `Faltam ${fmt(minimum - rawSubtotal)} para usar este cupom.` };
      if (coupon.grupo === 'cliente_novo' && state.customerLookupStatus === 'existing') {
        return { eligible: false, reason: 'Este cupom é exclusivo para a primeira compra.' };
      }
      return { eligible: true, reason: '' };
    }

    function couponUnitPrice(product, coupon) {
      const current = Number(product.price || 0);
      if (!couponMatchesProduct(coupon, product)) return current;
      if (coupon.tipo === 'percentual') {
        const base = Number(product.oldPrice || current);
        const candidate = base * (1 - Number(coupon.desconto || 0) / 100);
        return Math.max(0, Math.min(current, Math.round((candidate + Number.EPSILON) * 100) / 100));
      }
      return current;
    }

    const WHOLESALE_MIN_QTY = 3;
    const WHOLESALE_DISCOUNT_RATE = 0.05;
    const EXPIRY_BULK_DISCOUNT_RATE = 0.10;
    const EXPIRY_BULK_MAX_DAYS = 40;

    function roundMoney(value) {
      return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    }

    function productExpiryDays(product) {
      const end = parseOfferEndDate(product && product.validade);
      if (!end) return null;
      end.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.round((end - today) / 86400000);
    }

    function hasExpiryBulkDiscount(product) {
      const days = productExpiryDays(product);
      return days !== null && days >= 0 && days < EXPIRY_BULK_MAX_DAYS;
    }

    function formatProductExpiry(value) {
      const date = parseOfferEndDate(value);
      if (!date) return '';
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    }

    function cartUnitPricing(product, qty, coupon, eligibility) {
      const original = Number(product.price || 0);
      const couponPrice = eligibility && eligibility.eligible ? couponUnitPrice(product, coupon) : original;
      const wholesaleEligible = !product.isFee && Number(qty || 0) >= WHOLESALE_MIN_QTY;
      const expiryBulkEligible = wholesaleEligible && hasExpiryBulkDiscount(product);
      const expiryBulkPrice = expiryBulkEligible ? roundMoney(couponPrice * (1 - EXPIRY_BULK_DISCOUNT_RATE)) : couponPrice;
      const effective = wholesaleEligible ? roundMoney(expiryBulkPrice * (1 - WHOLESALE_DISCOUNT_RATE)) : expiryBulkPrice;
      return {
        original,
        couponPrice,
        expiryBulkPrice,
        effective,
        wholesaleEligible,
        expiryBulkEligible,
        couponDiscount: Math.max(0, original - couponPrice),
        expiryBulkDiscount: Math.max(0, couponPrice - expiryBulkPrice),
        wholesaleDiscount: Math.max(0, expiryBulkPrice - effective)
      };
    }

    function kitPromotionContext() {
      const protectedQtyById = {};
      const activeFeeIds = new Set();
      let kitDiscount = 0;
      Object.entries(state.basketCustomizations || {}).forEach(([key, info]) => {
        const isKit = String(key).indexOf('kit:') === 0 || String(info && info.label || '').toUpperCase().includes('KIT');
        if (!isKit) return;
        const originalItems = normalizeQuantityMap(info.originalItems);
        const hasOriginalItems = Object.values(originalItems).some(qty => Number(qty || 0) > 0);
        if (!hasOriginalItems) return;
        const intact = Object.entries(originalItems).every(([id, qty]) => Number(state.cart[id] || 0) >= Number(qty || 0));
        const feeId = 'fee_' + key;
        const feeQty = Number(state.cart[feeId] || 0);
        const feeProduct = getProductById(feeId);
        const feeUnit = Number(feeProduct && feeProduct.price !== undefined ? feeProduct.price : info.fee || 0);
        if (!intact || (feeUnit !== 0 && feeQty <= 0)) return;
        Object.entries(originalItems).forEach(([id, qty]) => {
          protectedQtyById[id] = Number(protectedQtyById[id] || 0) + Number(qty || 0);
        });
        if (feeQty > 0) {
          activeFeeIds.add(feeId);
          const feeValue = feeUnit * feeQty;
          if (feeValue < 0) kitDiscount += Math.abs(feeValue);
        }
      });
      return { protectedQtyById, activeFeeIds, kitDiscount: roundMoney(kitDiscount) };
    }

    function cartLinePricing(product, qty, coupon, eligibility, protectedQty) {
      const quantity = Math.max(0, Number(qty || 0));
      const lockedQty = Math.min(quantity, Math.max(0, Number(protectedQty || 0)));
      const discountedQty = Math.max(0, quantity - lockedQty);
      const original = Number(product.price || 0);
      const extraUnit = discountedQty > 0 ? cartUnitPricing(product, discountedQty, coupon, eligibility) : cartUnitPricing(product, 0, null, { eligible: false });
      const protectedTotal = lockedQty * original;
      const discountedTotal = discountedQty * extraUnit.effective;
      const total = roundMoney(protectedTotal + discountedTotal);
      return {
        original,
        protectedQty: lockedQty,
        discountedQty,
        effective: quantity > 0 ? roundMoney(total / quantity) : original,
        total,
        participatingItems: extraUnit.couponDiscount > 0 ? discountedQty : 0,
        wholesaleItems: extraUnit.wholesaleEligible ? discountedQty : 0,
        expiryBulkItems: extraUnit.expiryBulkEligible ? discountedQty : 0,
        couponDiscountTotal: roundMoney(extraUnit.couponDiscount * discountedQty),
        expiryBulkDiscountTotal: roundMoney(extraUnit.expiryBulkDiscount * discountedQty),
        wholesaleDiscountTotal: roundMoney(extraUnit.wholesaleDiscount * discountedQty),
        couponDiscountUnitAverage: quantity > 0 ? roundMoney((extraUnit.couponDiscount * discountedQty) / quantity) : 0,
        expiryBulkDiscountUnitAverage: quantity > 0 ? roundMoney((extraUnit.expiryBulkDiscount * discountedQty) / quantity) : 0,
        wholesaleDiscountUnitAverage: quantity > 0 ? roundMoney((extraUnit.wholesaleDiscount * discountedQty) / quantity) : 0
      };
    }

    function cartPricing(includeFees) {
      const kitContext = kitPromotionContext();
      const allItems = getCartItems();
      const productItems = allItems.filter(item => !item.product.isFee);
      const basketHiddenAdjustment = includeFees ? feeTotalByKind(allItems, kitContext, 'basket') : 0;
      const kitAdjustment = includeFees ? feeTotalByKind(allItems, kitContext, 'kit') : 0;
      const productsSubtotalBefore = productItems.reduce((sum, item) => sum + Number(item.product.price || 0) * item.qty, 0);
      const subtotalBefore = roundMoney(productsSubtotalBefore + basketHiddenAdjustment);
      const coupon = getActiveCoupon();
      const eligibility = couponEligibility(coupon, subtotalBefore);
      let participatingItems = 0;
      let wholesaleItems = 0;
      let expiryBulkItems = 0;
      let couponDiscount = 0;
      let expiryBulkDiscount = 0;
      let wholesaleDiscount = 0;
      const productsTotal = productItems.reduce((sum, item) => {
        const line = cartLinePricing(item.product, item.qty, coupon, eligibility, kitContext.protectedQtyById[String(item.id)] || 0);
        participatingItems += line.participatingItems;
        wholesaleItems += line.wholesaleItems;
        expiryBulkItems += line.expiryBulkItems;
        couponDiscount += line.couponDiscountTotal;
        expiryBulkDiscount += line.expiryBulkDiscountTotal;
        wholesaleDiscount += line.wholesaleDiscountTotal;
        return sum + line.total;
      }, 0);
      const roundedTotal = roundMoney(productsTotal + basketHiddenAdjustment + kitAdjustment);
      return {
        coupon,
        eligibility,
        subtotalBefore,
        productsSubtotalBefore: roundMoney(productsSubtotalBefore),
        hiddenAdjustment: basketHiddenAdjustment,
        kitAdjustment,
        total: roundedTotal,
        discount: roundMoney(subtotalBefore - roundedTotal),
        couponDiscount: roundMoney(couponDiscount),
        expiryBulkDiscount: roundMoney(expiryBulkDiscount),
        wholesaleDiscount: roundMoney(wholesaleDiscount),
        kitDiscount: kitContext.kitDiscount,
        participatingItems,
        expiryBulkItems,
        wholesaleItems
      };
    }

    function checkoutTotalsHtml(pricing, total) {
      const rows = [
        `<div class="summary-row normal-value"><span>Valor normal sem descontos</span><span>${fmt(pricing.subtotalBefore)}</span></div>`,
        pricing.couponDiscount > 0 ? `<div class="summary-row discount-row"><span>Desconto ${escapeHtml(pricing.coupon.codigo)}</span><span>- ${fmt(pricing.couponDiscount)}</span></div>` : '',
        pricing.kitDiscount > 0 ? `<div class="summary-row discount-row kit-discount-row"><span>Desconto do kit</span><span>- ${fmt(pricing.kitDiscount)}</span></div>` : '',
        pricing.expiryBulkDiscount > 0 ? `<div class="summary-row discount-row"><span>Desconto por validade - 3+ unidades (10%)</span><span>- ${fmt(pricing.expiryBulkDiscount)}</span></div>` : '',
        pricing.wholesaleDiscount > 0 ? `<div class="summary-row discount-row"><span>Desconto de atacado (5%)</span><span>- ${fmt(pricing.wholesaleDiscount)}</span></div>` : '',
        pricing.discount > 0 ? `<div class="summary-row savings-total"><span>Economia total</span><span>- ${fmt(pricing.discount)}</span></div>` : '',
        `<div class="summary-row total"><span>Total final</span><span>${fmt(total)}</span></div>`
      ];
      return rows.filter(Boolean).join('');
    }

    function activateCoupon(code) {
      const coupon = getCouponByCode(code);
      if (!couponIsValid(coupon)) {
        state.couponMessage = 'Cupom inválido, inativo ou vencido.';
        state.couponMessageType = 'error';
        if ($('checkout-drawer').classList.contains('open')) renderCheckout();
        showToast('Cupom não encontrado.');
        return false;
      }
      if (coupon.grupo === 'cliente_novo' && state.customerLookupStatus === 'existing') {
        state.couponMessage = 'Este cupom é exclusivo para a primeira compra.';
        state.couponMessageType = 'error';
        if ($('checkout-drawer').classList.contains('open')) renderCheckout();
        return false;
      }
      state.activeCouponCode = String(coupon.codigo).toUpperCase();
      state.couponMessage = '';
      state.couponMessageType = '';
      writeCache(CONFIG.COUPON_STORAGE_KEY, { codigo: state.activeCouponCode, savedAt: Date.now() });
      document.querySelectorAll(`[data-action="activate-coupon"][data-code="${state.activeCouponCode}"]`).forEach(button => {
        button.textContent = 'Cupom ativado ✓';
      });
      updateCartUI();
      if (!(location.hash || '').startsWith('#/campanha-cupom/')) handleRoute();
      if ($('checkout-drawer').classList.contains('open')) renderCheckout();
      showToast(`Cupom ${state.activeCouponCode} ativado.`);
      return true;
    }

    function removeCoupon() {
      const previous = getActiveCoupon();
      state.activeCouponCode = '';
      state.couponMessage = '';
      state.couponMessageType = '';
      try { localStorage.removeItem(CONFIG.COUPON_STORAGE_KEY); } catch(e) {}
      if (previous) {
        document.querySelectorAll(`[data-action="activate-coupon"][data-code="${previous.codigo}"]`).forEach(button => {
          button.textContent = previous.textoBotao || 'Ativar cupom';
        });
      }
      updateCartUI();
      if (!(location.hash || '').startsWith('#/campanha-cupom/')) handleRoute();
      if ($('checkout-drawer').classList.contains('open')) renderCheckout();
      showToast('Cupom removido.');
    }

    function cartCount() {
      return getCartItems().reduce((sum, item) => item.product.isFee ? sum : sum + item.qty, 0);
    }

    function productStockLimit(product) {
      if (!product || product.isFee) return 999999;
      return Math.max(0, Math.floor(Number(product.stock || 0)));
    }

    function stockCheckForAddMap(addMap) {
      const normalized = normalizeQuantityMap(addMap || {});
      for (const [id, amount] of Object.entries(normalized)) {
        if (amount <= 0) continue;
        const product = getProductById(id);
        if (!product || !isAvailable(product)) {
          return { ok: false, product, id, reason: 'Produto indisponível.' };
        }
        const max = productStockLimit(product);
        const current = Math.max(0, Number(state.cart[id] || 0));
        if (!product.isFee && current + amount > max) {
          return { ok: false, product, id, max, current, requested: amount, reason: `Estoque insuficiente para ${product.name}. Temos ${max} unidade(s) disponível(is).` };
        }
      }
      return { ok: true };
    }

    function pulseCartTarget() {
      ['bottom-cta', 'nav-cart', 'header-cart-btn'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.classList.remove('cart-pulse');
        void el.offsetWidth;
        el.classList.add('cart-pulse');
        clearTimeout(el.__daPulseTimer);
        el.__daPulseTimer = setTimeout(() => el.classList.remove('cart-pulse'), 2600);
      });
    }

    function setQty(id, qty, options) {
      const key = String(id);
      const product = getProductById(key);
      if (!product || (!product.isFee && !isAvailable(product))) {
        delete state.cart[key];
        state.cartOrder = state.cartOrder.filter(x => String(x) !== key);
        saveCart();
        updateCartUI();
        syncVisibleCards();
        if (!options || !options.silent) showToast('Produto indisponível removido da compra.');
        if ($('checkout-drawer').classList.contains('open')) renderCheckout();
        return;
      }
      const previous = Number(state.cart[key] || 0);
      const requested = Math.max(0, parseInt(qty, 10) || 0);
      const maxStock = productStockLimit(product);
      const next = product.isFee ? requested : Math.min(requested, maxStock);
      const hitStockLimit = !product.isFee && requested > maxStock;
      if (next <= 0) {
        delete state.cart[key];
        state.cartOrder = state.cartOrder.filter(x => String(x) !== key);
      } else {
        if (!state.cartOrder.includes(key)) state.cartOrder.push(key);
        state.cart[key] = next;
      }
      saveCart();
      updateCartUI();
      syncVisibleCards();
      if ($('checkout-drawer').classList.contains('open')) renderCheckout();
      if (!options || !options.silent) {
        if (hitStockLimit) showToast(`Só temos ${maxStock} unidade(s) deste produto em estoque.`);
        else if (next > previous) pulseCartTarget();
        else if (next <= 0 && previous > 0) showToast('Produto removido da compra.');
      }
    }

    function addToCart(id, qty) {
      const key = String(id);
      const current = Number(state.cart[key] || 0);
      setQty(key, current + (Number(qty) || 1));
    }

    function clearCart() {
      state.cart = {};
      state.cartOrder = [];
      state.basketCustomizations = {};
      state.basketDrafts = {};
      state.virtualFees = {};
      localStorage.removeItem(CONFIG.CART_STORAGE_KEY);
      updateCartUI();
      syncVisibleCards();
      if ($('checkout-drawer').classList.contains('open')) renderCheckout();
      showToast('Compra limpa.');
    }

    function removeMissingCartItems(options) {
      let changed = false;
      const removed = [];
      Object.keys(state.cart).forEach(id => {
        const product = getProductById(id);
        const invalid = !product || (!product.isFee && !isAvailable(product));
        if (invalid) {
          removed.push(product && product.name ? product.name : id);
          delete state.cart[id];
          changed = true;
          return;
        }
        if (product && !product.isFee) {
          const max = productStockLimit(product);
          const current = Math.max(0, Number(state.cart[id] || 0));
          if (current > max) {
            if (max > 0) state.cart[id] = max;
            else delete state.cart[id];
            removed.push(`${product.name} (quantidade ajustada ao estoque)`);
            changed = true;
          }
        }
      });
      state.cartOrder = state.cartOrder.filter(id => {
        const product = getProductById(id);
        return state.cart[id] && product && (product.isFee || isAvailable(product));
      });
      if (changed) {
        Object.keys(state.cart).forEach(id => {
          if (String(id).startsWith('fee_')) delete state.cart[id];
        });
        state.cartOrder = state.cartOrder.filter(id => !String(id).startsWith('fee_'));
        state.basketCustomizations = {};
        state.basketDrafts = {};
        rebuildVirtualFees();
        saveCart();
        updateCartUI();
        syncVisibleCards();
        if (!options || !options.silent) showToast('Atualizamos sua compra. Produto indisponível foi removido.');
      }
      return removed;
    }

    let liveCatalogValidationPromise = null;
    let liveCatalogValidationFingerprint = '';

    function validateLiveCatalogBeforeOrder() {
      const selectedProducts = getCartItems()
        .filter(item => item && item.product && !item.product.isFee && !String(item.id).startsWith('fee_'))
        .map(item => item.product);
      const fingerprint = selectedProducts.map(product => String(product.id)).sort().join('|');
      if (liveCatalogValidationPromise && liveCatalogValidationFingerprint === fingerprint) return liveCatalogValidationPromise;

      liveCatalogValidationFingerprint = fingerprint;
      liveCatalogValidationPromise = (async () => {
        try {
          // Conferência independente e curta: não altera carrinho, preços ou mensagem.
          // O resultado é apenas diagnóstico e nunca participa do caminho crítico de venda.
          const checks = await Promise.allSettled(selectedProducts.map(async product => {
            const firebaseKey = String(product.firebaseKey || '').trim();
            if (!firebaseKey) return null;
            const raw = await fetchJson(`${CONFIG.PRODUCT_ITEM_BASE_URL}/${encodeURIComponent(firebaseKey)}.json`, 2200, { cache: 'default' });
            if (!raw) return null;
            const liveCodes = new Set();
            [firebaseKey, raw.id, raw.codigo, raw.sku, raw.firebaseKey, raw.gtin, raw.ean].forEach(value => {
              codeVariants(value).forEach(code => { if (code) liveCodes.add(code); });
            });
            const matched = [product.id, product.codigo, product.firebaseKey, product.gtin, product.ean]
              .some(value => codeVariants(value).some(code => liveCodes.has(code)));
            return matched ? String(product.id) : null;
          }));
          const verifiedIds = checks
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);
          const catalogVerified = verifiedIds.length === selectedProducts.length;
          state.catalogVerifiedAt = catalogVerified ? Date.now() : 0;
          state.catalogVerifiedAll = false;
          state.catalogVerifiedItemIds = verifiedIds;
          return { ok: true, catalogVerified, validatedAt: state.catalogVerifiedAt || null };
        } catch(e) {
          console.warn('Conferência opcional do catálogo indisponível; venda preservada:', e);
          return { ok: true, catalogVerified: false, validatedAt: null };
        }
      })();
      return liveCatalogValidationPromise;
    }

    function rebuildVirtualFees() {
      state.virtualFees = {};
      Object.entries(state.basketCustomizations || {}).forEach(([basketId, info]) => {
        const feeId = 'fee_' + basketId;
        const isKit = String(info.label || '').toUpperCase().includes('KIT') || String(basketId).startsWith('kit:');
        state.virtualFees[feeId] = {
          id: feeId,
          name: isKit ? 'Ajuste de valor do kit' : 'Ajuste de valor da cesta',
          price: Number(info.fee || 0),
          img: 'img/logoantonia5.png',
          isFee: true,
          categoria: isKit ? 'Kits' : 'Cestas',
          stock: 999
        };
      });
    }

    function normalizeBasketSubstitutes(value) {
      if (Array.isArray(value)) {
        return value.map(item => {
          if (item && typeof item === 'object') return item.codigo || item.sku || item.id || item.gtin || item.ean || '';
          return item;
        }).map(v => String(v || '').trim()).filter(Boolean);
      }
      return String(value || '').split(/[;,|]/g).map(v => v.trim()).filter(Boolean);
    }

    function parseBasketItem(line) {
      if (line && typeof line === 'object') {
        const code = line.codigo || line.sku || line.id || line.gtin || line.ean || '';
        const qty = Number(line.qtd || line.qty || line.quantidade || line.quantity || 1);
        return {
          qty: Math.max(1, qty || 1),
          code: String(code || '').trim(),
          substitutes: normalizeBasketSubstitutes(line.substitutos || line.substitutes || line.alternativos || line.alternatives)
        };
      }
      const str = String(line || '').trim();
      const m = str.match(/^(\d+)\s*x\s*(.+)$/i);
      if (m) return { qty: Math.max(1, Number(m[1] || 1)), code: m[2].trim(), substitutes: [] };
      return { qty: 1, code: str, substitutes: [] };
    }

    function findProductByCode(code) {
      const variants = codeVariants(code);
      for (const key of variants) {
        if (state.productCodeMap && state.productCodeMap.has(key)) return state.productCodeMap.get(key);
      }
      return state.products.find(p => [p.id, p.codigo, p.firebaseKey, p.gtin, p.ean].some(v => {
        const productVariants = codeVariants(v);
        return productVariants.some(key => variants.includes(key));
      })) || null;
    }

    function findBasketProduct(line) {
      const parsed = parseBasketItem(line);
      const codes = [parsed.code, ...(parsed.substitutes || [])].filter(Boolean);
      for (const code of codes) {
        const product = findProductByCode(code);
        if (product && isAvailable(product)) return { product, qty: Math.max(1, Number(parsed.qty || 1)) };
      }
      return null;
    }

    function parseKitDate(value, endOfDay) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const date = new Date(`${raw}${raw.includes('T') ? '' : (endOfDay ? 'T23:59:59' : 'T00:00:00')}`);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function kitDateIsActive(kit) {
      const now = new Date();
      const start = parseKitDate(kit.dataInicio, false);
      const end = parseKitDate(kit.dataFim, true);
      return (!start || now >= start) && (!end || now <= end);
    }

    function getKitLines(kitId) {
      const kit = state.kits.find(k => String(k.id) === String(kitId) || String(k.codigo) === String(kitId));
      if (!kit) return { kit: null, rows: [] };
      const rows = (kit.produtos || [])
        .map(line => findBasketProduct(line))
        .filter(Boolean);
      return { kit, rows };
    }

    function kitRetailTotal(kitId) {
      const { rows } = getKitLines(kitId);
      return rows.reduce((sum, row) => sum + Number(row.product.price || 0) * Number(row.qty || 0), 0);
    }

    function kitOriginalPrice(kit) {
      return Math.max(Number(kit.precoOriginal || 0), kitRetailTotal(kit.id));
    }

    function kitStockCapacity(kit) {
      if (!kit || !(kit.produtos || []).length) return 0;
      const { rows } = getKitLines(kit.id);
      if (rows.length !== kit.produtos.length) return 0;
      const productCapacity = Math.min(...rows.map(row => Math.floor(Math.max(0, Number(row.product.stock || 0)) / Math.max(1, Number(row.qty || 1)))));
      const manualLimit = Math.max(0, Math.floor(Number(kit.limiteKits || 0)));
      const publishedStock = Math.max(0, Math.floor(Number(kit.estoqueDisponivel || 0)));
      const limitedByManual = manualLimit > 0 ? Math.min(productCapacity, manualLimit) : productCapacity;
      return publishedStock > 0 ? Math.min(limitedByManual, publishedStock) : limitedByManual;
    }

    function kitDiscountPercent(kit) {
      const original = kitOriginalPrice(kit);
      return original > Number(kit.preco || 0)
        ? Math.round(((original - Number(kit.preco || 0)) / Math.max(original, .01)) * 100)
        : 0;
    }

    function kitIsVisible(kit) {
      if (!kit || kit.ativo === false || !kitDateIsActive(kit)) return false;
      if (!Number(kit.preco || 0) || !(kit.produtos || []).length) return false;
      if (kitStockCapacity(kit) <= 0) return false;
      return kitDiscountPercent(kit) > 0 || Number(kit.descontoPercentual || 0) > 0;
    }

    function getActiveKits() {
      return state.kits.filter(kitIsVisible);
    }

    function setBasketDraftQty(basketId, productId, qty) {
      const key = String(basketId);
      const draft = ensureBasketDraft(key);
      const product = getProductById(productId);
      const requested = Math.max(0, Number(qty) || 0);
      const max = productStockLimit(product);
      draft[String(productId)] = Math.min(requested, max);
      if (requested > max) showToast(`Só temos ${max} unidade(s) deste produto em estoque.`);
      saveCart();
      renderBasketDetail(key);
    }

    function basketDefaultProductTotal(basketId) {
      const { rows } = getBasketLines(basketId);
      return rows.reduce((sum, row) => sum + Number(row.product.price || 0) * Number(row.qty || 0), 0);
    }

    function basketFixedAdjustment(basketId) {
      const basket = state.cestas.find(c => String(c.id) === String(basketId));
      if (!basket || !basket.preco) return 0;
      const defaultTotal = basketDefaultProductTotal(basketId);
      return Math.round((Number(basket.preco || 0) - defaultTotal + Number.EPSILON) * 100) / 100;
    }

    function basketOriginalItemsMap(basketId) {
      const { rows } = getBasketLines(basketId);
      return rows.reduce((map, row) => {
        map[String(row.product.id)] = Number(map[String(row.product.id)] || 0) + Number(row.qty || 0);
        return map;
      }, {});
    }

    function normalizeQuantityMap(value) {
      return Object.entries(value || {}).reduce((map, [id, qty]) => {
        const amount = Math.max(0, Number(qty) || 0);
        map[String(id)] = amount;
        return map;
      }, {});
    }

    function sumQuantityMaps(first, second) {
      const result = normalizeQuantityMap(first);
      Object.entries(normalizeQuantityMap(second)).forEach(([id, qty]) => {
        result[id] = Number(result[id] || 0) + Number(qty || 0);
      });
      return result;
    }

    function quantityMapsDiffer(first, second) {
      const a = normalizeQuantityMap(first);
      const b = normalizeQuantityMap(second);
      return Array.from(new Set([...Object.keys(a), ...Object.keys(b)]))
        .some(id => Number(a[id] || 0) !== Number(b[id] || 0));
    }

    function addBasketFeeToCart(basket, changed, selectedItems) {
      const fee = basketFixedAdjustment(basket.id);
      const feeId = 'fee_' + basket.id;
      const existing = state.basketCustomizations[basket.id] || {};
      const originalItems = basketOriginalItemsMap(basket.id);
      const chosenItems = normalizeQuantityMap(selectedItems || originalItems);
      const mergedOriginal = existing.originalItems
        ? sumQuantityMaps(existing.originalItems, originalItems)
        : originalItems;
      const mergedSelected = existing.selectedItems
        ? sumQuantityMaps(existing.selectedItems, chosenItems)
        : chosenItems;
      state.basketCustomizations[basket.id] = {
        name: basket.nome,
        changed: !!changed || quantityMapsDiffer(mergedOriginal, mergedSelected),
        fee,
        originalItems: mergedOriginal,
        selectedItems: mergedSelected
      };
      if (fee !== 0) {
        state.virtualFees[feeId] = { id: feeId, name: 'Ajuste de valor da cesta', price: fee, img: basket.imagem || 'img/logoantonia5.png', isFee: true, categoria: 'Cestas', stock: 999 };
        if (!state.cartOrder.includes(feeId)) state.cartOrder.push(feeId);
        state.cart[feeId] = Number(state.cart[feeId] || 0) + 1;
      }
    }

    function addBasketCustomToCart(basketId) {
      const basket = state.cestas.find(c => String(c.id) === String(basketId));
      const draft = ensureBasketDraft(basketId);
      if (!basket || !draft) return;
      const stockCheck = stockCheckForAddMap(draft);
      if (!stockCheck.ok) { showToast(stockCheck.reason || 'Estoque insuficiente para adicionar esta cesta.'); return; }
      let added = 0;
      Object.entries(draft).forEach(([productId, qty]) => {
        const p = getProductById(productId);
        const amount = Math.max(0, Number(qty) || 0);
        if (!p || !isAvailable(p) || amount <= 0) return;
        const key = String(p.id);
        if (!state.cartOrder.includes(key)) state.cartOrder.push(key);
        state.cart[key] = Number(state.cart[key] || 0) + amount;
        added += amount;
      });
      if (!added) { showToast('Escolha pelo menos um produto da cesta.'); return; }
      const changed = basketDraftChanged(basketId);
      addBasketFeeToCart(basket, changed, draft);
      saveCart();
      updateCartUI();
      syncVisibleCards();
      pulseCartTarget();
      openBasketConfirmation(basket, changed);
    }

    function addBasketToCart(basketId) {
      const { basket, rows } = getBasketLines(basketId);
      if (!basket) return;
      const addMap = rows.reduce((map, row) => { if (row.product) map[String(row.product.id)] = Number(map[String(row.product.id)] || 0) + Math.max(1, Number(row.qty || 1)); return map; }, {});
      const stockCheck = stockCheckForAddMap(addMap);
      if (!stockCheck.ok) { showToast(stockCheck.reason || 'Estoque insuficiente para adicionar esta cesta.'); return; }
      let added = 0;
      rows.forEach(({ product: p, qty }) => {
        if (!p || !isAvailable(p)) return;
        const amount = Math.max(1, Number(qty || 1));
        const key = String(p.id);
        if (!state.cartOrder.includes(key)) state.cartOrder.push(key);
        state.cart[key] = Number(state.cart[key] || 0) + amount;
        added += amount;
      });
      if (!added) { showToast('Não consegui localizar os itens dessa cesta.'); return; }
      addBasketFeeToCart(basket, false, basketOriginalItemsMap(basket.id));
      saveCart();
      updateCartUI();
      syncVisibleCards();
      pulseCartTarget();
      openBasketConfirmation(basket, false);
    }

    function kitOriginalItemsMap(kitId) {
      const { rows } = getKitLines(kitId);
      return rows.reduce((map, row) => {
        map[String(row.product.id)] = Number(map[String(row.product.id)] || 0) + Number(row.qty || 0);
        return map;
      }, {});
    }

    function addKitFeeToCart(kit, selectedItems) {
      const currentProducts = kitRetailTotal(kit.id);
      const fee = Math.round((Number(kit.preco || 0) - currentProducts + Number.EPSILON) * 100) / 100;
      const customizationKey = 'kit:' + kit.id;
      const feeId = 'fee_' + customizationKey;
      const existing = state.basketCustomizations[customizationKey] || {};
      const originalItems = kitOriginalItemsMap(kit.id);
      const chosenItems = normalizeQuantityMap(selectedItems || originalItems);
      const mergedOriginal = existing.originalItems
        ? sumQuantityMaps(existing.originalItems, originalItems)
        : originalItems;
      const mergedSelected = existing.selectedItems
        ? sumQuantityMaps(existing.selectedItems, chosenItems)
        : chosenItems;
      state.basketCustomizations[customizationKey] = {
        name: kit.nome,
        label: 'KIT PROMOCIONAL',
        changed: false,
        fee,
        originalItems: mergedOriginal,
        selectedItems: mergedSelected
      };
      if (fee !== 0) {
        state.virtualFees[feeId] = { id: feeId, name: 'Ajuste de valor do kit', price: fee, img: kit.imagem || 'img/logoantonia5.png', isFee: true, categoria: 'Kits', stock: 999 };
        if (!state.cartOrder.includes(feeId)) state.cartOrder.push(feeId);
        state.cart[feeId] = Number(state.cart[feeId] || 0) + 1;
      }
    }

    function addKitToCart(kitId) {
      const { kit, rows } = getKitLines(kitId);
      if (!kit || !kitIsVisible(kit)) { showToast('Kit promocional indisponivel no momento.'); return; }
      const addMap = rows.reduce((map, row) => { if (row.product) map[String(row.product.id)] = Number(map[String(row.product.id)] || 0) + Math.max(1, Number(row.qty || 1)); return map; }, {});
      const stockCheck = stockCheckForAddMap(addMap);
      if (!stockCheck.ok) { showToast(stockCheck.reason || 'Estoque insuficiente para adicionar este kit.'); return; }
      let added = 0;
      rows.forEach(({ product: p, qty }) => {
        if (!p || !isAvailable(p)) return;
        const amount = Math.max(1, Number(qty || 1));
        const key = String(p.id);
        if (!state.cartOrder.includes(key)) state.cartOrder.push(key);
        state.cart[key] = Number(state.cart[key] || 0) + amount;
        added += amount;
      });
      if (!added) { showToast('Nao consegui localizar os itens desse kit.'); return; }
      addKitFeeToCart(kit, kitOriginalItemsMap(kit.id));
      saveCart();
      updateCartUI();
      syncVisibleCards();
      pulseCartTarget();
      openBasketConfirmation(kit, false, 'kit');
    }

    function productScore(p, query) {
      const terms = words(query);
      if (!terms.length) return 0;
      const st = p.searchTokens || buildSearchTokens(p);
      let score = 0;
      for (const term of terms) {
        let matched = false;
        const codeExact = [p.codigo, p.gtin, p.ean, p.id].some(v => norm(v) === term);
        if (codeExact) { score += 120; matched = true; }
        if (!matched && st.tokens.some(t => t === term)) { score += 80; matched = true; }
        if (!matched && term.length >= 2 && st.tokens.some(t => t.startsWith(term))) { score += term.length <= 3 ? 55 : 45; matched = true; }
        if (!matched && term.length >= 4 && st.text.includes(term)) { score += 18; matched = true; }
        if (!matched) return 0;
      }
      if (norm(p.name).startsWith(norm(query))) score += 35;
      if (p.discountPercent > 0) score += 5;
      return score;
    }

    function searchProducts(query, options) {
      const available = state.products.filter(p => isAvailable(p));
      const section = options && options.section;
      const pool = section === 'ofertas' ? available.filter(p => Number(p.discountPercent || 0) > 0) : available;
      const q = String(query || '').trim();
      if (!q) return pool;
      return pool
        .map(p => ({ p, score: productScore(p, q) }))
        .filter(x => x.score > 0)
        .sort((a,b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'pt-BR'))
        .map(x => x.p);
    }

    function productsByRoutine(key, limit) {
      const routine = ROUTINES[key];
      if (!routine) return [];
      const scored = state.products.filter(isAvailable).map(p => {
        const text = p.searchTokens.text;
        let score = 0;
        routine.terms.forEach(term => { if (text.includes(norm(term))) score += 1; });
        return { p, score };
      }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.p.price - b.p.price).map(x => x.p);
      return scored.slice(0, limit || 24);
    }

    function productsByCategoryForMonth(limitPerCategory) {
      const grouped = new Map();
      state.products.filter(isAvailable).forEach(p => {
        const cat = p.categoria || 'Outros';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat).push(p);
      });
      return Array.from(grouped.entries())
        .sort((a,b) => a[0].localeCompare(b[0], 'pt-BR'))
        .map(([category, list]) => ({
          category,
          products: list
            .sort((a,b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0) || a.price - b.price || a.name.localeCompare(b.name, 'pt-BR'))
            .slice(0, limitPerCategory || 8)
        }))
        .filter(group => group.products.length);
    }

    function getCategories() {
      const count = new Map();
      state.products.filter(isAvailable).forEach(p => count.set(p.categoria, (count.get(p.categoria) || 0) + 1));
      return Array.from(count.entries()).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
    }

    function getTopOffers(limit) {
      return state.products.filter(p => isAvailable(p) && Number(p.discountPercent || 0) > 0)
        .sort((a,b) => {
          const displayA = productDisplayPricing(a);
          const displayB = productDisplayPricing(b);
          const rateA = displayA.original > 0 ? (displayA.original - displayA.effective) / displayA.original : 0;
          const rateB = displayB.original > 0 ? (displayB.original - displayB.effective) / displayB.original : 0;
          const savingA = displayA.original - displayA.effective;
          const savingB = displayB.original - displayB.effective;
          return rateB - rateA || savingB - savingA || a.name.localeCompare(b.name, 'pt-BR');
        })
        .slice(0, limit || 12);
    }

    function productRouteKey(p) {
      return `${encodeURIComponent(p.codigo || p.id)}-${p.slug || slug(p.name)}`;
    }

    function findProductByRoute(value) {
      const raw = decodeURIComponent(String(value || '')).split('?')[0].split('#')[0];
      const possibleCode = raw.split('-')[0];
      const normalized = norm(raw);
      return state.products.find(p => norm(p.codigo) === norm(possibleCode) || norm(p.id) === norm(possibleCode) || norm(productRouteKey(p)) === normalized || p.slug === normalized) || null;
    }

    function imageFallbackList(images) {
      return (images || []).map(src => String(src || '').trim()).filter(Boolean).join('|');
    }

    function fallbackImg(el) {
      if (!el) return;
      const logo = 'https://donaantonia.com.br/img/logoantonia5.png';
      const current = String(el.currentSrc || el.src || '').trim();
      const declared = String(el.getAttribute('data-fallback-images') || '').split('|').map(v => v.trim()).filter(Boolean);
      const variants = [];
      const add = src => {
        const clean = String(src || '').trim();
        if (clean && !/ia-referencias/i.test(clean) && !variants.includes(clean)) variants.push(clean);
      };
      declared.forEach(add);
      if (current) {
        if (/raw\.githubusercontent\.com/i.test(current) && !/\.(webp|png|jpe?g)(?:\?|$)/i.test(current)) add(current + '.webp');
        // Fallback legado entre pastas antigas. Produtos_3 é destino final novo e não deve cair para pasta antiga automaticamente.
        if (/\/produtos\//i.test(current) && !/\/produtos_2\//i.test(current) && !/\/produtos_3\//i.test(current)) add(current.replace('/produtos/', '/produtos_2/'));
        if (/\/produtos_2\//i.test(current)) add(current.replace('/produtos_2/', '/produtos/'));
        if (/\/site\/img\/(produtos_3|produtos_2|produtos|kits)\//i.test(current) && !/raw\.githubusercontent\.com/i.test(current)) {
          add(current.replace(/^https?:\/\/(?:www\.)?donaantonia\.com\.br\//i, 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/'));
        }
      }
      add(logo);
      const used = String(el.getAttribute('data-fallback-used') || '').split('|').filter(Boolean);
      if (current) used.push(current);
      const next = variants.find(src => !used.includes(src) && src !== current);
      if (next) {
        el.setAttribute('data-fallback-used', Array.from(new Set(used)).join('|'));
        el.src = next;
      } else {
        el.onerror = null;
        el.src = logo;
      }
    }
    window.__daFallbackImg = fallbackImg;

    function qtyControlHtml(id, qty) {
      if (qty > 0) {
        const product = getProductById(id);
        const nudge = product && !product.isFee && qty > 0 && qty < WHOLESALE_MIN_QTY
          ? `<div class="bulk-nudge">Leve 3 e pague ${fmt(roundMoney(Number(product.price || 0) * (1 - WHOLESALE_DISCOUNT_RATE)))} em cada.</div>`
          : '';
        return `<div class="qty-control" data-product-qty="${escapeHtml(id)}"><button type="button" data-action="dec" data-id="${escapeHtml(id)}">−</button><span>${qty}</span><button type="button" data-action="inc" data-id="${escapeHtml(id)}">+</button></div>${nudge}`;
      }
      return `<button class="add-btn" type="button" data-action="add" data-id="${escapeHtml(id)}">Adicionar</button>`;
    }

    function productDisplayPricing(p) {
      const current = Number(p.price || 0);
      const original = Math.max(Number(p.oldPrice || current), current);
      const coupon = getActiveCoupon();
      const couponParticipates = !!(coupon && couponIsValid(coupon) && couponMatchesProduct(coupon, p) && coupon.tipo === 'percentual' && Number(coupon.desconto || 0) > 0);
      const couponPercent = couponParticipates ? Math.max(0, Number(coupon.desconto || 0)) : 0;
      const couponCandidate = couponParticipates ? roundMoney(original * (1 - couponPercent / 100)) : current;
      const effective = couponParticipates ? Math.min(current, couponCandidate) : current;
      const couponApplied = couponParticipates && effective < current - .001;
      const systemDiscountPercent = original > current
        ? Math.round(((original - current) / Math.max(original, .01)) * 100)
        : 0;
      const systemOfferWins = couponParticipates && current < couponCandidate - .001;
      const systemOfferIsExpiry = systemOfferWins && !!p.validade;
      const discountPercent = original > effective
        ? Math.round(((original - effective) / Math.max(original, .01)) * 100)
        : 0;
      return { current, original, effective, coupon, couponApplied, couponParticipates, couponPercent, couponCandidate, systemDiscountPercent, systemOfferWins, systemOfferIsExpiry, discountPercent };
    }

    function productPriceHtml(display, detail) {
      const priceClass = detail ? 'detail-price' : 'price';
      if (display.couponParticipates) {
        const note = display.couponApplied
          ? `Cupom ${escapeHtml(display.coupon.codigo)} ativo · ${display.couponPercent}% de desconto`
          : display.systemOfferWins
            ? `Cupom ${escapeHtml(display.coupon.codigo)} ativo · a ${display.systemOfferIsExpiry ? 'oferta por validade' : 'oferta atual'} de ${display.systemDiscountPercent}% é mais vantajosa`
            : `Cupom ${escapeHtml(display.coupon.codigo)} ativo · o melhor preço já está aplicado`;
        const beforeLabel = display.couponApplied ? 'Preço sem cupom' : 'Preço normal';
        const beforeValue = display.couponApplied ? display.current : display.original;
        return `<div class="${detail ? 'detail-price-area' : ''}">
          <div class="coupon-price-card">
            <div class="coupon-price-before"><span>${beforeLabel}</span><s>${fmt(beforeValue)}</s></div>
            <div class="coupon-price-pay"><span>Você vai pagar</span><strong>${fmt(display.effective)}</strong></div>
          </div>
          <div class="coupon-active-note${display.systemOfferWins ? ' best-offer' : ''}">${note}</div>
        </div>`;
      }
      return `${display.original > display.effective ? `<div class="old-price">${fmt(display.original)}</div>` : ''}<div class="${priceClass}">${fmt(display.effective)}</div>`;
    }

    function productCardPriceHtml(display) {
      const oldPrice = display.original > display.effective + .001
        ? `<div class="old-price">${fmt(display.original)}</div>`
        : '';
      return `${oldPrice}<div class="price">${fmt(display.effective)}</div>`;
    }

    function truncateText(value, max) {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      const limit = Number(max || 46);
      return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
    }

    function productCardControlsHtml(id, qty, unavailable) {
      if (unavailable) return '<button class="add-btn add-plus" type="button" disabled aria-label="Produto esgotado">×</button>';
      if (qty > 0) {
        return `<div class="qty-control qty-control-mini" data-product-qty="${escapeHtml(id)}"><button type="button" data-action="dec" data-id="${escapeHtml(id)}" aria-label="Diminuir quantidade">−</button><span>${qty}</span><button type="button" data-action="inc" data-id="${escapeHtml(id)}" aria-label="Aumentar quantidade">+</button></div>`;
      }
      return `<button class="add-btn add-plus" type="button" data-action="add" data-id="${escapeHtml(id)}" aria-label="Adicionar ao pedido">+</button>`;
    }

    function pickProductForImage(list) {
      const available = (list || []).filter(item => item && item.img)
        .sort((a,b) => String(a.codigo || a.id || a.name).localeCompare(String(b.codigo || b.id || b.name), 'pt-BR'));
      return available[0] || null;
    }

    function pickProductImage(list) {
      const product = pickProductForImage(list);
      return product ? product.img : 'img/logoantonia5.png';
    }

    function categoryThumb(categoryName) {
      const pool = state.products.filter(p => isAvailable(p) && p.categoria === categoryName);
      return pickProductImage(pool);
    }

    function categoryCardHtml(cat, count) {
      const thumb = categoryThumb(cat);
      return `<a class="category-button category-button-single" href="#/categoria/${encodeURIComponent(cat)}">
        <div class="category-thumb-single"><img loading="lazy" decoding="async" src="${escapeHtml(thumb)}" alt="" onerror="window.__daFallbackImg(this)"></div>
        <div class="category-card-copy"><strong>${escapeHtml(cat)}</strong><span>${count} ${count === 1 ? 'produto' : 'produtos'}</span></div>
      </a>`;
    }

    function routineThumb(key) {
      return pickProductImage(productsByRoutine(key, 12));
    }

    function offersThumb() {
      return pickProductImage(getTopOffers(12));
    }

    function cestasThumb() {
      const cesta = state.cestas.find(c => c.imagem);
      return cesta ? cesta.imagem : 'img/logoantonia5.png';
    }

    function kitsThumb() {
      const kit = getActiveKits().find(item => item.imagem);
      return kit ? kit.imagem : 'img/logoantonia5.png';
    }

    function productCard(p, mode) {
      const id = String(p.id);
      const qty = Number(state.cart[id] || 0);
      const unavailable = !isAvailable(p);
      const display = productDisplayPricing(p);
      const classes = ['product-card'];
      if (mode === 'compact') classes.push('compact');
      if (mode === 'list') classes.push('list');
      const route = productRouteKey(p);
      const cardName = truncateText(p.name, mode === 'compact' ? 38 : 46);
      return `
        <article class="${classes.join(' ')}" data-card-id="${escapeHtml(id)}">
          <div class="product-media-wrap">
            <a class="product-imgbox" href="#/produto/${route}" aria-label="Ver ${escapeHtml(p.name)}">
              <img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(p.img)}" data-fallback-images="${escapeHtml(imageFallbackList(p.images))}" alt="${escapeHtml(p.name)}" onerror="window.__daFallbackImg(this)">
            </a>
            ${favoriteButtonHtml(id, false, 'product')}
            ${display.discountPercent > 0 ? `<span class="media-discount-badge">-${display.discountPercent}%</span>` : ''}
          </div>
          <div class="product-body">
            <a class="product-name" href="#/produto/${route}" title="${escapeHtml(p.name)}">${escapeHtml(cardName)}</a>
            ${p.validade && formatProductExpiry(p.validade) ? `<div class="product-expiry product-expiry-card" aria-label="Validade do produto">Val. ${escapeHtml(formatProductExpiry(p.validade))}</div>` : ''}
            <div class="product-card-bottom">
              <div class="price-wrap">${productCardPriceHtml(display)}</div>
              <div class="add-area compact-add" data-card-controls="${escapeHtml(id)}" data-control-mode="card">${productCardControlsHtml(id, qty, unavailable)}</div>
            </div>
          </div>
        </article>`;
    }

    function basketCard(cesta, mode) {
      const classes = ['basket-card'];
      if (mode === 'compact') classes.push('compact');
      if (mode === 'wide') classes.push('wide');
      const priceBlock = `<div>${cesta.precoOriginal > cesta.preco ? `<div class="old-price">${fmt(cesta.precoOriginal)}</div>` : ''}<div class="price">${cesta.preco ? fmt(cesta.preco) : 'Ver itens'}</div></div>`;
      if (mode === 'compact') {
        return `
          <article class="${classes.join(' ')} basket-card-simple">
            <a class="basket-imgbox" href="#/cesta/${encodeURIComponent(cesta.id)}" aria-label="Abrir ${escapeHtml(cesta.nome)}">
              <img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(cesta.imagem)}" alt="${escapeHtml(cesta.nome)}" onerror="window.__daFallbackImg(this)">
            </a>
            <div class="basket-body">
              <div class="basket-name">${escapeHtml(cesta.nome)}</div>
              <div class="price-row">${priceBlock}</div>
              <div class="basket-actions basket-actions-simple">
                <a class="secondary-btn" href="#/cesta/${encodeURIComponent(cesta.id)}">Ver produtos</a>
              </div>
            </div>
          </article>`;
      }
      return `
        <article class="${classes.join(' ')}">
          <a class="basket-imgbox" href="#/cesta/${encodeURIComponent(cesta.id)}" aria-label="Abrir ${escapeHtml(cesta.nome)}">
            <img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(cesta.imagem)}" alt="${escapeHtml(cesta.nome)}" onerror="window.__daFallbackImg(this)">
          </a>
          <div class="basket-body">
            <div class="basket-name">${escapeHtml(cesta.nome)}</div>
            <div class="basket-desc">${escapeHtml(cesta.descricao || 'Kit pronto para facilitar sua compra.')}</div>
            <div class="price-row">${priceBlock}</div>
            <div class="basket-actions basket-actions-simple">
              <a class="secondary-btn" href="#/cesta/${encodeURIComponent(cesta.id)}">Ver produtos</a>
            </div>
          </div>
        </article>`;
    }

    function kitCard(kit, mode) {
      const classes = ['basket-card'];
      const original = kitOriginalPrice(kit);
      const discount = kitDiscountPercent(kit);
      if (mode === 'compact') classes.push('compact');
      if (mode === 'wide') classes.push('wide');
      const priceBlock = `<div>${original > kit.preco ? `<div class="old-price">${fmt(original)}</div>` : ''}<div class="price">${kit.preco ? fmt(kit.preco) : 'Ver itens'}</div></div>`;
      if (mode === 'compact') {
        return `
          <article class="${classes.join(' ')} basket-card-simple kit-card">
            <div class="product-media-wrap kit-media-wrap">
              <a class="basket-imgbox" href="#/kit/${encodeURIComponent(kit.id)}" aria-label="Abrir ${escapeHtml(kit.nome)}">
                <img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}" onerror="window.__daFallbackImg(this)">
              </a>
              ${favoriteButtonHtml(kit.id, false, 'kit')}
              ${discount > 0 ? `<span class="media-discount-badge">-${discount}%</span>` : ''}
            </div>
            <div class="basket-body">
              <div class="basket-name">${escapeHtml(kit.nome)}</div>
              <div class="price-row">${priceBlock}</div>
              <div class="basket-actions basket-actions-simple">
                <a class="secondary-btn" href="#/kit/${encodeURIComponent(kit.id)}">Ver produtos</a>
              </div>
            </div>
          </article>`;
      }
      return `
        <article class="${classes.join(' ')} kit-card">
          <div class="product-media-wrap kit-media-wrap">
            <a class="basket-imgbox" href="#/kit/${encodeURIComponent(kit.id)}" aria-label="Abrir ${escapeHtml(kit.nome)}">
              <img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}" onerror="window.__daFallbackImg(this)">
            </a>
            ${favoriteButtonHtml(kit.id, false, 'kit')}
            ${discount > 0 ? `<span class="media-discount-badge">-${discount}%</span>` : ''}
          </div>
          <div class="basket-body">
            <div class="product-meta">${discount > 0 ? `<span class="discount">-${discount}%</span>` : '&nbsp;'}</div>
            <div class="basket-name">${escapeHtml(kit.nome)}</div>
            <div class="basket-desc">${escapeHtml(kit.descricao || 'Kit promocional por tempo limitado.')}</div>
            <div class="kit-card-countdown">Termina em <span data-offer-countdown>--:--:--</span></div>
            <div class="price-row">${priceBlock}</div>
            <div class="basket-actions">
              <a class="secondary-btn" href="#/kit/${encodeURIComponent(kit.id)}">Ver produtos</a>
              <button class="add-btn" type="button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar</button>
            </div>
          </div>
        </article>`;
    }

    

    function productDetailChipsHtml(p) {
      const chips = [];
      if (p.categoria) chips.push(`<a class="detail-chip" href="#/categoria/${encodeURIComponent(p.categoria)}">${escapeHtml(p.categoria)}</a>`);
      if (p.subcategoria && p.categoria) chips.push(`<a class="detail-chip" href="#/categoria/${encodeURIComponent(p.categoria)}?sub=${encodeURIComponent(p.subcategoria)}">${escapeHtml(p.subcategoria)}</a>`);
      if (p.marca) chips.push(`<a class="detail-chip" href="#/busca/${encodeURIComponent(p.marca)}">${escapeHtml(p.marca)}</a>`);
      if (!chips.length) return '';
      return `<div class="detail-chip-row" aria-label="Filtros do produto">${chips.join('')}</div>`;
    }

    let relatedInfiniteItems = [];
    let relatedInfiniteCursor = 0;
    let relatedInfiniteObserver = null;
    const RELATED_BATCH_SIZE = 8;

    function resetRelatedInfinite(items) {
      if (relatedInfiniteObserver) {
        relatedInfiniteObserver.disconnect();
        relatedInfiniteObserver = null;
      }
      relatedInfiniteItems = Array.isArray(items) ? items : [];
      relatedInfiniteCursor = Math.min(RELATED_BATCH_SIZE, relatedInfiniteItems.length);
    }

    function relatedGridHtml(title, caption, items) {
      if (!items || !items.length) {
        resetRelatedInfinite([]);
        return '';
      }
      resetRelatedInfinite(items);
      const visible = relatedInfiniteItems.slice(0, relatedInfiniteCursor);
      const sentinel = relatedInfiniteCursor < relatedInfiniteItems.length
        ? `<div class="related-infinite-sentinel" data-related-infinite-sentinel aria-live="polite"><span>Carregando mais produtos…</span></div>`
        : '';
      return `<section class="section related-section">
        <div class="section-head"><div><h2 class="section-title">${escapeHtml(title)}</h2>${caption ? `<div class="section-caption">${escapeHtml(caption)}</div>` : ''}</div></div>
        <div class="product-grid related-grid" data-related-infinite-grid>${visible.map(p => productCard(p)).join('')}</div>
        ${sentinel}
      </section>`;
    }

    function setupRelatedInfiniteScroll() {
      const grid = app.querySelector('[data-related-infinite-grid]');
      const sentinel = app.querySelector('[data-related-infinite-sentinel]');
      if (!grid || !sentinel || relatedInfiniteCursor >= relatedInfiniteItems.length) return;

      const loadNextBatch = () => {
        if (!sentinel.isConnected) return;
        const next = relatedInfiniteItems.slice(relatedInfiniteCursor, relatedInfiniteCursor + RELATED_BATCH_SIZE);
        if (!next.length) {
          relatedInfiniteObserver?.disconnect();
          sentinel.remove();
          return;
        }
        grid.insertAdjacentHTML('beforeend', next.map(product => productCard(product)).join(''));
        relatedInfiniteCursor += next.length;
        if (relatedInfiniteCursor >= relatedInfiniteItems.length) {
          relatedInfiniteObserver?.disconnect();
          relatedInfiniteObserver = null;
          sentinel.remove();
        }
      };

      if ('IntersectionObserver' in window) {
        relatedInfiniteObserver = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) loadNextBatch();
        }, { root: null, rootMargin: '600px 0px', threshold: 0.01 });
        relatedInfiniteObserver.observe(sentinel);
      } else {
        loadNextBatch();
      }
    }

    function pageHeader(title, subtitle, backHref, options) {
      const semanticHeading = !options || options.semanticHeading !== false;
      const heading = semanticHeading
        ? `<h1 class="page-title">${escapeHtml(title)}</h1>`
        : `<div class="page-title">${escapeHtml(title)}</div>`;
      return `<div class="page-head">${backHref ? `<a class="back-btn" href="${backHref}" aria-label="Voltar"><svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7 7l-7-7 7-7"></path></svg></a>` : ''}<div>${heading}${subtitle ? `<div class="page-subtitle">${escapeHtml(subtitle)}</div>` : ''}</div></div>`;
    }

    function beautyBannerHtml() { return ''; }

    function couponBoxHtml() {
      const coupon = getActiveCoupon();
      const pricing = cartPricing(true);
      if (coupon) {
        const detail = pricing.eligibility.eligible
          ? (pricing.couponDiscount > 0 ? `Você economiza ${fmt(pricing.couponDiscount)} em ${pricing.participatingItems} ${pricing.participatingItems === 1 ? 'item' : 'itens'}.` : 'Ativo. A oferta vigente continua quando for mais vantajosa.')
          : pricing.eligibility.reason;
        return `<div class="coupon-box">
          <span class="coupon-label">Cupom aplicado</span>
          <div class="coupon-active"><div><strong>${escapeHtml(coupon.codigo)}</strong><span>${escapeHtml(detail)}</span></div><button class="coupon-remove" type="button" data-action="remove-coupon">Remover</button></div>
        </div>`;
      }
      return `<div class="coupon-box">
        <label class="coupon-label" for="coupon-code">Tem um cupom?</label>
        <div class="coupon-row"><input id="coupon-code" class="field" type="text" placeholder="Digite o código" autocomplete="off" maxlength="30"><button class="coupon-apply" type="button" data-action="apply-coupon">Aplicar</button></div>
        <div class="coupon-message ${escapeHtml(state.couponMessageType)}" role="status">${escapeHtml(state.couponMessage || 'O desconto será calculado nos produtos participantes.')}</div>
      </div>`;
    }

    function homeQuickLinksHtml() {
      const cards = [
        { href: '#/ofertas', title: 'Ofertas de hoje', copy: 'Aproveite os melhores preços', img: offersThumb(), cls: 'offer' },
        { href: '#/cestas', title: 'Cestas básicas', copy: 'Opções prontas e editáveis', img: cestasThumb() },
        { href: '#/kits', title: 'Kits promocionais', copy: 'Combos com desconto ativo', img: kitsThumb() },
        { href: '#/rotina/compra-mes', title: 'Compra do mês', copy: 'Comece pelos itens essenciais', img: routineThumb('compra-mes'), cls: 'primary' }
      ];
      return `<section class="home-quick-grid" aria-label="Atalhos principais de compra">${cards.map((card, index) => `<a class="home-quick-card ${card.cls || ''}" href="${card.href}"><div><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.copy)}</span></div><img loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" width="96" height="96"${index === 0 ? ' fetchpriority="high"' : ''} src="${escapeHtml(card.img)}" alt="" onerror="window.__daFallbackImg(this)"></a>`).join('')}</section>`;
    }

    function brandStripHtml() {
      const counts = new Map();
      state.products.filter(p => isAvailable(p) && p.marca).forEach(p => counts.set(p.marca, (counts.get(p.marca) || 0) + 1));
      const brands = Array.from(counts.entries()).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 14);
      if (!brands.length) return '';
      return `<section class="section brand-section"><div class="section-head"><div><h2 class="section-title">Marcas procuradas</h2><div class="section-caption">Atalhos rápidos para encontrar marcas que já estão no catálogo.</div></div></div><div class="brand-strip">${brands.map(([brand, count]) => `<a class="brand-pill" href="#/marca/${encodeURIComponent(brand)}">${escapeHtml(brand)} · ${count}</a>`).join('')}</div></section>`;
    }

    function categoryButtonsHtml() {
      const cats = getCategories();
      if (!cats.length) return '';
      return `<section class="section category-section">
        <div class="section-head"><div><h2 class="section-title">Categorias</h2><div class="section-caption">Escolha um setor e veja todos os produtos disponíveis.</div></div><a class="see-all" href="#/categorias">Ver página</a></div>
        <div class="category-buttons">
          ${cats.map(([cat, count]) => categoryCardHtml(cat, count)).join('')}
        </div>
      </section>`;
    }

    let renderHome;

    

    function renderCategories() {
      const cats = getCategories();
      app.innerHTML = `<div class="container">${pageHeader('Categorias', 'Escolha um setor para navegar.', '#/')}${bannerSlotHtml('categorias.topo', { kind: 'section' })}
        <div class="category-buttons">${cats.map(([cat, count]) => categoryCardHtml(cat, count)).join('')}</div></div>`;
      setActiveNav('categorias');
    }

    function renderCategory(cat) {
      const decoded = decodeURIComponent(cat || '');
      const products = state.products.filter(p => isAvailable(p) && norm(p.categoria) === norm(decoded));
      const canonicalCategory = products[0]?.categoria || decoded;
      const subs = Array.from(new Set(products.map(p => p.subcategoria).filter(Boolean))).sort((a,b) => a.localeCompare(b,'pt-BR'));
      const currentSub = new URLSearchParams(location.hash.split('?')[1] || '').get('sub') || 'Todos';
      const filtered = currentSub === 'Todos' ? products : products.filter(p => norm(p.subcategoria) === norm(currentSub));
      const chips = `<div class="chips"><a class="chip ${currentSub === 'Todos' ? 'active' : ''}" href="#/categoria/${encodeURIComponent(canonicalCategory)}">Todos</a>${subs.map(sub => `<a class="chip ${currentSub === sub ? 'active' : ''}" href="#/categoria/${encodeURIComponent(canonicalCategory)}?sub=${encodeURIComponent(sub)}">${escapeHtml(sub)}</a>`).join('')}</div>`;
      const isBeauty = /(beleza|higiene|perfumaria)/.test(norm(canonicalCategory));
      const categoryBanners = bannerSlotHtml('categoria', { target: canonicalCategory, label: `Destaques de ${canonicalCategory}` });
      const subcategoryBanners = currentSub !== 'Todos' ? bannerSlotHtml('subcategoria', { targets: [currentSub, `${canonicalCategory}::${currentSub}`], label: `Destaques de ${currentSub}` }) : '';
      app.innerHTML = `<div class="container">${pageHeader(canonicalCategory, `${filtered.length} produtos encontrados`, '#/categorias')}${categoryBanners}${subcategoryBanners}${isBeauty ? beautyBannerHtml(products) : ''}${chips}<div class="product-grid">${filtered.map(p => productCard(p)).join('')}</div></div>`;
      setActiveNav('categorias');
      updateMeta(`${canonicalCategory} - Dona Antônia`, `Compre ${canonicalCategory.toLowerCase()} com entrega em Cuiabá e Várzea Grande.`, `/?categoria=${encodeURIComponent(canonicalCategory)}`);
    }

    function renderSubcategory(subcategory) {
      const decoded = decodeURIComponent(subcategory || '');
      const products = state.products.filter(p => isAvailable(p) && norm(p.subcategoria) === norm(decoded));
      const canonical = products[0]?.subcategoria || decoded;
      const subcategoryBannerTargets = [canonical, ...new Set(products.map(p => p.categoria).filter(Boolean))].map((v,i) => i===0 ? v : `${v}::${canonical}`);
      app.innerHTML = `<div class="container">${pageHeader(canonical, `${products.length} produtos encontrados`, '#/categorias')}${bannerSlotHtml('subcategoria', { targets: subcategoryBannerTargets, label: `Destaques de ${canonical}` })}${products.length ? `<div class="product-grid">${products.map(p => productCard(p)).join('')}</div>` : `<div class="empty"><strong>Nenhum produto disponível</strong>Esta subcategoria não possui itens disponíveis agora.</div>`}</div>`;
      setActiveNav('categorias');
      updateMeta(`${canonical} - Dona Antônia`, `Compre produtos de ${canonical.toLowerCase()} com entrega em Cuiabá e Várzea Grande.`, `/?subcategoria=${encodeURIComponent(canonical)}`);
    }

    function renderBrand(brand) {
      const decoded = decodeURIComponent(brand || '');
      const products = state.products.filter(p => isAvailable(p) && norm(p.marca) === norm(decoded));
      const canonical = products[0]?.marca || decoded;
      app.innerHTML = `<div class="container">${pageHeader(canonical, `${products.length} produtos encontrados`, '#/')}${bannerSlotHtml('marca', { target: canonical, label: `Destaques da marca ${canonical}` })}${products.length ? `<div class="product-grid">${products.map(p => productCard(p)).join('')}</div>` : `<div class="empty"><strong>Nenhum produto disponível</strong>Esta marca não possui itens disponíveis agora.</div>`}</div>`;
      setActiveNav('home');
      updateMeta(`${canonical} - Dona Antônia`, `Compre produtos ${canonical} com entrega em Cuiabá e Várzea Grande.`, `/?marca=${encodeURIComponent(canonical)}`);
    }

    function renderOffers() {
      const products = getTopOffers(200);
      app.innerHTML = `<div class="container">${pageHeader('Ofertas', 'Produtos com desconto disponíveis agora.', '#/')}${bannerSlotHtml('ofertas.topo', { kind: 'section' })}${products.length ? `<div class="product-grid">${products.map(p => productCard(p)).join('')}</div>` : `<div class="empty"><strong>Sem ofertas no momento</strong>Volte mais tarde ou navegue pelas categorias.</div>`}</div>`;
      setActiveNav('ofertas');
      updateMeta('Ofertas - Dona Antônia', 'Ofertas de supermercado com entrega em Cuiabá e Várzea Grande.', '/?secao=ofertas');
    }

    function renderRoutine(key) {
      const routine = ROUTINES[key] || ROUTINES['compra-mes'];
      if (key === 'compra-mes') {
        const groups = productsByCategoryForMonth(8);
        app.innerHTML = `<div class="container">${pageHeader('Compra do mês', '', '#/')}${bannerSlotHtml('rotina.compra-mes.topo', { kind: 'section' })}${groups.length ? groups.map(group => `<section class="month-group"><h2 class="month-group-title">${escapeHtml(group.category)}</h2><div class="product-grid">${group.products.map(p => productCard(p)).join('')}</div></section>`).join('') : `<div class="empty"><strong>Nenhum produto encontrado</strong>Use a busca para encontrar o que precisa.</div>`}</div>`;
      } else {
        let products = productsByRoutine(key, 200);
        if (key === 'higiene') {
          const beautyCoupon = getCouponByCode('BELEZA20');
          products = products.filter(p => couponMatchesProduct(beautyCoupon, p));
        }
        app.innerHTML = `<div class="container">${pageHeader(routine.title, '', '#/')}${bannerSlotHtml(`rotina.${key}.topo`, { kind: 'section' })}${key === 'higiene' ? beautyBannerHtml(products) : ''}${products.length ? `<div class="product-grid">${products.map(p => productCard(p)).join('')}</div>` : `<div class="empty"><strong>Nenhum produto encontrado</strong>Use a busca para encontrar o que precisa.</div>`}</div>`;
      }
      setActiveNav('home');
    }

    function renderCestas() {
      app.innerHTML = `<div class="container">${pageHeader('Cestas básicas', 'Escolha um kit pronto e envie pelo WhatsApp.', '#/')}${bannerSlotHtml('cestas.topo', { kind: 'section' })}${state.cestas.length ? `<div class="basket-list">${state.cestas.map(c => basketCard(c, 'wide')).join('')}</div>` : `<div class="empty"><strong>Nenhuma cesta carregada</strong>Confira se o arquivo de cestas publicado está disponível em <code>site/produtos-cesta-basica.json</code>.</div>`}</div>`;
      setActiveNav('home');
    }

    function renderKits() {
      const kits = getActiveKits();
      app.innerHTML = `<div class="container">${pageHeader('Kits promocionais', 'Escolha um combo com desconto e envie pelo WhatsApp.', '#/')}${bannerSlotHtml('kits.topo', { kind: 'section' })}${kits.length ? `<div class="basket-list">${kits.map(k => kitCard(k, 'wide')).join('')}</div>` : `<div class="empty"><strong>Nenhum kit promocional ativo</strong>Confira se o arquivo <code>site/kits.json</code> foi publicado e se os kits possuem estoque, desconto e periodo valido.</div>`}</div>`;
      setActiveNav('home');
      updateOfferCountdowns();
      updateMeta('Kits promocionais - Dona Antonia', 'Kits promocionais de supermercado com entrega em Cuiaba e Varzea Grande.', '/#/kits');
    }

    let offerCountdownTimer = null;

    function timeUntilMidnightLabel() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const totalSeconds = Math.max(0, Math.floor((midnight - now) / 1000));
      const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }

    function updateOfferCountdowns() {
      const nodes = document.querySelectorAll('[data-offer-countdown]');
      if (!nodes.length) return;
      const tick = () => {
        const label = timeUntilMidnightLabel();
        document.querySelectorAll('[data-offer-countdown]').forEach(el => { el.textContent = label; });
      };
      tick();
      clearInterval(offerCountdownTimer);
      offerCountdownTimer = setInterval(tick, 1000);
    }

    function renderKitDetail(kitId) {
      const { kit, rows } = getKitLines(kitId);
      if (!kit || !kitIsVisible(kit)) {
        app.innerHTML = `<div class="container">${pageHeader('Kit nao encontrado', '', '#/kits')}<div class="empty"><strong>Kit indisponivel</strong>Volte e escolha outra promocao ativa.</div></div>`;
        return;
      }
      const original = kitOriginalPrice(kit);
      const discount = kitDiscountPercent(kit);
      const saving = Math.max(0, original - Number(kit.preco || 0));
      const kitRatio = original > 0 ? Math.min(1, Number(kit.preco || 0) / original) : 1;
      app.innerHTML = `<div class="container kit-detail-container">${pageHeader(kit.nome, '', '#/kits')}${bannerSlotHtml('kit', { targets:[kit.id,kit.codigo,kit.nome].filter(Boolean), label:`Destaque de ${kit.nome}` })}
        <article class="kit-deal-card">
          <div class="kit-deal-top kit-deal-top-stacked">
            <div class="kit-deal-media product-media-wrap">
              <img class="kit-deal-img" src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}" onerror="window.__daFallbackImg(this)">
              ${favoriteButtonHtml(kit.id, false, 'kit')}
              ${discount > 0 ? `<span class="media-discount-badge">-${discount}%</span>` : ''}
            </div>
            <div class="kit-deal-copy">
              <div class="kit-badge-row">
                ${discount > 0 ? `<span class="kit-discount-badge">-${discount}% OFF</span>` : ''}
                <span class="kit-countdown">Termina em <span data-offer-countdown>--:--:--</span></span>
              </div>
              <h2 class="kit-deal-title">${escapeHtml(kit.nome)}</h2>
              <div class="kit-price-box">
                ${original > kit.preco ? `<div class="old-price">De ${fmt(original)}</div>` : ''}
                <div class="kit-price-main">${fmt(kit.preco)}</div>
                ${saving > 0 ? `<div class="kit-saving">Economia de ${fmt(saving)} neste combo.</div>` : ''}
              </div>
              <button class="add-btn" type="button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar kit promocional</button>
            </div>
          </div>
          <details class="kit-description-toggle">
            <summary>Ver detalhes da oferta</summary>
            <p>${escapeHtml(kit.descricao || 'Kit promocional por tempo limitado.')}</p>
          </details>
        </article>
        <section class="section kit-products-section"><div class="section-head"><div><h2 class="section-title">Produtos do kit</h2></div></div>
          ${rows.length ? `<div class="basket-editor">${rows.map(({product, qty}) => `
            <a class="basket-editor-row kit-product-row kit-product-link" href="#/produto/${productRouteKey(product)}" aria-label="Abrir ${escapeHtml(product.name)}">
              <img src="${escapeHtml(product.img)}" data-fallback-images="${escapeHtml(imageFallbackList(product.images))}" alt="${escapeHtml(product.name)}" onerror="window.__daFallbackImg(this)">
              <div><div class="basket-editor-name">${escapeHtml(product.name)}</div><div class="basket-editor-price">${qty} ${Number(qty) === 1 ? 'unidade' : 'unidades'} no kit</div></div>
              <div class="kit-product-price"><s>${fmt(Number(product.price || 0))}</s><strong>${fmt(roundMoney(Number(product.price || 0) * kitRatio))}</strong><span>cada no combo</span></div>
            </a>`).join('')}</div>` : `<div class="empty"><strong>Itens nao localizados</strong>Nao conseguimos relacionar os produtos desse kit ao cadastro atual.</div>`}
        </section>
      </div>`;
      setActiveNav('home');
      updateOfferCountdowns();
      updateMeta(`${kit.nome} - Dona Antonia`, `Compre ${kit.nome} com entrega em Cuiaba e Varzea Grande.`, `/#/kit/${encodeURIComponent(kit.id)}`);
    }

    function getBasketLines(basketId) {
      const basket = state.cestas.find(c => String(c.id) === String(basketId));
      if (!basket) return { basket: null, rows: [] };
      const rows = (basket.produtos || [])
        .map(line => findBasketProduct(line))
        .filter(Boolean);
      return { basket, rows };
    }

    function ensureBasketDraft(basketId) {
      const { rows } = getBasketLines(basketId);
      const key = String(basketId);
      const existing = state.basketDrafts[key] && typeof state.basketDrafts[key] === 'object' ? state.basketDrafts[key] : {};
      const merged = {};
      rows.forEach(row => {
        const savedQty = existing[row.product.id];
        merged[row.product.id] = Math.max(0, Number(savedQty !== undefined ? savedQty : row.qty) || 0);
      });
      state.basketDrafts[key] = merged;
      return state.basketDrafts[key];
    }

    function basketDraftProductTotal(basketId) {
      const draft = ensureBasketDraft(basketId);
      return Object.entries(draft).reduce((sum, [id, qty]) => {
        const p = getProductById(id);
        return p ? sum + Number(p.price || 0) * Number(qty || 0) : sum;
      }, 0);
    }

    function basketDraftChanged(basketId) {
      const { rows } = getBasketLines(basketId);
      const draft = ensureBasketDraft(basketId);
      return rows.some(row => Number(draft[row.product.id] || 0) !== Number(row.qty || 0));
    }

    function abbreviateProductName(value, maxLength) {
      const max = Math.max(1, Number(maxLength || 10));
      const clean = String(value || 'Produto').replace(/\s+/g, ' ').trim();
      if (clean.length <= max) return clean;
      const slice = clean.slice(0, max + 1);
      const lastSpace = slice.lastIndexOf(' ');
      return (lastSpace >= 4 ? slice.slice(0, lastSpace) : clean.slice(0, max)).trim();
    }    function buildBasketMessageContext() {
      const entries = Object.entries(state.basketCustomizations || {});
      const originalAggregate = {};
      const basketData = entries.map(([basketId, info]) => {
        const original = Object.keys(info.originalItems || {}).length
          ? normalizeQuantityMap(info.originalItems)
          : basketOriginalItemsMap(basketId);
        const selected = Object.keys(info.selectedItems || {}).length
          ? normalizeQuantityMap(info.selectedItems)
          : (state.basketDrafts[basketId] ? normalizeQuantityMap(state.basketDrafts[basketId]) : original);
        Object.entries(original).forEach(([id, qty]) => {
          originalAggregate[id] = Number(originalAggregate[id] || 0) + Number(qty || 0);
        });
        return { basketId, info, original, selected };
      });
      const hasBasket = basketData.length > 0;
      const actualForOriginal = {};
      Object.keys(originalAggregate).forEach(id => {
        actualForOriginal[id] = Math.max(0, Number(state.cart[id] || 0));
      });
      const aggregateChanged = quantityMapsDiffer(originalAggregate, actualForOriginal);
      const headers = basketData.map(({info, original, selected}) => {
        const changed = basketData.length === 1
          ? aggregateChanged
          : (!!info.changed || quantityMapsDiffer(original, selected));
        const label = String(info.label || 'CESTA').toUpperCase();
        const status = label.includes('KIT') ? 'PROMOCIONAL' : (changed ? 'ALTERADA' : 'PADRAO');
        return `*${label}: ${String(info.name || label).toUpperCase()} - ${status}*`;
      });
      const removed = Object.entries(originalAggregate).reduce((list, [id, originalQty]) => {
        const removedQty = Math.max(0, Number(originalQty || 0) - Number(state.cart[id] || 0));
        if (removedQty <= 0) return list;
        const product = getProductById(id);
        list.push(`${removedQty}x ${abbreviateProductName(product ? product.name : id, 20)}`);
        return list;
      }, []);
      return {
        hasBasket,
        headers,
        removed,
        originalAggregate,
        markerFor(productId) {
          if (!hasBasket) return '';
          const id = String(productId);
          if (!Object.prototype.hasOwnProperty.call(originalAggregate, id)) return '';
          return Number(state.cart[id] || 0) !== Number(originalAggregate[id] || 0) ? 'ALT ' : '';
        }
      };
    }

    function basketDraftTotal(basketId) {
      const basket = state.cestas.find(c => String(c.id) === String(basketId));
      const currentProducts = basketDraftProductTotal(basketId);
      if (!basket || !basket.preco) return currentProducts;
      return Math.round((currentProducts + basketFixedAdjustment(basketId) + Number.EPSILON) * 100) / 100;
    }

    function formatOrderDate(value) {
      const raw = String(value || '').trim();
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) return `${match[3]}-${match[2]}-${match[1]}`;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    }

    function formatOrderLine(product, qty) {
      return `${qty}x ${product ? product.name : 'Produto'}`;
    }

    function totalQtyLabel(items) {
      const total = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
      return `Total de itens: ${total}`;
    }

    function buildGroupedItemsText(cartItems, basketMessage) {
      if (!basketMessage.hasBasket) {
        const items = cartItems.filter(item => !item.product.isFee);
        return `${items.map(item => formatOrderLine(item.product, item.qty)).join('\n')}\n${totalQtyLabel(items)}\n`;
      }
      const standard = [];
      const changed = [];
      const extras = [];
      cartItems.filter(item => !item.product.isFee).forEach(item => {
        const id = String(item.id);
        const originalQty = Number((basketMessage.originalAggregate || {})[id] || 0);
        if (!originalQty) {
          extras.push(item);
        } else if (Number(item.qty || 0) === originalQty) {
          standard.push(item);
        } else {
          changed.push(item);
        }
      });
      const section = (title, items) => `*${title}*\n${items.length ? items.map(item => formatOrderLine(item.product, item.qty)).join('\n') : 'Nenhum item.'}\n${totalQtyLabel(items)}`;
      return [
        section('PRODUTOS DA CESTA SEM ALTERACAO', standard),
        '------------------------------',
        section('PRODUTOS DA CESTA COM QUANTIDADE ALTERADA', changed),
        '------------------------------',
        section('PRODUTOS ADICIONADOS FORA DA CESTA', extras)
      ].join('\n') + '\n';
    }

    function renderBasketDetail(basketId) {
      const { basket, rows } = getBasketLines(basketId);
      if (!basket) {
        app.innerHTML = `<div class="container">${pageHeader('Cesta não encontrada', '', '#/cestas')}<div class="empty"><strong>Não encontramos essa cesta</strong>Volte e escolha outra opção.</div></div>`;
        return;
      }
      const draft = ensureBasketDraft(basket.id);
      const total = basketDraftTotal(basket.id);
      const draftChanged = basketDraftChanged(basket.id);
      app.innerHTML = `<div class="container basket-detail-container">${pageHeader(basket.nome, '', '#/cestas')}${bannerSlotHtml('cesta', { targets:[basket.id,basket.nome].filter(Boolean), label:`Destaque de ${basket.nome}` })}
        <article class="basket-card wide basket-detail-hero" style="margin-bottom:12px">
          <div class="basket-imgbox"><img src="${escapeHtml(basket.imagem)}" alt="${escapeHtml(basket.nome)}" onerror="window.__daFallbackImg(this)"></div>
          <div class="basket-body"><div class="basket-name">${escapeHtml(basket.nome)}</div><div class="price">${basket.preco ? fmt(basket.preco) : fmt(total)}</div><button class="add-btn" type="button" data-action="add-basket" data-id="${escapeHtml(basket.id)}">Adicionar cesta padrão</button></div>
        </article>
        <section class="section"><div class="section-head"><div><h2 class="section-title">Produtos da cesta</h2></div></div>
          ${rows.length ? `<div class="basket-editor">${rows.map(({product}) => {
            const qty = Number(draft[product.id] || 0);
            return `<div class="basket-editor-row" data-basket-row="${escapeHtml(product.id)}">
              <img src="${escapeHtml(product.img)}" data-fallback-images="${escapeHtml(imageFallbackList(product.images))}" alt="${escapeHtml(product.name)}" onerror="window.__daFallbackImg(this)">
              <div><div class="basket-editor-name">${escapeHtml(product.name)}</div><div class="basket-editor-price">${fmt(product.price)} cada</div></div>
              <div class="cart-qty"><button type="button" data-action="basket-dec" data-basket-id="${escapeHtml(basket.id)}" data-id="${escapeHtml(product.id)}">−</button><span>${qty}</span><button type="button" data-action="basket-inc" data-basket-id="${escapeHtml(basket.id)}" data-id="${escapeHtml(product.id)}">+</button></div>
            </div>`;
          }).join('')}</div>` : `<div class="empty"><strong>Itens não localizados</strong>Não conseguimos relacionar os produtos dessa cesta ao cadastro atual.</div>`}
        </section>
        <section class="basket-total-card">
          <div class="summary-row"><span>Valor da cesta padrão</span><span>${basket.preco ? fmt(basket.preco) : fmt(basketDefaultProductTotal(basket.id))}</span></div>
          <div class="summary-row total"><span>Total da cesta editada</span><span>${fmt(total)}</span></div>
          <div class="desc">O total mantém o valor predefinido da cesta. Se retirar produto, o valor do item é abatido; se adicionar, o valor do item é somado.</div>
          <button class="send-btn" type="button" data-action="add-basket-custom" data-id="${escapeHtml(basket.id)}" ${rows.length ? '' : 'disabled'}>Adicionar cesta ${draftChanged ? 'alterada' : 'padrão'}</button>
        </section>
      </div>`;
      setActiveNav('home');
    }

    function renderSearch(query) {
      const q = String(query || '').trim();
      state.searchQuery = q;
      const searchInput = $('search-input');
      if (searchInput && document.activeElement !== searchInput && searchInput.value !== q) searchInput.value = q;
      updateSearchButtons();
      const products = searchProducts(q);
      app.innerHTML = `<div class="container">${pageHeader(q ? `Busca: ${q}` : 'Busca', q ? `${products.length} resultado(s)` : 'Digite o produto na busca acima.', '#/')}${q ? (products.length ? `<div class="product-list">${products.map(p => productCard(p, 'list')).join('')}</div>` : `<div class="empty"><strong>Nenhum produto encontrado</strong>Não achamos nada para "${escapeHtml(q)}". Tente buscar pelo nome exato, marca ou embalagem.</div>`) : ''}${bannerSlotHtml('busca.topo', { kind: 'section' })}</div>`;
      setActiveNav('home');
    }

    function renderFavorites() {
      const favorites = favoriteCollections();
      const productsSection = favorites.products.length ? `<section class="section favorites-section"><div class="section-head"><div><h2 class="section-title">Produtos favoritados</h2><p class="section-caption">${favorites.products.length} ${favorites.products.length === 1 ? 'produto salvo' : 'produtos salvos'}</p></div></div><div class="product-grid">${favorites.products.map(product => productCard(product)).join('')}</div></section>` : '';
      const kitsSection = favorites.kits.length ? `<section class="section favorites-section"><div class="section-head"><div><h2 class="section-title">Kits favoritados</h2><p class="section-caption">${favorites.kits.length} ${favorites.kits.length === 1 ? 'kit salvo' : 'kits salvos'}</p></div></div><div class="basket-list">${favorites.kits.map(kit => kitCard(kit, 'wide')).join('')}</div></section>` : '';
      const empty = `<div class="empty"><strong>Nenhum favorito ainda</strong>Toque no coração dos produtos e kits para salvar aqui.<div class="favorites-empty-actions"><a class="secondary-btn" href="#/ofertas">Ver ofertas</a><a class="secondary-btn" href="#/kits">Ver kits</a></div></div>`;
      app.innerHTML = `<div class="container favorites-page">${pageHeader('Favoritos', `${favorites.total} ${favorites.total === 1 ? 'item salvo' : 'itens salvos'}`, '#/')}${bannerSlotHtml('favoritos.topo', { kind: 'section' })}${favorites.total ? `${productsSection}${kitsSection}` : empty}</div>`;
      setActiveNav('favoritos');
      updateOfferCountdowns();
      updateFavoritesUI();
    }

    function productBackHref() {
      try {
        const saved = sessionStorage.getItem('da_last_product_from') || '';
        if (saved && !saved.startsWith('#/produto')) return saved;
      } catch(e) {}
      if (state.searchQuery) return '#/busca/' + encodeURIComponent(state.searchQuery);
      return '#/';
    }

    function renderProduct(routeId) {
      const p = findProductByRoute(routeId);
      if (!p) {
        app.innerHTML = `<div class="container">${pageHeader('Produto não encontrado', 'Esse item pode ter saído do estoque.', '#/')}<div class="empty"><strong>Produto indisponível</strong>Volte para a loja e procure outro item.</div></div>`;
        return;
      }
      const display = productDisplayPricing(p);
      const related = state.products
        .filter(x => isAvailable(x) && String(x.id) !== String(p.id) && (norm(x.categoria) === norm(p.categoria) || norm(x.marca) === norm(p.marca)))
        .sort((a, b) => {
          const scoreA = (norm(a.categoria) === norm(p.categoria) ? 2 : 0) + (norm(a.marca) === norm(p.marca) ? 1 : 0);
          const scoreB = (norm(b.categoria) === norm(p.categoria) ? 2 : 0) + (norm(b.marca) === norm(p.marca) ? 1 : 0);
          return scoreB - scoreA || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
        });
      const descHtml = p.descricao ? `<div class="desc">${escapeHtml(p.descricao)}</div>` : '';
      const productBannerTargets = [p.id, p.codigo, p.firebaseKey, p.gtin, p.ean, p.name].filter(Boolean);
      app.innerHTML = `<div class="container product-page-container">${pageHeader('Produto', '', productBackHref(), { semanticHeading: false })}${bannerSlotHtml('produto', { targets: productBannerTargets, label: 'Destaque deste produto' })}
        <article class="product-detail">
          <div class="detail-media">
            <div class="detail-imgbox"><img id="product-main-image" src="${escapeHtml(p.img)}" data-fallback-images="${escapeHtml(imageFallbackList(p.images))}" alt="${escapeHtml(p.name)}" onerror="window.__daFallbackImg(this)"></div>
            ${(p.images||[]).length>1?`<div class="detail-gallery">${(p.images||[]).slice(0,6).map((img,i)=>`<button class="detail-thumb ${i===0?'active':''}" type="button" data-action="detail-image" data-src="${escapeHtml(img)}" data-alt="${escapeHtml(`${p.name} - imagem ${i+1}`)}" aria-label="Ver imagem ${i+1} de ${escapeHtml(p.name)}"><img src="${escapeHtml(img)}" data-fallback-images="${escapeHtml(imageFallbackList(p.images))}" alt="${escapeHtml(`${p.name} - imagem ${i+1}`)}" loading="lazy" decoding="async" onerror="window.__daFallbackImg(this)"></button>`).join('')}</div>`:''}
            ${productDetailChipsHtml(p)}
          </div>
          <div class="detail-info">
            ${p.validade && formatProductExpiry(p.validade) ? `<div class="product-expiry">Validade: ${escapeHtml(formatProductExpiry(p.validade))}</div>` : ''}
            <h1 class="detail-title">${escapeHtml(p.name)}</h1>
            ${hasExpiryBulkDiscount(p) ? `<div class="expiry-bulk-note">Leve 3 ou mais unidades e ganhe mais 10% no checkout.</div>` : ''}
            ${productPriceHtml(display, true)}
            <div class="detail-actions-row">${favoriteButtonHtml(p.id, true, 'product')}</div>
            <div data-card-controls="${escapeHtml(p.id)}" data-control-mode="detail">${qtyControlHtml(p.id, Number(state.cart[p.id] || 0))}</div>
            ${descHtml}
          </div>
        </article>
        ${relatedGridHtml('Produtos relacionados', 'Itens parecidos ou da mesma categoria.', related)}
      </div>`;
      setupRelatedInfiniteScroll();
      setActiveNav('home');
      updateMeta(`${p.name} - Dona Antônia`, `Compre ${p.name} com entrega em Cuiabá e Várzea Grande.`, `/?p=${encodeURIComponent(productRouteKey(p))}`);
    }

    function renderInfo() {
      app.innerHTML = `<div class="container">${pageHeader('Informações da loja', '', '#/')}
        <section class="info-hero">
          <h2>Super Cestas Básicas Dona Antônia</h2>
          <p><strong>Tipo de loja:</strong> loja on-line de supermercado, cestas básicas, combos e produtos alimentícios, com atendimento por delivery para Cuiabá e Várzea Grande - MT.</p>
          <p><strong>Área de atendimento:</strong> Cuiabá e Várzea Grande - MT.</p>
          <p><strong>Endereço comercial:</strong> R. Trinta, 105 - Jardim Nossa Sra. Aparecida, Cuiabá - MT, 78090-660.</p>
          <p><strong>CNPJ:</strong> 51.385.335/0001-06.</p>
          <p><strong>E-mail:</strong> atendimento@donaantonia.com.br.</p>
          <p><strong>WhatsApp:</strong> (65) 99815-0975.</p>
          <p><strong>Horário de atendimento:</strong> segunda a sábado, das 08h às 18h.</p>
          <div class="info-badges"><span class="info-badge">Pedido mínimo ${fmt(CONFIG.MIN_ORDER)}</span><span class="info-badge">Delivery local</span><span class="info-badge">WhatsApp oficial</span></div>
          <a class="send-btn" style="margin-top:14px" href="https://api.whatsapp.com/send?phone=${CONFIG.WHATSAPP_NUMBER}" target="_blank" rel="noopener">Falar pelo WhatsApp</a>
        </section>

        <section class="info-accordion" aria-label="Informações comerciais e políticas da loja">
          <details open>
            <summary>Como funciona o pedido</summary>
            <div class="info-panel">
              <ul>
                <li>O cliente escolhe os produtos no site e envia a lista pelo WhatsApp.</li>
                <li>A equipe confirma disponibilidade, valores, endereço, forma de pagamento e prazo de entrega antes de finalizar o atendimento.</li>
                <li>Caso algum produto esteja indisponível, o cliente é avisado antes da entrega para escolher substituição, remoção do item ou ajuste do pedido.</li>
                <li>As informações de preço e estoque exibidas no site devem permanecer alinhadas com as informações enviadas ao Google Merchant Center.</li>
              </ul>
            </div>
          </details>
          <details>
            <summary>Entrega</summary>
            <div class="info-panel">
              <p><strong>Área de entrega:</strong> Cuiabá e Várzea Grande - MT.</p>
              <p><strong>Pedido mínimo:</strong> ${fmt(CONFIG.MIN_ORDER)}.</p>
              <p>Os pedidos são agendados conforme disponibilidade operacional. Pedidos feitos após 10h podem ficar para o próximo dia útil de entrega. Domingo não temos entrega.</p>
            </div>
          </details>
          <details>
            <summary>Pagamento</summary>
            <div class="info-panel">
              <p>Formas aceitas: dinheiro, Pix, cartão de débito, cartão de crédito, vale alimentação e vale refeição.</p>
              <p>A forma de pagamento é confirmada no WhatsApp antes da finalização do atendimento.</p>
            </div>
          </details>
          <details>
            <summary>Trocas e devoluções</summary>
            <div class="info-panel">
              <p>Produtos errados, avariados ou em desacordo com o pedido podem ser analisados pelo atendimento, conforme a política publicada da loja.</p>
              <p>Quando houver indisponibilidade, o cliente pode escolher substituição, remoção do item ou ajuste do valor do pedido.</p>
            </div>
          </details>
          <details>
            <summary>Privacidade e uso dos dados</summary>
            <div class="info-panel">
              <p>Os dados informados no pedido são usados para identificação do cliente, emissão fiscal, atendimento, entrega e confirmação pelo WhatsApp.</p>
              <p>O site mantém links públicos para política de privacidade e termos de uso.</p>
            </div>
          </details>
          <details>
            <summary>Links e políticas da loja</summary>
            <div class="info-panel">
              <p>Estes links precisam ficar publicados e com as mesmas informações cadastradas no Google Merchant Center.</p>
              <div class="policy-grid">
                <a class="policy-link" href="sobre-nos.html">Sobre nós <span>›</span></a>
                <a class="policy-link" href="contato.html">Contato <span>›</span></a>
                <a class="policy-link" href="politica-de-entrega.html">Política de entrega <span>›</span></a>
                <a class="policy-link" href="politica-de-troca.html">Trocas e devoluções <span>›</span></a>
                <a class="policy-link" href="politica-de-privacidade.html">Política de privacidade <span>›</span></a>
                <a class="policy-link" href="termos-de-uso.html">Termos de uso <span>›</span></a>
              </div>
            </div>
          </details>
        </section>
        <footer class="merchant-footer">
          <strong>Super Cestas Básicas Dona Antônia</strong>
          Loja on-line de supermercado, cestas básicas, combos e produtos alimentícios com atendimento em Cuiabá e Várzea Grande - MT.
        </footer>
      </div>`;
      updateMeta('Informações da loja - Dona Antônia', 'Dados comerciais, atendimento, entrega, formas de pagamento e políticas da Super Cestas Básicas Dona Antônia.', '/#/informacoes');
      setActiveNav('info');
    }

    function renderSiteMenuContent() {
      const el = $('site-menu-content');
      if (!el) return;
      const cats = getCategories().slice(0, 12);
      const countsByBrand = new Map();
      state.products.filter(p => isAvailable(p) && p.marca).forEach(p => countsByBrand.set(p.marca, (countsByBrand.get(p.marca) || 0) + 1));
      const brands = Array.from(countsByBrand.entries()).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 10);
      const count = cartCount();
      const total = subtotalCart(true);
      const favCount = favoriteCollections().total;
      el.innerHTML = `
        <section class="menu-hero-card">
          <div class="menu-hero-kicker">Supermercado online local</div>
          <strong>Compra fácil para Cuiabá e Várzea Grande.</strong>
          <span>Escolha produtos, salve favoritos, revise sua compra e envie o pedido pelo WhatsApp.</span>
        </section>
        <section class="menu-section-card menu-cart-card">
          <div class="menu-section-title">Resumo da compra</div>
          <div class="menu-cart-line"><span id="menu-cart-count">${count} ${count === 1 ? 'item' : 'itens'}</span><strong id="menu-cart-total">${fmt(total)}</strong></div>
          <button class="menu-main-btn" type="button" id="menu-open-checkout">Revisar minha compra</button>
        </section>
        <section class="menu-section-card">
          <div class="menu-section-title">Atalhos principais</div>
          <div class="menu-link-list">
            <a class="menu-link" href="#/"><span>Início</span><small>Vitrine principal</small></a>
            <a class="menu-link" href="#/cestas"><span>Cestas básicas</span><small>Kits prontos e editáveis</small></a>
            <a class="menu-link" href="#/ofertas"><span>Ofertas de hoje</span><small>Produtos com desconto</small></a>
            <a class="menu-link" href="#/favoritos"><span>Favoritos</span><small>${favCount} salvo(s)</small></a>
            <a class="menu-link" href="#/rotina/compra-mes"><span>Compra do mês</span><small>Despensa e básicos</small></a>
            <a class="menu-link" href="#/kits"><span>Kits promocionais</span><small>Combos ativos</small></a>
          </div>
        </section>
        <section class="menu-section-card">
          <div class="menu-section-title">Departamentos</div>
          <div class="menu-link-list compact">
            ${cats.map(([cat, qty]) => `<a class="menu-link" href="#/categoria/${encodeURIComponent(cat)}"><span>${escapeHtml(cat)}</span><small>${qty} produtos</small></a>`).join('')}
          </div>
        </section>
        ${brands.length ? `<section class="menu-section-card"><div class="menu-section-title">Marcas populares</div><div class="brand-strip">${brands.map(([brand, qty]) => `<a class="brand-pill" href="#/marca/${encodeURIComponent(brand)}">${escapeHtml(brand)} · ${qty}</a>`).join('')}</div></section>` : ''}
        <section class="menu-section-card">
          <div class="menu-section-title">Condições de compra</div>
          <div class="menu-benefits">
            <div><strong>Entrega local</strong><span>Cuiabá e Várzea Grande</span></div>
            <div><strong>Pedido mínimo</strong><span>A partir de ${fmt(CONFIG.MIN_ORDER)}</span></div>
            <div><strong>WhatsApp</strong><span>Pedido conferido antes do envio</span></div>
          </div>
        </section>`;
      updateFavoritesUI();
    }

    function scrollPageTop() {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      app.scrollTop = 0;
    }


    function ensureFullCatalogInBackground() {
      if (state.catalogMode === 'full' || state.catalogMode === 'full-cache' || state.catalogMode === 'compact-full' || state.fullCatalogLoading) return;
      state.fullCatalogLoading = true;
      loadProducts().then(() => {
        state.fullCatalogLoading = false;
        rebuildVirtualFees();
        renderSiteMenuContent();
        handleRoute();
        updateCartUI();
      }).catch(err => {
        state.fullCatalogLoading = false;
        console.warn('Catálogo completo não carregou em segundo plano:', err && err.message ? err.message : err);
      });
    }

    function handleRoute() {
      updateProductStructuredData(null);
      if (!state.isReady) return;
      scrollPageTop();
      const hash = location.hash || '#/';
      const clean = hash.replace(/^#\/?/, '').split('?')[0];
      const parts = clean.split('/').filter(Boolean);
      clearSearchButtonsState();
      if (!parts.length) return renderHome();
      if (parts[0] === 'categorias') return renderCategories();
      if (parts[0] === 'categoria') return renderCategory(parts.slice(1).join('/'));
      if (parts[0] === 'subcategoria') return renderSubcategory(parts.slice(1).join('/'));
      if (parts[0] === 'marca') return renderBrand(parts.slice(1).join('/'));
      if (parts[0] === 'ofertas') return renderOffers();
      if (parts[0] === 'favoritos') return renderFavorites();
      if (parts[0] === 'rotina') return renderRoutine(parts[1]);
      if (parts[0] === 'produto') {
        const result = renderProduct(parts.slice(1).join('/'));
        ensureFullCatalogInBackground();
        return result;
      }
      if (parts[0] === 'cesta') return renderBasketDetail(parts.slice(1).join('/'));
      if (parts[0] === 'cestas') return renderCestas();
      if (parts[0] === 'kit') return renderKitDetail(parts.slice(1).join('/'));
      if (parts[0] === 'kits') return renderKits();
      if (parts[0] === 'busca') return renderSearch(decodeURIComponent(parts.slice(1).join(' ')) || state.searchQuery);
      if (parts[0] === 'informacoes') return renderInfo();
      if (parts[0] === 'campanha-cupom') {
        activateCoupon(parts[1] || '');
        const coupon = getCouponByCode(parts[1] || '');
        if (coupon && coupon.grupo === 'beleza') return renderRoutine('higiene');
        if (coupon && coupon.grupo === 'cafe_da_manha') return renderRoutine('cafe');
        return renderHome();
      }
      return renderHome();
    }

    function clearSearchButtonsState() {
      if ((location.hash || '').startsWith('#/busca')) return;
      const input = $('search-input');
      if (input && !input.matches(':focus')) input.value = state.searchQuery = '';
      updateSearchButtons();
    }

    function updateSearchButtons() {
      const has = !!String($('search-input').value || '').trim();
      $('search-clear').classList.toggle('show', has);
      $('search-submit').classList.toggle('show', has);
    }

    function runInstantSearch(event) {
      const input = $('search-input');
      if (!input) return;
      const q = input.value.trim();
      state.searchQuery = q;
      updateSearchButtons();
      clearTimeout(state.searchTimer);
      if (event && event.isComposing) return;
      state.searchTimer = setTimeout(() => {
        if (q) {
          const target = '#/busca/' + encodeURIComponent(q);
          if ((location.hash || '') !== target) {
            try { history.replaceState(null, '', target); } catch (_) {}
          }
          renderSearch(q);
          scrollPageTop();
        } else if ((location.hash || '').startsWith('#/busca')) {
          try { history.replaceState(null, '', '#/'); } catch (_) {}
          renderHome();
          scrollPageTop();
        }
      }, 250);
    }

    function clearSearch() {
      $('search-input').value = '';
      state.searchQuery = '';
      updateSearchButtons();
      if ((location.hash || '').startsWith('#/busca')) location.hash = '#/';
      else handleRoute();
    }

    function setActiveNav(name) {
      ['home','categorias','ofertas','favoritos','info'].forEach(k => {
        const el = $('nav-' + k);
        if (el) el.classList.toggle('active', k === name);
      });
      const headerFavorites = $('header-favorites-btn');
      if (headerFavorites) headerFavorites.classList.toggle('active', name === 'favoritos');
    }

    function updateCartUI() {
      const total = subtotalCart(true);
      const count = cartCount();
      const countLabel = `${count} ${count === 1 ? 'item' : 'itens'}`;
      const bottomTotal = $('bottom-total');
      const bottomCta = $('bottom-cta');
      const cartBadge = $('cart-badge');
      const drawerSubtitle = $('drawer-subtitle');
      const headerTotal = $('header-cart-total');
      const headerCount = $('header-cart-count');
      const menuTotal = $('menu-cart-total');
      const menuCount = $('menu-cart-count');

      if (bottomTotal) bottomTotal.textContent = fmt(total);
      if (bottomCta) {
        bottomCta.disabled = count <= 0;
        const small = bottomCta.querySelector('small');
        if (small) small.textContent = count > 0 ? 'Ver compra' : 'Monte a compra';
      }
      if (cartBadge) {
        cartBadge.textContent = String(count);
        cartBadge.style.display = count > 0 ? 'flex' : 'none';
      }
      if (drawerSubtitle) drawerSubtitle.textContent = countLabel;
      if (headerTotal) headerTotal.textContent = fmt(total);
      if (headerCount) {
        headerCount.textContent = String(count);
        headerCount.style.display = count > 0 ? 'flex' : 'none';
      }
      if (menuTotal) menuTotal.textContent = fmt(total);
      if (menuCount) menuCount.textContent = countLabel;
    }

    function syncVisibleCards() {
      document.querySelectorAll('[data-card-controls]').forEach(el => {
        const id = el.getAttribute('data-card-controls');
        const p = getProductById(id);
        if (p && !p.isFee) {
          const qty = Number(state.cart[id] || 0);
          if (el.getAttribute('data-control-mode') === 'card') el.innerHTML = productCardControlsHtml(id, qty, !isAvailable(p));
          else el.innerHTML = qtyControlHtml(id, qty);
        }
      });
    }

    function renderCheckout() {
      removeMissingCartItems({ silent: true });
      const items = getCartItems().filter(i => !i.product.isFee && isAvailable(i.product));
      const pricing = cartPricing(true);
      const total = pricing.total;
      const missing = Math.max(CONFIG.MIN_ORDER - pricing.subtotalBefore, 0);
      const checkoutOffers = getTopOffers(200).filter(p => !state.cart[p.id]);
      const initialCheckoutOffers = checkoutOffers.slice(0, Math.max(12, Number(state.checkoutOfferLimit || 12)));
      const clientDetailsVisible = state.customerLookupStatus === 'existing' || state.customerLookupStatus === 'new';
      const isExistingClient = state.customerLookupStatus === 'existing';
      const clientDetailsIntro = isExistingClient
        ? 'Encontramos seu cadastro. Confira os dados e altere o que for necessario.'
        : 'CPF nao cadastrado. Complete seus dados uma vez para finalizar.';
      const selectedPayment = state.checkoutPayment || 'DINHEIRO';
      const paymentChecked = code => selectedPayment === code ? ' checked' : '';
      const deliveryAndDetails = clientDetailsVisible ? `
        <section class="checkout-section">
          <div class="checkout-title">2. Entrega</div>
          <div id="agendamento-options-container">${agendamentoOptionsHtml()}</div>
        </section>
        <section class="checkout-section">
          <div class="checkout-title">${isExistingClient ? '3. Seus dados' : '3. Dados para entrega'}</div>
          <div class="client-details" id="client-details">
            <p class="client-details-intro" id="client-details-intro">${escapeHtml(clientDetailsIntro)}</p>
            <label class="checkout-field-label" for="chk-nome">Nome completo*</label>
            <input type="text" id="chk-nome" class="field" placeholder="Nome completo*" autocomplete="name">
            <label class="checkout-field-label" for="chk-telefone">WhatsApp com DDD*</label>
            <input type="tel" id="chk-telefone" class="field" placeholder="WhatsApp com DDD*" maxlength="18" inputmode="tel" autocomplete="tel-national">
            <label class="checkout-field-label" for="chk-email">E-mail*</label>
            <input type="email" id="chk-email" class="field" placeholder="E-mail*" autocomplete="email">
            <label class="checkout-field-label" for="chk-cep">CEP*</label>
            <input type="tel" id="chk-cep" class="field" placeholder="CEP*" maxlength="9" inputmode="numeric" autocomplete="postal-code">
            <label class="checkout-field-label" for="chk-cidade">Cidade*</label>
            <select id="chk-cidade" class="field"><option value="">Cidade*</option><option value="Cuiabá">Cuiabá</option><option value="Várzea Grande">Várzea Grande</option></select>
            <label class="checkout-field-label" for="chk-bairro">Bairro*</label>
            <input type="text" id="chk-bairro" class="field" placeholder="Bairro*">
            <label class="checkout-field-label" for="chk-rua">Rua ou avenida*</label>
            <input type="text" id="chk-rua" class="field" placeholder="Rua ou avenida*">
            <label class="checkout-field-label">Numero e quadra</label>
            <div class="field-row"><input type="text" id="chk-quadra" class="field" placeholder="Quadra (opcional)" style="flex:1"><input type="text" id="chk-casa" class="field" placeholder="Numero*" style="flex:1"></div>
            <label class="checkout-field-label" for="chk-frente">Ponto de referência para entrega</label>
            <input type="text" id="chk-frente" class="field" placeholder="Como é a frente da casa?">
            <fieldset class="payment-fieldset" id="chk-pagamento">
              <legend>Forma de pagamento*</legend>
              <div class="payment-options">
                <label class="payment-option"><input type="radio" id="chk-pagamento-dinheiro" name="pagamento" value="DINHEIRO"${paymentChecked('DINHEIRO')}><span>Dinheiro</span></label>
                <label class="payment-option"><input type="radio" id="chk-pagamento-pix" name="pagamento" value="PIX"${paymentChecked('PIX')}><span>Pix</span></label>
                <label class="payment-option"><input type="radio" id="chk-pagamento-debito" name="pagamento" value="CARTAO_DE_DEBITO"${paymentChecked('CARTAO_DE_DEBITO')}><span>Cartão de débito</span></label>
                <label class="payment-option"><input type="radio" id="chk-pagamento-credito" name="pagamento" value="CARTAO_DE_CREDITO"${paymentChecked('CARTAO_DE_CREDITO')}><span>Cartão de crédito</span></label>
                <label class="payment-option"><input type="radio" id="chk-pagamento-alimentacao" name="pagamento" value="VALE_ALIMENTACAO"${paymentChecked('VALE_ALIMENTACAO')}><span>Vale-alimentação</span></label>
                <label class="payment-option"><input type="radio" id="chk-pagamento-refeicao" name="pagamento" value="VALE_REFEICAO"${paymentChecked('VALE_REFEICAO')}><span>Vale-refeição</span></label>
              </div>
            </fieldset>
          </div>
        </section>
        <section class="checkout-section">
          <div class="checkout-title">4. Total</div>
          ${couponBoxHtml()}
          ${checkoutTotalsHtml(pricing, total)}
          <button class="send-btn" type="button" id="btn-send-order" ${items.length && missing <= 0 ? '' : 'disabled'}>Pedir no WhatsApp</button>
        </section>` : `
        <section class="checkout-section checkout-next-step">
          <div class="checkout-title">Proximo passo</div>
          <p>Digite seu CPF e toque em Continuar. Se voce ja tiver cadastro, mostramos o endereco salvo para voce conferir e editar se precisar. Se nao tiver, abrimos os campos necessarios.</p>
        </section>`;

      $('checkout-content').innerHTML = `
        <div class="checkout-alert" id="checkout-alert"></div>
        <section class="checkout-section">
          <div class="checkout-title">1. Revise sua compra</div>
          ${items.length ? items.map(({id, product, qty}) => `
            <div class="cart-row">
              <img class="cart-img" src="${escapeHtml(product.img)}" data-fallback-images="${escapeHtml(imageFallbackList(product.images))}" alt="${escapeHtml(product.name)}" onerror="window.__daFallbackImg(this)">
              <div><div class="cart-name">${escapeHtml(product.name)}</div></div>
              <div class="cart-qty"><button type="button" data-action="dec" data-id="${escapeHtml(id)}">-</button><span>${qty}</span><button type="button" data-action="inc" data-id="${escapeHtml(id)}">+</button></div>
            </div>`).join('') : `<div class="empty"><strong>Sua compra esta vazia</strong>Adicione produtos para enviar o pedido.</div>`}
          <div class="min-order" id="min-order-box" style="display:${items.length && missing > 0 ? 'block' : 'none'}">Faltam <strong>${fmt(missing)}</strong> para atingir o pedido minimo de ${fmt(CONFIG.MIN_ORDER)}.</div>
          ${items.length ? `<button class="clear-cart-btn" type="button" data-action="clear-cart"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"></path></svg>Limpar compra</button>` : ''}
        </section>
        ${initialCheckoutOffers.length ? `<section class="checkout-section"><div class="checkout-title">Ofertas para completar</div><div class="mini-suggest checkout-offers-rail" id="checkout-offers-rail" data-loaded="${initialCheckoutOffers.length}">${initialCheckoutOffers.map(p => productCard(p, 'compact')).join('')}</div>${checkoutOffers.length > initialCheckoutOffers.length ? '<div class="checkout-offers-hint" id="checkout-offers-hint">Role para ver mais ofertas</div>' : ''}</section>` : ''}
        <section class="checkout-section checkout-cpf-step">
          <div class="checkout-title">2. Identifique seu cadastro</div>
          <div class="client-lookup">
            <div class="client-lookup-title">Consulte pelo CPF antes de preencher endereco</div>
            <p class="client-lookup-copy">Assim evitamos campos desnecessarios e ja trazemos seu endereco salvo quando existir.</p>
            <label class="checkout-field-label" for="chk-cpf">CPF*</label>
            <div class="client-lookup-row">
              <input type="tel" id="chk-cpf" class="field" placeholder="CPF*" maxlength="14" inputmode="numeric" autocomplete="off">
              <button type="button" class="lookup-btn" id="btn-lookup-client">Continuar</button>
            </div>
            <div class="lookup-status" id="lookup-status" role="status" aria-live="polite"></div>
          </div>
        </section>
        ${deliveryAndDetails}`;
      restoreCheckoutClient();
      setupCheckoutOffersCarousel();
    }

    function setupCheckoutOffersCarousel() {
      const rail = $('checkout-offers-rail');
      if (!rail) return;
      let loading = false;
      requestAnimationFrame(() => { rail.scrollLeft = Number(state.checkoutOfferScrollLeft || 0); });
      rail.addEventListener('scroll', () => {
        state.checkoutOfferScrollLeft = rail.scrollLeft;
        if (loading || rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 160) return;
        const offers = getTopOffers(200).filter(p => !state.cart[p.id]);
        const loaded = Number(rail.dataset.loaded || 0);
        if (loaded >= offers.length) {
          const hint = $('checkout-offers-hint');
          if (hint) hint.remove();
          return;
        }
        loading = true;
        const next = offers.slice(loaded, loaded + 12);
        rail.insertAdjacentHTML('beforeend', next.map(p => productCard(p, 'compact')).join(''));
        rail.dataset.loaded = String(loaded + next.length);
        state.checkoutOfferLimit = loaded + next.length;
        if (loaded + next.length >= offers.length) {
          const hint = $('checkout-offers-hint');
          if (hint) hint.remove();
        }
        loading = false;
      }, { passive: true });
    }

    function getAgoraCuiaba() {
      return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Cuiaba' }));
    }

    function addDays(date, days) {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d;
    }

    function formatDateValue(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function deliveryOptionText(date, index, now) {
      const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
      const tomorrow = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0), 1);
      const isTomorrow = date.getFullYear() === tomorrow.getFullYear() && date.getMonth() === tomorrow.getMonth() && date.getDate() === tomorrow.getDate();
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
      const dayMonth = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (sameDay) return { title: `Hoje, ${weekday}`, detail: 'No periodo da tarde' };
      if (isTomorrow) return { title: `Amanha, ${weekday}`, detail: `Dia ${dayMonth}` };
      return { title: `${weekday}`, detail: `Dia ${dayMonth}` };
    }

    function easterSunday(year) {
      const a = year % 19;
      const b = Math.floor(year / 100);
      const c = year % 100;
      const d = Math.floor(b / 4);
      const e = b % 4;
      const f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4);
      const k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }

    function nationalHolidayKeys(year) {
      const fixed = ['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25']
        .map(monthDay => `${year}-${monthDay}`);
      const goodFriday = addDays(easterSunday(year), -2);
      return new Set([...fixed, formatDateValue(goodFriday)]);
    }

    function isNationalHoliday(date) {
      return nationalHolidayKeys(date.getFullYear()).has(formatDateValue(date));
    }

    function agendamentoOptionsHtml() {
      const now = getAgoraCuiaba();
      const dates = [];
      let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
      while (dates.length < 7) {
        const sameDay = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth() && cursor.getDate() === now.getDate();
        const sameDayStillOpen = !sameDay || now.getHours() < 10;
        if (sameDayStillOpen && cursor.getDay() !== 0 && !isNationalHoliday(cursor)) dates.push(new Date(cursor));
        cursor = addDays(cursor, 1);
      }
      return `<div class="delivery-picker">${dates.map((d, i) => {
        const opt = deliveryOptionText(d, i, now);
        return `<label class="delivery-option"><input type="radio" name="agendamento" value="${formatDateValue(d)}" ${i === 0 ? 'checked' : ''}><strong>${escapeHtml(opt.title)}</strong><span>${escapeHtml(opt.detail)}</span></label>`;
      }).join('')}</div>`;
    }

    let basketConfirmPreviousFocus = null;

    function openBasketConfirmation(basket, changed, type) {
      const overlay = $('basket-confirm-overlay');
      if (!overlay || !basket) return;
      const isKit = type === 'kit';
      const offerCount = getTopOffers(200).length;
      basketConfirmPreviousFocus = document.activeElement;
      $('basket-confirm-title').textContent = isKit ? 'Kit adicionado' : 'Cesta adicionada';
      $('basket-confirm-message').textContent = offerCount > 0
        ? `Temos mais de ${offerCount} produtos em oferta para você aproveitar.`
        : 'Confira também os produtos em oferta antes de finalizar sua compra.';
      const summary = $('basket-confirm-summary');
      if (summary) {
        summary.textContent = '';
        summary.style.display = 'none';
      }
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => $('basket-confirm-continue')?.focus());
    }

    function closeBasketConfirmation() {
      const overlay = $('basket-confirm-overlay');
      if (!overlay) return;
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      if (basketConfirmPreviousFocus && typeof basketConfirmPreviousFocus.focus === 'function') basketConfirmPreviousFocus.focus();
      basketConfirmPreviousFocus = null;
    }

    function continueShoppingAfterBasket() {
      closeBasketConfirmation();
      if ((location.hash || '') === '#/ofertas') {
        renderOffers();
        scrollPageTop();
      } else {
        location.hash = '#/ofertas';
      }
    }

    let drawerPreviousFocus = null;

    function setDrawerPageIsolation(active) {
      [document.querySelector('.header'), app, document.querySelector('.bottom-bar')].forEach(element => {
        if (!element) return;
        if (active) {
          element.setAttribute('inert', '');
          element.setAttribute('aria-hidden', 'true');
        } else {
          element.removeAttribute('inert');
          element.removeAttribute('aria-hidden');
        }
      });
    }

    function getOpenDrawer() {
      return $('checkout-drawer')?.classList.contains('open')
        ? $('checkout-drawer')
        : ($('site-menu-drawer')?.classList.contains('open') ? $('site-menu-drawer') : null);
    }

    function focusDrawerStart(drawer, closeButtonId) {
      requestAnimationFrame(() => $(closeButtonId)?.focus());
    }

    function restoreDrawerFocus() {
      const target = drawerPreviousFocus;
      drawerPreviousFocus = null;
      if (target && target.isConnected && typeof target.focus === 'function') target.focus();
    }

    function trapDrawerFocus(event) {
      const drawer = getOpenDrawer();
      if (!drawer || event.key !== 'Tab') return;
      const focusable = Array.from(drawer.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function openCheckout() {
      closeBasketConfirmation();
      const menuWasOpen = $('site-menu-drawer')?.classList.contains('open');
      drawerPreviousFocus = menuWasOpen ? $('header-cart-btn') : document.activeElement;
      closeSiteMenu({ keepIsolation: true, restoreFocus: false });
      renderCheckout();
      $('drawer-overlay').classList.add('show');
      $('checkout-drawer').classList.add('open');
      $('checkout-drawer').setAttribute('aria-hidden', 'false');
      setDrawerPageIsolation(true);
      updateCartUI();
      focusDrawerStart($('checkout-drawer'), 'drawer-close');
      // Aproveita o tempo de preenchimento do checkout para conferir o catálogo sem bloquear a venda.
      setTimeout(() => validateLiveCatalogBeforeOrder(), 0);
    }

    function closeCheckout(options) {
      const settings = options || {};
      const overlay = $('drawer-overlay');
      const drawer = $('checkout-drawer');
      if (overlay) overlay.classList.remove('show');
      if (drawer) {
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
      }
      if (!settings.keepIsolation && !$('site-menu-drawer')?.classList.contains('open')) setDrawerPageIsolation(false);
      if (settings.restoreFocus !== false) restoreDrawerFocus();
    }

    function openSiteMenu() {
      drawerPreviousFocus = document.activeElement;
      closeCheckout({ keepIsolation: true, restoreFocus: false });
      updateCartUI();
      const overlay = $('drawer-overlay');
      const drawer = $('site-menu-drawer');
      const btn = $('header-menu-btn');
      if (overlay) overlay.classList.add('show');
      if (drawer) {
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
      }
      if (btn) btn.setAttribute('aria-expanded', 'true');
      setDrawerPageIsolation(true);
      focusDrawerStart(drawer, 'menu-close');
    }

    function closeSiteMenu(options) {
      const settings = options || {};
      const overlay = $('drawer-overlay');
      const drawer = $('site-menu-drawer');
      const btn = $('header-menu-btn');
      if (overlay) overlay.classList.remove('show');
      if (drawer) {
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
      }
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (!settings.keepIsolation && !$('checkout-drawer')?.classList.contains('open')) setDrawerPageIsolation(false);
      if (settings.restoreFocus !== false) restoreDrawerFocus();
    }

    function closeAllDrawers() {
      closeBasketConfirmation();
      closeCheckout({ keepIsolation: true, restoreFocus: false });
      closeSiteMenu({ keepIsolation: true, restoreFocus: false });
      setDrawerPageIsolation(false);
      restoreDrawerFocus();
    }

    function limparNumeros(value) { return String(value || '').replace(/\D/g, ''); }
    function limparCPF(value) { return limparNumeros(value).slice(0, 11); }
    function formatarCPF(value) {
      const n = limparCPF(value);
      return n.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    function limparCEP(value) { return limparNumeros(value).slice(0, 8); }
    function formatarCEP(value) { return limparCEP(value).replace(/(\d{5})(\d)/, '$1-$2'); }
    function telefoneSomenteNumeros(value) { return limparNumeros(value).slice(0, 13); }
    function limparTelefone(value) {
      let tel = telefoneSomenteNumeros(value);
      if (tel.length === 13 && tel.startsWith('55')) tel = tel.slice(2);
      if (tel.length === 12 && tel.startsWith('55')) tel = tel.slice(2);
      if (tel.length === 12 && tel.startsWith('0')) tel = tel.slice(1);
      if (tel.length === 10 && /^[1-9]{2}\d{8}$/.test(tel)) tel = tel.slice(0,2) + '9' + tel.slice(2);
      return tel.slice(0, 11);
    }
    function formatarTelefone(value) {
      const n = limparTelefone(value);
      if (n.length <= 2) return n;
      if (n.length <= 6) return `(${n.slice(0,2)}) ${n.slice(2)}`;
      if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
      return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7,11)}`;
    }
    function telefoneValidoBR(value) { return /^[1-9]{2}9\d{8}$/.test(limparTelefone(value)); }
    function emailValido(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }

    function saveCheckoutClient() {
      const ids = ['chk-nome','chk-cpf','chk-telefone','chk-email','chk-cep','chk-cidade','chk-bairro','chk-rua','chk-quadra','chk-casa'];
      const dados = {};
      ids.forEach(id => { const el = $(id); if (el) dados[id] = el.value || ''; });
      writeCache(CONFIG.CHECKOUT_CLIENT_KEY, { savedAt: Date.now(), dados });
    }

    function restoreCheckoutClient() {
      const saved = readCache(CONFIG.CHECKOUT_CLIENT_KEY);
      const dados = saved && saved.dados ? saved.dados : {};
      Object.entries(dados).forEach(([id, value]) => { const el = $(id); if (el && !el.value) el.value = value || ''; });
      const frente = $('chk-frente'); if (frente) frente.value = '';
      const cpf = $('chk-cpf'); if (cpf) cpf.value = formatarCPF(cpf.value);
      const tel = $('chk-telefone'); if (tel) tel.value = tel.value ? formatarTelefone(tel.value) : '';
      const cep = $('chk-cep'); if (cep) cep.value = formatarCEP(cep.value);
    }

    function clearCheckoutClientDetails() {
      ['chk-nome','chk-telefone','chk-email','chk-cep','chk-cidade','chk-bairro','chk-rua','chk-quadra','chk-casa','chk-frente']
        .forEach(id => { const el = $(id); if (el) el.value = ''; });
      saveCheckoutClient();
    }

    function setLookupStatus(message, type) {
      const el = $('lookup-status');
      if (!el) return;
      el.textContent = message || '';
      el.className = `lookup-status${message ? ' show' : ''}${type ? ' ' + type : ''}`;
    }

    function valueFrom(obj, paths) {
      for (const path of paths) {
        const value = path.split('.').reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : undefined, obj);
        if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
      }
      return '';
    }

    function cleanDeliveryReference(value) {
      let text = String(value || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      for (let i = 0; i < 4; i++) {
        text = text
          .replace(/(?:^|\s)(?:quadra|qd\.?)\s*:\s*\.?/ig, ' ')
          .replace(/(?:^|\s)(?:frente|refer[eê]ncia|referencia)\s*:\s*\.?/ig, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return text;
    }

    function fillClientFromBling(raw) {
      const cliente = raw && raw.data && !raw.nome ? raw.data : (raw || {});
      const endereco = cliente.endereco && (cliente.endereco.geral || cliente.endereco) || {};
      const values = {
        'chk-nome': valueFrom(cliente, ['nome']),
        'chk-cpf': valueFrom(cliente, ['numeroDocumento', 'cpf']),
        'chk-telefone': valueFrom(cliente, ['celular', 'telefone', 'telefoneFormatado']),
        'chk-email': valueFrom(cliente, ['email']),
        'chk-cep': valueFrom(endereco, ['cep']),
        'chk-cidade': valueFrom(endereco, ['municipio', 'cidade']),
        'chk-bairro': valueFrom(endereco, ['bairro']),
        'chk-rua': valueFrom(endereco, ['endereco', 'rua']),
        'chk-casa': valueFrom(endereco, ['numero']),
        'chk-frente': ''
      };
      Object.entries(values).forEach(([id, value]) => {
        const el = $(id);
        if (el && value) el.value = value;
      });
      if ($('chk-cpf')) $('chk-cpf').value = formatarCPF($('chk-cpf').value);
      if ($('chk-telefone')) $('chk-telefone').value = formatarTelefone($('chk-telefone').value);
      if ($('chk-cep')) $('chk-cep').value = formatarCEP($('chk-cep').value);
      saveCheckoutClient();
    }

    async function lookupClientByCpf(btn) {
      const cpfEl = $('chk-cpf');
      const cpf = limparCPF(cpfEl && cpfEl.value);
      if (cpf.length !== 11) {
        if (cpfEl) cpfEl.classList.add('invalid');
        setLookupStatus('Digite os 11 numeros do CPF.', 'error');
        return;
      }
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Consultando...';
      setLookupStatus('Consultando cadastro no Bling...', 'warning');
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const body = new URLSearchParams({ cpf });
        const response = await fetch(CONFIG.CLIENT_LOOKUP_WEBHOOK_URL, {
          method: 'POST',
          body,
          cache: 'default',
          signal: controller.signal
        });
        clearTimeout(timer);
        const text = await response.text();
        let result;
        try { result = JSON.parse(text); }
        catch(e) {
          if (String(text || '').trim().toLowerCase() === 'accepted') {
            throw new Error('Nao conseguimos buscar seus dados agora. Tente novamente.');
          }
          throw new Error('Nao conseguimos buscar seus dados agora.');
        }
        if (!response.ok || result.sucesso === false) throw new Error(result.erro || 'Nao foi possivel buscar seus dados agora.');
        clearCheckoutClientDetails();
        if (!result.encontrado || !result.cliente) {
          state.customerLookupStatus = 'new';
          state.customerLookupCpf = cpf;
          renderCheckout();
          const cpfAfter = $('chk-cpf');
          if (cpfAfter) cpfAfter.value = formatarCPF(cpf);
          setLookupStatus('CPF nao cadastrado. Complete os dados para entrega.', 'warning');
          return;
        }
        state.customerLookupStatus = 'existing';
        state.customerLookupCpf = cpf;
        renderCheckout();
        fillClientFromBling(result.cliente);
        setLookupStatus('Cadastro encontrado. Confira os dados e altere o que for necessario.', 'success');
        if (getActiveCoupon() && getActiveCoupon().grupo === 'cliente_novo') {
          state.couponMessage = 'Este cupom e exclusivo para a primeira compra.';
          state.couponMessageType = 'error';
          renderCheckout();
          fillClientFromBling(result.cliente);
          showToast('Cupom de primeira compra nao elegivel.');
        }
      } catch(err) {
        const message = err && err.name === 'AbortError'
          ? 'Demorou demais. Tente de novo.'
          : (err.message || 'Nao foi possivel buscar seus dados agora.');
        setLookupStatus(message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    }

    function showCheckoutErrors(errors) {
      const alert = $('checkout-alert');
      if (alert) {
        alert.innerHTML = `<strong>Falta preencher:</strong><br>${errors.map(e => '• ' + escapeHtml(e.label)).join('<br>')}`;
        alert.style.display = 'block';
      }
      errors.forEach(e => { const el = $(e.id); if (el) el.classList.add('invalid'); });
      const first = errors.find(e => $(e.id));
      if (first) $(first.id).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    let orderDeliveryProcessing = false;

    function readOrderDeliveryQueue() {
      try {
        const parsed = JSON.parse(localStorage.getItem(CONFIG.ORDER_DELIVERY_QUEUE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(item => item && item.id && item.makePayload) : [];
      } catch(e) {
        return [];
      }
    }

    function writeOrderDeliveryQueue(queue) {
      try {
        const normalized = (Array.isArray(queue) ? queue : [])
          .filter(item => item && item.id && item.makePayload)
          .slice(-CONFIG.ORDER_DELIVERY_MAX_ITEMS);
        localStorage.setItem(CONFIG.ORDER_DELIVERY_QUEUE_KEY, JSON.stringify(normalized));
      } catch(e) {
        console.warn('Não foi possível salvar a fila local de pedidos:', e);
      }
    }

    function updateOrderDeliveryEntry(orderId, changes) {
      const id = String(orderId || '');
      const queue = readOrderDeliveryQueue();
      const index = queue.findIndex(item => String(item.id) === id);
      if (index < 0) return null;
      queue[index] = Object.assign({}, queue[index], changes || {}, { updatedAt: Date.now() });
      writeOrderDeliveryQueue(queue);
      return queue[index];
    }

    function removeOrderDeliveryEntry(orderId) {
      const id = String(orderId || '');
      writeOrderDeliveryQueue(readOrderDeliveryQueue().filter(item => String(item.id) !== id));
    }

    function buildFirebaseOrder(makePayload) {
      const pedido = makePayload && makePayload.pedido ? makePayload.pedido : {};
      const cliente = pedido.cliente || {};
      const nowIso = new Date().toISOString();
      const itens = (Array.isArray(pedido.itens) ? pedido.itens : []).map(item => ({
        produtoId: String(item.produtoId || item.identificadores?.id || ''),
        firebaseKey: String(item.firebaseKey || ''),
        sku: String(item.sku || ''),
        codigo: String(item.sku || ''),
        identificadores: item.identificadores || {
          id: String(item.produtoId || ''),
          firebaseKey: String(item.firebaseKey || ''),
          sku: String(item.sku || ''),
          gtin: String(item.gtin || item.ean || ''),
          ean: String(item.ean || item.gtin || '')
        },
        nome: String(item.nome || ''),
        quantidade: Number(item.qtd || 0),
        preco_unitario: Number(item.price || 0),
        subtotal: roundMoney(Number(item.qtd || 0) * Number(item.price || 0)),
        gtin: String(item.gtin || item.ean || ''),
        ean: String(item.ean || item.gtin || ''),
        url_imagem: String(item.url_imagem || '../site/img/produtos/sem-imagem.webp'),
        gondola: String(item.gondola || 'Z-Sem Gôndola'),
        prateleira: String(item.prateleira || '-'),
        localizacao: String(item.localizacao || ''),
        categoria: String(item.categoria || ''),
        subcategoria: String(item.subcategoria || ''),
        subsubcategoria: String(item.subsubcategoria || ''),
        marca: String(item.marca || ''),
        embalagem: String(item.embalagem || ''),
        status_separacao: 'pendente',
        quantidade_separada: 0,
        separado_em: '',
        separador: ''
      }));

      return {
        id: String(pedido.id || ''),
        numero_pedido: String(pedido.numero || pedido.id || ''),
        idempotency_key: String(pedido.idempotencyKey || pedido.id || ''),
        origem: 'site',
        metadados: pedido.metadados || {},
        status: 'recebido',
        status_separacao: 'pendente',
        criado_em: nowIso,
        atualizado_em: nowIso,
        link_pedido: `${CONFIG.SITE_BASE_URL}/pedido.html?id=${encodeURIComponent(String(pedido.id || ''))}`,
        firebase_path: `/pedidos/${String(pedido.id || '')}`,
        mini_site_interno: `${CONFIG.SITE_BASE_URL}/pedidos.html?id=${encodeURIComponent(String(pedido.id || ''))}`,
        separacao: {
          status: 'pendente',
          iniciado_em: '',
          finalizado_em: '',
          separador: '',
          total_itens: itens.length,
          itens_separados: 0,
          itens_pendentes: itens.length,
          observacoes_internas: ''
        },
        bling: {
          status: 'aguardando_make',
          id_contato: '',
          id_pedido_venda: '',
          numero_pedido_bling: ''
        },
        integracao: {
          whatsapp: 'aberto',
          firebase: 'salvo_pelo_site',
          make: 'pendente',
          criado_pelo_site_em: nowIso
        },
        cliente: {
          nome: String(cliente.nome || 'Cliente Site'),
          cpf: String(cliente.cpf || ''),
          telefone: String(cliente.telefone || ''),
          telefoneFormatado: String(cliente.telefoneFormatado || ''),
          celular: String(cliente.celular || cliente.telefone || ''),
          email: String(cliente.email || '')
        },
        entrega: {
          agendamento: String(cliente.agendamento || ''),
          cep: String(cliente.cep || ''),
          cepFormatado: String(cliente.cepFormatado || ''),
          cidade: String(cliente.cidade || ''),
          uf: String(cliente.uf || 'MT'),
          bairro: String(cliente.bairro || ''),
          rua: String(cliente.rua || ''),
          numero: String(cliente.numero || cliente.casa || ''),
          casa: String(cliente.casa || ''),
          quadra: String(cliente.quadra || ''),
          complemento: String(cliente.complemento || ''),
          frente: String(cliente.frente || ''),
          endereco_completo: [
            String(cliente.rua || ''),
            String(cliente.numero || cliente.casa || ''),
            cliente.quadra ? `Quadra ${cliente.quadra}` : '',
            String(cliente.bairro || ''),
            [String(cliente.cidade || ''), String(cliente.uf || 'MT')].filter(Boolean).join('/'),
            cliente.cepFormatado ? `CEP ${cliente.cepFormatado}` : ''
          ].filter(Boolean).join(', ')
        },
        pagamento: {
          forma: String(cliente.pagamento || ''),
          codigo: String(cliente.pagamentoCodigo || ''),
          total: Number(pedido.total || 0),
          totalProdutos: Number(pedido.totalProdutos || 0),
          desconto: Number(pedido.desconto || 0),
          outrasDespesasBling: Number(pedido.outrasDespesasBling || 0),
          descontoBling: Number(pedido.descontoBling || 0),
          total_texto: fmt(Number(pedido.total || 0))
        },
        cupom: pedido.cupom || null,
        kitPromocional: pedido.kitPromocional || null,
        atacado: pedido.atacado || null,
        validadeQuantidade: pedido.validadeQuantidade || null,
        observacoes: String(pedido.observacoes || ''),
        itens,
        envio: {
          status: 'aguardando_separacao',
          entregador: '',
          saiu_em: '',
          entregue_em: '',
          tentativas: [],
          observacoes: ''
        },
        historico: [{
          data: nowIso,
          acao: 'pedido_recebido_site',
          usuario: 'site',
          observacao: 'Pedido salvo diretamente pelo site antes do processamento do Make/Bling.'
        }],
        controle: {
          pedido_original_site: true,
          bloquear_alteracao_por_whatsapp: true,
          aguardando_processamento_make: true,
          observacao_interna: 'WhatsApp é o canal prioritário. O pedido foi preservado no Firebase e aguarda integração secundária com Make/Bling.'
        }
      };
    }

    function enqueueOrderDelivery(makePayload) {
      const pedido = makePayload && makePayload.pedido ? makePayload.pedido : {};
      const id = String(pedido.id || '');
      if (!id) return null;
      const queue = readOrderDeliveryQueue();
      const existingIndex = queue.findIndex(item => String(item.id) === id);
      const current = existingIndex >= 0 ? queue[existingIndex] : null;
      const entry = {
        id,
        makePayload,
        firebaseOrder: buildFirebaseOrder(makePayload),
        createdAt: current ? current.createdAt : Date.now(),
        updatedAt: Date.now(),
        firebaseStatus: current ? current.firebaseStatus : 'pending',
        makeStatus: current ? current.makeStatus : 'pending',
        makeAttempts: current ? Number(current.makeAttempts || 0) : 0,
        lastMakeAttemptAt: current ? Number(current.lastMakeAttemptAt || 0) : 0,
        lastError: ''
      };
      if (existingIndex >= 0) queue[existingIndex] = entry;
      else queue.push(entry);
      writeOrderDeliveryQueue(queue);
      return entry;
    }

    async function fetchWithTimeout(url, options, timeoutMs) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs || 8000) : null;
      try {
        return await fetch(url, Object.assign({}, options || {}, controller ? { signal: controller.signal } : {}));
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    async function readFirebaseOrder(orderId) {
      try {
        const response = await fetchWithTimeout(`${CONFIG.FIREBASE_ORDERS_URL}/${encodeURIComponent(String(orderId))}.json`, {
          method: 'GET',
          cache: 'default'
        }, 6000);
        if (!response.ok) return null;
        return await response.json();
      } catch(e) {
        return null;
      }
    }

    function firebaseOrderHasBling(order) {
      return !!(order && order.bling && (order.bling.id_pedido_venda || order.bling.numero_pedido_bling));
    }

    async function saveQueuedOrderToFirebase(entry) {
      if (!entry || entry.firebaseStatus === 'sent') return true;
      const response = await fetchWithTimeout(`${CONFIG.FIREBASE_ORDERS_URL}/${encodeURIComponent(String(entry.id))}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.firebaseOrder),
        cache: 'default',
        keepalive: true
      }, 8000);
      if (!response.ok) throw new Error(`Firebase respondeu ${response.status}`);
      updateOrderDeliveryEntry(entry.id, { firebaseStatus: 'sent', lastError: '' });
      return true;
    }

    async function sendQueuedOrderToMake(entry) {
      if (!entry || entry.makeStatus === 'sent') return true;
      const now = Date.now();
      const previousAttempts = Number(entry.makeAttempts || 0);
      const lastAttemptAt = Number(entry.lastMakeAttemptAt || 0);

      if (previousAttempts > 0) {
        const existingOrder = await readFirebaseOrder(entry.id);
        if (firebaseOrderHasBling(existingOrder)) {
          updateOrderDeliveryEntry(entry.id, { firebaseStatus: 'sent', makeStatus: 'sent', lastError: '' });
          return true;
        }
        if (lastAttemptAt && now - lastAttemptAt < CONFIG.ORDER_DELIVERY_RETRY_MS) return false;
      }

      updateOrderDeliveryEntry(entry.id, {
        makeStatus: 'sending',
        makeAttempts: previousAttempts + 1,
        lastMakeAttemptAt: now,
        lastError: ''
      });

      try {
        const response = await fetchWithTimeout(CONFIG.MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.makePayload),
          cache: 'default',
          keepalive: true
        }, 12000);
        if (!response.ok) throw new Error(`Make respondeu ${response.status}`);
        updateOrderDeliveryEntry(entry.id, { makeStatus: 'sent', lastError: '' });
        return true;
      } catch(e) {
        updateOrderDeliveryEntry(entry.id, {
          makeStatus: 'pending',
          lastError: e && e.message ? e.message : 'Falha ao enviar ao Make'
        });
        console.warn(`Pedido ${entry.id} preservado para novo envio ao Make.`, e);
        return false;
      }
    }

    async function processPendingOrderDeliveries(priorityOrderId) {
      if (orderDeliveryProcessing || !navigator.onLine) return;
      orderDeliveryProcessing = true;
      try {
        let queue = readOrderDeliveryQueue();
        if (priorityOrderId) {
          const priority = String(priorityOrderId);
          queue.sort((a, b) => (String(a.id) === priority ? -1 : String(b.id) === priority ? 1 : Number(a.createdAt || 0) - Number(b.createdAt || 0)));
        } else {
          queue.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
        }

        for (const snapshot of queue.slice(0, 4)) {
          let entry = readOrderDeliveryQueue().find(item => String(item.id) === String(snapshot.id));
          if (!entry) continue;

          if (entry.makeStatus === 'sent' && entry.firebaseStatus !== 'sent') {
            const existingOrder = await readFirebaseOrder(entry.id);
            if (existingOrder) updateOrderDeliveryEntry(entry.id, { firebaseStatus: 'sent', lastError: '' });
          }

          entry = readOrderDeliveryQueue().find(item => String(item.id) === String(snapshot.id));
          if (!entry) continue;

          if (entry.firebaseStatus !== 'sent' && entry.makeStatus !== 'sent') {
            try {
              await saveQueuedOrderToFirebase(entry);
            } catch(e) {
              updateOrderDeliveryEntry(entry.id, {
                firebaseStatus: 'pending',
                lastError: e && e.message ? e.message : 'Falha ao salvar no Firebase'
              });
              console.warn(`Pedido ${entry.id} permanece salvo na fila local; Firebase indisponível.`, e);
            }
          }

          entry = readOrderDeliveryQueue().find(item => String(item.id) === String(snapshot.id));
          if (!entry) continue;
          await sendQueuedOrderToMake(entry);

          entry = readOrderDeliveryQueue().find(item => String(item.id) === String(snapshot.id));
          if (entry && entry.firebaseStatus === 'sent' && entry.makeStatus === 'sent') removeOrderDeliveryEntry(entry.id);
        }
      } finally {
        orderDeliveryProcessing = false;
      }
    }

    function bindOrderDeliveryRetryEvents() {
      if (window.__daOrderDeliveryRetryBound) return;
      window.__daOrderDeliveryRetryBound = true;
      window.addEventListener('online', () => setTimeout(() => processPendingOrderDeliveries(), 250), { passive: true });
      window.addEventListener('pageshow', () => setTimeout(() => processPendingOrderDeliveries(), 700), { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') setTimeout(() => processPendingOrderDeliveries(), 350);
      });
      setInterval(() => {
        if (document.visibilityState === 'visible') processPendingOrderDeliveries();
      }, 60000);
    }

    async function sendOrder(btn) {
      const original = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Preparando pedido...';
      }

      const items = getCartItems().filter(i => i.product.isFee || isAvailable(i.product));
      if (!items.filter(i => !i.product.isFee).length) {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        renderCheckout();
        return;
      }
      const pricing = cartPricing(true);
      const totalAtual = pricing.subtotalBefore;
      if (totalAtual < CONFIG.MIN_ORDER) {
        showToast(`Faltam ${fmt(CONFIG.MIN_ORDER - totalAtual)}.`);
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        return;
      }
      const nome = $('chk-nome').value.trim();
      const cpf = limparCPF($('chk-cpf').value);
      const telefone = limparTelefone($('chk-telefone').value);
      const email = $('chk-email').value.trim().toLowerCase();
      const cep = limparCEP($('chk-cep').value);
      const cidade = $('chk-cidade').value.trim();
      const uf = 'MT';
      const bairro = $('chk-bairro').value.trim();
      const rua = $('chk-rua').value.trim();
      const quadra = $('chk-quadra').value.trim();
      const casa = $('chk-casa').value.trim();
      const frente = cleanDeliveryReference($('chk-frente').value);
      const pag = document.querySelector('input[name="pagamento"]:checked')?.value || 'DINHEIRO';
      const agendamentoObj = document.querySelector('input[name="agendamento"]:checked');
      const dataAgendamento = agendamentoObj ? agendamentoObj.value : '';
      const agoraEntrega = getAgoraCuiaba();
      const hojeEntrega = formatDateValue(agoraEntrega);
      const entregaHojeForaHorario = dataAgendamento === hojeEntrega && agoraEntrega.getHours() >= 10;

      const errors = [
        { id: 'agendamento-options-container', label: entregaHojeForaHorario ? 'Entrega para hoje somente ate 10h da manha' : 'Escolha a entrega', valid: !!dataAgendamento && !entregaHojeForaHorario },
        { id: 'chk-nome', label: 'Nome completo', valid: !!nome },
        { id: 'chk-cpf', label: 'CPF com 11 números', valid: cpf.length === 11 },
        { id: 'chk-telefone', label: 'WhatsApp com DDD', valid: telefoneValidoBR(telefone) },
        { id: 'chk-email', label: 'E-mail', valid: emailValido(email) },
        { id: 'chk-cep', label: 'CEP com 8 números', valid: cep.length === 8 },
        { id: 'chk-cidade', label: 'Cidade', valid: !!cidade },
        { id: 'chk-bairro', label: 'Bairro', valid: !!bairro },
        { id: 'chk-rua', label: 'Rua ou avenida', valid: !!rua },
        { id: 'chk-casa', label: 'Número', valid: !!casa },
        { id: 'chk-pagamento', label: 'Pagamento', valid: !!pag },
      ].filter(e => !e.valid);
      document.querySelectorAll('.field.invalid').forEach(el => el.classList.remove('invalid'));
      if (errors.length) {
        showCheckoutErrors(errors);
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        return;
      }

      saveCheckoutClient();
      if (btn) btn.textContent = 'Processando...';

      const orderTimestamp = Date.now();
      const orderNumber = String(orderTimestamp).slice(-6);
      const orderId = `${orderTimestamp}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      let itemsTxt = '';
      let totalBruto = 0;
      let totalTaxasExtras = 0;
      const pedidoItens = [];
      const basketMessage = buildBasketMessageContext();
      const kitContext = kitPromotionContext();

      items.forEach(({id, product, qty}) => {
        if (product.isFee || String(id).startsWith('fee_')) {
          if (String(id).indexOf('fee_kit:') === 0 && !kitContext.activeFeeIds.has(String(id))) return;
          const line = roundMoney(Number(product.price || 0) * qty);
          totalBruto += line;
          totalTaxasExtras += line;
          return;
        }
        const linePricing = cartLinePricing(product, qty, pricing.coupon, pricing.eligibility, kitContext.protectedQtyById[String(id)] || 0);
        const effectivePrice = linePricing.effective;
        const line = linePricing.total;
        totalBruto += line;
        pedidoItens.push({
          produtoId: String(product.id || ''),
          firebaseKey: String(product.firebaseKey || ''),
          sku: String(product.codigo || product.id),
          identificadores: {
            id: String(product.id || ''),
            firebaseKey: String(product.firebaseKey || ''),
            sku: String(product.codigo || product.id || ''),
            gtin: String(product.gtin || ''),
            ean: String(product.ean || product.gtin || '')
          },
          nome: product.name,
          qtd: qty,
          price: effectivePrice,
          precoOriginal: Number(product.price || 0),
          descontoCupom: linePricing.couponDiscountUnitAverage,
          descontoValidadeQuantidade: linePricing.expiryBulkDiscountUnitAverage,
          descontoAtacado: linePricing.wholesaleDiscountUnitAverage,
          gtin: String(product.gtin || ''),
          ean: String(product.ean || product.gtin || ''),
          url_imagem: String(product.url_imagem || product.img || ''),
          gondola: String(product.gondola || 'Z-Sem Gôndola'),
          prateleira: String(product.prateleira || '-'),
          localizacao: String(product.localizacao || ''),
          categoria: String(product.categoria || ''),
          subcategoria: String(product.subcategoria || ''),
          subsubcategoria: String(product.subsubcategoria || ''),
          marca: String(product.marca || ''),
          embalagem: String(product.embalagem || '')
        });
      });

      const totalSite = roundMoney(pricing.total);
      const totalProdutosBling = Math.round((pedidoItens.reduce((sum, item) => sum + Number(item.qtd || 0) * Number(item.price || 0), 0) + Number.EPSILON) * 100) / 100;
      const diferencaBling = Math.round((totalSite - totalProdutosBling + Number.EPSILON) * 100) / 100;
      const outrasDespesasBling = diferencaBling > 0 ? diferencaBling : 0;
      const descontoBling = diferencaBling < 0 ? Math.abs(diferencaBling) : 0;
      const hasBasket = basketMessage.hasBasket;
      const pagamentoBling = normalizarPagamentoParaBling(pag);
      const orderItemIds = pedidoItens.map(item => String(item.produtoId || '')).filter(Boolean);
      const verifiedItemIds = new Set((state.catalogVerifiedItemIds || []).map(String));
      const catalogVerified = Boolean(state.catalogVerifiedAt) && (state.catalogVerifiedAll || orderItemIds.every(id => verifiedItemIds.has(id)));
      const orderCreatedAtIso = new Date(orderTimestamp).toISOString();
      const catalogLoadedAtIso = state.catalogLoadedAt ? new Date(state.catalogLoadedAt).toISOString() : null;
      const catalogValidatedAtIso = catalogVerified && state.catalogVerifiedAt ? new Date(state.catalogVerifiedAt).toISOString() : null;

      const makePayload = {
        pedido: {
          id: orderId,
          numero: orderNumber,
          idempotencyKey: orderId,
          metadados: {
            appVersion: CONFIG.APP_VERSION,
            pedidoCriadoEm: orderCreatedAtIso,
            catalogoCarregadoEm: catalogLoadedAtIso,
            catalogoValidadoEm: catalogValidatedAtIso,
            catalogoFonte: String(state.catalogSource || ''),
            catalogoModo: String(state.catalogMode || ''),
            catalogoReferencia: `${String(state.catalogSource || 'desconhecido')}:${String(state.catalogLoadedAt || 0)}`,
            catalogVerified
          },
          itens: pedidoItens,
          total: totalSite,
          totalProdutos: totalProdutosBling,
          outrasDespesasBling,
          descontoBling,
          desconto: 0,
          cupom: pricing.coupon && pricing.eligibility.eligible ? {
            codigo: pricing.coupon.codigo,
            tipo: pricing.coupon.tipo,
            percentual: Number(pricing.coupon.desconto || 0),
            valorDesconto: pricing.couponDiscount,
            itensParticipantes: pricing.participatingItems
          } : null,
          kitPromocional: pricing.kitDiscount > 0 ? {
            valorDesconto: pricing.kitDiscount
          } : null,
          atacado: pricing.wholesaleDiscount > 0 ? {
            percentual: WHOLESALE_DISCOUNT_RATE * 100,
            quantidadeMinima: WHOLESALE_MIN_QTY,
            valorDesconto: pricing.wholesaleDiscount,
            itensParticipantes: pricing.wholesaleItems
          } : null,
          validadeQuantidade: pricing.expiryBulkDiscount > 0 ? {
            percentual: EXPIRY_BULK_DISCOUNT_RATE * 100,
            quantidadeMinima: WHOLESALE_MIN_QTY,
            diasMaximos: EXPIRY_BULK_MAX_DAYS - 1,
            valorDesconto: pricing.expiryBulkDiscount,
            itensParticipantes: pricing.expiryBulkItems
          } : null,
          observacoes: hasBasket ? 'Pedido com Cesta/Kit' : 'Pedido Comum',
          cliente: {
            nome,
            cpf,
            telefone,
            telefoneFormatado: formatarTelefone(telefone),
            celular: telefone,
            email,
            cep,
            cepFormatado: formatarCEP(cep),
            cidade,
            uf,
            bairro,
            rua,
            quadra,
            casa,
            numero: casa,
            complemento: [quadra ? `Quadra ${quadra}` : '', frente].filter(Boolean).join('. '),
            frente,
            pagamento: pagamentoBling.nome,
            pagamentoCodigo: pagamentoBling.codigo,
            pagamentoIdBling: pagamentoBling.idBling,
            agendamento: dataAgendamento
          }
        }
      };

      const dadosOpcionais = [];
      if (cep) dadosOpcionais.push(`CEP: ${formatarCEP(cep)}`);
      if (rua) dadosOpcionais.push(`Rua: ${rua}`);
      if (quadra) dadosOpcionais.push(`Quadra: ${quadra}`);
      if (casa) dadosOpcionais.push(`Nº: ${casa}`);
      if (frente) dadosOpcionais.push(`Referência para entrega: ${frente}`);
      const dadosCliente = `\n*👤 DADOS PARA ATENDIMENTO*\nNome: ${nome}\nTelefone/WhatsApp: ${formatarTelefone(telefone)}\nCidade: ${cidade}/${uf}\nBairro: ${bairro}${dadosOpcionais.length ? `\n${dadosOpcionais.join('\n')}` : '\nEndereço completo: confirmar no atendimento'}\n📅 *Agendamento:* ${formatOrderDate(dataAgendamento)}\n💳 *Pagamento:* ${pagamentoBling.nome}`;
      itemsTxt = buildGroupedItemsText(items, basketMessage);
      const basketHeader = basketMessage.headers.length ? `\n${basketMessage.headers.join('\n')}` : '';
      const removedSection = hasBasket
        ? `\n\n*PRODUTOS RETIRADOS DA CESTA ORIGINAL*\n${basketMessage.removed.length ? basketMessage.removed.join(', ') : 'Nenhum produto retirado.'}`
        : '';
      const couponSummary = pricing.couponDiscount > 0 ? `\n🏷️ *CUPOM:* − ${fmt(pricing.couponDiscount)}` : '';
      const kitSummary = pricing.kitDiscount > 0 ? `\n🎁 *DESCONTO DO KIT:* − ${fmt(pricing.kitDiscount)}` : '';
      const expiryBulkSummary = pricing.expiryBulkDiscount > 0 ? `\n⏳ *VALIDADE + 3 UNIDADES:* − ${fmt(pricing.expiryBulkDiscount)}` : '';
      const wholesaleSummary = pricing.wholesaleDiscount > 0 ? `\n📦 *DESCONTO ATACADO:* − ${fmt(pricing.wholesaleDiscount)}` : '';
      const savingsSummary = pricing.discount > 0 ? `\n✅ *ECONOMIA TOTAL:* − ${fmt(pricing.discount)}` : '';
      const msg = `*PEDIDO #${orderNumber}*${basketHeader}\n*ENTREGA:* ${formatOrderDate(dataAgendamento)}\n------------------------------\n*ITENS SELECIONADOS*\n${itemsTxt}\n*RESUMO DE VALORES*\nValor normal sem descontos: ${fmt(pricing.subtotalBefore)}${couponSummary}${kitSummary}${expiryBulkSummary}${wholesaleSummary}${savingsSummary}\n💰 *TOTAL FINAL:* ${fmt(totalSite)}\n------------------------------${dadosCliente}\n------------------------------\nOlá! Gostaria de confirmar este pedido e o endereço de entrega.${removedSection}`;

      // Preserva o pedido localmente antes de abrir o WhatsApp. Nenhuma chamada de rede bloqueia o cliente.
      enqueueOrderDelivery(makePayload);

      // Prioridade absoluta: o WhatsApp é aberto primeiro.
      abrirWhatsAppPedido(msg);
      closeCheckout();
      showToast('Pedido pronto no WhatsApp.');

      // A conferência do Firebase acontece somente depois da abertura do WhatsApp.
      // Ela não altera, bloqueia ou reescreve o pedido enviado ao cliente.
      setTimeout(() => validateLiveCatalogBeforeOrder(), 0);

      // Firebase e Make são processados em segundo plano. Se o navegador suspender a página,
      // a fila local será retomada quando o cliente voltar, ficar online ou abrir o site novamente.
      setTimeout(() => processPendingOrderDeliveries(orderId), 80);
      setTimeout(() => { if (btn) { btn.disabled = false; btn.innerHTML = original; } }, 1500);
    }

    function normalizarPagamentoParaBling(pagamento) {
      const codigo = String(pagamento || '').trim().toUpperCase();
      const nomes = {
        DINHEIRO: 'Dinheiro',
        PIX: 'Pix',
        CARTAO_DE_DEBITO: 'Cartão de Débito',
        CARTAO_DE_CREDITO: 'Cartão de Crédito',
        VALE_ALIMENTACAO: 'Vale Alimentação',
        VALE_REFEICAO: 'Vale Refeição'
      };
      return { codigo, nome: nomes[codigo] || pagamento || '', idBling: '' };
    }

    function abrirWhatsAppPedido(mensagem) {
      const texto = encodeURIComponent(mensagem);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const urlMobile = `https://api.whatsapp.com/send?phone=${CONFIG.WHATSAPP_NUMBER}&text=${texto}&type=phone_number&app_absent=0`;
      const urlDesktop = `https://web.whatsapp.com/send?phone=${CONFIG.WHATSAPP_NUMBER}&text=${texto}`;
      const link = document.createElement('a');
      link.href = isMobile ? urlMobile : urlDesktop;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function showToast(message) {
      const el = $('toast');
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => el.classList.remove('show'), 1800);
    }

    function updateMeta(title, description, path) {
      document.title = title;
      const meta = $('meta-description');
      if (meta) meta.setAttribute('content', description);
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', CONFIG.SITE_BASE_URL + (path || '/'));
    }

    function updateProductStructuredData(p) {
      let el = document.getElementById('product-jsonld');
      if (!p) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = 'product-jsonld';
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.name,
        image: (p.images && p.images.length ? p.images : [p.img]).filter(Boolean),
        description: p.descricao || `${p.categoria}${p.embalagem ? ' - ' + p.embalagem : ''}`,
        sku: p.codigo || p.id,
        gtin13: p.gtin || p.ean || undefined,
        brand: p.marca ? {'@type':'Brand', name:p.marca} : undefined,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'BRL',
          price: String(productDisplayPricing(p).effective || p.price || 0),
          availability: isAvailable(p) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: CONFIG.SITE_BASE_URL + `/#/produto/${encodeURIComponent(productRouteKey(p))}`
        }
      });
    }

    function bindEvents() {
      window.addEventListener('hashchange', () => {
        handleRoute();
        requestAnimationFrame(scrollPageTop);
      });
      $('search-input').addEventListener('input', runInstantSearch);
      $('search-form').addEventListener('submit', e => { e.preventDefault(); const q = $('search-input').value.trim(); state.searchQuery = q; if (q) { const target = '#/busca/' + encodeURIComponent(q); if ((location.hash || '') !== target) location.hash = target; else renderSearch(q); scrollPageTop(); } });
      $('search-clear').addEventListener('click', clearSearch);
      $('bottom-cta').addEventListener('click', openCheckout);
      $('nav-cart').addEventListener('click', openCheckout);
      const headerCartBtn = $('header-cart-btn');
      const headerMenuBtn = $('header-menu-btn');
      const menuClose = $('menu-close');
      const menuOpenCheckout = $('menu-open-checkout');
      const basketConfirmOverlay = $('basket-confirm-overlay');
      const basketConfirmContinue = $('basket-confirm-continue');
      const basketConfirmView = $('basket-confirm-view');
      if (headerCartBtn) headerCartBtn.addEventListener('click', openCheckout);
      if (headerMenuBtn) headerMenuBtn.addEventListener('click', openSiteMenu);
      if (menuClose) menuClose.addEventListener('click', closeSiteMenu);
      if (menuOpenCheckout) menuOpenCheckout.addEventListener('click', openCheckout);
      if (basketConfirmContinue) basketConfirmContinue.addEventListener('click', continueShoppingAfterBasket);
      if (basketConfirmView) basketConfirmView.addEventListener('click', openCheckout);
      if (basketConfirmOverlay) basketConfirmOverlay.addEventListener('click', e => {
        if (e.target === basketConfirmOverlay) closeBasketConfirmation();
      });
      $('drawer-close').addEventListener('click', closeCheckout);
      $('drawer-overlay').addEventListener('click', closeAllDrawers);
      const siteMenuDrawer = $('site-menu-drawer');
      if (siteMenuDrawer) siteMenuDrawer.addEventListener('click', e => {
        if (e.target.closest('a')) closeSiteMenu();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          closeAllDrawers();
          return;
        }
        trapDrawerFocus(e);
      });
      document.addEventListener('click', e => {
        const productLink = e.target.closest('a[href^="#/produto/"]');
        if (!productLink) return;
        const current = location.hash || '#/';
        if (!current.startsWith('#/produto')) {
          try { sessionStorage.setItem('da_last_product_from', current); } catch(err) {}
        }
      }, true);
      document.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (action === 'toggle-favorite') { toggleFavorite(id, btn.getAttribute('data-favorite-kind')); return; }
        if (action === 'add') addToCart(id, 1);
        if (action === 'inc') addToCart(id, 1);
        if (action === 'dec') setQty(id, Number(state.cart[id] || 0) - 1);
        if (action === 'add-basket') addBasketToCart(id);
        if (action === 'add-kit') addKitToCart(id);
        if (action === 'basket-inc') setBasketDraftQty(btn.getAttribute('data-basket-id'), id, Number((state.basketDrafts[btn.getAttribute('data-basket-id')] || {})[id] || 0) + 1);
        if (action === 'basket-dec') setBasketDraftQty(btn.getAttribute('data-basket-id'), id, Number((state.basketDrafts[btn.getAttribute('data-basket-id')] || {})[id] || 0) - 1);
        if (action === 'add-basket-custom') addBasketCustomToCart(id);
        if (action === 'clear-cart') clearCart();
        if (action === 'activate-coupon') activateCoupon(btn.getAttribute('data-code'));
        if (action === 'apply-coupon') {
          const input = $('coupon-code');
          activateCoupon(input ? input.value : '');
        }
        if (action === 'remove-coupon') removeCoupon();
        if (action === 'detail-image') {
          const main = $('product-main-image');
          if (main) {
            main.src = btn.getAttribute('data-src') || main.src;
            main.alt = btn.getAttribute('data-alt') || main.alt;
          }
          document.querySelectorAll('.detail-thumb.active').forEach(el => el.classList.remove('active'));
          btn.classList.add('active');
        }
      });
      document.addEventListener('input', e => {
        const el = e.target;
        if (!el || !el.id || !el.id.startsWith('chk-')) return;
        if (el.id === 'chk-cpf') {
          el.value = formatarCPF(el.value);
          if (state.customerLookupStatus !== 'unknown' && limparCPF(el.value) !== state.customerLookupCpf) {
            state.customerLookupStatus = 'unknown';
            state.customerLookupCpf = '';
            clearCheckoutClientDetails();
            const details = $('client-details');
            if (details) details.hidden = true;
            const sendButton = $('btn-send-order');
            if (sendButton) sendButton.disabled = true;
            setLookupStatus('CPF alterado. Toque em Continuar para consultar novamente.', 'warning');
          }
        }
        if (el.id === 'chk-cep') el.value = formatarCEP(el.value);
        if (el.id === 'chk-telefone') {
          const nums = telefoneSomenteNumeros(el.value);
          el.value = nums ? el.value : '';
        }
        el.classList.remove('invalid');
        saveCheckoutClient();
      });
      document.addEventListener('change', e => {
        const el = e.target;
        if (!el || !el.id || !el.id.startsWith('chk-')) return;
        if (el.id === 'chk-telefone') el.value = formatarTelefone(el.value);
        if (el.name === 'pagamento' && el.checked) state.checkoutPayment = el.value || 'DINHEIRO';
        saveCheckoutClient();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target && e.target.id === 'coupon-code') {
          e.preventDefault();
          activateCoupon(e.target.value);
        }
      });
      document.addEventListener('click', e => {
        const lookup = e.target.closest('#btn-lookup-client');
        if (lookup) {
          lookupClientByCpf(lookup);
          return;
        }
        const menuCheckout = e.target.closest('#menu-open-checkout');
        if (menuCheckout) { openCheckout(); return; }
        const send = e.target.closest('#btn-send-order');
        if (send) sendOrder(send);
      });
    }


    async function init() {
      try { sessionStorage.removeItem('da_version_reload_attempts_v1'); } catch(e) {}
      bindEvents();
      bindOrderDeliveryRetryEvents();
      setTimeout(() => processPendingOrderDeliveries(), 900);
      enforceAppVersion();
      // Monitor da versão oficial desativado na página paralela.
      loadFavorites();
      loadCart();
      updateCartUI();
      app.innerHTML = `<div class="container da-stable-loading-shell" aria-busy="true" aria-label="Carregando catálogo"><div class="da-stable-loading-hero"></div><div class="da-stable-loading-row"></div><div class="da-stable-loading-row"></div></div>`;

      const home = isHomeRoute();

      try {
        if (home) {
          // Home estável: carrega os dados necessários em paralelo e faz uma única renderização completa.
          // Evita o efeito de partes da página aparecendo em momentos diferentes.
          const auxPromise = Promise.allSettled([loadCestas(), loadKits(), loadCoupons()]);
          let homeCatalogError = null;
          try {
            await loadHomeProducts();
          } catch (err) {
            homeCatalogError = err;
            console.warn('Catálogo leve indisponível; tentando Firebase completo:', err && err.message ? err.message : err);
            await loadProducts();
          }
          await auxPromise;

          state.isReady = true;
          rebuildVirtualFees();
          renderSiteMenuContent();
          removeMissingCartItems();
          handleRoute();
          updateCartUI();
          if (window.__DA_BOOT_REVEAL_TIMER__) clearTimeout(window.__DA_BOOT_REVEAL_TIMER__);
          requestAnimationFrame(() => {
            document.documentElement.classList.remove('da-pagespeed-booting');
          });
          if (homeCatalogError) console.info('Home carregada pelo catálogo completo após falha do catálogo leve.');
          return;
        }

        // Rotas de produto/categoria/busca entram com o catálogo completo para evitar detalhe incompleto.
        await Promise.all([
          loadProducts(),
          Promise.allSettled([loadCestas(), loadKits(), loadCoupons()])
        ]);
        state.isReady = true;
        rebuildVirtualFees();
        renderSiteMenuContent();
        removeMissingCartItems();
        handleRoute();
        updateCartUI();
      } catch(err) {
        console.error(err);
        app.innerHTML = `<div class="container"><div class="empty"><strong>Não conseguimos carregar o catálogo.</strong>Tente novamente em alguns instantes.</div></div>`;
      }
    }
/* DA_SITE_BANNERS_CONTEXTUAIS_E_OFERTAS_CESTAS_V6_20260711 */
(function(){
  function daSiteLooksLikeBanner(value){
    if(!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return !!(value.id || value.banner_id || value.imagem || value.image || value.img || value.arquivo || value.arquivos || value.imagens || value.exibicao || value.posicao || value.position || value.titulo || value.title || value.link);
  }
  function daSiteBannerEntries(value){
    const src = value && typeof value === 'object' ? value : {};
    const candidates = [src.banners,src.items,src.lista,src.ativos,src.banner,src.data?.banners,src.catalogo?.banners,src.catalog?.banners];
    let selected = candidates.find(item => Array.isArray(item) || (item && typeof item === 'object' && Object.values(item).some(daSiteLooksLikeBanner)));
    if(!selected && Array.isArray(value)) selected = value;
    if(!selected && !Array.isArray(value)) selected = src;
    if(Array.isArray(selected)) return selected.map((raw,index)=>({raw,key:String(raw?.id || raw?.banner_id || index)}));
    return Object.entries(selected || {}).filter(([,raw])=>daSiteLooksLikeBanner(raw)).map(([key,raw])=>({raw,key}));
  }
  function daSiteBannerImageValues(raw){
    const values = [
      raw?.imagem,raw?.imagem_url,raw?.image,raw?.img,raw?.arquivo,raw?.arquivo_imagem,raw?.caminho,raw?.path,
      raw?.mobile,raw?.desktop,raw?.mobile_url,raw?.desktop_url,
      raw?.arquivos?.principal,raw?.arquivos?.mobile,raw?.arquivos?.desktop,raw?.arquivos?.imagem,
      raw?.imagens?.principal,raw?.imagens?.mobile,raw?.imagens?.desktop,raw?.assets?.imagem,raw?.assets?.mobile,raw?.assets?.desktop
    ];
    return [...new Set(values.map(value=>String(value || '').trim()).filter(Boolean))];
  }
  function daSiteNormalizeLink(raw){
    const source = raw?.link ?? raw?.destino ?? raw?.href ?? raw?.link_url ?? raw?.url_destino;
    if(source && typeof source === 'object') return {tipo:String(source.tipo || source.type || 'rota'),valor:String(source.valor || source.value || source.href || source.url || '')};
    const value = String(source || '').trim();
    if(value) return {tipo:/^https?:/i.test(value)?'url':'rota',valor:value};
    const productValue = raw?.produto_codigo || raw?.produto_id || raw?.firebaseKey || raw?.produto?.codigo || raw?.produto?.firebaseKey || '';
    return productValue ? {tipo:'produto',valor:String(productValue)} : null;
  }
  function daSiteNormalizeOrigin(raw){
    if(raw?.origem && typeof raw.origem === 'object'){
      const origin = {...raw.origem};
      if(!Array.isArray(origin.produtos)) origin.produtos = origin.produto ? [origin.produto] : [];
      return origin;
    }
    const product = raw?.produto && typeof raw.produto === 'object' ? raw.produto : null;
    const value = raw?.produto_id || raw?.produto_codigo || raw?.firebaseKey || product?.firebaseKey || product?.codigo || product?.id || '';
    if(value) return {tipo:'produto',valor:String(value),produtos:[product || {firebaseKey:raw?.firebaseKey,codigo:raw?.produto_codigo,id:raw?.produto_id,nome:raw?.produto_nome,categoria:raw?.categoria}]};
    return {tipo:String(raw?.tipo_conteudo || raw?.tipo || 'personalizado'),valor:'',produtos:[]};
  }

  applyBannersData = function(data){
    const settings = data && data.settings ? data.settings : (data?.configuracao || {});
    const carousel = settings.carousel || data?.configuracao_carrossel || data?.carousel_config || data?.configuracao || {};
    const queue = settings.banner_queue || settings.fila_banners || {};
    state.bannerConfig = {
      desktop_columns: Math.max(1, Number(carousel.desktop_columns || 4)),
      tablet_columns: Math.max(1, Number(carousel.tablet_columns || 3)),
      mobile_columns: Math.max(1, Number(carousel.mobile_columns || 2)),
      show_arrows: carousel.show_arrows !== false && carousel.manual !== false,
      show_dots: carousel.show_dots !== false,
      show_hint: carousel.show_hint !== false,
      autoplay: carousel.autoplay === true || carousel.automatico === true,
      intervalo_ms: Math.max(3000, Number(carousel.intervalo_ms || carousel.interval || 5200)),
      loop: carousel.loop === true,
      pausar_hover: carousel.pausar_hover !== false,
      queue_capacity: Math.min(12, Math.max(4, Number(queue.capacity_per_space || queue.capacidade_por_posicao || 12))),
      visible_limit: Math.min(4, Math.max(1, Number(queue.visible_at_once || queue.visiveis_por_vez || 4))),
      queue_interval_ms: Math.max(5000, Number(queue.rotation_interval_ms || queue.intervalo_rotacao_ms || 9000)),
      queue_random: queue.random !== false && queue.aleatoria !== false
    };
    const aliases = {
      'home.inicio':'home.hero',
      'home.cestas':'cestas.topo','home.cestas.topo':'cestas.topo',
      'home.kits':'kits.topo','home.kits.topo':'kits.topo',
      'home.mercado':'home.compra-mes.topo',
      'home.ofertas':'ofertas.topo','home.ofertas.topo':'ofertas.topo',
      'home.limpeza.topo':'rotina.limpeza.topo',
      'home.cafe.topo':'rotina.cafe.topo',
      'home.categorias.topo':'categorias.topo'
    };
    const seen = new Set();
    state.banners = daSiteBannerEntries(data).map(({raw,key},index)=>{
      if(!raw || typeof raw !== 'object') return null;
      const exhibition = raw.exibicao && typeof raw.exibicao === 'object' ? raw.exibicao : {};
      let local = String(exhibition.local || raw.posicao || raw.position || raw.local || raw.slot || 'home.hero').trim();
      let target = String(exhibition.alvo || raw.alvo || raw.target || raw.destino_exibicao || '').trim();
      local = aliases[local] || local;
      const dynamic = local.match(/^(categoria|subcategoria|marca|produto|kit|cesta)(?:::|\.)(.+?)(?:\.topo)?$/i);
      if(dynamic){local=dynamic[1].toLowerCase();target=target || dynamic[2];}
      const images = daSiteBannerImageValues(raw).map(normalizeBannerImage).filter(Boolean);
      const period = raw.periodo && typeof raw.periodo === 'object' ? raw.periodo : {};
      const id = String(raw.id || raw.banner_id || raw.slug || key || `banner-${index+1}`);
      return {
        id,
        ativo: raw.ativo !== false && raw.active !== false && String(raw.status || '').toLowerCase() !== 'inativo',
        local,
        alvo:target,
        ordem:Number(exhibition.ordem ?? raw.ordem ?? raw.order ?? index+1),
        imagem:images[0] || '',
        imagens:images,
        titulo:String(raw.titulo || raw.title || raw.nome || ''),
        alt:String(raw.alt || raw.titulo || raw.title || raw.nome || 'Destaque Dona Antônia'),
        link:daSiteNormalizeLink(raw),
        periodo:{inicio:period.inicio || raw.inicio || raw.data_inicio || raw.inicio_oferta || null,fim:period.fim || raw.fim || raw.data_fim || raw.validade_oferta || null},
        origem:daSiteNormalizeOrigin(raw),
        tipo_conteudo:String(raw.tipo_conteudo || raw.tipo || raw?.origem?.tipo || 'personalizado'),
        automacao:raw.automacao && typeof raw.automacao === 'object' ? {...raw.automacao} : {},
        oferta:raw.oferta && typeof raw.oferta === 'object' ? {...raw.oferta} : {}
      };
    }).filter(banner=>{
      if(!banner || !banner.id || !banner.imagem || seen.has(banner.id)) return false;
      seen.add(banner.id); return true;
    }).sort((a,b)=>a.ordem-b.ordem || a.id.localeCompare(b.id,'pt-BR'));
  };

  function daSiteProductByReference(value){
    const raw = String(value || '').trim();
    if(!raw) return null;
    const normalized = norm(raw);
    return state.products.find(product=>[product.id,product.firebaseKey,product.codigo,product.gtin,product.ean,product.name].some(candidate=>norm(String(candidate || '')) === normalized)) || null;
  }
  function daSiteBannerProducts(banner){
    const refs = Array.isArray(banner?.origem?.produtos) ? banner.origem.produtos : [];
    const products = refs.map(ref=>daSiteProductByReference(ref?.firebaseKey || ref?.codigo || ref?.id || ref?.gtin || ref?.ean || ref?.nome)).filter(Boolean);
    if(banner?.origem?.tipo === 'produto'){
      const product = daSiteProductByReference(banner.origem.valor);
      if(product) products.push(product);
    }
    if(norm(banner?.link?.tipo) === 'produto'){
      const product = daSiteProductByReference(banner.link.valor);
      if(product) products.push(product);
    }
    return [...new Map(products.map(product=>[product.id,product])).values()];
  }
  function daSiteBannersForCategories(categories){
    const wanted = new Set((categories || []).map(category=>norm(category)).filter(Boolean));
    if(!wanted.size) return [];
    return state.banners.filter(banner=>bannerIsCurrent(banner) && daSiteBannerProducts(banner).some(product=>wanted.has(norm(product.categoria))));
  }
  function daSiteUniqueBanners(list){
    const seen = new Set();
    return (list || []).filter(banner=>banner && !seen.has(banner.id) && seen.add(banner.id));
  }
  function daSiteBannerListHtml(position,banners,label){
    const capacity = Math.min(12, Math.max(4, Number(state.bannerConfig.queue_capacity || 12)));
    const visibleLimit = Math.min(4, Math.max(1, Number(state.bannerConfig.visible_limit || 4)));
    const list = bannersInAccessOrder(position, daSiteUniqueBanners(banners).filter(bannerIsCurrent)).slice(0,capacity);
    if(!list.length) return '';
    const hint = state.bannerConfig.show_hint === false ? '' : (list.length > visibleLimit ? `${visibleLimit} de ${list.length} por vez · alternância automática` : 'Destaques disponíveis');
    scheduleBannerSetup();
    return `<section class="da-banner-zone" data-banner-zone data-banner-position="${escapeHtml(position)}" data-banner-queue-total="${list.length}" aria-label="${escapeHtml(label || 'Destaques selecionados')}">
      <div class="da-banner-zone-head"><div><strong>${escapeHtml(label || 'Destaques selecionados')}</strong><span>${escapeHtml(hint)}</span></div><span class="da-banner-page-counter" data-banner-counter>1 / 1</span></div>
      <div class="da-banner-track" data-banner-track>${list.map((banner,index)=>bannerCardHtml(banner,index,index<2,index>=visibleLimit)).join('')}</div>
      <div class="da-banner-controls"><div class="da-banner-arrows"><button class="da-banner-arrow" type="button" data-banner-prev aria-label="Ver banners anteriores">‹</button><button class="da-banner-arrow" type="button" data-banner-next aria-label="Ver próximos banners">›</button></div><div class="da-banner-dots" data-banner-dots aria-label="Páginas do carrossel"></div></div>
    </section>`;
  }

  window.__daSiteBannerListHtml = daSiteBannerListHtml;

  renderCategory = function(cat){
    const decoded = decodeURIComponent(cat || '');
    const products = state.products.filter(product=>isAvailable(product) && norm(product.categoria) === norm(decoded));
    const canonicalCategory = products[0]?.categoria || decoded;
    const subs = Array.from(new Set(products.map(product=>product.subcategoria).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const currentSub = new URLSearchParams(location.hash.split('?')[1] || '').get('sub') || 'Todos';
    const filtered = currentSub === 'Todos' ? products : products.filter(product=>norm(product.subcategoria) === norm(currentSub));
    const chips = `<div class="chips"><a class="chip ${currentSub === 'Todos' ? 'active' : ''}" href="#/categoria/${encodeURIComponent(canonicalCategory)}">Todos</a>${subs.map(sub=>`<a class="chip ${currentSub === sub ? 'active' : ''}" href="#/categoria/${encodeURIComponent(canonicalCategory)}?sub=${encodeURIComponent(sub)}">${escapeHtml(sub)}</a>`).join('')}</div>`;
    const isBeauty = /(beleza|higiene|perfumaria)/.test(norm(canonicalCategory));
    const directCategory = getBanners('categoria',canonicalCategory);
    const productCategory = daSiteBannersForCategories([canonicalCategory]);
    const categoryBanners = daSiteBannerListHtml('categoria-contextual',daSiteUniqueBanners([...directCategory,...productCategory]),`Destaques de ${canonicalCategory}`);
    const subcategoryBanners = currentSub !== 'Todos' ? bannerSlotHtml('subcategoria',{targets:[currentSub,`${canonicalCategory}::${currentSub}`],label:`Destaques de ${currentSub}`}) : '';
    app.innerHTML = `<div class="container">${pageHeader(canonicalCategory,`${filtered.length} produtos encontrados`,'#/categorias')}${categoryBanners}${subcategoryBanners}${isBeauty ? beautyBannerHtml(products) : ''}${chips}<div class="product-grid">${filtered.map(product=>productCard(product)).join('')}</div></div>`;
    setActiveNav('categorias');
    updateMeta(`${canonicalCategory} - Dona Antônia`,`Compre ${canonicalCategory.toLowerCase()} com entrega em Cuiabá e Várzea Grande.`,`/?categoria=${encodeURIComponent(canonicalCategory)}`);
  };

  renderSearch = function(query){
    const q = String(query || '').trim();
    state.searchQuery = q;
    const searchInput = $('search-input');
    if(searchInput && document.activeElement !== searchInput && searchInput.value !== q) searchInput.value = q;
    updateSearchButtons();
    const products = searchProducts(q);
    const categories = [...new Set(products.map(product=>product.categoria).filter(Boolean))];
    const contextual = daSiteBannersForCategories(categories).slice(0,16);
    const contextualHtml = q && contextual.length ? daSiteBannerListHtml('busca-categoria-contextual',contextual,'Ofertas relacionadas à sua busca') : '';
    app.innerHTML = `<div class="container">${pageHeader(q ? `Busca: ${q}` : 'Busca',q ? `${products.length} resultado(s)` : 'Digite o produto na busca acima.','#/')}${q ? (products.length ? `<div class="product-list">${products.map(product=>productCard(product,'list')).join('')}</div>` : `<div class="empty"><strong>Nenhum produto encontrado</strong>Não achamos nada para "${escapeHtml(q)}". Tente buscar pelo nome exato, marca ou embalagem.</div>`) : ''}${contextualHtml}${bannerSlotHtml('busca.topo',{kind:'section'})}</div>`;
    setActiveNav('home');
  };

  renderBasketDetail = function(basketId){
    const {basket,rows} = getBasketLines(basketId);
    if(!basket){
      app.innerHTML = `<div class="container">${pageHeader('Cesta não encontrada','','#/cestas')}<div class="empty"><strong>Não encontramos essa cesta</strong>Volte e escolha outra opção.</div></div>`;
      return;
    }
    const draft = ensureBasketDraft(basket.id);
    const total = basketDraftTotal(basket.id);
    const draftChanged = basketDraftChanged(basket.id);
    const standardPrice = basket.preco ? Number(basket.preco) : basketDefaultProductTotal(basket.id);
    const originalPrice = Math.max(Number(basket.precoOriginal || 0), standardPrice);
    const basketProductIds = new Set(rows.map(row=>String(row.product?.id || '')));
    const allOffers = getTopOffers(240);
    const offers = [...allOffers.filter(product=>!basketProductIds.has(String(product.id))),...allOffers.filter(product=>basketProductIds.has(String(product.id)))].slice(0,24);
    app.innerHTML = `<div class="container basket-detail-container kit-detail-container">${pageHeader(basket.nome,'','#/cestas')}${bannerSlotHtml('cesta',{targets:[basket.id,basket.nome].filter(Boolean),label:`Destaque de ${basket.nome}`})}
      <article class="kit-deal-card basket-deal-card">
        <div class="kit-deal-top kit-deal-top-stacked">
          <div class="kit-deal-media basket-deal-media"><img class="kit-deal-img" src="${escapeHtml(basket.imagem)}" alt="${escapeHtml(basket.nome)}" onerror="window.__daFallbackImg(this)"></div>
          <div class="kit-deal-copy">
            <div class="kit-badge-row"><span class="basket-type-badge">Cesta básica</span></div>
            <h2 class="kit-deal-title">${escapeHtml(basket.nome)}</h2>
            <div class="kit-price-box">${originalPrice > standardPrice ? `<div class="old-price">De ${fmt(originalPrice)}</div>` : ''}<div class="kit-price-main">${fmt(standardPrice)}</div></div>
            <button class="add-btn" type="button" data-action="add-basket" data-id="${escapeHtml(basket.id)}">Adicionar cesta padrão</button>
          </div>
        </div>
        <details class="kit-description-toggle"><summary>Ver detalhes da cesta</summary><p>${escapeHtml(basket.descricao || 'Cesta básica pronta e editável.')}</p></details>
      </article>
      <section class="section kit-products-section basket-products-section"><div class="section-head"><div><h2 class="section-title">Produtos da cesta</h2><p class="section-caption">Ajuste as quantidades antes de adicionar a cesta.</p></div></div>${rows.length ? `<div class="basket-editor">${rows.map(({product})=>{const qty=Number(draft[product.id]||0);return `<div class="basket-editor-row" data-basket-row="${escapeHtml(product.id)}"><a class="basket-product-image-link" href="#/produto/${productRouteKey(product)}" aria-label="Abrir ${escapeHtml(product.name)}"><img src="${escapeHtml(product.img)}" data-fallback-images="${escapeHtml(imageFallbackList(product.images))}" alt="${escapeHtml(product.name)}" onerror="window.__daFallbackImg(this)"></a><div><a class="basket-editor-name" href="#/produto/${productRouteKey(product)}">${escapeHtml(product.name)}</a><div class="basket-editor-price">${fmt(product.price)} cada</div></div><div class="cart-qty"><button type="button" data-action="basket-dec" data-basket-id="${escapeHtml(basket.id)}" data-id="${escapeHtml(product.id)}">−</button><span>${qty}</span><button type="button" data-action="basket-inc" data-basket-id="${escapeHtml(basket.id)}" data-id="${escapeHtml(product.id)}">+</button></div></div>`;}).join('')}</div>` : `<div class="empty"><strong>Itens não localizados</strong>Não conseguimos relacionar os produtos dessa cesta ao cadastro atual.</div>`}</section>
      <section class="basket-total-card"><div class="summary-row"><span>Valor da cesta padrão</span><span>${fmt(standardPrice)}</span></div><div class="summary-row total"><span>Total da cesta editada</span><span>${fmt(total)}</span></div><div class="desc">O valor é recalculado conforme você retira ou adiciona unidades.</div><button class="send-btn" type="button" data-action="add-basket-custom" data-id="${escapeHtml(basket.id)}" ${rows.length ? '' : 'disabled'}>Adicionar cesta ${draftChanged ? 'alterada' : 'padrão'}</button></section>
      ${offers.length ? `<section class="section basket-detail-offers"><div class="section-head"><div><h2 class="section-title">Ofertas para completar sua compra</h2><p class="section-caption">Produtos promocionais exibidos depois da lista completa da cesta.</p></div><a class="see-all" href="#/ofertas">Ver todas</a></div><div class="product-grid">${offers.map(product=>productCard(product)).join('')}</div></section>` : ''}
    </div>`;
    setActiveNav('home');
    updateOfferCountdowns();
  };
  if(!document.getElementById('daSiteV6Styles')){
    const style = document.createElement('style');
    style.id = 'daSiteV6Styles';
    style.textContent = `.basket-detail-offers{margin-top:28px;padding-top:20px;border-top:2px solid var(--line)}.basket-detail-offers .product-grid{margin-top:4px}`;
    document.head.appendChild(style);
  }
})();

    /* DONA ANTÔNIA — HOME MODULAR V1 + BANNERS CONTEXTUAIS POR PRODUTO */
    (function(){
      function daHomeSectionHead(title, caption, href, label){
        return `<div class="da-home-section-head"><div><h2>${escapeHtml(title)}</h2>${caption ? `<p>${escapeHtml(caption)}</p>` : ''}</div>${href ? `<a href="${escapeHtml(href)}">${escapeHtml(label || 'Ver todos')}<span aria-hidden="true">→</span></a>` : ''}</div>`;
      }
    
      function daHomeProductImage(product, className){
        return `<img class="${className || ''}" loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(product.img)}" data-fallback-images="${escapeHtml(imageFallbackList(product.images))}" alt="${escapeHtml(product.name)}" onerror="window.__daFallbackImg(this)">`;
      }
    
      function daHomeControls(product, extraClass){
        const id = String(product.id);
        const qty = Number(state.cart[id] || 0);
        return `<div class="${extraClass || ''}" data-card-controls="${escapeHtml(id)}" data-control-mode="card">${productCardControlsHtml(id, qty, !isAvailable(product))}</div>`;
      }
    
      function daHomeStandardShelfHtml(title, caption, products, href, tone){
        const items = daHomeUniqueProducts((products || []).filter(isAvailable)).slice(0,4);
        if(!items.length) return '';
        const bandClass = tone ? ` da-home-band da-home-band-${escapeHtml(tone)}` : '';
        return `<section class="da-home-section da-home-standard-section${bandClass}" data-home-section="standard">${daHomeSectionHead(title,caption,href,'Ver todos')}<div class="da-home-standard-grid">${items.map(product=>productCard(product)).join('')}</div></section>`;
      }

      function daHomeHereTemProducts(){
        const available = state.products.filter(isAvailable);
        const takeDiversified = (category, limit) => daHomeRandomizedDiverseProducts(
          available.filter(product => norm(product.categoria) === norm(category)),
          limit
        );
        const groups = [
          takeDiversified('UTENSÍLIOS E UTILIDADES', 10),
          takeDiversified('TEMPEROS', 6),
          takeDiversified('PETS', 4)
        ];
        const panel = [];
        let row = 0;
        while (panel.length < 20 && groups.some(group => row < group.length)) {
          groups.forEach(group => {
            const product = group[row];
            if (product && !panel.some(item => String(item.id) === String(product.id))) panel.push(product);
          });
          row += 1;
        }
        return panel.slice(0,20);
      }

      function daHomeHereTemHtml(){
        const items = daHomeHereTemProducts();
        if(!items.length) return '';
        return `<section class="da-home-section da-home-here-section" data-home-section="aqui-tem">${daHomeSectionHead('Aqui Tem','','','')}<div class="da-home-here-grid">${items.map(product=>`<a class="da-home-here-item" href="#/produto/${productRouteKey(product)}" aria-label="Ver ${escapeHtml(product.name)}">${daHomeProductImage(product)}</a>`).join('')}</div></section>`;
      }
    
      function daHomeOfferCardHtml(product){
        const id = String(product.id);
        const display = productDisplayPricing(product);
        const route = productRouteKey(product);
        return `<article class="da-home-offer-card" data-card-id="${escapeHtml(id)}">
          <div class="da-home-offer-media">
            <a href="#/produto/${route}" aria-label="Ver ${escapeHtml(product.name)}">${daHomeProductImage(product)}</a>
            ${favoriteButtonHtml(id,false,'product')}
            ${display.discountPercent > 0 ? `<span class="da-home-offer-discount">${display.discountPercent}%<span class="da-home-off-word">&nbsp;OFF</span></span>` : ''}
          </div>
          <div class="da-home-offer-body">
            <a class="da-home-card-name" href="#/produto/${route}">${escapeHtml(truncateText(product.name,44))}</a>
            ${product.validade && formatProductExpiry(product.validade) ? `<div class="da-home-card-expiry">Val. ${escapeHtml(formatProductExpiry(product.validade))}</div>` : ''}
            <div class="da-home-offer-bottom"><div class="da-home-offer-price">${daHomeCommercialPriceHtml(display)}</div>${daHomeControls(product,'da-home-small-control')}</div>
          </div>
        </article>`;
      }
    
      function daHomeOfferPriorityDays(product){
        const raw = String(product?.validade || '').trim();
        if(!raw) return Number.POSITIVE_INFINITY;
        const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59` : raw);
        if(!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
        const days = Math.ceil((timestamp - Date.now()) / 86400000);
        return days >= 0 && days <= 120 ? days : Number.POSITIVE_INFINITY;
      }

      function daHomeCommercialPriceHtml(display){
        const hasDiscount = Number(display.original || 0) > Number(display.effective || 0) + .001;
        return `<div class="da-home-commercial-price">${hasDiscount ? `<div class="da-home-commercial-old"><small>De</small><s>${fmt(display.original)}</s></div>` : ''}<div class="da-home-commercial-now">${hasDiscount ? '<small>Por</small>' : ''}<strong>${fmt(display.effective)}</strong></div></div>`;
      }

      function daHomeOfferFeaturedHtml(product){
        const id = String(product.id);
        const display = productDisplayPricing(product);
        const route = productRouteKey(product);
        const expiry = product.validade && formatProductExpiry(product.validade) ? formatProductExpiry(product.validade) : '';
        return `<article class="da-home-offer-feature" data-card-id="${escapeHtml(id)}">
          <div class="da-home-offer-feature-media"><a href="#/produto/${route}" aria-label="Ver ${escapeHtml(product.name)}">${daHomeProductImage(product)}</a>${favoriteButtonHtml(id,false,'product')}${display.discountPercent > 0 ? `<span class="da-home-offer-feature-discount">${display.discountPercent}%<span class="da-home-off-word">&nbsp;OFF</span></span>` : ''}</div>
          <div class="da-home-offer-feature-copy"><span class="da-home-offer-feature-kicker">Oferta em destaque</span><a class="da-home-offer-feature-name" href="#/produto/${route}">${escapeHtml(product.name)}</a>${expiry ? `<span class="da-home-offer-feature-expiry">Val. ${escapeHtml(expiry)}</span>` : ''}<div class="da-home-offer-feature-price">${daHomeCommercialPriceHtml(display)}</div>${daHomeControls(product,'da-home-offer-feature-control')}</div>
        </article>`;
      }

      function daHomeOfferShelfHtml(products){
        const ranked = (products || []).filter(isAvailable).slice(0,20).sort((a,b)=>{
          const daysA = daHomeOfferPriorityDays(a);
          const daysB = daHomeOfferPriorityDays(b);
          if(daysA !== daysB){
            if(!Number.isFinite(daysA)) return 1;
            if(!Number.isFinite(daysB)) return -1;
            return daysA - daysB;
          }
          const displayA = productDisplayPricing(a);
          const displayB = productDisplayPricing(b);
          return Number(displayB.discountPercent || 0) - Number(displayA.discountPercent || 0) || displayA.effective - displayB.effective;
        });
        if(!ranked.length) return '';
        const featured = ranked[0];
        const remaining = daHomeDiversifyByCategory(ranked.slice(1),7);
        return `<section class="da-home-section da-home-offers-section da-home-band da-home-band-offers" data-home-section="offers">${daHomeSectionHead('Ofertas de hoje','Oportunidades que merecem ser vistas primeiro. Aproveite enquanto houver estoque.','#/ofertas','Ver todas as ofertas')}${daHomeOfferFeaturedHtml(featured)}${remaining.length ? `<div class="da-home-offer-grid">${remaining.map(daHomeOfferCardHtml).join('')}</div>` : ''}</section>`;
      }
    
      function daHomeBasketCardHtml(basket){
        const price = Number(basket.preco || 0);
        const original = Math.max(Number(basket.precoOriginal || 0),price);
        return `<article class="da-home-basket-card">
          <a class="da-home-square-media" href="#/cesta/${encodeURIComponent(basket.id)}" aria-label="Ver produtos de ${escapeHtml(basket.nome)}"><img loading="lazy" decoding="async" src="${escapeHtml(basket.imagem)}" alt="${escapeHtml(basket.nome)}" onerror="window.__daFallbackImg(this)"></a>
          <div class="da-home-basket-body"><a class="da-home-basket-name" href="#/cesta/${encodeURIComponent(basket.id)}">${escapeHtml(basket.nome)}</a><div class="da-home-basket-price">${original > price && price > 0 ? `<s>${fmt(original)}</s>` : ''}<strong>${price ? fmt(price) : 'Consulte os itens'}</strong></div><a class="da-home-view-products" href="#/cesta/${encodeURIComponent(basket.id)}">Ver produtos</a></div>
        </article>`;
      }
    
      function daHomeBasketShelfHtml(baskets){
        const items = (baskets || []).slice(0,10);
        if(!items.length) return '';
        return `<section class="da-home-section da-home-baskets-section da-home-band da-home-band-baskets" data-home-section="baskets">${daHomeSectionHead('Cestas básicas','Veja todos os produtos antes de escolher sua cesta.','#/cestas','Ver todas as cestas')}<div class="da-home-basket-grid">${items.map(daHomeBasketCardHtml).join('')}</div></section>`;
      }
    
      function daHomeKitCardHtml(kit){
        const original = kitOriginalPrice(kit);
        const discount = kitDiscountPercent(kit);
        return `<article class="da-home-kit-card">
          <div class="da-home-kit-media"><a class="da-home-square-media" href="#/kit/${encodeURIComponent(kit.id)}" aria-label="Abrir ${escapeHtml(kit.nome)}"><img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}" onerror="window.__daFallbackImg(this)"></a>${favoriteButtonHtml(kit.id,false,'kit')}${discount > 0 ? `<span class="da-home-kit-discount">${discount}%<span class="da-home-off-word">&nbsp;OFF</span></span>` : ''}</div>
          <div class="da-home-kit-body"><a class="da-home-basket-name" href="#/kit/${encodeURIComponent(kit.id)}">${escapeHtml(kit.nome)}</a><div class="da-home-kit-price">${kit.preco ? daHomeCommercialPriceHtml({original,effective:Number(kit.preco || 0)}) : 'Ver produtos'}</div><div class="da-home-kit-actions"><a href="#/kit/${encodeURIComponent(kit.id)}">Ver produtos</a><button type="button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar</button></div></div>
        </article>`;
      }
    
      function daHomeKitShelfHtml(kits){
        const items = (kits || []).slice(0,6);
        if(!items.length) return '';
        return `<section class="da-home-section da-home-kits-section da-home-band da-home-band-kits" data-home-section="kits">${daHomeSectionHead('Kits promocionais','Combos com desconto e produtos selecionados.','#/kits','Ver todos os kits')}<div class="da-home-kit-grid">${items.map(daHomeKitCardHtml).join('')}</div><a class="da-home-mobile-see-all" href="#/kits">Ver todos os kits</a></section>`;
      }
    
      function daHomeRecentCardHtml(product){
        const id = String(product.id);
        const route = productRouteKey(product);
        const display = productDisplayPricing(product);
        return `<article class="da-home-recent-card" data-card-id="${escapeHtml(id)}"><a class="da-home-recent-media" href="#/produto/${route}">${daHomeProductImage(product)}</a><div class="da-home-recent-body"><a href="#/produto/${route}">${escapeHtml(truncateText(product.name,34))}</a><div><strong>${fmt(display.effective)}</strong>${daHomeControls(product,'da-home-tiny-control')}</div></div></article>`;
      }
    
      function daHomeRecentShelfHtml(products){
        const items = (products || []).filter(isAvailable).slice(0,10);
        if(!items.length) return '';
        return `<section class="da-home-section da-home-recent-section" data-personalization-section="recent">${daHomeSectionHead('Vistos recentemente','Continue de onde parou.','','')}<div class="da-home-recent-track">${items.map(daHomeRecentCardHtml).join('')}</div></section>`;
      }
    
      function daHomeBuyAgainCardHtml(product){
        const id = String(product.id);
        const route = productRouteKey(product);
        const display = productDisplayPricing(product);
        const previousQty = Math.max(1,Number(product.__daLastPurchaseQty || 1));
        return `<article class="da-home-buy-card" data-card-id="${escapeHtml(id)}"><a class="da-home-buy-media" href="#/produto/${route}">${daHomeProductImage(product)}</a><div class="da-home-buy-copy"><span>Comprado anteriormente${previousQty > 1 ? ` · ${previousQty} un.` : ''}</span><a href="#/produto/${route}">${escapeHtml(truncateText(product.name,46))}</a><strong>${fmt(display.effective)}</strong></div>${daHomeControls(product,'da-home-buy-control')}</article>`;
      }
    
      function daHomeBuyAgainShelfHtml(products){
        const items = (products || []).filter(isAvailable).slice(0,6);
        if(!items.length) return '';
        return `<section class="da-home-section da-home-buy-section" data-personalization-section="buy-again">${daHomeSectionHead('Compre novamente','Itens disponíveis da sua última compra neste aparelho.','','')}<div class="da-home-buy-grid">${items.map(daHomeBuyAgainCardHtml).join('')}</div></section>`;
      }
    
      function daHomeMosaicMiniHtml(product,index){
        const id = String(product.id);
        const route = productRouteKey(product);
        const display = productDisplayPricing(product);
        return `<article class="da-home-mosaic-mini da-home-mosaic-item-${index}" data-card-id="${escapeHtml(id)}"><a class="da-home-mosaic-mini-media" href="#/produto/${route}">${daHomeProductImage(product)}</a><div><a href="#/produto/${route}">${escapeHtml(truncateText(product.name,30))}</a><div><strong>${fmt(display.effective)}</strong>${daHomeControls(product,'da-home-tiny-control')}</div></div></article>`;
      }
    
      function daHomePersonalizedMosaicHtml(products){
        const items = (products || []).filter(isAvailable).slice(0,7);
        if(!items.length) return '';
        const main = items[0];
        const display = productDisplayPricing(main);
        const id = String(main.id);
        const route = productRouteKey(main);
        return `<section class="da-home-section da-home-personalized-section" data-personalization-section="chosen">${daHomeSectionHead('Escolhidos para você','Sugestões baseadas no que você visitou neste aparelho.','','')}<div class="da-home-personalized-mosaic"><article class="da-home-mosaic-main" data-card-id="${escapeHtml(id)}"><a class="da-home-mosaic-main-media" href="#/produto/${route}">${daHomeProductImage(main)}</a><div class="da-home-mosaic-main-copy"><span>Recomendado para você</span><a href="#/produto/${route}">${escapeHtml(truncateText(main.name,58))}</a><div><strong>${fmt(display.effective)}</strong>${daHomeControls(main,'da-home-mosaic-control')}</div></div></article><div class="da-home-mosaic-grid">${items.slice(1).map((product,index)=>daHomeMosaicMiniHtml(product,index+2)).join('')}</div></div></section>`;
      }
    
      function daHomeNormalizeSet(values){
        return new Set((values || []).map(value=>norm(value)).filter(Boolean));
      }
    
      function daHomeCollectionDefinitions(key){
        if(key === 'limpeza') return [
          {title:'Lavanderia',copy:'Lava-roupas, amaciantes e acessórios.',href:'#/categoria/LAVANDERIA',match:p=>norm(p.categoria)==='lavanderia'},
          {title:'Detergentes e cozinha',copy:'Detergentes e limpadores para o dia a dia.',href:'#/categoria/LIMPEZA?sub=DETERGENTE',match:p=>norm(p.categoria)==='limpeza' && daHomeNormalizeSet(['DETERGENTE','LIMPADOR']).has(norm(p.subcategoria))},
          {title:'Banheiro e desinfecção',copy:'Desinfetantes, água sanitária e limpeza pesada.',href:'#/categoria/LIMPEZA?sub=DESINFETANTE',match:p=>norm(p.categoria)==='limpeza' && daHomeNormalizeSet(['DESINFETANTE','BANHEIRO','ÁGUA SANITÁRIA','ÁLCOOL']).has(norm(p.subcategoria))},
          {title:'Panos e acessórios',copy:'Panos, sacos de lixo, vassouras, rodos e pás.',href:'#/categoria/LIMPEZA?sub=PANOS%20E%20PAPÉIS',match:p=>norm(p.categoria)==='limpeza' && daHomeNormalizeSet(['PANOS E PAPÉIS','VASSOURA, RODO E PÁ','SACO DE LIXO']).has(norm(p.subcategoria))}
        ];
        if(key === 'higiene') return [
          {title:'Cabelos',copy:'Shampoo, condicionador e tratamentos.',href:'#/categoria/SHAMPOO%20E%20CONDICIONADOR',match:p=>norm(p.categoria)==='shampoo e condicionador' || (norm(p.categoria)==='beleza' && norm(p.subcategoria)==='cabelo')},
          {title:'Banho e sabonetes',copy:'Sabonetes em barra, líquidos e cuidados para banho.',href:'#/categoria/SABONETE',match:p=>norm(p.categoria)==='sabonete' || (norm(p.categoria)==='higiene' && norm(p.subcategoria)==='banho')},
          {title:'Higiene bucal',copy:'Creme dental, escovas e cuidados com a boca.',href:'#/categoria/HIGIENE?sub=HIGIENE%20BUCAL',match:p=>(norm(p.categoria)==='higiene' && norm(p.subcategoria)==='higiene bucal') || (norm(p.categoria)==='beleza' && norm(p.subcategoria)==='boca')},
          {title:'Desodorantes',copy:'Aerossol, roll-on e creme.',href:'#/categoria/DESODORANTE',match:p=>norm(p.categoria)==='desodorante'}
        ];
        return [
          {title:'Cafés',copy:'Cafés para todos os momentos do dia.',href:'#/categoria/CAFÉ%20DA%20MANHÃ?sub=CAFÉ',match:p=>norm(p.categoria)==='cafe da manha' && norm(p.subcategoria)==='cafe'},
          {title:'Acompanhamentos',copy:'Itens para completar o café da manhã.',href:'#/categoria/CAFÉ%20DA%20MANHÃ?sub=ACOMPANHAMENTOS',match:p=>norm(p.categoria)==='cafe da manha' && norm(p.subcategoria)==='acompanhamentos'},
          {title:'Cereais e achocolatados',copy:'Opções práticas para começar o dia.',href:'#/categoria/CAFÉ%20DA%20MANHÃ?sub=CEREAIS',match:p=>norm(p.categoria)==='cafe da manha' && daHomeNormalizeSet(['CEREAIS','ACHOCOLATADO']).has(norm(p.subcategoria))},
          {title:'Biscoitos e bolachas',copy:'Doces, salgadas e wafers.',href:'#/categoria/BOLACHAS%20E%20BISCOITOS',match:p=>norm(p.categoria)==='bolachas e biscoitos'}
        ];
      }
    
      function daHomeCollectionCardHtml(definition){
        const matches = state.products.filter(product=>isAvailable(product) && definition.match(product));
        const imageProduct = pickProductForImage(matches.slice(0,18));
        const image = imageProduct ? imageProduct.img : 'img/logoantonia5.png';
        const fallbacks = imageProduct ? imageFallbackList(imageProduct.images) : image;
        return `<a class="da-home-collection-card" href="${definition.href}"><span class="da-home-collection-media"><img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(image)}" data-fallback-images="${escapeHtml(fallbacks)}" alt="" onerror="window.__daFallbackImg(this)"></span><span class="da-home-collection-copy"><strong>${escapeHtml(definition.title)}</strong><small>${escapeHtml(definition.copy)}</small><em>${matches.length} ${matches.length === 1 ? 'produto' : 'produtos'}</em></span></a>`;
      }
    
      function daHomeShuffle(products){
        const shuffled=[...(products || [])];
        for(let index=shuffled.length-1;index>0;index-=1){
          const swapIndex=Math.floor(Math.random()*(index+1));
          [shuffled[index],shuffled[swapIndex]]=[shuffled[swapIndex],shuffled[index]];
        }
        return shuffled;
      }

      function daHomeRandomizedDiverseProducts(products,limit){
        const unique=daHomeUniqueProducts((products || []).filter(isAvailable));
        return daHomeDiversifiedProducts(daHomeShuffle(unique),limit);
      }

      function daHomeDiversifiedProducts(products,limit){
        const picked=[];
        const seenSubs=new Set();
        for(const product of (products || []).filter(isAvailable)){
          const sub=norm(product.subcategoria || product.categoria);
          if(sub && seenSubs.has(sub) && picked.length < Math.ceil(limit/2)) continue;
          picked.push(product);
          if(sub) seenSubs.add(sub);
          if(picked.length>=limit) break;
        }
        if(picked.length<limit){
          for(const product of (products || []).filter(isAvailable)){
            if(picked.some(item=>String(item.id)===String(product.id))) continue;
            picked.push(product);
            if(picked.length>=limit) break;
          }
        }
        return picked;
      }
    
      function daHomeCollectionSectionHtml(key,title,caption,products,href,tone){
        const definitions=daHomeCollectionDefinitions(key);
        const highlights=daHomeDiversifiedProducts(products,4);
        const bandClass = tone ? ` da-home-band da-home-band-${escapeHtml(tone)}` : '';
        return `<section class="da-home-section da-home-collection-section${bandClass}" data-home-section="collection-${escapeHtml(key)}">${daHomeSectionHead(title,caption,href,'Ver todos')}<div class="da-home-collection-grid">${definitions.map(daHomeCollectionCardHtml).join('')}</div>${highlights.length ? `<div class="da-home-collection-highlight-head"><strong>Produtos em destaque</strong></div><div class="da-home-collection-products">${highlights.map(product=>productCard(product)).join('')}</div>` : ''}</section>`;
      }
    
      function daHomeUniqueProducts(products){
        const seen = new Set();
        return (products || []).filter(product=>{
          const id = String(product?.id || '');
          if(!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }

      function daHomeEffectivePrice(product){
        try { return Number(productDisplayPricing(product).effective || product.price || 0); }
        catch(_) { return Number(product?.price || 0); }
      }

      function daHomeCommercialSort(products){
        return [...(products || [])].sort((a,b)=>{
          const displayA = productDisplayPricing(a);
          const displayB = productDisplayPricing(b);
          return Number(displayB.discountPercent || 0) - Number(displayA.discountPercent || 0)
            || daHomeEffectivePrice(a) - daHomeEffectivePrice(b)
            || String(a.name || '').localeCompare(String(b.name || ''),'pt-BR');
        });
      }

      function daHomeDiversifyByCategory(products,limit){
        const pool = daHomeCommercialSort(daHomeUniqueProducts((products || []).filter(isAvailable)));
        const selected = [];
        const usedCategories = new Set();
        for(const product of pool){
          const category = norm(product.categoria || product.subcategoria || 'outros');
          if(usedCategories.has(category)) continue;
          selected.push(product);
          usedCategories.add(category);
          if(selected.length >= limit) return selected;
        }
        for(const product of pool){
          if(selected.some(item=>String(item.id)===String(product.id))) continue;
          selected.push(product);
          if(selected.length >= limit) break;
        }
        return selected;
      }

      function daHomeCompactShelfHtml(title,caption,products,href,tone,label){
        const items = daHomeUniqueProducts((products || []).filter(isAvailable)).slice(0,10);
        if(!items.length) return '';
        const bandClass = tone ? ` da-home-band da-home-band-${escapeHtml(tone)}` : '';
        return `<section class="da-home-section da-home-compact-section${bandClass}" data-home-section="compact">${daHomeSectionHead(title,caption,href,label || 'Ver todos')}<div class="da-home-compact-rail">${items.map(product=>productCard(product,'compact')).join('')}</div></section>`;
      }

      function daHomeJourneyDefinitions(){
        return [
          {title:'Despensa básica',copy:'Arroz, feijão, açúcar e básicos para abastecer a casa.',href:'#/categoria/MERCEARIA%20BÁSICA',match:p=>norm(p.categoria)==='mercearia basica'},
          {title:'Macarrão e molhos',copy:'Refeições rápidas e acompanhamentos para o dia a dia.',href:'#/categoria/MACARRÃO%20E%20MOLHOS',match:p=>norm(p.categoria)==='macarrao e molhos' || norm(p.categoria)==='molhos e condimentos'},
          {title:'Café da manhã',copy:'Café, biscoitos e itens para começar o dia.',href:'#/rotina/cafe',match:p=>norm(p.categoria)==='cafe da manha' || norm(p.categoria)==='bolachas e biscoitos'},
          {title:'Limpeza da casa',copy:'Pia, banheiro e superfícies da casa.',href:'#/rotina/limpeza',match:p=>norm(p.categoria)==='limpeza'},
          {title:'Lavanderia',copy:'Sabão, lava-roupas, amaciante e acessórios.',href:'#/categoria/LAVANDERIA',match:p=>norm(p.categoria)==='lavanderia'},
          {title:'Higiene da família',copy:'Banho, higiene bucal e cuidados do dia a dia.',href:'#/rotina/higiene',match:p=>['higiene','sabonete','desodorante'].includes(norm(p.categoria))}
        ];
      }

      function daHomeJourneyCardHtml(definition){
        const matches = state.products.filter(product=>isAvailable(product) && definition.match(product));
        const imageProduct = pickProductForImage(daHomeCommercialSort(matches).slice(0,18));
        const image = imageProduct ? imageProduct.img : 'img/logoantonia5.png';
        const fallbacks = imageProduct ? imageFallbackList(imageProduct.images) : image;
        return `<a class="da-home-journey-card" href="${definition.href}"><span class="da-home-journey-copy"><strong>${escapeHtml(definition.title)}</strong><small>${escapeHtml(definition.copy)}</small><em>${matches.length} ${matches.length === 1 ? 'produto' : 'produtos'}</em></span><span class="da-home-journey-media"><img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(image)}" data-fallback-images="${escapeHtml(fallbacks)}" alt="" onerror="window.__daFallbackImg(this)"></span></a>`;
      }

      function daHomePurchaseJourneyHtml(){
        const definitions = daHomeJourneyDefinitions().filter(definition=>state.products.some(product=>isAvailable(product) && definition.match(product)));
        if(!definitions.length) return '';
        return `<section class="da-home-section da-home-journey-section da-home-band da-home-band-month" data-home-section="purchase-journey">${daHomeSectionHead('Faça sua compra do mês','Um caminho rápido pelos setores que normalmente entram na compra básica.','','')}<div class="da-home-journey-grid">${definitions.map(daHomeJourneyCardHtml).join('')}</div></section>`;
      }

      function daHomeProductSearchText(product){
        return norm([product?.name,product?.categoria,product?.subcategoria,product?.subsubcategoria,product?.marca,product?.embalagem].filter(Boolean).join(' '));
      }

      function daHomeReminderProducts(){
        const reminders = [
          ['detergente'],['esponja','bucha'],['saco de lixo'],['filtro de cafe'],['papel higienico'],
          ['creme dental','pasta de dente'],['sabonete'],['absorvente'],['amaciante'],['prendedor de roupa','prendedor']
        ];
        const available = daHomeCommercialSort(state.products.filter(isAvailable));
        const selected = [];
        for(const terms of reminders){
          const product = available.find(item=>!selected.some(chosen=>String(chosen.id)===String(item.id)) && terms.some(term=>daHomeProductSearchText(item).includes(norm(term))));
          if(product) selected.push(product);
        }
        return selected.slice(0,10);
      }

      function daHomeCareProducts(){
        const allowed = new Set(['beleza','shampoo e condicionador','desodorante']);
        const pool = state.products.filter(product=>isAvailable(product) && allowed.has(norm(product.categoria)));
        return daHomeDiversifiedProducts(daHomeCommercialSort(pool),10);
      }

      function daHomeBargainProducts(){
        const pool = state.products.filter(product=>isAvailable(product) && daHomeEffectivePrice(product) > 0 && daHomeEffectivePrice(product) <= 3);
        return daHomeDiversifyByCategory(pool,10);
      }

      function daHomeUsefulProducts(){
        const pool = state.products.filter(product=>isAvailable(product) && norm(product.categoria)==='utensilios e utilidades');
        return daHomeDiversifiedProducts(daHomeCommercialSort(pool),10);
      }

      function daHomeTreatProducts(){
        const categories = new Set(['chocolates e doces','salgadinhos e petiscos','bolachas e biscoitos','balas e chicletes']);
        const pool = state.products.filter(product=>isAvailable(product) && categories.has(norm(product.categoria)));
        return daHomeDiversifyByCategory(pool,10);
      }

      window.daHomeBuyAgainShelfHtml=daHomeBuyAgainShelfHtml;
      window.daHomeRecentShelfHtml=daHomeRecentShelfHtml;
      window.daHomePersonalizedMosaicHtml=daHomePersonalizedMosaicHtml;

      let daHomeSecondaryObserver=null;
      let daHomeTailObserver=null;
      let daHomeSecondaryTimer=0;
      let daHomeTailTimer=0;

      function daProgressiveLoadingHtml(label){
        return `<div class="da-home-progressive-status" role="status"><span aria-hidden="true"></span>${escapeHtml(label)}</div>`;
      }

      function daRenderHomeTail(slot){
        if(!slot || !slot.isConnected || slot.dataset.loaded==='true') return;
        slot.dataset.loaded='true';
        slot.removeAttribute('aria-busy');
        const bargains=daHomeBargainProducts().slice(0,8);
        const cafe=productsByRoutine('cafe',100);
        slot.innerHTML=`
          ${daHomeCollectionSectionHtml('cafe','Café da manhã','Café, biscoitos e acompanhamentos para começar o dia.',cafe,'#/rotina/cafe','coffee')}
          ${daHomeCompactShelfHtml('Complete seu carrinho por até R$ 3','Itens baratos e úteis para aproveitar melhor o pedido.',bargains,'#/categorias','bargain','Explorar categorias')}
          ${daHomeHereTemHtml()}
          
          ${categoryButtonsHtml()}`;
        updateOfferCountdowns();
        syncVisibleCards();
        updateFavoritesUI();
      }

      function daSetupHomeTail(){
        const slot=app.querySelector('[data-home-tail-slot]');
        if(!slot) return;
        if(daHomeTailObserver) daHomeTailObserver.disconnect();
        if(daHomeTailTimer) window.clearTimeout(daHomeTailTimer);
        const load=()=>{
          if(daHomeTailObserver) daHomeTailObserver.disconnect();
          daRenderHomeTail(slot);
        };
        if('IntersectionObserver' in window){
          daHomeTailObserver=new IntersectionObserver(entries=>{
            if(entries.some(entry=>entry.isIntersecting)) load();
          },{root:app,rootMargin:'1200px 0px',threshold:0});
          daHomeTailObserver.observe(slot);
        }
        daHomeTailTimer=window.setTimeout(load,3200);
      }

      function daRenderHomeSecondary(slot){
        if(!slot || !slot.isConnected || slot.dataset.loaded==='true') return;
        slot.dataset.loaded='true';
        slot.removeAttribute('aria-busy');
        slot.innerHTML=`${daHomeHereTemHtml()}${categoryButtonsHtml()}`;
        syncVisibleCards();
        updateFavoritesUI();
      }

      function daSetupHomeSecondary(){
        const slot=app.querySelector('[data-home-secondary-slot]');
        if(!slot) return;
        if(daHomeSecondaryObserver) daHomeSecondaryObserver.disconnect();
        if(daHomeSecondaryTimer) window.clearTimeout(daHomeSecondaryTimer);
        const load=()=>{
          if(daHomeSecondaryObserver) daHomeSecondaryObserver.disconnect();
          daRenderHomeSecondary(slot);
        };
        if('IntersectionObserver' in window){
          daHomeSecondaryObserver=new IntersectionObserver(entries=>{
            if(entries.some(entry=>entry.isIntersecting)) load();
          },{root:app,rootMargin:'1200px 0px',threshold:0});
          daHomeSecondaryObserver.observe(slot);
        }else{
          load();
        }
        daHomeSecondaryTimer=window.setTimeout(load,1800);
      }

      function daPaymentNoticesHtml(){
        return `<section class="da-payment-notices" aria-label="Condições de pagamento">
          <article class="da-payment-notice">
            <span class="da-payment-notice-mark" aria-hidden="true">4x</span>
            <div class="da-payment-notice-copy"><small>Pagamento facilitado</small><strong>Parcele em até 4x sem juros</strong><span>no Cartão de Crédito</span></div>
          </article>
          <article class="da-payment-notice">
            <span class="da-payment-notice-mark" aria-hidden="true">OK</span>
            <div class="da-payment-notice-copy"><small>Compra com segurança</small><strong>Pague somente na entrega</strong><span>após receber o seu pedido</span></div>
          </article>
        </section>`;
      }

      renderHome=function(){
        const offers=getTopOffers(20);
        const kits=getActiveKits();
        app.innerHTML=`<div class="container home-clean da-home-modular da-home-funnel da-home-profit">
          <h1 class="sr-only">Dona Antônia - Supermercado e Cestas</h1>
          ${homeQuickLinksHtml()}
          ${daHomeOfferShelfHtml(offers)}
          ${daPaymentNoticesHtml()}
          ${daHomePurchaseJourneyHtml()}
          ${daHomeBasketShelfHtml(state.cestas)}
          ${daHomeKitShelfHtml(kits)}
          <div data-home-secondary-slot aria-busy="true">${daProgressiveLoadingHtml('Carregando sugestões para completar sua compra…')}</div>
          <div class="da-home-bottom-safe" aria-hidden="true"></div>
        </div>`;
        setupBannerCarousels();
        daSetupHomeSecondary();
        updateOfferCountdowns();
        updateMeta('Dona Antônia - Supermercado e Cestas','Supermercado online, cestas básicas, ofertas e entrega em Cuiabá e Várzea Grande.','/');
        setActiveNav('home');
      };
    
      function daContextProductRef(product){
        return [product?.id,product?.firebaseKey,product?.codigo,product?.gtin,product?.ean,product?.name].map(value=>norm(String(value || ''))).filter(Boolean);
      }
    
      function daContextBannerProductRefs(banner){
        const refs=[];
        const originProducts=Array.isArray(banner?.origem?.produtos) ? banner.origem.produtos : [];
        originProducts.forEach(ref=>refs.push(ref?.firebaseKey,ref?.codigo,ref?.id,ref?.gtin,ref?.ean,ref?.nome));
        if(norm(banner?.origem?.tipo)==='produto') refs.push(banner?.origem?.valor);
        if(norm(banner?.link?.tipo)==='produto') refs.push(banner?.link?.valor);
        return refs.map(value=>norm(String(value || ''))).filter(Boolean);
      }
    
      function daContextBannersForProducts(products){
        const wanted=new Set();
        (products || []).forEach(product=>daContextProductRef(product).forEach(ref=>wanted.add(ref)));
        if(!wanted.size) return [];
        // Um banner só pode aparecer fora do local mapeado quando houver opt-in explícito.
        // Isso impede que um banner de home.hero surja também em busca, categoria e rotina.
        return state.banners.filter(banner=>banner?.automacao?.contextual_inteligente===true && bannerIsCurrent(banner) && daContextBannerProductRefs(banner).some(ref=>wanted.has(ref)));
      }
    
      function daContextUnique(list){
        const seen=new Set();
        return (list || []).filter(banner=>banner && !seen.has(banner.id) && seen.add(banner.id));
      }
    
      function daContextBannerHtml(products,directBanners,label,position){
        return '';
      }
    
      renderCategory=function(cat){
        const decoded=decodeURIComponent(cat || '');
        const products=state.products.filter(product=>isAvailable(product) && norm(product.categoria)===norm(decoded));
        const canonicalCategory=products[0]?.categoria || decoded;
        const subs=Array.from(new Set(products.map(product=>product.subcategoria).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
        const currentSub=new URLSearchParams(location.hash.split('?')[1] || '').get('sub') || 'Todos';
        const filtered=currentSub==='Todos' ? products : products.filter(product=>norm(product.subcategoria)===norm(currentSub));
        const chips=`<div class="chips"><a class="chip ${currentSub==='Todos'?'active':''}" href="#/categoria/${encodeURIComponent(canonicalCategory)}">Todos</a>${subs.map(sub=>`<a class="chip ${currentSub===sub?'active':''}" href="#/categoria/${encodeURIComponent(canonicalCategory)}?sub=${encodeURIComponent(sub)}">${escapeHtml(sub)}</a>`).join('')}</div>`;
        const isBeauty=/(beleza|higiene|perfumaria)/.test(norm(canonicalCategory));
        const direct=[...getBanners('categoria',canonicalCategory),...(currentSub!=='Todos'?getBanners('subcategoria',[currentSub,`${canonicalCategory}::${currentSub}`]):[])];
        const contextual=daContextBannerHtml(filtered,direct,currentSub==='Todos'?`Destaques de ${canonicalCategory}`:`Destaques de ${currentSub}`,'categoria-produtos-contextuais');
        app.innerHTML=`<div class="container">${pageHeader(canonicalCategory,`${filtered.length} produtos encontrados`,'#/categorias')}${contextual}${isBeauty?beautyBannerHtml(products):''}${chips}<div class="product-grid">${filtered.map(product=>productCard(product)).join('')}</div></div>`;
        setActiveNav('categorias');
        updateMeta(`${canonicalCategory} - Dona Antônia`,`Compre ${canonicalCategory.toLowerCase()} com entrega em Cuiabá e Várzea Grande.`,`/?categoria=${encodeURIComponent(canonicalCategory)}`);
      };
    
      renderSubcategory=function(subcategory){
        const decoded=decodeURIComponent(subcategory || '');
        const products=state.products.filter(product=>isAvailable(product) && norm(product.subcategoria)===norm(decoded));
        const canonical=products[0]?.subcategoria || decoded;
        const targets=[canonical,...new Set(products.map(product=>product.categoria).filter(Boolean))].map((value,index)=>index===0?value:`${value}::${canonical}`);
        const contextual=daContextBannerHtml(products,getBanners('subcategoria',targets),`Destaques de ${canonical}`,'subcategoria-produtos-contextuais');
        app.innerHTML=`<div class="container">${pageHeader(canonical,`${products.length} produtos encontrados`,'#/categorias')}${contextual}${products.length?`<div class="product-grid">${products.map(product=>productCard(product)).join('')}</div>`:`<div class="empty"><strong>Nenhum produto disponível</strong>Esta subcategoria não possui itens disponíveis agora.</div>`}</div>`;
        setActiveNav('categorias');
        updateMeta(`${canonical} - Dona Antônia`,`Compre produtos de ${canonical.toLowerCase()} com entrega em Cuiabá e Várzea Grande.`,`/?subcategoria=${encodeURIComponent(canonical)}`);
      };
    
      renderBrand=function(brand){
        const decoded=decodeURIComponent(brand || '');
        const products=state.products.filter(product=>isAvailable(product) && norm(product.marca)===norm(decoded));
        const canonical=products[0]?.marca || decoded;
        const contextual=daContextBannerHtml(products,getBanners('marca',canonical),`Destaques da marca ${canonical}`,'marca-produtos-contextuais');
        app.innerHTML=`<div class="container">${pageHeader(canonical,`${products.length} produtos encontrados`,'#/')}${contextual}${products.length?`<div class="product-grid">${products.map(product=>productCard(product)).join('')}</div>`:`<div class="empty"><strong>Nenhum produto disponível</strong>Esta marca não possui itens disponíveis agora.</div>`}</div>`;
        setActiveNav('home');
        updateMeta(`${canonical} - Dona Antônia`,`Compre produtos ${canonical} com entrega em Cuiabá e Várzea Grande.`,`/?marca=${encodeURIComponent(canonical)}`);
      };
    
      renderOffers=function(){
        const products=getTopOffers(200);
        const contextual=daContextBannerHtml(products,[],`Destaques dos produtos em oferta`,'ofertas-produtos-contextuais');
        app.innerHTML=`<div class="container">${pageHeader('Ofertas','Produtos com desconto disponíveis agora.','#/')}${contextual}${bannerSlotHtml('ofertas.topo',{kind:'section'})}${products.length?`<div class="product-grid">${products.map(product=>productCard(product)).join('')}</div>`:`<div class="empty"><strong>Sem ofertas no momento</strong>Volte mais tarde ou navegue pelas categorias.</div>`}</div>`;
        setActiveNav('ofertas');
        updateMeta('Ofertas - Dona Antônia','Ofertas de supermercado com entrega em Cuiabá e Várzea Grande.','/?secao=ofertas');
      };
    
      renderRoutine=function(key){
        const routine=ROUTINES[key] || ROUTINES['compra-mes'];
        if(key==='compra-mes'){
          const allProducts=productsByRoutine('compra-mes',240);
          const groups=productsByCategoryForMonth(8);
          const contextual=daContextBannerHtml(allProducts,[],`Destaques para a compra do mês`,'rotina-compra-mes-produtos-contextuais');
          app.innerHTML=`<div class="container">${pageHeader('Compra do mês','','#/')}${contextual}${bannerSlotHtml('rotina.compra-mes.topo',{kind:'section'})}${groups.length?groups.map(group=>`<section class="month-group"><h2 class="month-group-title">${escapeHtml(group.category)}</h2><div class="product-grid">${group.products.map(product=>productCard(product)).join('')}</div></section>`).join(''):`<div class="empty"><strong>Nenhum produto encontrado</strong>Use a busca para encontrar o que precisa.</div>`}</div>`;
        }else{
          let products=productsByRoutine(key,200);
          if(key==='higiene'){
            const beautyCoupon=getCouponByCode('BELEZA20');
            products=products.filter(product=>couponMatchesProduct(beautyCoupon,product));
          }
          const contextual=daContextBannerHtml(products,[],`Destaques de ${routine.title}` ,`rotina-${key}-produtos-contextuais`);
          app.innerHTML=`<div class="container">${pageHeader(routine.title,'','#/')}${contextual}${bannerSlotHtml(`rotina.${key}.topo`,{kind:'section'})}${key==='higiene'?beautyBannerHtml(products):''}${products.length?`<div class="product-grid">${products.map(product=>productCard(product)).join('')}</div>`:`<div class="empty"><strong>Nenhum produto encontrado</strong>Use a busca para encontrar o que precisa.</div>`}</div>`;
        }
        setActiveNav('home');
      };
    
      renderSearch=function(query){
        const q=String(query || '').trim();
        state.searchQuery=q;
        const searchInput=$('search-input');
        if(searchInput && document.activeElement !== searchInput && searchInput.value!==q) searchInput.value=q;
        updateSearchButtons();
        const products=searchProducts(q);
        let contextual='';
        if(q){
          try{ contextual=daContextBannerHtml(products,[],`Ofertas relacionadas à sua busca`,'busca-produtos-contextuais'); }
          catch(error){ console.warn('Banner contextual da busca ignorado:',error); }
        }
        app.innerHTML=`<div class="container search-results-page">${pageHeader(q?`Busca: ${q}`:'Busca',q?`${products.length} resultado(s)`:'Digite o produto na busca acima.','#/')}${q?(products.length?`<div class="product-list">${products.map(product=>productCard(product,'list')).join('')}</div>`:`<div class="empty"><strong>Nenhum produto encontrado</strong>Não achamos nada para "${escapeHtml(q)}". Tente buscar pelo nome exato, marca ou embalagem.</div>`):''}${contextual}${bannerSlotHtml('busca.topo',{kind:'section'})}</div>`;
        setActiveNav('home');
      };
    })();
    

    /* ======================================================================
       DONA ANTÔNIA — PERSONALIZAÇÃO LOCAL FASE 1
       - Não envia dados de navegação para Firebase, Make, OpenAI ou terceiros.
       - Não altera webhooks, checkout, catálogo, carrinho ou integrações atuais.
       - Usa apenas localStorage após consentimento explícito.
       ====================================================================== */
    (() => {
      const PERSONALIZATION_KEY = 'da_personalizacao_v1';
      const PERSONALIZATION_VERSION = 1;
      const MAX_RECENT = 30;
      const MAX_PRODUCTS = 100;
      const MAX_DIMENSIONS = 50;
      const MAX_PURCHASES = 3;
      const VIEW_DWELL_MS = 8000;
      const TRACK_COOLDOWN_MS = 30 * 60 * 1000;
      let productViewTimer = null;
      let activeViewedProductId = '';

      function emptyPersonalization() {
        return {
          version: PERSONALIZATION_VERSION,
          consent: null,
          consentAt: '',
          updatedAt: '',
          profile: { products: {}, categories: {}, subcategories: {}, brands: {} },
          recentlyViewed: [],
          purchases: [],
          cooldowns: {}
        };
      }

      function loadPersonalizationData() {
        const fallback = emptyPersonalization();
        try {
          const parsed = JSON.parse(localStorage.getItem(PERSONALIZATION_KEY) || 'null');
          if (!parsed || typeof parsed !== 'object' || Number(parsed.version) !== PERSONALIZATION_VERSION) return fallback;
          parsed.profile = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : fallback.profile;
          ['products','categories','subcategories','brands'].forEach(key => {
            if (!parsed.profile[key] || typeof parsed.profile[key] !== 'object') parsed.profile[key] = {};
          });
          parsed.recentlyViewed = Array.isArray(parsed.recentlyViewed) ? parsed.recentlyViewed : [];
          parsed.purchases = Array.isArray(parsed.purchases) ? parsed.purchases : [];
          parsed.cooldowns = parsed.cooldowns && typeof parsed.cooldowns === 'object' ? parsed.cooldowns : {};
          return parsed;
        } catch (_) {
          return fallback;
        }
      }

      let personalization = loadPersonalizationData();

      function savePersonalizationData() {
        personalization.updatedAt = new Date().toISOString();
        try { localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(personalization)); } catch (_) {}
      }

      function personalizationEnabled() {
        return personalization.consent === true;
      }

      function trimObject(obj, max) {
        const entries = Object.entries(obj || {});
        if (entries.length <= max) return obj;
        entries.sort((a,b) => {
          const av = Number(a[1]?.points || 0);
          const bv = Number(b[1]?.points || 0);
          const at = Date.parse(a[1]?.lastAt || 0) || 0;
          const bt = Date.parse(b[1]?.lastAt || 0) || 0;
          return (bv - av) || (bt - at);
        });
        return Object.fromEntries(entries.slice(0, max));
      }

      function prunePersonalization() {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        Object.keys(personalization.profile).forEach(group => {
          Object.entries(personalization.profile[group]).forEach(([key, item]) => {
            const ts = Date.parse(item?.lastAt || 0) || 0;
            if (ts && ts < cutoff) delete personalization.profile[group][key];
          });
        });
        personalization.profile.products = trimObject(personalization.profile.products, MAX_PRODUCTS);
        personalization.profile.categories = trimObject(personalization.profile.categories, 30);
        personalization.profile.subcategories = trimObject(personalization.profile.subcategories, MAX_DIMENSIONS);
        personalization.profile.brands = trimObject(personalization.profile.brands, 30);
        personalization.recentlyViewed = personalization.recentlyViewed
          .filter(item => (Date.parse(item.viewedAt || 0) || 0) >= Date.now() - 30 * 24 * 60 * 60 * 1000)
          .slice(0, MAX_RECENT);
        personalization.purchases = personalization.purchases.slice(0, MAX_PURCHASES);
        const cooldownCutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
        Object.entries(personalization.cooldowns).forEach(([key, value]) => {
          if (Number(value || 0) < cooldownCutoff) delete personalization.cooldowns[key];
        });
      }

      function cooldownAllows(key, duration = TRACK_COOLDOWN_MS) {
        const now = Date.now();
        const last = Number(personalization.cooldowns[key] || 0);
        if (last && now - last < duration) return false;
        personalization.cooldowns[key] = now;
        return true;
      }

      function bump(group, rawKey, points) {
        if (!personalizationEnabled()) return;
        const key = norm(rawKey);
        if (!key) return;
        const now = new Date().toISOString();
        const current = personalization.profile[group][key] || { points: 0, lastAt: now, interactions: 0 };
        current.points = Math.max(-20, Math.min(250, Number(current.points || 0) + Number(points || 0)));
        current.lastAt = now;
        current.interactions = Number(current.interactions || 0) + 1;
        personalization.profile[group][key] = current;
      }

      function bumpProduct(product, points, source, useCooldown = true) {
        if (!personalizationEnabled() || !product || product.isFee) return;
        const id = String(product.id || '');
        if (!id) return;
        const cdKey = `${source || 'event'}:product:${id}`;
        if (useCooldown && !cooldownAllows(cdKey)) return;
        bump('products', id, points);
        if (product.categoria) bump('categories', product.categoria, Math.max(1, points * 0.65));
        if (product.subcategoria) bump('subcategories', product.subcategoria, Math.max(1, points * 0.75));
        if (product.marca) bump('brands', product.marca, Math.max(1, points * 0.45));
        prunePersonalization();
        savePersonalizationData();
      }

      function addRecentlyViewed(product) {
        if (!personalizationEnabled() || !product || product.isFee) return;
        const id = String(product.id || '');
        personalization.recentlyViewed = personalization.recentlyViewed.filter(item => String(item.productId) !== id);
        personalization.recentlyViewed.unshift({ productId: id, viewedAt: new Date().toISOString() });
        personalization.recentlyViewed = personalization.recentlyViewed.slice(0, MAX_RECENT);
        savePersonalizationData();
      }

      function effectivePoints(entry) {
        if (!entry) return 0;
        const ageDays = Math.max(0, (Date.now() - (Date.parse(entry.lastAt || 0) || Date.now())) / 86400000);
        let weight = 1;
        if (ageDays > 90) weight = 0;
        else if (ageDays > 60) weight = 0.25;
        else if (ageDays > 30) weight = 0.5;
        else if (ageDays > 7) weight = 0.75;
        return Number(entry.points || 0) * weight;
      }

      function scoreProduct(product) {
        if (!product || !isAvailable(product) || product.isFee) return -Infinity;
        const profile = personalization.profile;
        const productScore = effectivePoints(profile.products[norm(product.id)]);
        const categoryScore = effectivePoints(profile.categories[norm(product.categoria)]);
        const subcategoryScore = effectivePoints(profile.subcategories[norm(product.subcategoria)]);
        const brandScore = effectivePoints(profile.brands[norm(product.marca)]);
        const display = productDisplayPricing(product);
        const offerBonus = display && Number(display.effective || 0) < Number(product.price || 0) ? 7 : 0;
        const inCartPenalty = state.cart[String(product.id)] ? 8 : 0;
        const recentIndex = personalization.recentlyViewed.findIndex(item => String(item.productId) === String(product.id));
        const recentBonus = recentIndex >= 0 ? Math.max(0, 5 - recentIndex * 0.25) : 0;
        return productScore * 5 + subcategoryScore * 3 + categoryScore * 2 + brandScore * 1.5 + offerBonus + recentBonus - inCartPenalty;
      }

      function hasEnoughSignals() {
        if (!personalizationEnabled()) return false;
        const p = personalization.profile;
        const count = Object.keys(p.products).length + Object.keys(p.categories).length + Object.keys(p.subcategories).length + Object.keys(p.brands).length;
        return count >= 3 || personalization.recentlyViewed.length >= 2 || personalization.purchases.length > 0;
      }

      function diversifiedRecommendations(limit = 8) {
        if (!hasEnoughSignals()) return [];
        const ranked = state.products
          .filter(product => isAvailable(product) && !product.isFee)
          .map(product => ({ product, score: scoreProduct(product) }))
          .filter(item => Number.isFinite(item.score) && item.score > 0)
          .sort((a,b) => b.score - a.score);
        const picked = [];
        const subCounts = new Map();
        const brandCounts = new Map();
        for (const item of ranked) {
          const sub = norm(item.product.subcategoria || item.product.categoria);
          const brand = norm(item.product.marca);
          if (sub && Number(subCounts.get(sub) || 0) >= 3) continue;
          if (brand && Number(brandCounts.get(brand) || 0) >= 4) continue;
          picked.push(item.product);
          if (sub) subCounts.set(sub, Number(subCounts.get(sub) || 0) + 1);
          if (brand) brandCounts.set(brand, Number(brandCounts.get(brand) || 0) + 1);
          if (picked.length >= limit) break;
        }
        return picked;
      }

      function recentProducts(limit = 8) {
        if (!personalizationEnabled()) return [];
        return personalization.recentlyViewed
          .map(item => getProductById(String(item.productId)))
          .filter(product => product && isAvailable(product) && !product.isFee)
          .slice(0, limit);
      }

      function buyAgainProducts(limit = 8) {
        if (!personalizationEnabled() || !personalization.purchases.length) return [];
        const latest = personalization.purchases[0];
        return (latest.items || [])
          .map(item => {
            const product = getProductById(String(item.productId));
            return product ? { ...product, __daLastPurchaseQty: Math.max(1, Number(item.qty || 1)) } : null;
          })
          .filter(product => product && isAvailable(product) && !product.isFee)
          .slice(0, limit);
      }

      function renderPersonalizedHomeSections() {
        if (!personalizationEnabled() || !isHomeRoute()) return;
        const container = app.querySelector('.da-home-modular');
        if (!container) return;
        const chosen = diversifiedRecommendations(7);
        const recent = recentProducts(10);
        const buyAgain = buyAgainProducts(6);
        const buySlot = container.querySelector('[data-home-personalization-slot="buy-again"]');
        const chosenSlot = container.querySelector('[data-home-personalization-slot="chosen"]');
        const recentSlot = container.querySelector('[data-home-personalization-slot="recent"]');
        if (buySlot) buySlot.innerHTML = buyAgain.length && typeof window.daHomeBuyAgainShelfHtml === 'function' ? window.daHomeBuyAgainShelfHtml(buyAgain) : '';
        if (chosenSlot) chosenSlot.innerHTML = chosen.length && typeof window.daHomePersonalizedMosaicHtml === 'function' ? window.daHomePersonalizedMosaicHtml(chosen) : '';
        if (recentSlot) recentSlot.innerHTML = recent.length && typeof window.daHomeRecentShelfHtml === 'function' ? window.daHomeRecentShelfHtml(recent) : '';
        syncVisibleCards();
        updateFavoritesUI();
      }

      function recordPurchaseFromCart() {
        if (!personalizationEnabled()) return;
        const items = getCartItems()
          .filter(item => item.product && !item.product.isFee && isAvailable(item.product))
          .map(item => ({ productId: String(item.product.id), qty: Number(item.qty || 1) }));
        if (!items.length) return;
        personalization.purchases.unshift({ at: new Date().toISOString(), items });
        personalization.purchases = personalization.purchases.slice(0, MAX_PURCHASES);
        items.forEach(item => {
          const product = getProductById(item.productId);
          bumpProduct(product, 12, `purchase:${Date.now()}`, false);
        });
        prunePersonalization();
        savePersonalizationData();
      }

      function setConsent(value) {
        personalization.consent = value === true;
        personalization.consentAt = new Date().toISOString();
        if (!value) {
          const keepConsent = { ...emptyPersonalization(), consent: false, consentAt: personalization.consentAt };
          personalization = keepConsent;
        }
        savePersonalizationData();
        closePersonalizationPanel();
        removeConsentBanner();
        if (isHomeRoute()) handleRoute();
        showToast(value ? 'Personalização ativada neste aparelho.' : 'Personalização desativada.');
      }

      function clearPersonalizationHistory() {
        const consent = personalization.consent;
        const consentAt = personalization.consentAt;
        personalization = emptyPersonalization();
        personalization.consent = consent;
        personalization.consentAt = consentAt;
        savePersonalizationData();
        closePersonalizationPanel();
        if (isHomeRoute()) handleRoute();
        showToast('Histórico de personalização apagado.');
      }

      function removeConsentBanner() {
        document.getElementById('da-personalization-consent')?.remove();
      }

      function showConsentBanner() {
        if (personalization.consent !== null || document.getElementById('da-personalization-consent')) return;
        const banner = document.createElement('section');
        banner.id = 'da-personalization-consent';
        banner.className = 'da-personalization-consent';
        banner.setAttribute('aria-label','Preferências de personalização');
        banner.innerHTML = `<div class="da-personalization-consent-copy"><strong>Podemos te indicar produtos e ofertas?</strong><span>Usamos apenas sua navegação neste aparelho para melhorar as sugestões. Você pode desativar quando quiser.</span></div><div class="da-personalization-consent-actions"><button type="button" data-personalization-action="decline">Agora não</button><button class="primary" type="button" data-personalization-action="accept">Sim, quero</button></div>`;
        document.body.appendChild(banner);
      }

      function openPersonalizationPanel() {
        let overlay = document.getElementById('da-personalization-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'da-personalization-overlay';
          overlay.className = 'da-personalization-overlay';
          document.body.appendChild(overlay);
        }
        overlay.innerHTML = `<div class="da-personalization-panel" role="dialog" aria-modal="true" aria-labelledby="da-personalization-title"><div class="da-personalization-panel-head"><div><strong id="da-personalization-title">Privacidade e personalização</strong><span>Controle os dados salvos somente neste navegador.</span></div><button type="button" data-personalization-action="close" aria-label="Fechar">×</button></div><div class="da-personalization-status"><span>Personalização</span><strong>${personalizationEnabled() ? 'Ativada' : 'Desativada'}</strong></div><p>Quando ativada, o site usa produtos vistos, categorias, favoritos, carrinho e pedidos enviados para organizar recomendações locais. Não guarda nome, CPF, telefone, e-mail ou endereço neste perfil.</p><div class="da-personalization-panel-actions">${personalizationEnabled() ? '<button type="button" data-personalization-action="clear">Apagar histórico</button><button class="danger" type="button" data-personalization-action="disable">Desativar personalização</button>' : '<button class="primary" type="button" data-personalization-action="enable">Ativar personalização</button>'}</div></div>`;
        overlay.classList.add('show');
      }

      function closePersonalizationPanel() {
        document.getElementById('da-personalization-overlay')?.classList.remove('show');
      }

      function injectPersonalizationStyles() {
        if (document.getElementById('da-personalization-styles')) return;
        const style = document.createElement('style');
        style.id = 'da-personalization-styles';
        style.textContent = `.da-personalization-consent{position:fixed;z-index:120;left:12px;right:12px;bottom:calc(var(--bottom-h) + var(--safe-bottom) + 10px);max-width:980px;margin:0 auto;padding:15px;border:1px solid var(--line);border-radius:18px;background:rgba(255,253,248,.98);box-shadow:0 18px 55px rgba(20,40,28,.18);display:grid;gap:12px}.da-personalization-consent-copy{display:grid;gap:5px}.da-personalization-consent-copy strong{font-size:15px;font-weight:850;color:var(--ink)}.da-personalization-consent-copy span{font-size:12.5px;line-height:1.45;color:var(--muted)}.da-personalization-consent-actions{display:grid;grid-template-columns:1fr;gap:8px}.da-personalization-consent-actions button,.da-personalization-panel-actions button{min-height:42px;padding:0 14px;border-radius:12px;border:1px solid var(--line-strong);background:#fff;color:var(--ink);font-size:13px;font-weight:800}.da-personalization-consent-actions button.primary,.da-personalization-panel-actions button.primary{background:var(--brand);border-color:var(--brand);color:#fff}.da-personalization-overlay{position:fixed;z-index:140;inset:0;padding:16px;background:rgba(15,23,42,.44);display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s ease}.da-personalization-overlay.show{opacity:1;pointer-events:auto}.da-personalization-panel{width:min(100%,520px);padding:20px;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.24);display:grid;gap:16px}.da-personalization-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.da-personalization-panel-head>div{display:grid;gap:4px}.da-personalization-panel-head strong{font-size:19px;color:var(--ink)}.da-personalization-panel-head span,.da-personalization-panel p{font-size:13px;line-height:1.5;color:var(--muted)}.da-personalization-panel-head button{width:38px;height:38px;border-radius:999px;border:1px solid var(--line);font-size:24px}.da-personalization-status{display:flex;justify-content:space-between;gap:12px;padding:13px;border-radius:14px;background:var(--surface-soft);font-size:14px}.da-personalization-status strong{color:var(--brand)}.da-personalization-panel-actions{display:grid;gap:8px}.da-personalization-panel-actions button.danger{color:#9f1239;background:#fff1f2;border-color:#fecdd3}.da-personalization-menu-button{width:100%;min-height:48px;padding:0 13px;border-radius:16px;background:#faf9f5;border:1px solid rgba(23,32,26,.08);display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--ink);font-size:13px;font-weight:800}.da-personalization-menu-button span:last-child{color:var(--brand)}[data-personalization-section]{display:block}@media(min-width:768px){.da-personalization-consent{bottom:18px;grid-template-columns:1fr auto;align-items:center;padding:16px 18px}.da-personalization-consent-actions{grid-template-columns:auto auto}.da-personalization-overlay{align-items:center}.da-personalization-panel-actions{grid-template-columns:1fr 1fr}.da-personalization-panel-actions .primary:only-child{grid-column:1/-1}}`;
        document.head.appendChild(style);
      }

      function appendPrivacyMenuCard() {
        const menu = $('site-menu-content');
        if (!menu || menu.querySelector('[data-personalization-menu]')) return;
        const section = document.createElement('section');
        section.className = 'menu-section-card';
        section.setAttribute('data-personalization-menu','');
        section.innerHTML = `<div class="menu-section-title">Privacidade</div><button class="da-personalization-menu-button" type="button" data-personalization-action="settings"><span>Personalização neste aparelho</span><span>${personalizationEnabled() ? 'Ativada' : 'Configurar'}</span></button>`;
        menu.appendChild(section);
      }

      const originalRenderHome = renderHome;
      renderHome = function(...args) {
        const result = originalRenderHome.apply(this,args);
        renderPersonalizedHomeSections();
        return result;
      };

      const originalRenderProduct = renderProduct;
      renderProduct = function(routeId) {
        clearTimeout(productViewTimer);
        const result = originalRenderProduct.call(this,routeId);
        const product = findProductByRoute(routeId);
        if (product && personalizationEnabled()) {
          activeViewedProductId = String(product.id);
          addRecentlyViewed(product);
          bumpProduct(product,1,'open');
          productViewTimer = setTimeout(() => {
            const currentHash = decodeURIComponent(location.hash || '');
            if (activeViewedProductId === String(product.id) && currentHash.includes('/produto/')) bumpProduct(product,2,'dwell');
          },VIEW_DWELL_MS);
        }
        return result;
      };

      const originalRenderCategory = renderCategory;
      renderCategory = function(cat) {
        const result = originalRenderCategory.call(this,cat);
        const decoded = decodeURIComponent(cat || '');
        if (personalizationEnabled() && cooldownAllows(`category:${norm(decoded)}`)) {
          bump('categories',decoded,2); prunePersonalization(); savePersonalizationData();
        }
        return result;
      };

      const originalRenderSubcategory = renderSubcategory;
      renderSubcategory = function(sub) {
        const result = originalRenderSubcategory.call(this,sub);
        const decoded = decodeURIComponent(sub || '');
        if (personalizationEnabled() && cooldownAllows(`subcategory:${norm(decoded)}`)) {
          bump('subcategories',decoded,3); prunePersonalization(); savePersonalizationData();
        }
        return result;
      };

      const originalRenderBrand = renderBrand;
      renderBrand = function(brand) {
        const result = originalRenderBrand.call(this,brand);
        const decoded = decodeURIComponent(brand || '');
        if (personalizationEnabled() && cooldownAllows(`brand:${norm(decoded)}`)) {
          bump('brands',decoded,2); prunePersonalization(); savePersonalizationData();
        }
        return result;
      };

      const originalRenderSearch = renderSearch;
      renderSearch = function(query) {
        const result = originalRenderSearch.call(this,query);
        const q = String(query || '').trim();
        if (personalizationEnabled() && q.length >= 3 && cooldownAllows(`search:${norm(q)}`,2*60*60*1000)) {
          const results = searchProducts(q).slice(0,12);
          const categories = [...new Set(results.map(p => p.categoria).filter(Boolean))].slice(0,3);
          const subcategories = [...new Set(results.map(p => p.subcategoria).filter(Boolean))].slice(0,3);
          const brands = [...new Set(results.map(p => p.marca).filter(Boolean))].slice(0,3);
          categories.forEach(value => bump('categories',value,1));
          subcategories.forEach(value => bump('subcategories',value,1));
          brands.forEach(value => bump('brands',value,0.5));
          prunePersonalization(); savePersonalizationData();
        }
        return result;
      };

      const originalSetQty = setQty;
      setQty = function(id,qty,options) {
        const key = String(id);
        const before = Number(state.cart[key] || 0);
        const result = originalSetQty.call(this,id,qty,options);
        const after = Number(state.cart[key] || 0);
        const product = getProductById(key);
        if (personalizationEnabled() && product && !product.isFee && before !== after && !(options && options.silent)) {
          if (after > before) bumpProduct(product,6,'cart-add');
          else bumpProduct(product,-2,'cart-remove');
        }
        return result;
      };

      const originalToggleFavorite = toggleFavorite;
      toggleFavorite = function(id,kind) {
        const wasFavorite = isFavorite(id,kind);
        const result = originalToggleFavorite.call(this,id,kind);
        if (personalizationEnabled() && kind !== 'kit') {
          const product = getProductById(String(id));
          if (product) bumpProduct(product,wasFavorite ? -5 : 8,wasFavorite ? 'favorite-remove' : 'favorite-add',false);
        }
        return result;
      };

      const originalOpenWhatsAppOrder = abrirWhatsAppPedido;
      abrirWhatsAppPedido = function(message) {
        recordPurchaseFromCart();
        return originalOpenWhatsAppOrder.call(this,message);
      };

      const originalRenderSiteMenuContent = renderSiteMenuContent;
      renderSiteMenuContent = function(...args) {
        const result = originalRenderSiteMenuContent.apply(this,args);
        appendPrivacyMenuCard();
        return result;
      };

      document.addEventListener('click', event => {
        const actionButton = event.target.closest('[data-personalization-action]');
        if (!actionButton) return;
        const action = actionButton.getAttribute('data-personalization-action');
        if (action === 'accept' || action === 'enable') setConsent(true);
        if (action === 'decline' || action === 'disable') setConsent(false);
        if (action === 'settings') openPersonalizationPanel();
        if (action === 'clear') clearPersonalizationHistory();
        if (action === 'close') closePersonalizationPanel();
      });

      document.addEventListener('click', event => {
        const overlay = document.getElementById('da-personalization-overlay');
        if (overlay && event.target === overlay) closePersonalizationPanel();
      });

      window.addEventListener('hashchange', () => {
        clearTimeout(productViewTimer);
        activeViewedProductId = '';
      });

      injectPersonalizationStyles();
      prunePersonalization();
      savePersonalizationData();
      setTimeout(showConsentBanner,900);
    })();

    init();
  })();
