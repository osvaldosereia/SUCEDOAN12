import fs from 'node:fs';
import assert from 'node:assert/strict';

const resolver=fs.readFileSync('supabase/migrations/20260918162500_cm_1_2_identity_resolver_v1.sql','utf8');
const observer=fs.readFileSync('supabase/migrations/20260918170500_cm_1_2_identity_kind_compat_v2.sql','utf8');
const bootstrap=fs.readFileSync('supabase/migrations/20260918171000_cm_1_2_bootstrap_whatsapp_identities_v1.sql','utf8');
const papo=fs.readFileSync('supabase/functions/papo-comprar-webhook-v1/index.ts','utf8');

assert.match(resolver,/resolve_customer_identity_v1/);
assert.match(resolver,/decision in \('matched','unmatched','conflict'\)/);
assert.match(resolver,/v_decision:='conflict'/);
assert.match(resolver,/p_persist boolean default true/);
assert.doesNotMatch(resolver,/where\s+lower\([^\n]*name/i,'Identity Resolver não pode resolver por nome');
assert.match(resolver,/revoke all on function public\.resolve_customer_identity_v1[\s\S]*from public,anon,authenticated/);
assert.match(observer,/verification_status.*'observed'/s);
assert.match(observer,/v_kind not in \('e164','igsid','psid','web_subject','email','other'\)/);
assert.match(bootstrap,/'e164'/);
assert.match(bootstrap,/'observed'/);
assert.match(papo,/resolve_customer_identity_v1/);
assert.match(papo,/observe_customer_channel_identity_v1/);
assert.doesNotMatch(papo,/lookup_customer_by_phone/,'PapoAI deve usar o resolver canônico, não escolher primeiro match legado');

console.log('cm-1.2 identity resolver contract ok');
