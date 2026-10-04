import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/sql/20261004_storefront_catalog_link_v1.sql';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';

assert.equal(fs.existsSync(migrationPath),true,'migration do link de catálogo próprio deve existir');
assert.equal(fs.existsSync(apiPath),true,'gateway da Central deve existir');

const sql=fs.readFileSync(migrationPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_issue_storefront_catalog_link_v1/i,'RPC próprio de catálogo deve existir');
assert.match(sql,/storefront_identity_tokens/i,'link deve continuar usando tokens canônicos do Storefront');
assert.match(sql,/short_code/i,'link deve continuar emitindo código curto');
assert.match(sql,/catalog_path/i,'RPC deve devolver caminho de catálogo');
assert.match(sql,/interval|make_interval/i,'token deve continuar expirando');
assert.match(sql,/'attendance'/i,'novo token da Central deve ter source próprio');
assert.doesNotMatch(sql,/ops2_papoai_bridge_runtime_v1/i,'RPC próprio não pode depender do runtime PapoAI');
assert.match(sql,/security\s+definer/i,'RPC deve ser server-side');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.ops2_issue_storefront_catalog_link_v1/i,'RPC deve nascer fechado');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.ops2_issue_storefront_catalog_link_v1[^;]*to\s+service_role/i,'somente service role deve executar');

assert.match(api,/ops2_issue_storefront_catalog_link_v1/,'Central deve emitir catálogo pelo RPC próprio');
assert.doesNotMatch(api,/ops2_issue_papoai_catalog_link_v1/,'Central não deve depender do RPC legado PapoAI para emitir catálogo');
assert.match(api,/action===?\s*["']issue_catalog["']|action==\s*["']issue_catalog["']/,'ação issue_catalog deve permanecer exposta');

console.log('OK · emissão de catálogo da Central independe do runtime PapoAI.');
