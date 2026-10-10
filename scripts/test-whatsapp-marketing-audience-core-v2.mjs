import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261005002000_marketing_audience_candidates_v2.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration do núcleo de audiência v2 deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_audience_candidates_v2\s*\(/i,'núcleo marketing_audience_candidates_v2 deve existir');
for(const field of ['customer_id','name','canonical_phone','masked_phone','consent_state','is_active','city','neighborhood','order_count','lifetime_value','last_purchase_at','phone_rank','eligible','exclusion_reason_list']){
  assert.match(sql,new RegExp(`\\b${field}\\b`,'i'),`coluna ausente no núcleo: ${field}`);
}
for(const filter of ['customer_ids','search','city','neighborhood','label_ids','product_ids','brand','category','last_purchase_before','last_purchase_after','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value']){
  assert.match(sql,new RegExp(`['\"]${filter}['\"]`,'i'),`filtro ausente no núcleo: ${filter}`);
}
assert.match(sql,/canonical_whatsapp_e164_br_v2/i,'núcleo deve canonicalizar telefone E.164');
assert.match(sql,/row_number\s*\(\s*\)\s*over[\s\S]*partition\s+by\s+(?:[a-z_][a-z0-9_]*\.)?canonical_phone/i,'núcleo deve deduplicar deterministicamente por telefone');
for(const reason of ['no_consent','opted_out','inactive_customer','invalid_phone','duplicate_phone']){
  assert.match(sql,new RegExp(reason,'i'),`motivo técnico ausente: ${reason}`);
}

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_preview_audience_v1\s*\(/i,'preview v1 deve continuar existindo');
assert.match(sql,/from\s+public\.marketing_audience_candidates_v2\s*\(/i,'preview v1 deve consumir o núcleo v2');
for(const key of ['found_count','eligible_count','excluded_count','exclusion_reasons','limit','offset','items']){
  assert.match(sql,new RegExp(`['\"]${key}['\"]`,'i'),`preview deve preservar chave ${key}`);
}
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.marketing_audience_candidates_v2[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'núcleo deve negar public/anon/authenticated');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.marketing_audience_candidates_v2[\s\S]*to\s+service_role/i,'núcleo deve ser service_role only');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.marketing_preview_audience_v1[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'preview deve permanecer service_role only');

console.log('PASS test-whatsapp-marketing-audience-core-v2');
