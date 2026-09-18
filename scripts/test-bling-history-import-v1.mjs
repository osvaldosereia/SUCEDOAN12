import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918010500_bling_history_import_runtime_v1.sql','utf8');
const foundation=fs.readFileSync('supabase/migrations/20260918004500_bling_history_import_foundation_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/bling-history-import-v1/index.ts','utf8');

assert.match(foundation,/bling_history_import_runtime/);
assert.match(foundation,/promotion_enabled boolean not null default false/);
assert.match(foundation,/fetch_enabled boolean not null default false/);
assert.match(foundation,/bling_order_id bigint not null unique/);
assert.match(foundation,/reconcile_bling_history_order_v1/);
assert.match(foundation,/promote_bling_history_order_v1/);

assert.match(migration,/dona_antonia_bling_history_import_key_v1/);
assert.match(migration,/bling_api_client_id_v1/);
assert.match(migration,/bling_api_client_secret_v1/);
assert.match(migration,/bling_api_refresh_token_v1/);
assert.match(migration,/set_bling_api_refresh_token_v1/);
assert.match(migration,/begin_bling_history_import_run_v1/);
assert.match(migration,/stage_bling_history_order_v1/);
assert.match(migration,/finish_bling_history_import_run_v1/);
assert.match(migration,/on conflict\(bling_order_id\)/,'staging deve ser idempotente por ID externo');
assert.match(migration,/approved\)\s*values\(v_status_id,v_status_name,false\)/,'status descoberto não pode ser aprovado automaticamente');
assert.doesNotMatch(migration,/make\.com|hook\.make/i);

assert.match(edge,/https:\/\/api\.bling\.com\.br\/Api\/v3/);
assert.match(edge,/https:\/\/api\.bling\.com\.br\/oauth\/token/);
assert.match(edge,/enable-jwt/);
assert.match(edge,/dataInicial/);
assert.match(edge,/dataFinal/);
assert.match(edge,/pagina/);
assert.match(edge,/limite/);
assert.match(edge,/pedidos\/vendas/);
assert.match(edge,/get_bling_api_credentials_v1/);
assert.match(edge,/set_bling_api_refresh_token_v1/,'refresh token rotacionado deve voltar ao Vault');
assert.match(edge,/stage_bling_history_order_v1/);
assert.match(edge,/reconcile_pending/);
assert.doesNotMatch(edge,/promote_bling_history_order_v1/,'importador de leitura não deve promover pedidos');
assert.doesNotMatch(edge,/Make|make\.com|hook\.make/i);
assert.match(edge,/max_orders_per_run/);
assert.match(edge,/Math\.min\(Number\(runtime\.max_orders_per_run\)\|\|10,10\)/,'primeiro importador deve limitar lote externo a 10');
assert.match(edge,/credentials:\{/);
assert.match(edge,/ready:Boolean\(c\.client_id&&c\.client_secret&&c\.refresh_token\)/);

console.log('PASS: importador histórico Bling V1');
