import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');

assert.match(source,/async function attendanceSendCapability\(accountId:string\|null,windowOpen:boolean,destinationE164:string\|null\)/,'capability must receive destination');
assert.match(source,/select\("send_enabled,human_send_enabled,homologated_at,outbound_provider,metadata"\)/,'capability must load runtime metadata');
assert.match(source,/meta_canary_destination_blocked/,'capability must expose explicit canary block reason');
assert.match(source,/meta_canary_to_e164/,'capability must inspect canary allowlist');
assert.match(source,/data\.conversation\.phone_e164/,'conversation phone must be passed into capability');

console.log('PASS admin attendance Meta canary capability guard');
