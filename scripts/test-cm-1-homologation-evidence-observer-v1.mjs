import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919080000_cm_1_homologation_evidence_observer_v1.sql','utf8');
const hardening=fs.readFileSync('supabase/migrations/20260919080500_customer_os_vault_secret_reader_hardening_v1.sql','utf8');
const ui=fs.readFileSync('admin/relacionamento.js','utf8');
const html=fs.readFileSync('admin/relacionamento.html','utf8');

assert.match(migration,/cm1_homologation_evidence_summary_v1/);
assert.match(migration,/catalog_search/);
assert.match(migration,/product_view/);
assert.match(migration,/next_expiry_at/);
assert.match(migration,/lifecycle_closed_observed/);
assert.match(migration,/pending_conflicts/);
assert.match(migration,/vault_readonly_token_configured/);
assert.match(migration,/granted_required_permissions/);
assert.match(migration,/marketing_external_side_effects_7d/);
assert.match(migration,/ai_side_effects_7d/);
assert.match(migration,/'version','cm1\.15-v3'/);
assert.match(migration,/'homologation_evidence',public\.cm1_homologation_evidence_summary_v1\(\)/);
assert.match(migration,/external_side_effect',false/);

assert.doesNotMatch(migration,/graph\.facebook\.com|openai\.com\/v1|\/messages\b/i);
assert.doesNotMatch(migration,/insert\s+into\s+public\.marketing_campaigns/i);
assert.doesNotMatch(migration,/update\s+public\.customer_marketing_opportunities/i);
assert.doesNotMatch(migration,/delete\s+from/i);

assert.match(hardening,/p_name='dona_antonia_whatsapp_access_token_v1'/);
assert.match(hardening,/else null/);
assert.match(hardening,/grant execute[\s\S]*service_role/i);
assert.doesNotMatch(hardening,/grant execute[\s\S]*authenticated/i);

assert.match(html,/Evidências em observação/);
assert.match(html,/homologationEvidenceView/);
assert.match(html,/relacionamento\.js\?v=20260918-8/);
assert.match(ui,/renderHomologationEvidence/);
assert.match(ui,/Aguardando lifecycle natural/);
assert.match(ui,/Token read-only no Vault/);
assert.match(ui,/Zero efeito externo/);
assert.match(ui,/não cria eventos/);

console.log('CM-1 homologation evidence observer: OK');
