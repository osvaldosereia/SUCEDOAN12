import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const page=fs.readFileSync('index.html','utf8');
const nested=fs.readFileSync('vitrine/index.html','utf8');
const carousel=fs.readFileSync('vitrine/basket-carousel.js','utf8');
assert.match(nested,/rel="canonical" href="https:\/\/donaantonia\.com\.br\/"/,'/vitrine/ must canonicalize to the public root');
assert.match(nested,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/,'/vitrine/ must preserve query and hash while redirecting');
const inline=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inline,'public inline script must be present');
new vm.Script(inline,{filename:'index.html'});
new vm.Script(carousel,{filename:'basket-carousel.js'});
assert.match(page,/basket-carousel\.js\?v=20261021-price-hierarchy-v1/,'asset URL must invalidate previous cached script');
const region=page.slice(page.indexOf('const homeSubgroupSignatures='),page.indexOf('function paintOffersPage()'));
assert.match(region,/const homeSubgroupSignatures=new WeakMap/);
assert.match(region,/homeSubgroupSignatures\.get\(subgroup\)!==sub\.signature/,'unchanged subgroups must be reused');
assert.match(region,/if\(host\.children\[index\]!==sectionNode\)/,'category ordering must be preserved');
assert.match(region,/if\(changed\)[\s\S]*BasketCarousel\.mount\(host\)/,'only altered sections remount observers');
assert.match(region,/if\(!canPatch\)\{[\s\S]*content\.innerHTML=homeIntro/,'full page replacement must occur only on fresh navigation');
assert.match(region,/if\(!state\.homePartial&&existingRemaining\)existingRemaining\.remove\(\)/,'progressive loading placeholder must disappear');
assert.match(region,/if\(!canPatch\)\{[\s\S]*observeOffers\(\)/,'existing loaded offers must not be reloaded on catalog updates');
assert.match(region,/function syncHomeBasketGroups\(host,records\)/);
assert.match(page,/BasketCarousel\.card\(b,esc,money,basketName,index\)/,'card must receive global image index');

const start=page.indexOf('const homeSubgroupSignatures=');
const end=page.indexOf('function fragmentElement(',start);
assert.ok(start>=0&&end>start);
const groupFactory=new Function('esc','basketCard',page.slice(start,end)+'return homeBasketGroupRecords;');
const records=groupFactory(v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;'),(b,i)=>'<article data-card="'+b.id+'" data-index="'+i+'"></article>');
const grande={id:'large',name:'Grande'};
const mini={id:'small',name:'Mini'};
const initial=[{id:'complete',name:'Cestas Completas',subcategories:[grande]}];
const complete=[{id:'complete',name:'Cestas Completas',subcategories:[grande,mini]}];
const largeBasket={id:'big',category_id:'complete',subcategory_id:'large',display_price_cents:9500,carousel_items:[{name:'Arroz'}]};
const smallBasket={...largeBasket,id:'small',subcategory_id:'small'};
const initialRecords=records([largeBasket],initial);
const completeRecords=records([largeBasket,smallBasket],complete);
assert.equal(initialRecords[0].subgroups[0].signature,completeRecords[0].subgroups[0].signature,'first Grande card must be retained through the priority/full transition');
assert.match(initialRecords[0].subgroups[0].markup(),/data-index="0"/);
assert.match(completeRecords[0].subgroups[1].markup(),/data-index="1"/);
const changed=records([{...largeBasket,display_price_cents:9900},smallBasket],complete);
assert.notEqual(changed[0].subgroups[0].signature,completeRecords[0].subgroups[0].signature,'changed prices must refresh their own subgroup');
assert.equal(changed[0].subgroups[1].signature,completeRecords[0].subgroups[1].signature,'unrelated subgroup must remain intact');

const mockWindow={};
const testStorage={getItem:()=>null,removeItem(){},setItem(){}};
const environment=new Function('window','document','localStorage','sessionStorage','location','history',carousel);
environment(mockWindow,{addEventListener(){}},testStorage,testStorage,{href:'https://donaantonia.com.br/'},{replaceState(){}});
assert.ok(mockWindow.BasketCarousel?.card,'carousel must expose its public API');
const b={id:'basket',name:'Grande Completa',size_key:'grande',size_card:true,image_url:'https://example.test/arroz.webp',display_price_cents:9500};
const esc=v=>String(v);
const money=v=>'R$ '+(v/100).toFixed(2);
const priorityPhoto=mockWindow.BasketCarousel.card(b,esc,money,v=>v,0);
const lazyPhoto=mockWindow.BasketCarousel.card(b,esc,money,v=>v,1);
assert.match(priorityPhoto,/fetchpriority="high"/,'first basket image should have high network priority');
assert.match(priorityPhoto,/loading="eager"/);
assert.doesNotMatch(lazyPhoto,/fetchpriority="high"/,'only first card should be high priority');
assert.match(lazyPhoto,/loading="lazy"/);
assert.match(priorityPhoto,/\ssrc="https:\/\/example\.test\/arroz\.webp"/,'the priority image must load immediately without an observer');
assert.doesNotMatch(priorityPhoto,/data-basket-src=/,'priority photo must not wait for observer');
assert.match(lazyPhoto,/data-basket-src=/,'non-priority photos must stay viewport gated');
assert.equal((priorityPhoto.match(/<img\b/g)||[]).length,1,'only one image per basket card');


// Execute the actual DOM reconciliation code against a minimal DOM test double.
// This catches accidental replacement of existing cards and redundant remounts.
class TestElement {
  constructor(type='section',heading=''){
    this.children=[];this.dataset={};this.parentNode=null;
    this.classList={contains:name=>name===type};
    if(type==='section'){
      const head=new TestElement('section-head');head.parentNode=this;this.children.push(head);
      this.heading={textContent:heading};
    }
  }
  insertBefore(node,reference){
    if(node.parentNode){const old=node.parentNode.children.indexOf(node);if(old>=0)node.parentNode.children.splice(old,1)}
    const index=reference?this.children.indexOf(reference):-1;
    this.children.splice(index<0?this.children.length:index,0,node);
    node.parentNode=this;return node;
  }
  replaceWith(node){const parent=this.parentNode;if(!parent)throw Error('missing parent');parent.insertBefore(node,this);this.remove()}
  remove(){if(this.parentNode){const i=this.parentNode.children.indexOf(this);if(i>=0)this.parentNode.children.splice(i,1);this.parentNode=null}}
  querySelector(query){return query==='.section-head h2'?this.heading||null:null}
  querySelectorAll(query){return query==='[data-basket]'?[]:[]}
}
const fakeDocument={createElement(type){
  assert.equal(type,'template');
  const element={content:{firstElementChild:null}};
  Object.defineProperty(element,'innerHTML',{set(html){
    const isSection=html.startsWith('<section'),title=(html.match(/<h2>(.*?)<\/h2>/)||[])[1]||'';
    const node=new TestElement(isSection?'section':'basket-subgroup',title);
    if(!isSection)node.dataset.homeSubgroup=(html.match(/data-home-subgroup="([^"]+)"/)||[])[1];
    element.content.firstElementChild=node;
  }});
  return element;
}};
const carouselSpy={mountCalls:0,mount(){this.mountCalls++}};
const domFunctions=page.slice(page.indexOf('const homeSubgroupSignatures='),page.indexOf('function renderHome(){'));
const runtime=new Function('document','section','esc','basketCard','BasketCarousel','openBasket',domFunctions+'return {homeBasketGroupRecords,syncHomeBasketGroups};')(
  fakeDocument,(name,subtitle,content)=>'<section class="section"><h2>'+name+'</h2>'+content+'</section>',
  esc,(basket,index)=>'<article data-index="'+index+'">'+basket.name+'</article>',carouselSpy,()=>{}
);
const host=new TestElement('host');
runtime.syncHomeBasketGroups(host,runtime.homeBasketGroupRecords([largeBasket],initial));
const savedSection=host.children[0],savedGrande=savedSection.children[1];
assert.equal(carouselSpy.mountCalls,1,'initial mount required');
runtime.syncHomeBasketGroups(host,runtime.homeBasketGroupRecords([largeBasket,smallBasket],complete));
const savedMini=savedSection.children[2],mountsAfterFull=carouselSpy.mountCalls;
assert.equal(host.children[0],savedSection,'the category section must stay mounted');
assert.equal(savedSection.children[1],savedGrande,'priority Grande card DOM must survive full response');
assert.equal(savedSection.children.length,3,'second subgroup must be appended after the priority card');
runtime.syncHomeBasketGroups(host,runtime.homeBasketGroupRecords([largeBasket,smallBasket],complete));
assert.equal(carouselSpy.mountCalls,mountsAfterFull,'unchanged catalog must not reinitialize image observers');
runtime.syncHomeBasketGroups(host,runtime.homeBasketGroupRecords([{...largeBasket,display_price_cents:9900},smallBasket],complete));
assert.notEqual(savedSection.children[1],savedGrande,'changed Grande card must refresh');
assert.equal(savedSection.children[2],savedMini,'unmodified Mini card must not be discarded');

console.log('Mobile storefront R3 incremental-render contract passed');
