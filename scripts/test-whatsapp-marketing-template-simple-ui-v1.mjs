import assert from 'node:assert/strict';
import fs from 'node:fs';

const pickerPath='vitrine/admin/marketing/template-type-picker.js';
assert.equal(fs.existsSync(pickerPath),true,'template-type-picker.js deve existir');
const picker=fs.readFileSync(pickerPath,'utf8');
const polish=fs.readFileSync('vitrine/admin/marketing/marketing-polish.js','utf8');

for(const label of ['Resposta rápida','Atendimento','Campanha','Carrossel'])assert.ok(picker.includes(label),`picker deve oferecer ${label}`);
for(const fn of ['openTemplateTypePicker','openSimpleTemplateEditor','submitSimpleTemplate','enhanceTemplateCenter'])assert.match(picker,new RegExp(`function ${fn}\\(`),`${fn} deve existir`);

assert.match(picker,/admin-whatsapp-templates-v1/,'criação deve usar API Admin de templates');
assert.match(picker,/attendanceAuthorizedFetch/,'API Admin deve usar autenticação existente');
assert.doesNotMatch(picker,/graph\.facebook\.com/,'browser não pode chamar Graph diretamente');
assert.doesNotMatch(picker,/META_WHATSAPP_ACCESS_TOKEN|SERVICE_ROLE_KEY/,'browser não pode conter segredo Meta/Supabase');

for(const text of ['Modelos de mensagem','modelo(s) encontrado(s)','+ Novo','Sincronizar'])assert.ok(picker.includes(text),`Templates deve usar texto simples: ${text}`);
for(const field of ['Nome','Canal','Categoria','Idioma','Mensagem','Rodapé','Botão'])assert.ok(picker.includes(field),`editor simples deve mostrar ${field}`);
assert.match(picker,/<details[^>]*data-template-advanced/,'opções avançadas devem ficar recolhidas');
assert.ok(picker.includes('Opções avançadas'),'editor deve nomear opções avançadas');
assert.match(picker,/data-template-simple-submit/,'editor deve ter ação principal clara');
assert.match(polish,/template-type-picker\.js/,'shell deve carregar enhancer simples de Templates');

console.log('marketing template simple UI contract: ok');
