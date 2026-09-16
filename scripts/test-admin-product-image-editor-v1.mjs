import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const uiPath='admin/product-image-editor-v1.js';
const cssPath='admin/product-image-editor-v1.css';
const indexPath='admin/index.html';
const fnPath='supabase/functions/admin-product-image-editor-v1/index.ts';
const migrationPath='supabase/migrations/20260916173000_product_image_versions_v1.sql';

for(const path of [uiPath,cssPath,fnPath,migrationPath])assert.ok(existsSync(path),`arquivo obrigatório ausente: ${path}`);

const ui=readFileSync(uiPath,'utf8');
const css=readFileSync(cssPath,'utf8');
const index=readFileSync(indexPath,'utf8');
const fn=readFileSync(fnPath,'utf8');
const migration=readFileSync(migrationPath,'utf8');

for(const marker of ['data-product-image-preview','data-product-image-upload','data-product-image-replace','data-product-image-generate-current','data-product-image-generate-upload','data-product-image-history']){
  assert.match(ui,new RegExp(marker),`cadastro do produto deve expor ${marker}`);
}
assert.match(index,/product-image-editor-v1\.css/,'Admin deve carregar o estilo do editor individual');
assert.match(index,/product-image-editor-v1\.js/,'Admin deve carregar o editor individual');
assert.match(ui,/admin-product-image-editor-v1/,'cadastro deve chamar o controlador individual de imagem');
assert.match(ui,/Authorization:\s*`Bearer \$\{[^}]+\}`/,'ações de imagem devem usar a sessão autenticada do Admin');
assert.match(ui,/FormData\(/,'upload deve enviar o arquivo sem converter imagem para base64');
assert.match(ui,/Gerar novamente/i,'produto deve permitir regenerar individualmente');
assert.match(ui,/Gerar com esta imagem/i,'nova referência enviada deve poder alimentar a mesma geração individual');
assert.match(ui,/Restaurar/i,'histórico deve permitir restaurar imagem anterior');
assert.match(css,/product-image-editor/,'painel individual de imagem deve ter diagramação própria');

assert.match(fn,/admin_users/,'endpoint deve autorizar somente usuário administrativo');
assert.match(fn,/product-images/,'upload deve reutilizar o bucket oficial de produtos');
assert.match(fn,/dispatch_product_image_manual_worker_v1/,'regeneração deve despachar o mesmo worker usado pela Imagens IA');
assert.doesNotMatch(fn,/api\.openai\.com/,'controlador do cadastro não deve criar um segundo gerador de imagens');
assert.match(fn,/generate_current/,'endpoint deve regenerar a partir da imagem atual');
assert.match(fn,/upload_replace/,'endpoint deve trocar imagem manualmente');
assert.match(fn,/upload_generate/,'endpoint deve gerar usando uma nova imagem enviada como referência');
assert.match(fn,/history/,'endpoint deve listar histórico');
assert.match(fn,/restore/,'endpoint deve restaurar versão anterior');
assert.match(fn,/image_source_url/,'fila deve indicar ao worker qual imagem usar como referência');
assert.match(fn,/image_ai_manual_review_required/,'fila individual deve usar o contrato manual já existente');

assert.match(migration,/create table if not exists public\.product_image_versions/i,'migration deve criar histórico');
assert.match(migration,/enable row level security/i,'histórico no schema público deve usar RLS');
assert.match(migration,/revoke all on table public\.product_image_versions from anon, authenticated/i,'histórico não deve ser acessível diretamente pelo navegador');
assert.match(migration,/product_id uuid not null references public\.products\(id\)/i,'histórico deve pertencer ao produto');

console.log('admin_product_image_editor_v1_contract_ok');
