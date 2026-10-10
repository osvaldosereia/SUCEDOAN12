import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/sql/20261004_storefront_catalog_link_v1.sql';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';

assert.equal(fs.existsSync(migrationPath),true,'migration do link de catálogo próprio deve existir');
assert.equal(fs.existsSync(apiPath),true,'gateway da Central deve existir');

const sql=fs.readFileSync(migrationPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const compatMarker=sql.indexOf('-- Compatibility bridge:');
assert.ok(compatMarker>0,'migration deve separar RPC próprio da ponte de compatibilidade');
const ownSql=sql.slice(0,compatMarker);
const compatSql=sql.slice(compatMarker);

assert.match(ownSql,/create\s+or\s+replace\s+function\s+public\.ops2_issue_storefront_catalog_link_v1/i,'RPC próprio de catálogo deve existir');
assert.match(ownSql,/storefront_identity_tokens/i,'link deve continuar usando tokens canônicos do Storefront');
assert.match(ownSql,/short_code/i,'link deve continuar emitindo código curto');
assert.match(ownSql,/catalog_path/i,'RPC deve devolver caminho de catálogo');
assert.match(ownSql,/make_interval/i,'token deve continuar expirando');
assert.match(ownSql,/'attendance'/i,'novo token da Central deve ter source próprio');
assert.doesNotMatch(ownSql,/ops2_papoai_bridge_runtime_v1/i,'RPC próprio não pode depender do runtime PapoAI');
assert.match(ownSql,/security\s+definer/i,'RPC deve ser server-side');
assert.match(ownSql,/revoke\s+all\s+on\s+function\s+public\.ops2_issue_storefront_catalog_link_v1/i,'RPC deve nascer fechado');
assert.match(ownSql,/grant\s+execute\s+on\s+function\s+public\.ops2_issue_storefront_catalog_link_v1[^;]*to\s+service_role/i,'somente service role deve executar');

assert.match(compatSql,/create\s+or\s+replace\s+function\s+public\.ops2_issue_papoai_catalog_link_v1/i,'ponte legada deve continuar existindo temporariamente');
assert.match(compatSql,/if\s+v_source_event_key\s+like\s+'attendance:%'[\s\S]*?ops2_issue_storefront_catalog_link_v1\([\s\S]*?'attendance'\s*,\s*120[\s\S]*?end\s+if/i,'chamadas da Central devem desviar para o RPC próprio antes do runtime PapoAI');
const attendanceBranchEnd=compatSql.search(/select\s+\*\s+into\s+v_cfg\s+from\s+public\.ops2_papoai_bridge_runtime_v1/i);
assert.ok(attendanceBranchEnd>0,'gate legado PapoAI deve existir apenas depois do desvio Attendance');
assert.match(compatSql.slice(0,attendanceBranchEnd),/ops2_issue_storefront_catalog_link_v1/,'desvio Attendance deve ocorrer antes de consultar PapoAI');

assert.match(api,/action===?\s*["']issue_catalog["']|action==\s*["']issue_catalog["']/,'ação issue_catalog deve permanecer exposta');
assert.match(api,/sourceKey=`attendance:\$\{conversationId\}:\$\{Date\.now\(\)\}`/,'Central deve identificar emissão própria com source attendance');
assert.match(api,/ops2_issue_papoai_catalog_link_v1/,'nome legado pode permanecer no gateway apenas enquanto a ponte de compatibilidade estiver ativa');

console.log('OK · emissão de catálogo da Central desvia do runtime PapoAI para o RPC próprio.');
