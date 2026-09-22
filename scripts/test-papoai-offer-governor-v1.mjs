import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922060000_papoai_offer_governor_v1.sql','utf8');
for(const x of [
"'explicit_request_max',10",
'get_papoai_commerce_proactive_offer_v1',
'proactive_offer_already_shown_for_cart',
'recent_offer_rejection',
'offer_signal_too_weak',
'record_papoai_commerce_proactive_offer_v1',
"'proactive_offer_max_per_cart',1",
"'proactive_offer_policy','strong_signal_only_no_spam'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI offer governor anti-spam policy');
