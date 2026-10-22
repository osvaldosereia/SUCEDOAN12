import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root=fs.readFileSync('index.html','utf8');
const nested=fs.readFileSync('vitrine/index.html','utf8');
const carousel=fs.readFileSync('vitrine/basket-carousel.js','utf8');
assert.match(nested,/rel="canonical" href="https:\/\/donaantonia\.com\.br\/"/,'/vitrine/ must canonicalize to the public root');
assert.match(nested,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/,'/vitrine/ must preserve query and hash while redirecting');
const inline=[...root.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inline,'public inline app script must exist');
new vm.Script(inline,{filename:'index.html'});
new vm.Script(carousel,{filename:'vitrine/basket-carousel.js'});

const mobileStart=root.indexOf('@media(max-width:759px){\n      /* Mobile uses a light gradient');
assert.ok(mobileStart>=0,'mobile CSS should isolate the decorative banner');
const mobileRules=root.slice(mobileStart,root.indexOf('@media(min-width:760px){',mobileStart));
assert.match(mobileRules,/\.home-hero\{[^}]*background-image:none/,'4G/mobile should never fetch decorative hero image');
assert.match(root,/\.home-hero\{[^}]*home-grocery\.webp/,'desktop should retain existing hero photo');
assert.match(root,/basket-carousel\.js\?v=20261013-mobile-r4/,'changed image JS must bust browser caches');
assert.match(root,/rel="preconnect" href="https:\/\/ssbesxgaijknwsjbsbcz\.supabase\.co"/,'early API handshake must be retained');

const shell=root.slice(root.indexOf('function renderInitialShell(){'),root.indexOf('function basketCategoryControls('));
assert.match(shell,/id="basketSections"/,'first shell must use the same basket mount as the final home');
assert.match(shell,/id="homeOffersMount"/,'the offers section must be present before the first catalog response');
assert.match(shell,/homeIntro\(categories\)/,'brand hero and shortcuts must render immediately');
assert.match(shell,/home-loading-status/,'loading message should remain accessible');
assert.doesNotMatch(shell,/\+\s*section\('Categorias'/,'initial-only category sections must not linger after hydration');
const render=root.slice(root.indexOf('function renderHome(){'),root.indexOf('function paintOffersPage(){'));
assert.match(render,/const canPatch=Boolean\(existingHost&&content\.querySelector\('#homeOffersMount'\)\)/,'first response must use existing shell');
assert.match(render,/syncHomeBasketGroups\(host,records\)/,'first response must replace only the basket skeleton');
assert.match(render,/if\(!canPatch\)[\s\S]*?observeOffers\(\)/,'fresh navigation must still observe offers');
assert.match(render,/else if\(!state\.offersLoaded&&!state\.offersObserver\)[\s\S]*?observeOffers\(\)/,'shell-hydration must activate deferred offers');
assert.match(render,/else if\(state\.offersLoaded&&/,'cached offers should paint into reused mount');

const testEnv={};
const storage={getItem:()=>null,setItem(){},removeItem(){}};
new Function('window','document','localStorage','sessionStorage','location','history',carousel)(
  testEnv,{addEventListener(){}},storage,storage,{href:'https://donaantonia.com.br/'},{replaceState(){}}
);
const card={id:'c1',name:'Cesta Grande',display_price_cents:10000,carousel_items:[{image_url:'https://images.test/arroz.webp',name:'Arroz'}]};
const esc=s=>String(s),money=x=>String(x),name=x=>String(x);
const first=testEnv.BasketCarousel.card(card,esc,money,name,0);
const other=testEnv.BasketCarousel.card(card,esc,money,name,1);
assert.match(first,/\ssrc="https:\/\/images\.test\/arroz\.webp"/,'first photo must start immediately');
assert.match(first,/fetchpriority="high"/);
assert.doesNotMatch(first,/data-basket-src=/,'first photo must not wait for intersection');
assert.match(other,/data-basket-src="https:\/\/images\.test\/arroz\.webp"/,'other photos must wait for intersection');
assert.match(other,/loading="lazy"/);
assert.doesNotMatch(other,/\ssrc="/,'non-first image should not make immediate request');
assert.equal((first.match(/<img\b/g)||[]).length,1,'one photo per basket card');

assert.match(root,/window\.DAStorefrontPerf=\{snapshot:/,'browser should make local load measurements accessible');
assert.match(root,/type:'largest-contentful-paint',buffered:true/,'observe real browser LCP');
assert.match(root,/type:'paint',buffered:true/,'observe FCP');
assert.match(root,/da-home-first-cestas/,'measure first basket insertion');
assert.match(root,/da-home-full-catalog/,'measure final catalog insertion');

console.log('Storefront mobile image and first-paint R4 contract passed');
