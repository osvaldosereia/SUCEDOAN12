'use strict';

    const CONFIG = Object.freeze({
      BUILD: '2026-07-21-site-zero-v1',
      SITE_URL: 'https://www.donaantonia.com.br',
      PRODUCTS_URL: '/site/produtos-home.json',
      KITS_URL: '/site/kits.json',
      BASKETS_URL: '/site/produtos-cesta-basica.json',
      COUPONS_URL: '/site/cuponsativos.json',
      BANNERS_URL: '/site/banners/banners.json',
      VERSION_URL: '/site/app-version.json',
      FIREBASE_PRODUCT_BASE: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos',
      FIREBASE_ORDERS_BASE: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/pedidos',
      MAKE_ORDER_WEBHOOK: 'https://hook.eu1.make.com/cmjv3cc829ocf26vo1h8fs61n5lkt6hc',
      CLIENT_LOOKUP_WEBHOOK: 'https://hook.eu1.make.com/1wfehhacklarj1h4c78xrh4f7yjdlp9v',
      WHATSAPP: '5565998150975',
      MIN_ORDER: 75,
      WHOLESALE_QTY: 3,
      WHOLESALE_RATE: .05,
      EXPIRY_BULK_RATE: .10,
      CART_KEY: 'da_carrinho_v1',
      CLIENT_KEY: 'da_checkout_cliente_v1',
      FAVORITES_KEY: 'da_favoritos_v1',
      COUPON_KEY: 'da_cupom_ativo_v1',
      ORDER_QUEUE_KEY: 'da_pedidos_pendentes_v2',
      CART_MAX_AGE: 6 * 60 * 60 * 1000,
      LOGO: '/img/logoantonia5.png'
    });

    const ROUTINES = Object.freeze({
      'compra-mes': { title:'Compra do mês', terms:['arroz','feijao','oleo','acucar','cafe','leite','macarrao','molho','farinha','sal'] },
      limpeza: { title:'Limpeza da casa', terms:['sabao','detergente','desinfetante','amaciante','agua sanitaria','multiuso','esponja','papel higienico'] },
      cafe: { title:'Café da manhã', terms:['cafe','leite','achocolatado','biscoito','bolacha','margarina','pao'] },
      higiene: { title:'Higiene e beleza', terms:['sabonete','shampoo','condicionador','creme dental','desodorante','absorvente','hidratante'] }
    });

    const state = {
      products: [], productsById: new Map(), productsByCode: new Map(),
      baskets: [], kits: [], coupons: [], banners: [],
      cart: {}, cartOrder: [], bundles: [], basketDrafts: {},
      favorites: new Set(), activeCoupon: '', customerStatus: 'unknown',
      resourcesReady: false, catalogLoadedAt: 0, catalogSource: 'site/produtos-home.json'
    };

    const app = document.getElementById('app');
    const $ = id => document.getElementById(id);
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
    const norm = value => String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const slug = value => norm(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    const num = value => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const text = String(value == null ? '' : value).trim();
      if (!text) return 0;
      return Number(text.includes(',') ? text.replace(/\./g,'').replace(',','.') : text) || 0;
    };
    const text = value => String(value == null ? '' : value).replace(/\s+/g,' ').trim();

    function safeJson(value, fallback) {
      try { return JSON.parse(value); } catch (_) { return fallback; }
    }

    function canonicalImage(value) {
      const source = String(value || '').trim();
      if (!source || /site\/tmp\/ia-referencias\//i.test(source)) return CONFIG.LOGO;
      if (/^data:/i.test(source)) return source;
      const raw = source.match(/^https:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/(?:main|master)\/(.+)$/i);
      if (raw) return '/' + raw[1].replace(/^\/+/,'');
      try {
        const url = new URL(source, location.origin);
        if (url.origin === location.origin || /^(?:www\.)?donaantonia\.com\.br$/i.test(url.hostname)) return url.pathname;
        return /^https?:$/i.test(url.protocol) ? url.href : CONFIG.LOGO;
      } catch (_) {
        let clean = source.replace(/^(?:\.\.\/|\.\/)+/g,'').replace(/^\/+/,'');
        if (/^img\/(?:produtos_3|produtos_2|produtos|kits)\//i.test(clean)) clean = 'site/' + clean;
        return '/' + clean;
      }
    }

    function imageError(image) {
      if (!image || image.dataset.fallbackDone === '1') return;
      image.dataset.fallbackDone = '1';
      image.onerror = null;
      image.src = CONFIG.LOGO;
    }
    window.DAImageError = imageError;

    function parseDate(value, endOfDay = true) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const date = new Date(+match[3], +match[2]-1, +match[1], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const date = new Date(+match[1], +match[2]-1, +match[3], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function daysUntil(value) {
      const date = parseDate(value);
      if (!date) return null;
      const today = new Date(); today.setHours(0,0,0,0);
      date.setHours(0,0,0,0);
      return Math.round((date - today) / 86400000);
    }

    function expiryRate(days) {
      if (days == null || days <= 2 || days > 105) return 0;
      if (days <= 7) return .50;
      if (days <= 15) return .40;
      if (days <= 31) return .35;
      if (days <= 46) return .30;
      if (days <= 65) return .25;
      if (days <= 76) return .20;
      if (days <= 91) return .10;
      return .05;
    }

    function productExpiry(raw) {
      return raw.validade || raw.vencimento || raw.data_validade || raw.validade_produto || raw.dataValidade || raw.expiry || raw.expiry_date || '';
    }

    function normalizeProduct(raw, key, index) {
      const name = text(raw.nome || raw.name || raw.descricao || 'Produto');
      const id = text(raw.codigo || raw.id || key || index || slug(name));
      const regularPrice = num(raw.preco || raw.price || raw.valor);
      const expiry = productExpiry(raw);
      const expiryDays = daysUntil(expiry);
      const offerEnd = parseDate(raw.validade_oferta || raw.validadeOferta || '');
      const explicitOffer = num(raw.preco_oferta || raw.precoOferta);
      const explicitActive = explicitOffer > 0 && (!offerEnd || offerEnd >= new Date());
      const automaticRate = expiryRate(expiryDays);
      const automaticPrice = automaticRate ? round(regularPrice * (1 - automaticRate)) : regularPrice;
      const price = round(Math.max(0, Math.min(
        regularPrice || Infinity,
        explicitActive ? explicitOffer : Infinity,
        automaticRate ? automaticPrice : Infinity
      )));
      const finalPrice = Number.isFinite(price) ? price : regularPrice;
      const image = canonicalImage(raw.url_imagem || raw.imagem_url || raw.urlImagem || raw.imagem || raw.image || raw.img || raw.foto || raw.foto_url || raw.imagem_path);
      const product = {
        id, firebaseKey:text(key || raw.firebaseKey || raw.id || raw.codigo || id),
        codigo:text(raw.codigo || raw.sku || id), name, slug:slug(name),
        regularPrice, price:finalPrice, stock:Math.max(0,parseInt(raw.estoque,10)||0),
        status:text(raw.situacao || raw.status), category:text(raw.categoria || raw.category || 'Outros') || 'Outros',
        subcategory:text(raw.subcategoria), subsubcategory:text(raw.subsubcategoria), brand:text(raw.marca),
        package:text(raw.embalagem), description:text(raw.descricao || raw.descricao_curta || raw.description),
        gtin:text(raw.gtin || raw.ean), ean:text(raw.ean || raw.gtin), expiry, expiryDays,
        gondola:text(raw.gondola || raw['gôndola']), shelf:text(raw.prateleira), location:text(raw.localizacao),
        image, discountPercent:regularPrice > finalPrice ? Math.round((regularPrice-finalPrice)/regularPrice*100) : 0
      };
      product.search = norm([product.name,product.brand,product.package,product.category,product.subcategory,product.subsubcategory,product.codigo,product.gtin,product.ean].join(' '));
      return product;
    }

    function setProducts(raw) {
      const entries = Array.isArray(raw) ? raw.map((item,index)=>[String(index),item]) : Object.entries(raw || {});
      const products = entries.map(([key,value],index)=>normalizeProduct(value || {},key,index)).filter(product => {
        if (norm(product.status) === 'i' || norm(product.status) === 'inativo') return false;
        return product.regularPrice > 0;
      }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      state.products = products;
      state.productsById = new Map(products.map(product=>[String(product.id),product]));
      state.productsByCode = new Map();
      for (const product of products) {
        [product.id,product.firebaseKey,product.codigo,product.gtin,product.ean].filter(Boolean).forEach(code => {
          const key = norm(String(code).replace(/[^a-z0-9]/gi,''));
          if (key && !state.productsByCode.has(key)) state.productsByCode.set(key,product);
        });
      }
      state.catalogLoadedAt = Date.now();
    }

    function normalizeBasket(raw) {
      return {
        id:text(raw.id || raw.codigo), code:text(raw.codigo || raw.id), name:text(raw.nome || 'Cesta básica'),
        price:num(raw.preco || raw.price), image:canonicalImage(raw.imagem || raw.url_imagem),
        description:text(raw.descricao || 'Cesta pronta com produtos selecionados.'),
        products:Array.isArray(raw.produtos) ? raw.produtos : []
      };
    }

    function normalizeKit(raw) {
      return {
        id:text(raw.id || raw.codigo), code:text(raw.codigo || raw.id), name:text(raw.nome || 'Kit promocional'),
        price:num(raw.preco_novo || raw.preco || raw.price), oldPrice:num(raw.preco_anterior || raw.precoOriginal || raw.preco_original),
        image:canonicalImage(raw.imagem || raw.url_imagem), description:text(raw.descricao),
        products:Array.isArray(raw.produtos) ? raw.produtos : [], active:raw.ativo !== false,
        start:raw.data_inicio || raw.dataInicio || '', end:raw.data_fim || raw.dataFim || '',
        stock:Math.max(0,parseInt(raw.estoque_disponivel || raw.estoqueDisponivel,10)||0),
        limit:Math.max(0,parseInt(raw.limite_kits || raw.limiteKits,10)||0)
      };
    }

    function findProductByCode(value) {
      const key = norm(String(value || '').replace(/[^a-z0-9]/gi,''));
      return state.productsByCode.get(key) || null;
    }

    function lineInfo(line) {
      if (line && typeof line === 'object') {
        return {
          code:line.codigo || line.sku || line.id || line.gtin || line.ean || '',
          qty:Math.max(1,Number(line.qtd || line.qty || line.quantidade || 1)),
          substitutes:Array.isArray(line.substitutos) ? line.substitutos : []
        };
      }
      const match = String(line || '').trim().match(/^(\d+)\s*x\s*(.+)$/i);
      return {code:match ? match[2] : line,qty:match ? +match[1] : 1,substitutes:[]};
    }

    function resolveBundleProducts(lines) {
      return (lines || []).map(line => {
        const parsed = lineInfo(line);
        const product = [parsed.code].concat(parsed.substitutes).map(findProductByCode).find(Boolean);
        return product ? {product,qty:parsed.qty} : null;
      }).filter(Boolean);
    }

    function isAvailable(product) {
      if (!product || product.stock <= 0 || product.price <= 0) return false;
      return product.expiryDays == null || product.expiryDays > 2;
    }

    function kitActive(kit) {
      if (!kit || !kit.active || kit.price <= 0 || !kit.products.length) return false;
      const now = new Date(), start = parseDate(kit.start,false), end = parseDate(kit.end,true);
      if (start && now < start || end && now > end) return false;
      const rows = resolveBundleProducts(kit.products);
      if (rows.length !== kit.products.length) return false;
      const capacity = Math.min.apply(null,rows.map(row=>Math.floor(row.product.stock/row.qty)));
      const limit = kit.limit > 0 ? Math.min(capacity,kit.limit) : capacity;
      const stock = kit.stock > 0 ? Math.min(limit,kit.stock) : limit;
      return stock > 0 && kit.price < rows.reduce((sum,row)=>sum+row.product.price*row.qty,0);
    }

