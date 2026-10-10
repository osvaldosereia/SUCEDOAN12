import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath='supabase/functions/admin-marketing-campaign-report-v1/index.ts';
assert.equal(fs.existsSync(edgePath),true,'Edge de relatório deve existir');
const source=fs.readFileSync(edgePath,'utf8');
for(const text of ['marketing_campaigns_v1','marketing_campaign_dispatches_v1','whatsapp_messages_v1','whatsapp_message_status_events_v1','customers'])assert.ok(source.includes(text),`relatório deve usar ${text}`);
for(const key of ['total','sent','delivered','read','failed','delivery_rate','read_rate'])assert.ok(source.includes(key),`relatório deve retornar ${key}`);
assert.match(source,/masked_phone/,'telefone deve ser mascarado');
assert.match(source,/adminAuth/,'relatório deve exigir autenticação Admin');
assert.doesNotMatch(source,/provider_message_id\s*:/,'API não deve expor WAMID/provider_message_id no payload normal');
assert.doesNotMatch(source,/graph\.facebook\.com/,'relatório não deve chamar Graph');
assert.doesNotMatch(source,/insert\(|update\(|delete\(/,'Edge de relatório deve ser somente leitura');
console.log('admin marketing campaign report contract: ok');
