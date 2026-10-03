import assert from 'node:assert/strict';
import fs from 'node:fs';

const jsPath='vitrine/admin/atendimento/attendance-templates.js';
assert.equal(fs.existsSync(jsPath),true);
const js=fs.readFileSync(jsPath,'utf8');

assert.match(js,/sendable/,'UI deve respeitar flag server-side sendable');
assert.match(js,/parameter_labels/,'campos devem vir dos metadados do template');
assert.match(js,/\.queue-card\.selected/,'destino deve ser a conversa selecionada na Central');
assert.match(js,/dataset\.conversationId/);
assert.match(js,/method\s*:\s*["']POST["']/);
assert.match(js,/action["']?\s*[:,]\s*["']send["']|searchParams\.set\(["']action["'],\s*["']send["']\)/);
for(const key of ['conversation_id','template_id','parameters','idempotency_key'])assert.match(js,new RegExp(key));
assert.doesNotMatch(js,/to_phone_e164|phone_number_id|waba_id|whatsapp_account_id/,'browser não pode escolher destino/identidade Meta');
assert.match(js,/template-send-form/);
assert.match(js,/Enviar template/);
assert.match(js,/catch[\s\S]{0,600}setTemplateFormStatus|catch[\s\S]{0,600}error/i,'falha deve ser tratada no próprio formulário');
assert.doesNotMatch(js,/catch[\s\S]{0,500}(?:reset\(|replaceChildren\(\)|\.value\s*=\s*["']["'])/i,'falha não deve apagar os parâmetros digitados');

console.log('PASS test-attendance-template-send-ui-v1');
