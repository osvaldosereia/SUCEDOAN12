import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261004234500_marketing_audience_preview_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration de preview de públicos deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_preview_audience_v1\s*\(/i);
assert.match(sql,/p_filters\s+jsonb\s+default\s+['"]?\{\}['"]?::jsonb/i);
assert.match(sql,/p_limit\s+integer\s+default\s+50/i);
assert.match(sql,/p_offset\s+integer\s+default\s+0/i);
assert.match(sql,/returns\s+jsonb/i);

for(const key of ['customer_ids','search','city','neighborhood','label_ids','product_ids','brand','category','last_purchase_before','last_purchase_after','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value']){
  assert.match(sql,new RegExp(`['"]${key}['"]`,'i'),`filtro suportado ausente: ${key}`);
}
assert.match(sql,/unsupported_filter/i,'filtro desconhecido deve ser rejeitado explicitamente');

for(const key of ['found_count','eligible_count','excluded_count','exclusion_reasons','items']){
  assert.match(sql,new RegExp(`['"]${key}['"]`,'i'),`saída obrigatória ausente: ${key}`);
}
for(const reason of ['no_consent','opted_out','inactive_customer','invalid_phone','duplicate_phone']){
  assert.match(sql,new RegExp(reason,'i'),`motivo de exclusão ausente: ${reason}`);
}

assert.match(sql,/marketing_customer_consent_current_v1/i,'preview deve consumir estado canônico de consentimento');
assert.match(sql,/canonical_whatsapp_e164_br_v2/i,'telefone deve ser normalizado com helper canônico');
assert.match(sql,/row_number\s*\(\s*\)\s*over\s*\(\s*partition\s+by[\s\S]*phone/is,'dedupe deve usar row_number por telefone');
assert.match(sql,/attendance_conversation_labels_v1/i,'etiquetas devem ser filtro auxiliar server-side');
assert.match(sql,/attendance_labels_v1/i,'filtro de etiqueta deve validar cadastro de etiquetas');
assert.match(sql,/customer_addresses/i,'cidade/bairro devem usar endereço canônico');
assert.match(sql,/order_items/i,'produto/categoria/marca devem usar itens de pedido');
assert.match(sql,/products/i,'produto/categoria/marca devem resolver produto canônico');
assert.match(sql,/cancelled_at\s+is\s+null/i,'pedidos cancelados não contam como compra');
assert.match(sql,/returned_at\s+is\s+null/i,'pedidos devolvidos não contam como compra');
assert.match(sql,/confirmed_at\s+is\s+not\s+null|status\s+in\s*\([^)]*confirmed/is,'compra deve exigir confirmação/estado comercial válido');

assert.match(sql,/masked_phone/i,'itens do preview devem mascarar telefone');
assert.doesNotMatch(sql,/birthday_day|birthday_month|cpf_cnpj|relig|health|sexo|gender/i,'segmentação não deve usar/inferir atributos sensíveis');
assert.doesNotMatch(sql,/graph\.facebook\.com|sendTemplateViaMeta|whatsapp_outbox|wamid/i,'preview não pode conter transporte ou fila de envio');

assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.marketing_preview_audience_v1[\s\S]*from\s+public\s*,?\s*anon\s*,?\s*authenticated/i);
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.marketing_preview_audience_v1[\s\S]*to\s+service_role/i);
assert.doesNotMatch(sql,/grant\s+execute\s+on\s+function\s+public\.marketing_preview_audience_v1[\s\S]*to\s+(?:anon|authenticated)/i);

console.log('PASS test-whatsapp-marketing-audience-preview-v1');
