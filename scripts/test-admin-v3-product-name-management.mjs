import fs from 'node:fs';
import assert from 'node:assert/strict';

const required=['admin-v3/index.html','admin-v3/app.js','admin-v3/styles.css','supabase/functions/admin-v3-api/index.ts'];
for(const file of required) assert.ok(fs.existsSync(file),`faltando ${file}`);

const html=fs.readFileSync('admin-v3/index.html','utf8');
const app=fs.readFileSync('admin-v3/app.js','utf8');
const css=fs.readFileSync('admin-v3/styles.css','utf8');
const edge=fs.readFileSync('supabase/functions/admin-v3-api/index.ts','utf8');

assert.match(html,/data-route=["']product-names["']/,'menu de Nomes dos produtos ausente');
assert.match(app,/product-names/,'rota product-names ausente');
assert.match(app,/Atualizar/,'tela deve ter atualização manual explícita');
assert.doesNotMatch(app,/setInterval\([^\n]*product[-_ ]?name/i,'tela de nomes não deve atualizar automaticamente');
assert.match(app,/Era/i,'histórico deve mostrar nome anterior');
assert.match(app,/Ficou/i,'histórico deve mostrar nome novo');
assert.match(app,/data-edit-product/,'tela deve abrir o editor completo do produto');
assert.match(app,/Aprovar/,'revisão precisa permitir aprovação');
assert.match(app,/Manter nome atual/,'revisão precisa permitir manter o nome');
assert.match(app,/Editar e aplicar/,'revisão precisa permitir editar e aplicar');
assert.match(app,/Processar agora/,'gestor deve poder solicitar uma rodada imediata');
assert.match(edge,/product_name_normalization_jobs/,'API deve consultar jobs de normalização');
assert.match(edge,/product_name_normalization_runs/,'API deve consultar rodadas de normalização');
for(const action of ['product_name_normalization','product_name_normalization_review','product_name_normalization_process_now']) assert.match(edge,new RegExp(action),`ação ${action} ausente`);
assert.match(css,/name-normalization/,'estilos da gestão de nomes ausentes');

console.log('admin-v3 product name management contract ok');
