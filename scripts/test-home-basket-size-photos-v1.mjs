import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('index.html','utf8');
const source=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const context={
  window:{},
  location:{href:'https://donaantonia.com.br/'},
  URL,
  history:{replaceState(){}},
  localStorage:{getItem(){return null},removeItem(){},setItem(){}},
  sessionStorage:{getItem(){return null},setItem(){}},
  document:{addEventListener(){}},
  console,
  Date,
  setTimeout
};
vm.runInNewContext(source,context);
const photos={
  grande:'/img/CESTA-GRANDE-ALVINO.webp',
  media:'/img/CESTA-MEDIA-BONINI.webp',
  pequena:'/img/CESTA-PEQUENA-BONINI.webp',
  mini:'/img/CESTA-MINI-BONINI.webp',
  economica:'/img/cesta-basica-cuiaba-varzea-grande-economica.avif'
};
const labels={grande:'Grande',media:'Média',pequena:'Pequena',mini:'Mini',economica:'Econômica'};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const htmlFor=(size,index)=>context.window.BasketCarousel.card(
  {id:'basket-'+size,name:size,size_card:true,size_key:size,total_item_count:12,display_price_cents:10000},
  esc,value=>'R$ '+value,name=>name,index
);
for(const [size,path] of Object.entries(photos)){
  const markup=htmlFor(size,0);
  assert.ok(markup.includes('src="'+path+'"'),size+' card should load its matching basket photo');
  assert.ok(markup.includes('alt="Cesta '+size+'"'),size+' photo needs descriptive alt text');
  const filePath=path.startsWith('/site/')?path.slice(1):path.slice(1);
  const bytes=fs.statSync(filePath).size;
  assert.ok(bytes<100_000,size+' photo should stay under 100 KB');
}

// Match the live storefront-v2 home payload, which has category/subcategory labels and image_url,
// but does not include client-only size_card or size_key flags.
for(const [size,path] of Object.entries(photos)){
  const markup=context.window.BasketCarousel.card(
    {id:'catalog-'+size,name:labels[size],subcategory_name:labels[size],image_url:path,size_card:false,total_item_count:12,display_price_cents:10000},
    esc,value=>'R$ '+value,name=>name,0
  );
  assert.ok(markup.includes('class="card basket-card basket-size-card basket-size-'+size+'"'),size+' live catalog record should be recognized as a size card');
  assert.ok(markup.includes('src="'+path+'"'),size+' live catalog image_url should be rendered');
}

const homeShellCard=context.window.BasketCarousel.card(
  {id:'home-shell-mini',name:'Mini',size_card:true,size_key:'mini',home_shell:true,total_item_count:12,display_price_cents:9876,stock_quantity:773},
  esc,value=>'R$ '+value,name=>name,0
);
assert.ok(homeShellCard.includes('Ver produtos'),'home size card must keep its product action');
assert.doesNotMatch(homeShellCard,/basket-card-item-total|basket-price-amount|class="price"|9876|773|12 itens/,'home size cards must hide item composition, price and stock');

const deferred=htmlFor('media',2);
assert.ok(deferred.includes('data-basket-src="'+photos.media+'"'),'non-priority photos should load lazily');
assert.ok(deferred.includes('loading="lazy"'),'non-priority photos should use native lazy loading');
assert.ok(html.includes('.basket-size-card-photo'),'home card photo sizing styles are present');
assert.match(html,/basket-carousel\.js\?v=20261022-home-shell-v1/,'home shell cards must load the module version that hides price and item count');
assert.ok(Object.values(photos).reduce((sum,path)=>sum+fs.statSync(path.slice(1)).size,0)<350_000,'all five above-the-fold size photos stay under 350 KB total');
console.log('Home basket size photos: PASS');
