const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const modulePath=pathToFileURL(path.join(root,'scripts/da6-release-fingerprint.mjs')).href;
function tempSource(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'da6-release-src-'));
 function file(p,content='DA6 fixture'){
  const full=path.join(dir,p);fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.writeFileSync(full,content);
 }
 for(const p of [
  'vitrine/admin/index.html','vitrine/admin/product-shelf-admin-ui.js',
  'vitrine/admin/product-shelf-labels.js','vitrine/admin/product-shelf-labels.css',
  'vitrine/admin/product-label-print.css',
  'vitrine/admin/inventory-label-photo-tab.js',
  'vitrine/admin/vendor/JsBarcode.all-3.11.6.min.js',
  'vitrine/admin/vendor/LICENSE-JsBarcode.txt',
  'vitrine/admin/vendor/qrcode-generator-2.0.4.js',
  'vitrine/admin/vendor/LICENSE-qrcode-generator.txt',
  'supabase/functions/admin-products-live-v1/index.ts',
  'supabase/functions/admin-products-live-v1/inventory-label-worker.ts',
  'supabase/migrations/20261009150000_da6_upload_atomic_reservation_v1.sql',
  '.github/workflows/da6-inventory-labels-ci.yml'
 ])file(p);
 return {dir,file,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('R8 impressão digital mantém lista ordenada e inclui gateway, worker, SQL e bundles',async()=>{
 const {da6SourceFingerprint}=await import(modulePath);
 const r=da6SourceFingerprint(root);
 assert.match(r.sha256,/^[a-f0-9]{64}$/);
 assert.ok(r.count>=15,'too few release sources tracked');
 for(const p of [
  'vitrine/admin/index.html',
  'supabase/functions/admin-products-live-v1/index.ts',
  'supabase/functions/admin-products-live-v1/inventory-label-worker.ts',
  'supabase/functions/admin-products-live-v1/inventory-label-photo-api.ts',
  'supabase/migrations/20261009150000_da6_upload_atomic_reservation_v1.sql',
  'vitrine/admin/vendor/JsBarcode.all-3.11.6.min.js'
 ])assert.ok(r.files.includes(p),'not covered: '+p);
 assert.deepEqual(r.files,[...r.files].sort());
});
test('R8 alteração de 1 byte em arquivo crítico invalida todas as evidências anteriores',async()=>{
 const {da6SourceFingerprint}=await import(modulePath);
 const f=tempSource();
 try{
  const initial=da6SourceFingerprint(f.dir).sha256;
  f.file('vitrine/admin/inventory-label-photo-tab.js','different');
  assert.notEqual(da6SourceFingerprint(f.dir).sha256,initial);
  const second=da6SourceFingerprint(f.dir).sha256;
  f.file('supabase/functions/admin-products-live-v1/index.ts','different');
  assert.notEqual(da6SourceFingerprint(f.dir).sha256,second);
  const third=da6SourceFingerprint(f.dir).sha256;
  f.file('supabase/migrations/20261009150000_da6_upload_atomic_reservation_v1.sql','different');
  assert.notEqual(da6SourceFingerprint(f.dir).sha256,third);
 }finally{f.cleanup()}
});
test('R8 arquivos novos de worker/OMR são incluídos automaticamente no fingerprint',async()=>{
 const {da6SourceFingerprint}=await import(modulePath);
 const f=tempSource();
 try{
  const a=da6SourceFingerprint(f.dir).sha256;
  f.file('supabase/functions/admin-products-live-v1/inventory-label-new-worker.ts','new');
  const b=da6SourceFingerprint(f.dir);
  assert.notEqual(a,b.sha256);
  assert.ok(b.files.includes('supabase/functions/admin-products-live-v1/inventory-label-new-worker.ts'));
 }finally{f.cleanup()}
});
test('R8 edição de documentação não altera fingerprint do software',async()=>{
 const {da6SourceFingerprint}=await import(modulePath);
 const f=tempSource();
 try{
  const a=da6SourceFingerprint(f.dir).sha256;
  f.file('docs/projects/DA6_QA_PHYSICAL.md','evidence');
  assert.equal(a,da6SourceFingerprint(f.dir).sha256);
 }finally{f.cleanup()}
});
test('R8 release permanece bloqueado sem fingerprint e provas físicas',()=>{
 const p=spawnSync(process.execPath,['scripts/da6-release-gate.mjs','--enforce'],{cwd:root,encoding:'utf8',timeout:15000});
 assert.equal(p.status,3,p.stderr);
 const result=JSON.parse(p.stdout);
 assert.equal(result.ready,false);
 assert.ok(result.missing.some(x=>x.gate==='source_fingerprint'));
 assert.ok(result.missing.some(x=>x.gate==='real_cell_phone_photos_omr'));
 assert.match(result.source_fingerprint,/^[a-f0-9]{64}$/);
});
