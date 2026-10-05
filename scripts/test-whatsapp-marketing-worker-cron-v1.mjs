import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/migrations/20261005021000_marketing_campaign_worker_cron_v1.sql';
assert.equal(fs.existsSync(path),true,'migration do cron de campanhas deve existir');
const sql=fs.readFileSync(path,'utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.run_marketing_campaign_worker_tick_v1\s*\(/i,'tick RPC deve existir');
assert.match(sql,/campaigns_enabled\s+is\s+true/i,'tick deve exigir campaigns_enabled=true');
assert.match(sql,/marketing_campaign_execution_runtime_v1/i,'tick deve consultar runtime próprio');
assert.match(sql,/mode\s+in\s*\(\s*['"]canary['"]\s*,\s*['"]live['"]\s*\)/i,'tick deve aceitar apenas canary/live');
assert.match(sql,/return\s+null|return\s+0|no[_ ]?op/i,'gate fechado deve retornar sem HTTP');
assert.match(sql,/net\.http_post\s*\(/i,'tick ativo deve usar pg_net');
assert.match(sql,/https:\/\/ssbesxgaijknwsjbsbcz\.supabase\.co\/functions\/v1\/whatsapp-marketing-worker-v1/i,'tick deve chamar somente o endpoint canônico do worker');
assert.match(sql,/timeout_milliseconds\s*:=\s*\d+/i,'HTTP do tick deve ter timeout finito');
assert.match(sql,/marketing_campaign_worker_internal_key_v1\s*\(/i,'autenticação interna deve vir do servidor');
assert.match(sql,/x-dona-antonia-marketing-worker-key/i,'header interno deve ser enviado ao worker');
assert.match(sql,/jsonb_build_object\s*\(\s*['"]limit['"]/i,'payload deve conter limite');
assert.match(sql,/['"]tick_id['"]/i,'payload deve conter tick_id');
assert.doesNotMatch(sql,/to_phone_e164|destination_phone|phone_number_id|waba_id|template_name/i,'cron não pode carregar destino/template no payload');
assert.match(sql,/cron\.unschedule/i,'migration deve remover job anterior por nome');
assert.match(sql,/cron\.schedule\s*\([\s\S]*marketing-campaign-worker-v1[\s\S]*['"]\* \* \* \* \*['"]/i,'job deve rodar a cada minuto e ser idempotente');
assert.match(sql,/pg_try_advisory_xact_lock|pg_advisory_xact_lock/i,'tick concorrente deve ter lock');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.run_marketing_campaign_worker_tick_v1[\s\S]*anon[\s\S]*authenticated/i,'tick deve ser service-role only');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.run_marketing_campaign_worker_tick_v1[\s\S]*service_role/i,'service_role deve executar tick');

console.log('PASS test-whatsapp-marketing-worker-cron-v1');
