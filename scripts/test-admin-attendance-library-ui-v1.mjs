import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');
const jsPath='vitrine/admin/atendimento/attendance-library.js';

for(const id of [
  'libraryBtn','attendanceLibraryOverlay','attendanceLibraryDrawer','libraryCloseBtn','librarySearch',
  'libraryAddBtn','libraryFileInput','libraryGrid','libraryStatus','libraryClearSelectionBtn','librarySendBtn'
]) assert.match(html,new RegExp(`id=["']${id}["']`),`HTML deve conter #${id}`);

for(const kind of ['all','image','video','audio','document']){
  assert.match(html,new RegExp(`data-library-kind=["']${kind}["']`),`deve existir filtro ${kind}`);
}
assert.match(html,/id=["']libraryFileInput["'][^>]*\bmultiple\b|\bmultiple\b[^>]*id=["']libraryFileInput["']/s,'input de upload deve aceitar múltiplos arquivos');
assert.match(html,/attendance-library\.js/,'módulo da Biblioteca deve estar carregado');
assert.match(html,/attendance-library-image\.js|attendance-library\.js/,'otimizador deve estar acessível ao módulo da Biblioteca');

assert.match(css,/\.attendance-library-overlay\s*\{/,'deve existir overlay da Biblioteca');
assert.match(css,/\.attendance-library-drawer\s*\{[^}]*position\s*:\s*fixed[^}]*right\s*:\s*0/is,'drawer desktop deve abrir pela lateral direita');
assert.match(css,/\.library-footer\s*\{[^}]*position\s*:\s*sticky/is,'footer de seleção/envio deve permanecer visível');
assert.match(css,/@media\s*\(max-width\s*:\s*720px\)[\s\S]*\.attendance-library-drawer\s*\{[^}]*width\s*:\s*(?:100%|min\(100%)/i,'mobile deve usar drawer quase/tela inteira');

assert.ok(fs.existsSync(jsPath),'deve existir attendance-library.js');
const js=fs.readFileSync(jsPath,'utf8');
assert.match(js,/from\s+["']\.\/attendance-library-image\.js["']/,'Biblioteca deve importar otimizador de imagem');
for(const action of ['library_list','library_preview','library_upload_prepare','library_upload_complete','library_update','library_deactivate']){
  assert.match(js,new RegExp(action),`Biblioteca deve usar action ${action}`);
}
assert.match(js,/compactando/i,'UI de upload deve mostrar etapa compactando');
assert.match(js,/solicitando upload/i,'UI de upload deve mostrar etapa solicitando upload');
assert.match(js,/enviando Storage/i,'UI de upload deve mostrar etapa enviando Storage');
assert.match(js,/confirmando/i,'UI de upload deve mostrar etapa confirmando');
assert.match(js,/concluído/i,'UI de upload deve mostrar etapa concluído');
assert.match(js,/erro/i,'UI de upload deve expor erro por arquivo');
assert.match(js,/library_update/,'deve permitir editar metadados');
assert.match(js,/library_deactivate/,'deve permitir remover logicamente');
assert.match(js,/library_preview/,'cards devem resolver preview assinado');
assert.doesNotMatch(js,/SERVICE_ROLE|SUPABASE_SERVICE_ROLE|service_role/i,'frontend não pode conter service role');

console.log('PASS test-admin-attendance-library-ui-v1');
