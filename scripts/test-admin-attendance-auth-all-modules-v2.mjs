import assert from 'node:assert/strict';
import fs from 'node:fs';

const authPath='vitrine/admin/atendimento/attendance-auth.js';
const htmlPath='vitrine/admin/atendimento/index.html';
const appPath='vitrine/admin/atendimento/attendance-app.js';
const libraryPath='vitrine/admin/atendimento/attendance-library.js';
const targets={
  send:'vitrine/admin/atendimento/attendance-send.js',
  media:'vitrine/admin/atendimento/attendance-media-send.js',
  templates:'vitrine/admin/atendimento/attendance-templates.js',
  humanAi:'vitrine/admin/atendimento/attendance-human-ai.js',
  ana:'vitrine/admin/atendimento/attendance-ana-preview.js',
  products:'vitrine/admin/atendimento/attendance-product-send.js'
};
for(const path of [authPath,htmlPath,appPath,libraryPath,...Object.values(targets)])assert.equal(fs.existsSync(path),true,`${path} deve existir`);
const auth=fs.readFileSync(authPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');
const app=fs.readFileSync(appPath,'utf8');
const library=fs.readFileSync(libraryPath,'utf8');
const files=Object.fromEntries(Object.entries(targets).map(([key,path])=>[key,fs.readFileSync(path,'utf8')]));

assert.match(auth,/export\s+async\s+function\s+attendanceAuthorizedFetch/,'auth compartilhado deve expor fetch autenticado genérico');
assert.match(auth,/ensureAttendanceToken/,'fetch autenticado deve usar renovação preventiva');
assert.match(auth,/response\.status\s*===\s*401/,'fetch autenticado deve recuperar uma vez após 401');
assert.match(auth,/forceRefresh\s*:\s*true/,'recuperação 401 deve forçar token novo');
assert.match(auth,/import\.meta\.url/,'auth deve distinguir alias sem versão da instância canônica');
assert.match(auth,/import\(['"]\.\/attendance-auth\.js\?v=auth-refresh-v2['"]\)/,'alias sem versão deve delegar para a instância canônica v2');
assert.match(auth,/canonicalAuth[\s\S]*ensureAttendanceToken/,'renovação via alias deve delegar ao canônico');
assert.match(auth,/canonicalAuth[\s\S]*attendanceJsonApi/,'API JSON via alias deve delegar ao canônico');

assert.match(app,/ensureAttendanceToken/,'boot do Atendimento deve preservar o hotfix #716');
assert.match(app,/async\s+function\s+boot\(\)[\s\S]*await\s+ensureAttendanceToken\(\)/,'boot deve renovar/obter sessão antes de carregar a Central');
assert.doesNotMatch(app,/\badminToken\s*\(/,'boot não pode voltar a chamar helper removido');
assert.match(app,/from\s+['"]\.\/attendance-auth\.js['"]/i,'core deve usar o alias compatível do auth compartilhado');
assert.match(library,/from\s+['"]\.\/attendance-auth\.js['"]/i,'Biblioteca deve usar o alias compatível do auth compartilhado');

for(const [name,source] of Object.entries(files)){
  assert.match(source,/from\s+['"]\.\/attendance-auth\.js\?v=auth-refresh-v2['"]/i,`${name} deve importar a instância canônica atual do auth compartilhado`);
  assert.doesNotMatch(source,/sessionStorage\.getItem\([^)]*da_finance_access_token_v1|ADMIN_TOKEN_KEY\s*=|function\s+(?:adminToken|token)\s*\(\)\s*\{[^}]*sessionStorage/s,`${name} não deve gerenciar JWT por conta própria`);
}
assert.match(files.send,/attendanceJsonApi/,'envio de texto deve usar API JSON compartilhada');
assert.match(files.media,/attendanceAuthorizedFetch/,'mídia multipart deve usar fetch autenticado compartilhado');
assert.match(files.templates,/attendanceAuthorizedFetch/,'templates devem usar fetch autenticado compartilhado');
assert.match(files.humanAi,/attendanceAuthorizedFetch/,'Humano×IA deve usar fetch autenticado compartilhado para RPC direto');
assert.match(files.humanAi,/attendanceJsonApi/,'Humano×IA deve usar API compartilhada para leitura da conversa');
assert.match(files.ana,/attendanceAuthorizedFetch/,'ANA deve usar fetch autenticado compartilhado');
assert.match(files.products,/attendanceAuthorizedFetch/,'Produtos com imagem devem usar fetch autenticado compartilhado');
assert.match(files.products,/attendanceJsonApi/,'fallback de texto de Produtos deve usar API compartilhada');

const directModules=['attendance-library.js','attendance-ana-preview.js','attendance-send.js','attendance-media-send.js','attendance-templates.js','attendance-human-ai.js'];
assert.match(html,/attendance-app\.js\?v=(?:auth-refresh-v2|product-media-v1|attendance-papoai-retired-v1|ana-identified-catalog-v1|mobile-chat-v1)/,'core deve ter cache-bust explícito compatível com sessão renovável');
for(const module of directModules){
  const escaped=module.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(html,new RegExp(`${escaped}\\?v=auth-refresh-v2`),`${module} deve receber cache-bust v2`);
}

console.log('OK · toda a Central, inclusive Produtos, converge para uma instância canônica versionada de sessão e preserva o boot autenticado.');
