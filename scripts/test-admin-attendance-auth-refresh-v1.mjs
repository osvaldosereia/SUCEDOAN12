import assert from 'node:assert/strict';
import fs from 'node:fs';

const authPath='vitrine/admin/atendimento/attendance-auth.js';
assert.equal(fs.existsSync(authPath),true,'cliente autenticado compartilhado deve existir');
const auth=fs.readFileSync(authPath,'utf8');
const app=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');
const library=fs.readFileSync('vitrine/admin/atendimento/attendance-library.js','utf8');
const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const bootstrap=fs.readFileSync('supabase/functions/admin-pin-auth-v1/index.ts','utf8');

assert.match(auth,/export\s+async\s+function\s+attendanceJsonApi/,'cliente autenticado compartilhado deve exportar attendanceJsonApi');
assert.match(auth,/(?:tokenExpiresSoon|jwtExpiresSoon|expiresSoon)/,'JWT deve ser renovado antes do vencimento');
assert.match(auth,/response\.status\s*===\s*401/,'401 deve disparar recuperação de sessão');
assert.match(auth,/(?:forceRefresh|force\s*:\s*true)/,'401 deve forçar renovação do token');
assert.match(auth,/JSON\.stringify\(params/,'POST deve enviar corpo JSON explicitamente');
assert.match(auth,/sessionStorage\.setItem\([^,]+,\s*token\)/,'novo token deve ser persistido no sessionStorage');
assert.match(bootstrap,/searchParams\.get\("exchange"\)\s*===\s*"1"/,'bootstrap deve ter modo de troca server-side opcional');
assert.match(bootstrap,/auth\.verifyOtp/,'bootstrap deve trocar token hash por sessão somente no modo exchange');
assert.match(app,/attendanceJsonApi/,'core do Atendimento deve usar o cliente compartilhado');
assert.match(library,/attendanceJsonApi/,'Biblioteca deve usar o cliente compartilhado');
assert.match(html,/attendance-app\.js\?v=(?:auth-refresh-v2|product-media-v1|attendance-papoai-retired-v1)/,'core deve receber cache-bust explícito e atual');
assert.match(html,/attendance-library\.js\?v=auth-refresh-v2/,'Biblioteca deve receber cache-bust atual');

console.log('OK · Atendimento renova sessão e preserva corpo JSON da Biblioteca.');
