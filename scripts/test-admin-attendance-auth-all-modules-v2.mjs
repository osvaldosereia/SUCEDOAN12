import assert from 'node:assert/strict';
import fs from 'node:fs';

const authPath='vitrine/admin/atendimento/attendance-auth.js';
const htmlPath='vitrine/admin/atendimento/index.html';
const targets={
  send:'vitrine/admin/atendimento/attendance-send.js',
  media:'vitrine/admin/atendimento/attendance-media-send.js',
  templates:'vitrine/admin/atendimento/attendance-templates.js',
  humanAi:'vitrine/admin/atendimento/attendance-human-ai.js',
  ana:'vitrine/admin/atendimento/attendance-ana-preview.js'
};
for(const path of [authPath,htmlPath,...Object.values(targets)])assert.equal(fs.existsSync(path),true,`${path} deve existir`);
const auth=fs.readFileSync(authPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');
const files=Object.fromEntries(Object.entries(targets).map(([key,path])=>[key,fs.readFileSync(path,'utf8')]));

assert.match(auth,/export\s+async\s+function\s+attendanceAuthorizedFetch/,'auth compartilhado deve expor fetch autenticado genérico');
assert.match(auth,/ensureAttendanceToken/,'fetch autenticado deve usar renovação preventiva');
assert.match(auth,/response\.status\s*===\s*401/,'fetch autenticado deve recuperar uma vez após 401');
assert.match(auth,/forceRefresh\s*:\s*true/,'recuperação 401 deve forçar token novo');

for(const [name,source] of Object.entries(files)){
  assert.match(source,/from\s+['"]\.\/attendance-auth\.js\?v=auth-refresh-v2['"]/i,`${name} deve importar a versão atual do auth compartilhado`);
  assert.doesNotMatch(source,/sessionStorage\.getItem\([^)]*da_finance_access_token_v1|ADMIN_TOKEN_KEY\s*=|function\s+(?:adminToken|token)\s*\(\)\s*\{[^}]*sessionStorage/s,`${name} não deve gerenciar JWT por conta própria`);
}
assert.match(files.send,/attendanceJsonApi/,'envio de texto deve usar API JSON compartilhada');
assert.match(files.media,/attendanceAuthorizedFetch/,'mídia multipart deve usar fetch autenticado compartilhado');
assert.match(files.templates,/attendanceAuthorizedFetch/,'templates devem usar fetch autenticado compartilhado');
assert.match(files.humanAi,/attendanceAuthorizedFetch/,'Humano×IA deve usar fetch autenticado compartilhado para RPC direto');
assert.match(files.humanAi,/attendanceJsonApi/,'Humano×IA deve usar API compartilhada para leitura da conversa');
assert.match(files.ana,/attendanceAuthorizedFetch/,'ANA deve usar fetch autenticado compartilhado');

for(const module of ['attendance-app.js','attendance-library.js','attendance-ana-preview.js','attendance-send.js','attendance-media-send.js','attendance-templates.js','attendance-human-ai.js']){
  const escaped=module.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(html,new RegExp(`${escaped}\\?v=auth-refresh-v2`),`${module} deve receber cache-bust v2`);
}

console.log('OK · toda a Central usa renovação de sessão compartilhada.');
