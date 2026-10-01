import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='supabase/sql/20261001_checkout_whatsapp_observability_v1.sql';
assert.ok(fs.existsSync(path),'WhatsApp confirmation observability migration must exist');
const sql=fs.readFileSync(path,'utf8');
assert.match(sql,/create\s+or\s+replace\s+view\s+public\.ops2_order_whatsapp_confirmation_v1/i,'order confirmation operational view must exist');
for(const field of ['order_id','message_kind','status','delivery_mode','channel_origin','attempt_count','external_message_id','last_error','created_at','sent_at','updated_at']){
  assert.match(sql,new RegExp(`\\b${field}\\b`,'i'),`${field} must be visible operationally`);
}
assert.match(sql,/revoke\s+all\s+on\s+public\.ops2_order_whatsapp_confirmation_v1\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,'operational view must not be public');
assert.match(sql,/grant\s+select\s+on\s+public\.ops2_order_whatsapp_confirmation_v1\s+to\s+service_role/i,'admin service layer must be able to read operational view');
console.log('checkout WhatsApp observability contract: ok');
