import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const script=html.slice(html.indexOf('<script>\n(()=>{')+8,html.lastIndexOf('</script>'));
const functions=[...script.matchAll(/^\s{2,4}(?:async )?function ([A-Za-z_$][\w$]*)\(/gm)].map(m=>m[1]);
const unique=new Set(functions);
assert.equal(unique.size,functions.length,'duplicate named function declaration in main script');
const critical={
  orders:['orderProblemReasons','orderIssueMatch','orderOperationalPriority','orderNextAction','orderFilterMatch','openOrder'],
  separation:['openOrderSeparationSheet'],
  fiscal:['loadCurrentOrderFiscal'],
  inventory:['renderBalance','handleBalanceScan'],
  delivery:['printDelivery','openPrint'],
  bootstrap:['start','setTab']
};
for(const [domain,names] of Object.entries(critical)){
  for(const name of names)assert.ok(unique.has(name)||html.includes('const '+name+'=')||readModel.includes('function '+name+'('),'missing '+domain+' contract '+name);
}
assert.match(controllerSource,/function orderProblemReasons\(o\)/);
assert.match(controllerSource,/if\(o\?\.stock_readiness\?\.ok===false\)reasons\.push\('Estoque insuficiente'\)/);
assert.match(controllerSource,/if\(o\?\.delivery_return\?\.status==='returned_review'\)/);
assert.match(controllerSource,/function orderNextAction\(o\)/);
assert.match(controllerSource,/confirmed:consumed\?'Continuar separação':'Iniciar separação'/);
assert.match(controllerSource,/processing:consumed\?'Finalizar separação':'Regularizar separação'/);
assert.match(controllerSource,/function orderFilterMatch\(o,filter\)/);
assert.match(controllerSource,/if\(filter==='separate'\)return \['confirmed','processing'\]\.includes\(o\.status\)/);
console.log('Admin controller contracts: PASS ('+functions.length+' named functions)');
