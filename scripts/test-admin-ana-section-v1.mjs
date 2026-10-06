import assert from 'node:assert/strict';
import fs from 'node:fs';
const shell=fs.readFileSync('vitrine/admin/index.html','utf8');
const modulePath='vitrine/admin/ana/ana-admin.js';
assert.match(shell,/data-tab="ana"[\s\S]*?ANA/);
assert.match(shell,/tab==='ana'[\s\S]*ana-admin\.js/);
assert.equal(fs.existsSync(modulePath),true,'ANA management module must exist');
const ui=fs.readFileSync(modulePath,'utf8');
for(const section of ['Visão geral','Comportamento','Conhecimento','Gatilhos','Testes e histórico'])assert.ok(ui.includes(section),`missing ${section}`);
for(const action of ['admin_load','admin_save_draft','admin_publish','admin_rollback','admin_set_channel','admin_test','admin_history'])assert.ok(ui.includes(action),`missing action ${action}`);
assert.match(ui,/dry_run_not_sendable|não envia|Não envia/i);
assert.match(ui,/role.*owner|owner.*role/i);
assert.match(ui,/campaigns_enabled|marketing/i);
assert.match(ui,/da_finance_access_token_v1/);
const css=fs.readFileSync('vitrine/admin/ana/ana-admin.css','utf8');
assert.match(css,/@media/);
console.log('PASS: ANA Admin navigation, sections, role controls and no-send simulator contracts');

