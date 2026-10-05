import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath='supabase/functions/admin-marketing-campaigns-v1/index.ts';
assert.equal(fs.existsSync(edgePath),true,'Edge admin-marketing-campaigns-v1 deve existir');
const source=fs.readFileSync(edgePath,'utf8');

assert.match(source,/async\s+function\s+adminAuth\s*\(/,'API deve exigir autenticação Admin');
assert.match(source,/db\.auth\.getUser\s*\(/,'sessão deve ser validada no Supabase Auth');
assert.match(source,/from\(["']admin_users["']\)[\s\S]*is_active/i,'Admin deve estar ativo');

for(const action of ['list','detail','options','create','update_draft','create_snapshot','transition','prepare_internal_test']){
  assert.match(source,new RegExp(`action\\s*===\\s*["']${action}["']`,'i'),`ação Admin ausente: ${action}`);
}
for(const rpc of ['marketing_create_campaign_v1','marketing_update_campaign_draft_v1','marketing_create_campaign_snapshot_v1','marketing_transition_campaign_v1','marketing_campaign_detail_v1']){
  assert.match(source,new RegExp(`rpc\\(["']${rpc}["']`,'i'),`API deve usar RPC canônica: ${rpc}`);
}

assert.match(source,/from\(["']whatsapp_templates_v1["']\)[\s\S]*category[\s\S]*status/i,'options deve ler cache canônico de templates');
assert.match(source,/eq\(["']whatsapp_account_id["']/i,'options deve filtrar template pela conta');
assert.match(source,/MARKETING/i,'options deve restringir categoria MARKETING');
assert.match(source,/APPROVED/i,'options deve restringir status APPROVED');

for(const forbidden of ['waba_id','phone_number_id','to_phone_e164','destination_phone','outbox_id','schedule_at','send_at']){
  assert.match(source,new RegExp(forbidden,'i'),`campo proibido deve ser reconhecido: ${forbidden}`);
}
assert.match(source,/hasForbiddenField/i,'payloads devem ser inspecionados por campos de transporte');
assert.match(source,/payload_too_large|MAX_BODY_BYTES/i,'API deve limitar payload');
assert.match(source,/filters_too_large|MAX_FILTER/i,'API deve limitar filtros');
assert.match(source,/dispatch_allowed\s*:\s*false/i,'teste interno deve ser preparação sem despacho');
assert.match(source,/Nenhuma mensagem será enviada|no_dispatch|internal_test_only/i,'API deve deixar explícito que teste interno não envia');
assert.match(source,/0975|1018/i,'destinos internos devem ser derivados dos canais oficiais, não do browser');

assert.doesNotMatch(source,/sendTemplateViaMeta|graph\.facebook\.com|whatsapp_outbox|ops2_whatsapp_outbox|pg_net|scheduler|setTimeout\s*\([^,]+,\s*\d{4,}/i,'Fase D não pode conter transporte, outbox ou scheduler');

console.log('PASS test-admin-marketing-campaigns-v1');
