import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('admin/index.html','utf8');
assert.doesNotMatch(index,/admin-v3\/imagens-ia\.html/,'Admin oficial não deve enviar Imagens IA para /admin-v3');
assert.match(index,/href=["'](?:\.\/)?imagens-ia\.html["']/,'Admin oficial deve abrir Imagens IA dentro de /admin');

for(const file of [
  'admin/imagens-ia.html',
  'admin/image-automation.js',
  'admin/image-bulk-grid18.js',
  'admin/image-automation.css',
  'admin/styles.css',
  'admin/runtime-config.js'
]) assert.ok(fs.existsSync(file),`faltando ${file}`);

const page=fs.readFileSync('admin/imagens-ia.html','utf8');
assert.doesNotMatch(page,/Admin V3|admin-v3/i,'Tela Imagens IA não pode exibir nem depender do Admin V3');
assert.match(page,/\.\/image-automation\.js/,'Tela deve usar automação local em /admin');
assert.match(page,/\.\/image-bulk-grid18\.js/,'Tela deve usar lote Grid18 local em /admin');
assert.match(page,/\.\/styles\.css/,'Tela deve usar o shell consolidado local do Admin');

const automation=fs.readFileSync('admin/image-automation.js','utf8');
const bulk=fs.readFileSync('admin/image-bulk-grid18.js','utf8');
for(const [name,source] of [['image-automation.js',automation],['image-bulk-grid18.js',bulk]]){
  assert.doesNotMatch(source,/admin-v3|da_admin_v3_auth/i,`${name} ainda contém dependência/nome V3`);
  assert.match(source,/\.\/runtime-config\.js/,`${name} deve usar o runtime único do Admin`);
}

console.log('Admin Imagens IA está isolado de /admin-v3 e usa o runtime oficial.');
