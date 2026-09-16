import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const exists=path=>fs.existsSync(path);

for(const path of ['admin/gondolas.html','admin/gondolas-v1.js','admin/gondolas-v1.css','admin/product-gondola-editor-v1.js','supabase/functions/admin-gondolas-v1/index.ts']){
  assert.ok(exists(path),`${path} ausente`);
}

const html=read('admin/index.html');
const page=read('admin/gondolas.html');
const gondolas=read('admin/gondolas-v1.js');
const editor=read('admin/product-gondola-editor-v1.js');
const backend=read('supabase/functions/admin-gondolas-v1/index.ts');
const config=read('supabase/config.toml');

assert.match(html,/href=["']\.\/gondolas\.html["'][^>]*>Gôndolas</,'atalho Gôndolas ausente no Admin');
assert.match(html,/product-gondola-editor-v1\.js/,'integração da gôndola no editor de produto não carregada');
assert.match(page,/gondolas-v1\.css/,'CSS da página de gôndolas não carregado');
assert.match(page,/gondolas-v1\.js/,'JS da página de gôndolas não carregado');

for(const action of ['list_gondolas','create_gondola','rename_gondola','set_gondola_active','get_gondola','scan_ean','remove_product','set_product_gondola']){
  assert.match(backend,new RegExp(action),`ação ${action} ausente no backend`);
}

assert.match(backend,/warehouse_locations/,'backend deve usar warehouse_locations para cadastrar gôndolas');
assert.match(backend,/\.from\(["']products["']\)/,'backend deve localizar/atualizar products');
assert.match(backend,/gondola/,'backend deve gravar a gôndola no produto');
assert.match(backend,/shelf:\s*null/,'backend deve manter prateleira vazia');
assert.match(backend,/product_not_found/,'EAN desconhecido deve retornar product_not_found');

assert.match(gondolas,/data-gondola-scan/,'campo de leitura rápida de EAN ausente');
assert.match(gondolas,/scan_ean/,'leitor não chama scan_ean');
assert.match(gondolas,/Nova gôndola/,'ação Nova gôndola ausente');
assert.doesNotMatch(page+gondolas,/Prateleira|prateleira/,'a interface não deve expor prateleira');

assert.match(editor,/name=["']gondola_id["']/,'editor do produto deve ter seletor de gôndola');
assert.match(editor,/set_product_gondola/,'editor do produto deve salvar vínculo de gôndola');
assert.match(config,/\[functions\.admin-gondolas-v1\]/,'config da Edge Function de gôndolas ausente');

console.log('Admin Gôndolas v1: contrato OK');
