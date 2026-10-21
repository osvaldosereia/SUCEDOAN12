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
