import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const exists=path=>fs.existsSync(path);

assert.ok(exists('admin/gondolas-v1.js'),'módulo admin/gondolas-v1.js ausente');
assert.ok(exists('admin/gondolas-v1.css'),'estilos admin/gondolas-v1.css ausentes');
assert.ok(exists('supabase/functions/admin-gondolas-v1/index.ts'),'backend admin-gondolas-v1 ausente');

const html=read('admin/index.html');
const app=read('admin/app.js');
const gondolas=read('admin/gondolas-v1.js');
const products=read('admin/products-inline-controls-v4.js');
const backend=read('supabase/functions/admin-gondolas-v1/index.ts');
const config=read('supabase/config.toml');

assert.match(html,/data-route=["']gondolas["']/,'menu Gôndolas ausente');
assert.match(html,/gondolas-v1\.css/,'CSS de Gôndolas não carregado');
assert.match(app,/['"]gondolas['"]/,'rota gondolas ausente do Admin');
assert.match(app,/gondolas-v1\.js/,'rota não carrega o módulo de Gôndolas');

for(const action of ['list_gondolas','create_gondola','rename_gondola','set_gondola_active','get_gondola','scan_ean','remove_product','set_product_gondola']){
  assert.match(backend,new RegExp(action),`ação ${action} ausente no backend`);
}

assert.match(backend,/warehouse_locations/,'backend deve usar warehouse_locations');
assert.match(backend,/\.from\(["']products["']\)/,'backend deve atualizar products');
assert.match(backend,/gondola/,'backend deve gravar a gôndola no produto');
assert.match(backend,/shelf[^\n]*null|shelf:\s*null/,'backend deve manter prateleira vazia');
assert.match(backend,/product_not_found/,'EAN desconhecido deve retornar product_not_found');

assert.match(gondolas,/data-gondola-scan/,'campo de leitura rápida de EAN ausente');
assert.match(gondolas,/scan_ean/,'leitor não chama scan_ean');
assert.match(gondolas,/Nova gôndola/,'ação Nova gôndola ausente');
assert.doesNotMatch(gondolas,/Prateleira|prateleira/,'a interface não deve expor prateleira');

assert.match(products,/name=["']gondola_id["']/,'editor do produto deve ter seletor de gôndola');
assert.match(products,/set_product_gondola/,'editor do produto deve salvar vínculo de gôndola');
assert.match(config,/\[functions\.admin-gondolas-v1\]/,'config da Edge Function de gôndolas ausente');

console.log('Admin Gôndolas v1: contrato OK');
