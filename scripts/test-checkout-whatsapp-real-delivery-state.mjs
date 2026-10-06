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
assert.match(sql,/q\.status\s+in\s*\(\s*'sending'\s*,\s*'accepted'\s*,\s*'sent'\s*\)/i,'message.sent reconciliation must also win if it arrives while provider acknowledgement is still being finalized');
assert.match(sql,/v_status\s*=\s*'accepted'[\s\S]*v_item\.status\s*=\s*'sent'/i,'accepted finish must be idempotent when a real wamid already won the race');

assert.match(edge,/"accepted"/,'edge finish type must support accepted');
assert.match(edge,/provider_request[\s\S]*meta_request/i,'direct Meta template request must be audited before sending');
assert.match(edge,/ops2_accept_order_whatsapp_meta_v1/i,'Meta WAMID must be accepted into the canonical order transport');
assert.match(edge,/externalId[\s\S]*accepted/i,'HTTP success without wamid must not be marked sent');
assert.match(edge,/externalId[\s\S]*"sent"/i,'HTTP success with wamid may be marked sent');
assert.match(edge,/food_card\s*:\s*"Cartão alimentação\/refeição"/i,'food_card must be translated for the customer');

console.log('checkout WhatsApp real delivery-state contract OK');
