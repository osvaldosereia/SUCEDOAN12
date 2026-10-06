import assert from 'node:assert/strict';
import fs from 'node:fs';

const pickerPath='vitrine/admin/marketing/template-type-picker.js';
assert.equal(fs.existsSync(pickerPath),true,'template-type-picker.js deve existir');
const picker=fs.readFileSync(pickerPath,'utf8');
const polish=fs.readFileSync('vitrine/admin/marketing/marketing-polish.js','utf8');

for(const label of ['Modelo padrão','Carrossel','Catálogo / Produtos','Autenticação'])assert.ok(picker.includes(label),`picker deve oferecer ${label}`);
for(const fn of ['openTemplateTypePicker','openSimpleTemplateEditor','openExistingTemplateEditor','openLiveTemplateDetail','submitSimpleTemplate','enhanceTemplateCenter','updateWhatsAppPreview','insertTemplateVariable'])assert.match(picker,new RegExp(`function ${fn}\\(`),`${fn} deve existir`);

assert.match(picker,/admin-whatsapp-templates-v1/,'criação deve usar API Admin de templates');
assert.match(picker,/attendanceAuthorizedFetch/,'API Admin deve usar autenticação existente');
assert.doesNotMatch(picker,/graph\.facebook\.com/,'browser não pode chamar Graph diretamente');
assert.doesNotMatch(picker,/META_WHATSAPP_ACCESS_TOKEN|SERVICE_ROLE_KEY/,'browser não pode conter segredo Meta/Supabase');

for(const text of ['Templates de mensagem','+ Novo template','Sincronizar com Meta','Enviar para análise'])assert.ok(picker.includes(text)||polish.includes(text),`Templates deve usar texto simples: ${text}`);
for(const field of ['Nome','Canal WhatsApp','Categoria','Idioma','Cabeçalho','Mensagem','Rodapé','Botões'])assert.ok(picker.includes(field),`editor deve mostrar ${field}`);
for(const header of ['Nenhum','Texto','Imagem','Vídeo','Documento','Localização'])assert.ok(picker.includes(header),`editor deve oferecer cabeçalho ${header}`);
for(const button of ['Resposta rápida','Abrir site','Telefonar','Catálogo','OTP'])assert.ok(picker.includes(button),`editor deve contemplar botão ${button}`);
assert.ok(picker.includes('+ variável'),'editor deve permitir inserir variável numerada');
assert.match(picker,/\{\{\$\{next\}\}\}/,'inserção de variável deve ser sequencial');
assert.match(picker,/marketing-whatsapp-preview/,'editor deve manter prévia permanente do WhatsApp');
assert.match(picker,/data-template-preview-body/,'prévia deve atualizar o corpo da mensagem');
assert.match(picker,/input[\s\S]{0,120}data-template-media-file|data-template-media-file[\s\S]{0,120}input/,'cabeçalho de mídia deve aceitar arquivo');
assert.match(picker,/upload_media/,'mídia de exemplo deve ser enviada pelo backend');
assert.match(picker,/data-template-simple-submit/,'editor deve ter ação principal clara');
assert.match(picker,/action:'detail'/,'detalhes e edição devem consultar o endpoint live antes de abrir');
assert.match(picker,/Histórico Meta/,'detalhe deve mostrar linha do tempo de aprovação/rejeição');
assert.match(picker,/Atualizado agora pela Meta/,'detalhe deve deixar claro quando o estado foi confirmado ao vivo');
assert.match(picker,/stopImmediatePropagation\(\)/,'enhancer deve substituir os handlers legados de Ver/Editar sem dupla abertura');
assert.match(picker,/adminPost\('edit'/,'editor visual deve salvar alterações pela API Admin');
assert.match(polish,/template-type-picker\.js/,'shell deve carregar enhancer simples de Templates');

console.log('marketing template rich simple UI contract: ok');
