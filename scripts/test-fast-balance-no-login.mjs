import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('contagem/index.html','utf8');
const fast=fs.readFileSync('contagem/fast-mode.js','utf8');
const edge=fs.readFileSync('supabase/functions/inventory-fast-balance-v3/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

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

for (const forbidden of [
  'da_count_v2_auth',
  'access_token',
  'refresh_token',
  'Authorization',
  'Faça login'
]) assert.doesNotMatch(fast,new RegExp(forbidden,'i'));

assert.doesNotMatch(edge,/authorize\(req\)|auth\.getUser|admin_users|user\.id/i);
assert.match(edge,/p_user_id\s*:\s*null/i);
assert.match(config,/\[functions\.inventory-fast-balance-v3\][\s\S]*?verify_jwt\s*=\s*false/i);

console.log('fast-balance-no-login ok');
