/* DA6 R8: CI precisa garantir que os gates de produção NÃO possam ficar verdes
 * apenas com testes sintéticos. Não usa rede ou credenciais.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
function gate(flag){
 const r=spawnSync(process.execPath,['scripts/da6-release-gate.mjs',flag],{
  cwd:root,encoding:'utf8',timeout:15000});
 return {...r,data:JSON.parse(r.stdout)};
}
test('R8 gate dá relatório útil sem publicar nem modificar banco',()=>{
 const r=gate('--report');
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.data.ready,false);
 assert.ok(r.data.missing.some(x=>x.gate==='physical_thermal_203dpi_print'));
 assert.ok(r.data.missing.some(x=>x.gate==='hosted_edge_staging'));
 assert.ok(r.data.missing.some(x=>x.gate==='hosted_cron_pgnet_staging'));
 assert.match(r.data.next_action,/do not deploy/);
});
test('R8 gate de publicação barra ausência de testes físicos e staging',()=>{
 const r=gate('--enforce');
 assert.equal(r.status,3,r.stderr);
 assert.equal(r.data.ready,false);
 assert.ok(r.data.missing.length>=7);
});
test('R8 dependências QR/Code128 são autocontidas e têm licença',()=>{
 const print=fs.readFileSync(path.join(root,'vitrine/admin/product-shelf-labels.js'),'utf8');
 assert.doesNotMatch(print,/cdn[.]jsdelivr[.]net|unpkg[.]com/);
 for(const file of [
  'vendor/JsBarcode.all-3.11.6.min.js',
  'vendor/qrcode-generator-2.0.4.js',
  'vendor/LICENSE-JsBarcode.txt',
  'vendor/LICENSE-qrcode-generator.txt']){
   assert.ok(fs.statSync(path.join(root,'vitrine/admin',file)).size>100,'missing or empty '+file);
 }
});
