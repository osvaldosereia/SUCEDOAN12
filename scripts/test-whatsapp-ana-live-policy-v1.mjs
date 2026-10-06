import assert from 'node:assert/strict';
import {shouldSendAnaLiveReply} from '../supabase/functions/_shared/ana-live-policy-v1.mjs';

assert.equal(shouldSendAnaLiveReply({decision:'suggest',confidence:0.90,responseText:'Oi! Posso ajudar.'}),true,'high-confidence suggestion with text may be sent');
assert.equal(shouldSendAnaLiveReply({decision:'suggest',confidence:0.79,responseText:'Oi! Posso ajudar.'}),false,'low-confidence suggestions must go to a human');
assert.equal(shouldSendAnaLiveReply({decision:'handoff',confidence:0.99,responseText:'Vou verificar.'}),false,'handoff decisions must never be sent automatically');
assert.equal(shouldSendAnaLiveReply({decision:'no_reply',confidence:0.99,responseText:'Oi!'}),false,'no-reply decisions must not be sent');
assert.equal(shouldSendAnaLiveReply({decision:'suggest',confidence:0.99,responseText:'  '}),false,'empty text must never be sent');

console.log('PASS test-whatsapp-ana-live-policy-v1');
