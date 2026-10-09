const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('supabase/migrations/20261009133000_da6_worker_dispatch_cron_v1.sql','utf8');
test('R6 cron não faz chamadas ao projeto de produção a partir de staging',()=>{
 assert.doesNotMatch(migration,/https:\/\/ssbesxgaijknwsjbsbcz[.]supabase[.]co\/functions/);
 assert.match(migration,/name='da6_label_worker_url_v1'/);
 assert.match(migration,/worker_endpoint_not_configured/);
 assert.match(migration,/IF v_url IS NULL OR v_url !~/);
});
test('R6 cron exige segredo e nunca atualiza estoque',()=>{
 assert.match(migration,/name='da6_label_worker_key_v1'/);
 assert.match(migration,/worker_key_missing/);
 assert.doesNotMatch(migration,/\binventory_balance_commit\b|\bupdate\s+products\b|bling/i);
});
