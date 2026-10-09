import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/admin-service-intelligence-v1/index.ts',import.meta.url),'utf8');
function extract(startMarker,endMarker){
  const start=source.indexOf(startMarker);
  assert.ok(start>=0,`Missing source function: ${startMarker}`);
  const end=source.indexOf(endMarker,start+startMarker.length);
  assert.ok(end>start,`Missing end marker: ${endMarker}`);
  return source.slice(start,end).replace(/:any\\b/g,'').replace(/\\s+as any\\b/g,'');
}
const projection=extract('function blingHubOrderManagedProjection(', 'function blingHubRebalanceInstallmentsForTotal(');
const diff=extract('function blingHubOrderManagedDiff(', 'async function blingHubProcessOrderJobs(');
const sandbox={
  clean(value,limit){return String(value??'').trim().slice(0,limit);},
  blingHubDigits(value){return String(value??'').replace(/\\D/g,'');}
};
const managedDiff=runInNewContext(projection+'\\n'+diff+'\\nblingHubOrderManagedDiff',sandbox);
const base={
  contato:{id:123},numeroLoja:'DA-261009-822A74D6',
  totalProdutos:229.07,total:229.07,outrasDespesas:0,
  desconto:{valor:0,unidade:'REAL'},observacoes:'',
  itens:[{produto:{id:16712731221},codigo:'',quantidade:1,valor:3.49}]
};
const desired={
  ...base,itens:[{produto:{id:16712731221},codigo:'7891150049888',quantidade:1,valor:3.49}]
};
assert.equal(Object.keys(managedDiff(base,desired)).length,0,'Barcode normalization must not produce a sale PUT');
assert.ok(managedDiff(base,{...desired,itens:[{...desired.itens[0],quantidade:2}]}).itens,'Quantity drift must block automatic acceptance');
assert.ok(managedDiff(base,{...desired,itens:[{...desired.itens[0],valor:3.59}]}).itens,'Price drift must block automatic acceptance');
assert.ok(managedDiff(base,{...desired,itens:[{...desired.itens[0],produto:{id:16712731222}}]}).itens,'Different product IDs must not be treated as equal');
const unmapped={...base,itens:[{produto:{},codigo:'SKU-A',quantidade:1,valor:3.49}]};
assert.ok(managedDiff(unmapped,{...unmapped,itens:[{...unmapped.itens[0],codigo:'SKU-B'}]}).itens,'Code must remain compared when Bling ID is missing');
console.log('PASS: item barcode normalization is idempotent, but product, quantity and value are guarded.');
