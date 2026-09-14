import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('contagem/index.html','utf8');
const fast=fs.readFileSync('contagem/fast-mode.js','utf8');
const edge=fs.readFileSync('supabase/functions/inventory-fast-balance-v3/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const quantityMigrationPath='supabase/migrations/20260914211000_inventory_fast_quantity_mode_v1.sql';
const quantityMigration=fs.existsSync(quantityMigrationPath)?fs.readFileSync(quantityMigrationPath,'utf8'):'';

for (const forbidden of [
  'Entrar na contagem',
  'loginCard',
  'emailInput',
  'passwordInput',
  'bridge-auth.js',
  'app-v2.js'
]) assert.doesNotMatch(html,new RegExp(forbidden,'i'));

assert.match(html,/id="fastMode"/i);
assert.match(html,/fast-mode\.js/i);
assert.match(html,/id="fastModeDirectButton"/i,'balanço rápido deve oferecer Leitura direta');
assert.match(html,/id="fastModeQuantityButton"/i,'balanço rápido deve oferecer Ler + quantidade');
assert.match(html,/id="fastQuantityPanel"/i,'modo quantidade deve ter painel próprio');
assert.match(html,/id="fastQuantityInput"[^>]*inputmode="numeric"/i,'quantidade deve usar teclado numérico');

for (const forbidden of [
  'da_count_v2_auth',
  'access_token',
  'refresh_token',
  'Authorization',
  'Faça login'
]) assert.doesNotMatch(fast,new RegExp(forbidden,'i'));

assert.match(fast,/da_fast_balance_mode_v1/,'modo escolhido deve ficar salvo no aparelho');
assert.match(fast,/direct/,'Leitura direta deve continuar disponível');
assert.match(fast,/quantity/,'modo Ler + quantidade deve ser suportado');
assert.match(fast,/quantity\s*:\s*qty/,'evento do modo quantidade deve levar o total digitado');
assert.match(fast,/fastQuantityInput/,'JS deve controlar o campo de quantidade');

assert.doesNotMatch(edge,/authorize\(req\)|auth\.getUser|admin_users|user\.id/i);
assert.match(edge,/p_user_id\s*:\s*null/i);
assert.match(edge,/quantity\s*:\s*Number\.isFinite/,'edge deve preservar a quantidade absoluta solicitada');
assert.match(config,/\[functions\.inventory-fast-balance-v3\][\s\S]*?verify_jwt\s*=\s*false/i);

assert.equal(fs.existsSync(quantityMigrationPath),true,'modo quantidade deve incluir migração de banco');
assert.match(quantityMigration,/requested_quantity/i,'migração deve registrar a quantidade solicitada');
assert.match(quantityMigration,/v_requested_quantity/i,'RPC deve tratar quantidade absoluta separadamente da soma por bip');
assert.match(quantityMigration,/physically_verified\s*=\s*true/i,'os dois modos devem continuar concluindo a verificação física');

console.log('fast-balance-no-login ok');
