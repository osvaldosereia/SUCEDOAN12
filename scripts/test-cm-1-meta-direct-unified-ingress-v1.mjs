import fs from 'node:fs';
import assert from 'node:assert/strict';

const direct=fs.readFileSync('supabase/functions/whatsapp-meta-direct-v1/index.ts','utf8');

assert.match(direct,/get_dona_antonia_meta_app_secret_v1/);
assert.match(direct,/get_whatsapp_flow_health_verify_token_v1/);
assert.match(direct,/persistMetaIngressEvidence/);
assert.match(direct,/meta_webhook_events/);
assert.match(direct,/whatsapp_flow_health_events/);
assert.match(direct,/signature_verified:true/);
assert.match(direct,/processing_status:cfg\?\.enabled&&cfg\?\.release_mode!=="off"\?"received":"ignored"/);
assert.match(direct,/evidence_recorded:true/);
assert.match(direct,/outbound_performed:false/);
assert.match(direct,/external_side_effect:false/);

const handlerStart=direct.indexOf('Deno.serve(async(req:Request)=>');
assert.ok(handlerStart>=0,'handler missing');
const handler=direct.slice(handlerStart);
const persistAt=handler.indexOf('persistMetaIngressEvidence(sb,body,raw,cfg)');
const gateAt=handler.indexOf('if(!cfg?.enabled||cfg.release_mode==="off")');
const sendAt=handler.indexOf('await sendMeta(');
assert.ok(persistAt>=0,'evidence persist missing');
assert.ok(gateAt>persistAt,'fail-closed gate must run after evidence persistence');
assert.ok(sendAt>gateAt,'sendMeta must stay behind the disabled/release gate');

const disabledBlock=handler.slice(gateAt,sendAt);
assert.match(disabledBlock,/disabled:true/);
assert.match(disabledBlock,/outbound_performed:false/);
assert.doesNotMatch(disabledBlock,/messages.*insert/);

console.log('CM-1 Meta Direct unified ingress fail-closed contract: OK');
