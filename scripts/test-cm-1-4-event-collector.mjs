import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918182000_cm_1_4_event_collector_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/papo-comprar-webhook-v1/index.ts','utf8');
const customer=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');

assert.match(migration,/record_customer_event_v1/,'Event Collector canônico precisa existir');
assert.match(migration,/customer_behavior_events_source_key_uidx/,'Event Collector precisa de idempotência source + event_key');
assert.match(migration,/on conflict\(source,event_key\)/i,'Event Collector precisa fazer upsert idempotente');
assert.match(migration,/customer_timeline_v1[\s\S]*customer_behavior_events/s,'Timeline precisa incorporar behavior events');
assert.match(migration,/customer_timeline_v1[\s\S]*catalog_events/s,'Timeline precisa incorporar catálogo');
assert.match(migration,/customer_timeline_v1[\s\S]*shopping_chat_trigger_events/s,'Timeline precisa incorporar gatilhos do Comprar');
assert.match(migration,/security_invoker=true/,'Timeline deve continuar security invoker');
assert.match(migration,/revoke all on function public\.record_customer_event_v1[\s\S]*from public,anon,authenticated/,'Collector não pode ficar exposto ao browser');
assert.match(edge,/normalized_channel_events/,'PapoAI precisa continuar alimentando event core de mensagens');
assert.match(customer,/customer_timeline_v1/,'Customer 360 precisa consumir a timeline consolidada');

console.log('cm-1.4 event collector contract ok');
