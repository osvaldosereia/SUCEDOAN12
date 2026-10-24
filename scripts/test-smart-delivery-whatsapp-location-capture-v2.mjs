import fs from 'node:fs';

const core=fs.readFileSync('supabase/functions/_shared/whatsapp-core-v1.mjs','utf8');
const sql=fs.readFileSync('supabase/migrations/20261007201515_smart_delivery_whatsapp_location_capture_v2.sql','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};

must(core.includes("location:type==='location'&&message?.location"),'Meta location canonical metadata missing');
must(core.includes('latitude:Number(message.location.latitude)'),'Meta latitude missing');
must(core.includes('longitude:Number(message.location.longitude)'),'Meta longitude missing');

must(sql.includes('capture_whatsapp_location_evidence_v1'),'capture function missing');
must(sql.includes("confidence = 'confirmed'"),'confirmed evidence immutability guard missing');
must(sql.includes('on conflict (whatsapp_message_id)'),'idempotency by WhatsApp message missing');
must(sql.includes('revoke all on function public.capture_whatsapp_location_evidence_v1() from public, anon, authenticated'),'RPC privilege hardening missing');
must(sql.includes('create trigger whatsapp_location_evidence_v1'),'location trigger missing');

console.log('smart delivery WhatsApp location capture v2: ok');
