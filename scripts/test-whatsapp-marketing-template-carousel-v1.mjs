import assert from 'node:assert/strict';
import fs from 'node:fs';

const editorPath='vitrine/admin/marketing/template-carousel-editor.js';
assert.equal(fs.existsSync(editorPath),true,'template-carousel-editor.js deve existir');
const source=fs.readFileSync(editorPath,'utf8');

for(const text of ['Novo carrossel','Nome','Canal','Idioma','Mensagem principal','Imagem','Vídeo','Adicionar cartão','Salvar carrossel'])assert.ok(source.includes(text),`editor deve conter ${text}`);
for(const fn of ['openCarouselEditor','addCarouselCard','removeCarouselCard','moveCarouselCard','uploadCardMedia','submitCarouselTemplate'])assert.match(source,new RegExp(`function ${fn}\\(`),`${fn} deve existir`);
assert.match(source,/2[^\n]+10|10[^\n]+2/,'editor deve trabalhar com 2 a 10 cartões');
assert.match(source,/type=["']file["']/,'cada cartão deve aceitar arquivo de mídia');
assert.match(source,/upload_media/,'mídia deve subir via Edge Admin');
assert.match(source,/admin-whatsapp-template-carousel-v1/,'editor deve usar Edge dedicada de carrossel');
assert.match(source,/data-carousel-preview/,'editor deve ter prévia do carrossel');
assert.match(source,/data-carousel-card/,'editor deve renderizar cartões editáveis');
assert.doesNotMatch(source,/graph\.facebook\.com/,'browser não pode chamar Graph diretamente');
assert.doesNotMatch(source,/META_WHATSAPP_ACCESS_TOKEN|SERVICE_ROLE_KEY|META_APP_ID/,'browser não pode conter segredos Meta/Supabase');

console.log('marketing template carousel UI contract: ok');
