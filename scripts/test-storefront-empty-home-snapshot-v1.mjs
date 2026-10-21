import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const start=source.indexOf('function isValidPublicHome(');
const end=source.indexOf('function keepHomeInMemory(',start);
assert.ok(start>=0&&end>start,'snapshot validator exists');
const functions=source.slice(start,end).replace(/:(?:any|boolean)/g,'');
const validator=vm.runInNewContext(functions+';isValidPublicHome');
const freshEmptyCatalog={
  ok:true,
  priority:false,
  baskets:[],
  basket_categories:[{id:'complete',slug:'cestas-completas',subcategories:[]}]
};
assert.equal(validator(freshEmptyCatalog),true,'zero sellable baskets is a valid current snapshot that clears expired basket cards');
assert.equal(validator({...freshEmptyCatalog,priority:true}),false,'priority-only payloads are not full home snapshots');
assert.equal(validator({...freshEmptyCatalog,basket_categories:null}),false,'a missing basket taxonomy must remain invalid');
console.log('Storefront empty-home snapshot regression passed');

const storefrontHtml=fs.readFileSync('index.html','utf8');
const vitrineHtml=fs.readFileSync('vitrine/index.html','utf8');
assert.equal(vitrineHtml,storefrontHtml,'public root and /vitrine entrypoints stay in sync');
const acceptMatch=storefrontHtml.match(/const accept=\(data,partial\)=>\{([\s\S]*?)\n      \};/);
assert.ok(acceptMatch,'home response acceptance callback exists');
const makeAcceptHarness=()=>{
  const harnessSource='(()=>{'+
    'let fullFinished=false,received=false,renderCount=0,writeCount=0;'+
    'const hadCached=false,state={view:"home",home:{baskets:[{name:"stale"}],basket_categories:[],categories:[]}};'+
    'const STATIC_CATEGORIES=[{key:"mercearia",label:"Mercearia"}],HOME_CACHE_KEY="home";'+
    'const writeCache=()=>{writeCount++},renderHome=()=>{renderCount++},performance={mark(){}},applyMarketingEntryContext=()=>{};'+
    acceptMatch[0]+
    'return {accept,state,get received(){return received},get renderCount(){return renderCount},get writeCount(){return writeCount}};})()';
  return vm.runInNewContext(harnessSource);
};
const validEmptyHome={ok:true,priority:false,baskets:[],basket_categories:[{id:'complete',slug:'cestas-completas',subcategories:[]}],categories:[{key:'mercearia',label:'Mercearia'}]};
const emptyHarness=makeAcceptHarness();
assert.equal(emptyHarness.accept(validEmptyHome,false),true,'a valid empty full catalog must render instead of replacing the storefront with an error');
assert.equal(emptyHarness.state.home.baskets.length,0,'stale basket cards must be cleared');
assert.equal(emptyHarness.state.home.categories[0].key,'mercearia','product categories must remain in home state');
assert.equal(emptyHarness.received,true);
assert.equal(emptyHarness.renderCount,1,'the home and product-category sections must render');
assert.equal(emptyHarness.writeCount,1,'the current empty catalog must replace the stale local cache');
const priorityHarness=makeAcceptHarness();
assert.equal(priorityHarness.accept({...validEmptyHome,priority:true},true),false,'an empty priority response must wait for the full catalog');
const errorHarness=makeAcceptHarness();
assert.equal(errorHarness.accept({...validEmptyHome,ok:false},false),false,'API errors must not be accepted as valid empty catalogs');
console.log('Storefront empty-home snapshot and frontend regressions passed');
