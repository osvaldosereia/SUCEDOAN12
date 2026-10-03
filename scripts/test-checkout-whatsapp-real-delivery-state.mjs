import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261003014500_checkout_whatsapp_real_delivery_state.sql';
assert.ok(fs.existsSync(migrationPath),'real delivery-state migration must exist');
const sql=fs.readFileSync(migrationPath,'utf8');
const edge=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8');

assert.match(sql,/status\s*=\s*ANY[\s\S]*accepted/i,'outbox status constraint must allow accepted');
assert.match(sql,/ops2_finish_whatsapp_outbox_v1/i,'finish RPC must be updated');
assert.match(sql,/accepted/i,'finish RPC must support accepted without marking sent_at');
assert.match(sql,/whatsapp_messages_v1/i,'message.sent canonical table must drive reconciliation');
assert.match(sql,/provider_message_id[\s\S]*wamid\./i,'reconciliation must require a real wamid');
assert.match(sql,/recipient_kind\s*=\s*'customer'/i,'reconciliation must be restricted to checkout customer confirmations');
assert.match(sql,/external_message_id/i,'reconciliation must persist the wamid on the order outbox');
assert.match(sql,/right\([^\n]*order_number[^\n]*8\)/i,'historical short order numbers must be backfilled when safely correlated');
assert.match(sql,/status\s*=\s*'accepted'/i,'legacy sent-without-wamid rows must become accepted when not confirmed');

assert.match(edge,/"accepted"/,'edge finish type must support accepted');
assert.match(edge,/provider_acceptance/i,'PapoAI 202 acknowledgement must be audited separately from wamid');
assert.match(edge,/externalId[\s\S]*accepted/i,'HTTP success without wamid must not be marked sent');
assert.match(edge,/externalId[\s\S]*"sent"/i,'HTTP success with wamid may be marked sent');
assert.match(edge,/food_card\s*:\s*"Cartão alimentação\/refeição"/i,'food_card must be translated for the customer');

console.log('checkout WhatsApp real delivery-state contract OK');
