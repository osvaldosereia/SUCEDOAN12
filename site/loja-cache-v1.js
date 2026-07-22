'use strict';

    function couponValid(coupon) {
      if (!coupon || coupon.ativo !== true) return false;
      const end = parseDate(coupon.validade);
      return !end || end >= new Date();
    }

    function couponByCode(code) {
      return state.coupons.find(coupon=>norm(coupon.codigo).replace(/\s/g,'')===norm(code).replace(/\s/g,'')) || null;
    }

    function activeCoupon() {
      const coupon = couponByCode(state.activeCoupon);
      return couponValid(coupon) ? coupon : null;
    }

    function couponMatches(coupon, product) {
      if (!coupon || !product) return false;
      const categories = (coupon.categorias || []).map(norm).filter(Boolean);
      const brands = (coupon.marcas || []).map(norm).filter(Boolean);
      const keywords = (coupon.palavras_chave || []).map(norm).filter(Boolean);
      if (!categories.length && !brands.length && !keywords.length) return true;
      const categoryText = norm([product.category,product.subcategory,product.subsubcategory].join(' '));
      const productText = norm([product.name,product.brand,product.category,product.subcategory,product.subsubcategory].join(' '));
      return categories.some(value=>categoryText.includes(value)||value.includes(categoryText))
        || brands.some(value=>norm(product.brand)===value||productText.includes(value))
        || keywords.some(value=>productText.includes(value));
    }

    function couponEligible(coupon, subtotal) {
      if (!couponValid(coupon)) return {ok:false,reason:'Cupom inativo ou vencido.'};
      if (subtotal < num(coupon.valorMinimo)) return {ok:false,reason:`Faltam ${money(num(coupon.valorMinimo)-subtotal)} para usar o cupom.`};
      if (coupon.grupo === 'cliente_novo' && state.customerStatus === 'existing') return {ok:false,reason:'Cupom exclusivo para a primeira compra.'};
      return {ok:true,reason:''};
    }

    function protectedBundleContext() {
      const protectedQty = {}, activeBundles = [];
      for (const bundle of state.bundles) {
        const canUse = Object.entries(bundle.items || {}).every(([id,qty]) => Number(state.cart[id] || 0) >= Number(protectedQty[id] || 0) + Number(qty || 0));
        if (!canUse) continue;
        activeBundles.push(bundle);
        Object.entries(bundle.items || {}).forEach(([id,qty])=>protectedQty[id]=Number(protectedQty[id]||0)+Number(qty||0));
      }
      return {protectedQty,activeBundles,adjustment:round(activeBundles.reduce((sum,bundle)=>sum+Number(bundle.adjustment||0),0))};
    }

    function cartItems() {
      return state.cartOrder.map(id => {
        const product = state.productsById.get(String(id));
        const qty = Number(state.cart[id] || 0);
        return product && qty > 0 ? {id:String(id),product,qty} : null;
      }).filter(Boolean);
    }

    function cartPricing() {
      const items = cartItems();
      const bundles = protectedBundleContext();
      const subtotalProducts = round(items.reduce((sum,item)=>sum+item.product.price*item.qty,0));
      const subtotal = round(subtotalProducts + bundles.adjustment);
      const coupon = activeCoupon();
      const eligibility = coupon ? couponEligible(coupon,subtotal) : {ok:false,reason:''};
      let couponDiscount=0,wholesaleDiscount=0,expiryBulkDiscount=0,totalProducts=0,participatingItems=0;
      const lines = items.map(item => {
        const protectedQty = Math.min(item.qty,Number(bundles.protectedQty[item.id]||0));
        const extraQty = Math.max(0,item.qty-protectedQty);
        const current = item.product.price;
        const couponCandidate = coupon && eligibility.ok && couponMatches(coupon,item.product) && coupon.tipo === 'percentual'
          ? round(Math.max(0,item.product.regularPrice*(1-num(coupon.desconto)/100))) : current;
        const couponUnit = Math.min(current,couponCandidate);
        const expiryEligible = extraQty >= CONFIG.WHOLESALE_QTY && item.product.expiryDays != null && item.product.expiryDays >= 0 && item.product.expiryDays < 40;
        const expiryUnit = expiryEligible ? round(couponUnit*(1-CONFIG.EXPIRY_BULK_RATE)) : couponUnit;
        const wholesaleEligible = extraQty >= CONFIG.WHOLESALE_QTY;
        const effectiveExtra = wholesaleEligible ? round(expiryUnit*(1-CONFIG.WHOLESALE_RATE)) : expiryUnit;
        couponDiscount += round((current-couponUnit)*extraQty);
        expiryBulkDiscount += round((couponUnit-expiryUnit)*extraQty);
        wholesaleDiscount += round((expiryUnit-effectiveExtra)*extraQty);
        if (couponUnit < current) participatingItems += extraQty;
        const total = round(protectedQty*current + extraQty*effectiveExtra);
        totalProducts += total;
        return Object.assign({},item,{protectedQty,extraQty,effectiveUnit:item.qty ? round(total/item.qty) : current,total});
      });
      const total = round(totalProducts + bundles.adjustment);
      return {
        lines,bundles,coupon,eligibility,subtotalProducts,subtotal,total,
        couponDiscount:round(couponDiscount),wholesaleDiscount:round(wholesaleDiscount),
        expiryBulkDiscount:round(expiryBulkDiscount),discount:round(subtotal-total),participatingItems
      };
    }

    function productDisplay(product) {
      const coupon = activeCoupon();
      const candidate = coupon && couponValid(coupon) && couponMatches(coupon,product) && coupon.tipo === 'percentual'
        ? round(product.regularPrice*(1-num(coupon.desconto)/100)) : product.price;
      const effective = Math.min(product.price,candidate);
      return {
        effective, original:Math.max(product.regularPrice,effective),
        discount:product.regularPrice > effective ? Math.round((product.regularPrice-effective)/product.regularPrice*100) : 0
      };
    }

    function readLocal(key, fallback) {
      return safeJson(localStorage.getItem(key) || '',fallback);
    }

    function writeLocal(key, value) {
      try { localStorage.setItem(key,JSON.stringify(value)); } catch (_) {}
    }

    function restoreLocalState() {
      const saved = readLocal(CONFIG.CART_KEY,null);
      if (saved && Date.now()-Number(saved.savedAt||0) <= CONFIG.CART_MAX_AGE) {
        state.cart = saved.cart || {};
        state.cartOrder = Array.isArray(saved.cartOrder) ? saved.cartOrder.map(String) : Object.keys(state.cart);
        state.bundles = Array.isArray(saved.bundles) ? saved.bundles : [];
        state.basketDrafts = saved.basketDrafts || {};
      }
      const favorites = readLocal(CONFIG.FAVORITES_KEY,[]);
      state.favorites = new Set(Array.isArray(favorites) ? favorites.map(String) : []);
      const coupon = readLocal(CONFIG.COUPON_KEY,null);
      state.activeCoupon = coupon && coupon.codigo ? String(coupon.codigo).toUpperCase() : '';
    }

    function saveCart() {
      writeLocal(CONFIG.CART_KEY,{savedAt:Date.now(),cart:state.cart,cartOrder:state.cartOrder,bundles:state.bundles,basketDrafts:state.basketDrafts});
    }

    function saveFavorites() {
      writeLocal(CONFIG.FAVORITES_KEY,Array.from(state.favorites));
    }

    function removeLegacyRuntimeCaches() {
      const key = 'da_site_zero_runtime_clean_v1';
      try {
        if (localStorage.getItem(key) === '1') return;
        localStorage.setItem(key,'1');
      } catch (_) {}
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())))
          .catch(()=>{});
      }
      if ('caches' in window) {
        caches.keys()
          .then(names=>Promise.all(names.map(name=>caches.delete(name))))
          .catch(()=>{});
      }
    }

    function openDb() {
      return new Promise((resolve,reject)=>{
        if (!('indexedDB' in window)) return resolve(null);
        const request = indexedDB.open('dona-antonia-store',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('resources');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
    }

    async function cacheGet(key) {
      try {
        const db = await openDb(); if (!db) return null;
        return await new Promise((resolve,reject)=>{
          const request=db.transaction('resources').objectStore('resources').get(key);
          request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
        });
      } catch (_) { return null; }
    }

    async function cacheSet(key,value) {
      try {
        const db = await openDb(); if (!db) return;
        await new Promise((resolve,reject)=>{
          const tx=db.transaction('resources','readwrite');
          tx.objectStore('resources').put({savedAt:Date.now(),data:value},key);
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
        });
      } catch (_) {}
    }

    async function fetchJson(url, timeout=10000) {
      const controller = 'AbortController' in window ? new AbortController() : null;
      const timer = controller ? setTimeout(()=>controller.abort(),timeout) : null;
      try {
        const response = await fetch(`${url}${url.includes('?')?'&':'?'}v=${encodeURIComponent(CONFIG.BUILD)}`,{
          cache:'no-cache',headers:{Accept:'application/json'},signal:controller ? controller.signal : undefined
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } finally { if (timer) clearTimeout(timer); }
    }

    const RESOURCE_DEFS = {
      products:{url:CONFIG.PRODUCTS_URL,apply:setProducts},
      baskets:{url:CONFIG.BASKETS_URL,apply:data=>state.baskets=(Array.isArray(data)?data:Object.values(data||{})).filter(Boolean).map(normalizeBasket).filter(item=>item.id&&item.name)},
      kits:{url:CONFIG.KITS_URL,apply:data=>state.kits=(Array.isArray(data)?data:Object.values(data||{})).filter(Boolean).map(normalizeKit).filter(item=>item.id&&item.name)},
      coupons:{url:CONFIG.COUPONS_URL,apply:data=>state.coupons=(Array.isArray(data)?data:Object.values(data||{})).filter(Boolean)},
      banners:{url:CONFIG.BANNERS_URL,apply:data=>state.banners=Array.isArray(data)?data:Array.isArray(data && data.banners) ? data.banners : []}
    };

    async function hydrateCaches() {
      const cached = await Promise.all(Object.keys(RESOURCE_DEFS).map(async key=>[key,await cacheGet(key)]));
      for (const [key,value] of cached) if (value && value.data) RESOURCE_DEFS[key].apply(value.data);
      return state.products.length > 0;
    }

    async function refreshResources() {
      const results = await Promise.allSettled(Object.entries(RESOURCE_DEFS).map(async ([key,definition])=>{
        const data=await fetchJson(definition.url,key==='products'?14000:9000);
        definition.apply(data);await cacheSet(key,data);return key;
      }));
      const productResult=results[0];
      if (productResult.status==='rejected' && !state.products.length) throw productResult.reason;
      state.resourcesReady=true;
    }

