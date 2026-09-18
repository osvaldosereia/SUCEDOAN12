import fs from 'node:fs';
import assert from 'node:assert/strict';

const cfg=fs.readFileSync('supabase/config.toml','utf8');
const edge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const auth=fs.readFileSync('admin/customer-os-auth.js','utf8');
const api=fs.readFileSync('admin/customer-os-api.js','utf8');
const runtime=fs.readFileSync('admin/runtime-config.js','utf8');
const publicAdmin=fs.readFileSync('supabase/functions/admin-core-v1/index.ts','utf8');

assert.match(cfg,/\[functions\.customer-intelligence-v1\][\s\S]*?verify_jwt\s*=\s*true/i,'Customer OS precisa exigir JWT');
assert.match(edge,/auth\.getUser\(token\)/,'endpoint protegido precisa validar usuário');
assert.match(edge,/from\(["']admin_users["']\)/,'endpoint protegido precisa validar admin_users');
assert.match(edge,/action===['"]customer_360['"]/,'Customer 360 precisa existir somente no boundary autenticado');
assert.match(auth,/sessionStorage/,'sessão sensível deve ficar limitada à sessão do navegador');
assert.match(auth,/\/auth\/v1\/verify/,'PIN bootstrap precisa virar sessão Supabase real');
assert.doesNotMatch(auth+api,/service[_-]?role/i,'frontend nunca pode carregar service role');
assert.match(api,/Authorization:\s*`Bearer \$\{token\}`/,'Customer OS precisa enviar Bearer JWT');
assert.match(runtime,/customerOsFunction:\s*['"]customer-intelligence-v1['"]/,'runtime deve apontar para boundary seguro');
assert.match(runtime,/adminPinAuthFunction:\s*['"]admin-pin-auth-v1['"]/,'runtime deve apontar para bootstrap de PIN');
assert.doesNotMatch(publicAdmin,/action===["']customer_360["']/,'Customer 360 não pode ser adicionado ao endpoint público');
assert.doesNotMatch(publicAdmin,/customer_channel_consents/,'Consent Ledger não pode ser exposto no endpoint público');

console.log('customer-marketing security boundary v1 ok');
