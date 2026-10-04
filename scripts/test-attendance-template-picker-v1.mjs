import assert from 'node:assert/strict';
import fs from 'node:fs';

const htmlPath=new URL('../vitrine/admin/atendimento/index.html',import.meta.url);
const jsPath=new URL('../vitrine/admin/atendimento/attendance-templates.js',import.meta.url);
const html=fs.readFileSync(htmlPath,'utf8');
assert.equal(fs.existsSync(jsPath),true,'módulo de templates da Central deve existir');
const js=fs.readFileSync(jsPath,'utf8');

for(const id of ['templatesBtn','templatesMenu','templatesList','templateSyncBtn'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(html,/attendance-templates\.js/);
assert.match(js,/admin-whatsapp-templates-v1/);
assert.match(js,/action\s*:\s*["']sync["']|searchParams\.set\(["']action["']\s*,\s*["']sync["']\)/);
assert.match(js,/data-channel-switch/);
assert.match(js,/account_id/);
assert.match(js,/APPROVED/);
assert.match(js,/attendanceAuthorizedFetch|attendanceJsonApi/,'templates devem usar autenticação compartilhada renovável');
assert.doesNotMatch(js,/sessionStorage\.getItem|ADMIN_TOKEN_KEY/,'templates não devem gerenciar JWT diretamente');
assert.doesNotMatch(js,/graph\.facebook\.com|META_WHATSAPP_ACCESS_TOKEN|EAA[A-Za-z0-9_-]{30,}/i,'browser não pode conhecer Graph/token Meta');
assert.doesNotMatch(js,/send_template|type\s*:\s*["']template["']/i,'UI não pode construir payload Meta diretamente');

console.log('PASS test-attendance-template-picker-v1');
