import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const home=source.slice(source.indexOf('async function home('),source.indexOf('async function sellableMap('));
const detail=source.slice(source.indexOf('async function basket(id:string){'),source.indexOf('function groupChanged('));
const quote=source.slice(source.indexOf('async function quote(payload:any){'),source.indexOf('async function resolveCode('));
const carousel=fs.readFileSync('vitrine/basket-carousel.js','utf8');
const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');
const vm=await import('node:vm');

const totalHelper=source.match(/function basketTotalItems\(items:any\[\]\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(totalHelper,'basket total item helper exists');
const sum=vm.runInNewContext('('+totalHelper.replace('items:any[]','items')+')');
assert.equal(sum([{quantity:4},{quantity:4},{quantity:4}]),12,'sum all item quantities, not product types');
assert.equal(sum([{quantity:4},{quantity:0},{quantity:-2},{quantity:'bad'}]),4,'ignore invalid/nonpositive quantities');
assert.match(source,/total_item_count:basketTotalItems\(\[\.\.\.items\.values\(\)\]\)/,'legacy baskets expose total quantity');
assert.match(source,/total_item_count:basketTotalItems\(carousel\)/,'mold baskets expose total selected composition quantity');
for(const [name,html] of [['root',root],['vitrine',vitrine]]){
  assert.match(html,/size_card:true,size_key:sizeKey/,'size picker marks its compact cards');
  assert.match(html,/basket-size-grande/,'Grande pastel background is defined');
  assert.match(html,/basket-size-economica/,'Economica pastel background is defined');
}
const cardStart=carousel.indexOf('window.BasketCarousel={');
const cardEnd=carousel.indexOf('\n};',cardStart)+3;
assert.ok(cardStart>=0&&cardEnd>cardStart,'carousel card renderer exists');
const context={window:{}};
vm.runInNewContext(carousel.slice(cardStart,cardEnd),context);
const rendered=context.window.BasketCarousel.card({id:'basket',name:'Grande',size_card:true,size_key:'grande',total_item_count:12,display_price_cents:1234},String,String,x=>x);
assert.match(rendered,/12 itens/);
assert.doesNotMatch(rendered,/no total/);
assert.match(rendered,/Ver produtos/);
assert.match(rendered,/basket-size-grande/);
assert.doesNotMatch(rendered,/Personalizar/);
const sizePhotos={
  grande:'/site/img/CESTA-GRANDE-KOBLENZ.webp',
  media:'/site/img/CESTA-MEDIA-BONINI.webp',
  pequena:'/site/img/CESTA-PEQUENA-BONINI.webp',
  mini:'/site/img/CESTA-MINI-KOBLENZ.webp',
  economica:'/img/cesta-basica-cuiaba-varzea-grande-economica.avif'
};
let photoBytes=0;
for(const [size,path] of Object.entries(sizePhotos)){
  const card=context.window.BasketCarousel.card({id:'basket-'+size,name:size,size_card:true,size_key:size,total_item_count:12,display_price_cents:1234},String,String,x=>x,0);
  assert.match(card,new RegExp('src="'+path.replaceAll('/','\\/').replaceAll('.','\\.')+'"'),size+' card shows the matching photo');
  assert.match(card,new RegExp('alt="Cesta '+size+'"'),size+' photo has descriptive alt text');
  const bytes=fs.statSync(path.slice(1)).size;photoBytes+=bytes;
  assert.ok(bytes<100_000,size+' photo stays below 100 KB');
}
const lazyPhoto=context.window.BasketCarousel.card({id:'basket-media',name:'Média',size_card:true,size_key:'media',display_price_cents:1234},String,String,x=>x,2);
assert.ok(lazyPhoto.includes('data-basket-src="'+sizePhotos.media+'"'),'non-priority basket photos use deferred loading');
assert.match(lazyPhoto,/loading="lazy"/,'non-priority basket photos keep native lazy loading');
assert.ok(photoBytes<350_000,'all five basket photos stay under 350 KB total');
assert.match(root,/basket-size-card-photo/,'home page styles the basket size photos');
assert.ok(root.includes('basket-carousel.js?v=20261019-basket-size-photos-v1'),'home page refreshes the carousel asset cache');
assert.match(home,/basket_commercial_catalog_v1/);assert.match(home,/public_name/);assert.match(home,/sale_price/);assert.match(home,/public_available/);
assert.match(detail,/basket_commercial_catalog_v1/);assert.match(detail,/splitLotItems/);assert.match(detail,/basket_stock_lot_items/);
assert.match(quote,/basket_commercial_catalog_v1/);assert.match(quote,/let total=Number\(c\.sale_price\|\|0\)/);
assert.doesNotMatch(home,/basket_split_availability_v1|basket_current_lot_v1/);
console.log('Basket carousel service: canonical lot name/price, composition and stock source passed');
