import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261005021000_marketing_campaign_worker_cron_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration do cron de campanhas deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/pg_extension[\s\S]*pg_cron/i,'migration deve verificar pg_cron existente');
assert.match(sql,/pg_extension[\s\S]*pg_net/i,'migration deve verificar pg_net existente');
assert.doesNotMatch(sql,/create\s+extension/i,'não deve recriar extensões já existentes');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.run_marketing_campaign_worker_tick_v1\s*\(\s*\)/i,'tick server-side deve existir');
assert.match(sql,/pg_try_advisory_xact_lock/i,'tick concorrente deve usar advisory lock');
assert.match(sql,/marketing_campaign_execution_runtime_v1/i,'tick deve consultar runtime próprio');
assert.match(sql,/whatsapp_channel_runtime_v1/i,'tick deve consultar runtime do canal');
assert.match(sql,/campaigns_enabled\s*=\s*true|campaigns_enabled\s+is\s+true/i,'tick deve exigir campaigns_enabled');
assert.match(sql,/mode\s+in\s*\(\s*['"]canary['"]\s*,\s*['"]live['"]\s*\)/i,'tick deve exigir canary/live');
assert.match(sql,/outbound_provider\s*=\s*['"]meta['"]/i,'tick deve exigir outbound Meta');
assert.match(sql,/marketing_campaign_worker_internal_key_v1\s*\(/i,'auth interna deve ser obtida server-side');
assert.match(sql,/net\.http_post\s*\(/i,'tick deve usar pg_net somente após gates');
assert.match(sql,/whatsapp-marketing-worker-v1/i,'tick só pode chamar a Edge do worker de campanhas');
assert.match(sql,/x-dona-antonia-marketing-worker-key/i,'HTTP deve levar chave interna');
assert.match(sql,/jsonb_build_object\s*\(\s*['"]limit['"][\s\S]*['"]tick_id['"]/i,'payload deve conter apenas limit/tick_id');
assert.doesNotMatch(sql,/customer_id|phone_e164|template_id|waba_id|phone_number_id/i,'tick não pode transportar destinatário/template/WABA');

const httpIndex=sql.search(/net\.http_post\s*\(/i);
const gateIndex=sql.search(/campaigns_enabled\s*=\s*true|campaigns_enabled\s+is\s+true/i);
const secretIndex=sql.search(/marketing_campaign_worker_internal_key_v1\s*\(/i);
assert.ok(gateIndex>=0&&httpIndex>gateIndex,'gate deve ser avaliado antes do HTTP');
assert.ok(secretIndex>gateIndex&&httpIndex>secretIndex,'segredo só deve ser lido depois de existir trabalho elegível');

assert.match(sql,/jobname\s*=\s*['"]marketing-campaign-worker-v1['"]|where\s+jobname\s*=\s*['"]marketing-campaign-worker-v1['"]/i,'migration deve localizar job pelo nome');
assert.match(sql,/cron\.unschedule/i,'migration deve remover job anterior idempotentemente');
assert.match(sql,/cron\.schedule\s*\([\s\S]*marketing-campaign-worker-v1[\s\S]*\* \* \* \* \*/i,'cron deve rodar a cada minuto');
assert.match(sql,/run_marketing_campaign_worker_tick_v1\s*\(\s*\)/i,'cron deve chamar apenas o tick server-side');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.run_marketing_campaign_worker_tick_v1\s*\(\s*\)[\s\S]*anon[\s\S]*authenticated/i,'tick não pode ser público');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.run_marketing_campaign_worker_tick_v1\s*\(\s*\)[\s\S]*service_role/i,'service_role deve poder executar tick');
assert.doesNotMatch(sql,/graph\.facebook\.com/i,'cron nunca chama Meta/Graph diretamente');

console.log('PASS test-whatsapp-marketing-worker-cron-v1');
