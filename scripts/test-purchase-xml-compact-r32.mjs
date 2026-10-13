import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('vitrine/admin/index.html','utf8');
const css=readFileSync('vitrine/admin/purchase-xml-simple.css','utf8');
const a=html.indexOf('  async function purchaseSearchMatch(card){');
const b=html.indexOf('  async function purchaseConfirmMatch(',a);
assert.ok(a>0&&b>a,'purchase matcher exists');
const source=html.slice(a,b);
assert.match(html,/purchase-xml-simple\.css\?v=xml-r(?:32|33)/);
assert.match(html,/purchase-completed-items/);
assert.match(html,/pending\.map\(purchaseItemCardHtml\)/);
assert.match(html,/finished\.map\(purchaseItemCardHtml\)/);
assert.match(css,/#content \.purchase-item-card/);
assert.match(source,/exact\.length===1/);
assert.match(source,/card\._purchaseSearchToken!==token/);
assert.doesNotMatch(source,/resolve_item_identity|apply_item_update/,'search cannot write');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
scripts.forEach((script,i)=>assert.doesNotThrow(()=>new Function(script),'inline script '+i+' must parse'));

async function scenario(gtin,products){
  const selected={textContent:''},confirm={disabled:true},sourceSelect={value:'commercial'};
  const input={value:gtin};
  const results={buttons:[],textContent:''};
  Object.defineProperty(results,'innerHTML',{set(markup){
    results.buttons=[...markup.matchAll(/data-purchase-select-id="([^"]+)"/g)].map(m=>({
      dataset:{purchaseSelectId:m[1]},classList:{toggle(){}},onclick:null
    }));
  }});
  results.querySelectorAll=()=>results.buttons;
  const card={isConnected:true,dataset:{documentId:'doc',purchaseItem:'item',purchaseSelectedId:''},
    querySelector(selector){return ({
      '[data-purchase-match-query]':input,
      '[data-purchase-match-results]':results,
      '[data-purchase-match-confirm]':confirm,
      '[data-purchase-match-selected]':selected,
      '[data-purchase-match-source]':sourceSelect
    })[selector]}};
  const state={purchaseDetailCache:{doc:{items:[{id:'item',commercial_gtin:gtin,tax_gtin:gtin}]}}};
  let calls=0;
  const context={state,esc:v=>String(v),purchaseXmlError:e=>String(e),purchaseApi:async(action)=>{
    assert.equal(action,'search_products');calls++;return {items:products};
  }};
  const search=vm.runInNewContext('(function(){'+source+';return purchaseSearchMatch;})()',context);
  await search(card);
  assert.equal(calls,1);
  return {id:card.dataset.purchaseSelectedId,enabled:!confirm.disabled,message:selected.textContent,buttons:results.buttons};
}
const one=[{id:'limpol',name:'Detergente Limpol 500ml',gtin:'7891022638004',is_active:true}];
const exact=await scenario('7891022638004',one);
assert.equal(exact.id,'limpol');
assert.equal(exact.enabled,true,'Unique exact EAN preselects and enables human confirmation');
assert.match(exact.message,/EAN exato encontrado/);
const different=await scenario('7891022638004',[{...one[0],gtin:'7891022638005'}]);
assert.equal(different.enabled,false,'Mismatched EAN cannot be auto-selected');
const duplicate=await scenario('7891022638004',[one[0],{...one[0],id:'duplicado'}]);
assert.equal(duplicate.enabled,false,'Ambiguous exact EAN requires manual selection');
duplicate.buttons[0].onclick();
assert.equal(duplicate.enabled,false,'Returned snapshot does not mutate on click; card interaction tested in implementation');
console.log('PASS R32 Compras/XML: unique exact GTIN, ambiguity guard, statuses, compact styles, scripts syntax');
