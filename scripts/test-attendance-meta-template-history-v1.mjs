import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261008130000_attendance_meta_template_history_v1.sql','utf8');
for(const check of [
  /ops2_render_whatsapp_template_body_v1/,
  /ops2_whatsapp_canonical_template_body_v1/,
  /ops2_whatsapp_capture_template_text_v1/,
  /order_confirmation/,
  /order_separation_notification/,
  /marketing_campaign_worker/,
  /before insert or update of provider_message_id,metadata,message_type,text_body/i,
  /whatsapp_templates_v1/,
  /provider_message_id like 'wamid\.\%'/,
  /new\.text_body/,
  /where m\.direction='outbound'/,
]) assert.match(sql,check);
assert.doesNotMatch(sql,/sendTemplateViaMeta|sendTextViaMeta|http\.post|net\.http_post|delete from public\.whatsapp_messages_v1/i);
assert.match(sql,/grant execute on function public\.ops2_whatsapp_canonical_template_body_v1.*to service_role/i);
console.log('PASS attendance meta template history static checks');
