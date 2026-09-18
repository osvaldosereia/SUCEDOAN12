import fs from 'node:fs';
import assert from 'node:assert/strict';

const cfg=fs.readFileSync('supabase/config.toml','utf8');
const edge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const auth=fs.readFileSync('admin/customer-os-auth.js','utf8');
const api=fs.readFileSync('admin/customer-os-api.js','utf8');
const runtime=fs.readFileSync('admin/runtime-config.js','utf8');
const publicAdmin=fs.readFileSync('supabase/functions/admin-core-v1/index.ts','utf8');
const app=fs.readFileSync('admin/app.js','utf8');
const pinAuth=fs.readFileSync('supabase/functions/admin-pin-auth-v1/index.ts','utf8');

assert.match(cfg,/\[functions\.customer-intelligence-v1\][\s\S]*?verify_jwt\s*=\s*true/i,'Customer OS precisa exigir JWT');
assert.match(edge,/auth\.getUser\(token\)/,'endpoint protegido precisa validar usuário');
assert.match(edge,/from\(["']admin_users["']\)/,'endpoint protegido precisa validar admin_users');
assert.match(edge,/action===['"]customer_360['"]/,'Customer 360 precisa existir somente no boundary autenticado');
assert.match(edge,/action===['"]save_customer['"]/,'CRUD sensível de clientes precisa existir no boundary autenticado');
assert.match(edge,/action===['"]customer_history['"]/,'histórico de clientes precisa existir no boundary autenticado');
assert.match(auth,/sessionStorage/,'sessão sensível deve ficar limitada à sessão do navegador');
assert.match(auth,/\/auth\/v1\/verify/,'PIN bootstrap precisa virar sessão Supabase real');
assert.match(pinAuth,/verification_type:\"email\"/,'token_hash de magic link deve ser trocado pelo tipo email conforme Supabase Auth');
assert.doesNotMatch(auth+api,/service[_-]?role/i,'frontend nunca pode carregar service role');
assert.match(api,/Authorization:\s*`Bearer \$\{token\}`/,'Customer OS precisa enviar Bearer JWT');
assert.match(runtime,/customerOsFunction:\s*['"]customer-intelligence-v1['"]/,'runtime deve apontar para boundary seguro');
assert.match(runtime,/adminPinAuthFunction:\s*['"]admin-pin-auth-v1['"]/,'runtime deve apontar para bootstrap de PIN');
assert.match(runtime,/customerOsSecureUiEnabled:\s*false/,'UI segura deve continuar em canary desligado até homologação do PIN');
assert.match(app,/customerOsApi\('customer_360'/,'editor/histórico precisa estar preparado para Customer 360 seguro');
assert.match(app,/customerApi\('save_customer'/,'salvamento de cliente precisa migrar pelo adapter seguro quando a flag estiver ligada');
assert.match(app,/customerOsLoginForm/,'UI segura precisa ter gate de PIN antes dos dados pessoais');
assert.doesNotMatch(publicAdmin,/action===["']customer_360["']/,'Customer 360 não pode ser adicionado ao endpoint público');
assert.doesNotMatch(publicAdmin,/customer_channel_consents/,'Consent Ledger não pode ser exposto no endpoint público');

console.log('customer-marketing security boundary v1 ok');
