import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('admin/index.html','utf8');
const app=fs.readFileSync('admin/app-lite.js','utf8');
const config=fs.readFileSync('admin/config.js','utf8');
const supabaseConfig=fs.readFileSync('supabase/config.toml','utf8');

for (const forbidden of [
  'accessNotice',
  'Autorizar este aparelho',
  'Sessão protegida',
  'da_admin_v3_auth',
  'refresh_token',
  'access_token',
  'setup-admin'
]) {
  assert.doesNotMatch(html+app+config,new RegExp(forbidden,'i'));
}

assert.match(supabaseConfig,/\[functions\.admin-simple-v2\][\s\S]*?verify_jwt\s*=\s*false/i);
console.log('admin-no-auth-v2 ok');
