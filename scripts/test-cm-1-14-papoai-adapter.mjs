import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919030000_cm_1_14_papoai_adapter_core_v1.sql','utf8');
const webhook=fs.readFileSync('supabase/functions/papo-comprar-webhook-v1/index.ts','utf8');
const locationMigration=fs.readFileSync('supabase/migrations/20260924235958_papoai_customer_location_pin_v1.sql','utf8');

for(const token of [
  'channel_provider_adapters',
  'channel_provider_contact_states',
  'channel_provider_event_receipts',
  'ingest_channel_adapter_event_v1',
  'channel_provider_adapter_summary_v1'
]){
  assert.match(migration,new RegExp(token),'missing CM-1.14 structure '+token);
}
assert.match(migration,/'papoai','whatsapp'/);
assert.match(migration,/'temporary_active','active','disabled'/);
assert.match(migration,/'replacement_target','meta_direct'/);
assert.match(migration,/'business_logic_dependency',false/);
assert.match(migration,/tag_read_state text not null default 'unknown'/);
assert.match(migration,/tag_write_state text not null default 'unknown'/);
assert.match(migration,/external_side_effect',false/);
assert.match(migration,/revoke all on table public\.channel_provider_adapters from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.ingest_channel_adapter_event_v1/);
assert.doesNotMatch(migration,/openai|gpt-|gemini/i,'CM-1.14 adapter must not use AI');

const fnStart=migration.indexOf('create or replace function public.ingest_channel_adapter_event_v1');
const fnEnd=migration.indexOf('create or replace function public.channel_provider_adapter_summary_v1');
const genericCore=migration.slice(fnStart,fnEnd);
assert.ok(fnStart>=0&&fnEnd>fnStart);
assert.doesNotMatch(genericCore,/papoai/i,'Canonical ingest must not depend on PapoAI');
assert.match(genericCore,/resolve_customer_identity_v1/);
assert.match(genericCore,/observe_customer_channel_identity_v1/);
assert.match(genericCore,/normalized_channel_events/);
assert.match(genericCore,/channel_provider_event_receipts/);
assert.match(genericCore,/channel_provider_contact_states/);
assert.match(genericCore,/provider_adapter/);

assert.match(webhook,/const PROVIDER_KEY="papoai"/);
assert.match(webhook,/normalizeTags/);
assert.match(webhook,/tags_field_present/);
assert.match(webhook,/ingest_channel_adapter_event_v1/);
assert.match(webhook,/room_start_for_conversation_v1/);
assert.match(webhook,/entry_source:'channel_adapter'/);
assert.match(webhook,/provider_key:PROVIDER_KEY/);
assert.match(webhook,/external_side_effect:false/);
assert.doesNotMatch(webhook,/\.from\('normalized_channel_events'\)\.insert/,'Adapter edge must not write canonical event directly');
assert.doesNotMatch(webhook,/resolve_customer_identity_v1|observe_customer_channel_identity_v1/,'Provider edge must delegate identity work to canonical ingest');
assert.doesNotMatch(webhook,/papo_contact_id|papo_contact_name|papo_phone|papo_customer_found|papo_received_at/,'Downstream session metadata must be provider-neutral');
assert.doesNotMatch(webhook,/OPENAI_API_KEY|openai|gpt-|gemini/i,'Papo adapter must be deterministic');
assert.match(webhook,/tags_write_verified:false/,'Tag write must remain unverified/fail-closed');
assert.match(webhook,/function extractLocation\(body:any\)/,'Papo adapter must normalize location payloads');
assert.match(webhook,/normalizedMessageType=location\?'location'/,'valid coordinates must normalize message type to location');
assert.match(webhook,/coordinate_source:'customer_pin'/,'customer WhatsApp pin provenance must be explicit');
assert.match(webhook,/capture_customer_location_pin_v1/,'customer pin must be persisted through a server-side RPC');
assert.match(webhook,/location_persistence:locationPersistence/,'response must expose local persistence result for observability');
assert.match(webhook,/location_pin:/,'shopping session must preserve the latest pin for downstream checkout');

assert.match(locationMigration,/create or replace function public\.capture_customer_location_pin_v1/);
assert.match(locationMigration,/p_latitude < -90 or p_latitude > 90/);
assert.match(locationMigration,/p_longitude < -180 or p_longitude > 180/);
assert.match(locationMigration,/'coordinate_source','customer_pin'/);
assert.match(locationMigration,/'coordinate_confidence',1\.0/);
assert.match(locationMigration,/catalog_session_id=p_catalog_session_id/);
assert.match(locationMigration,/conversation_id=p_conversation_id/);
assert.match(locationMigration,/revoke all on function public\.capture_customer_location_pin_v1/);
assert.match(locationMigration,/grant execute on function public\.capture_customer_location_pin_v1.*service_role/s);

console.log('cm-1.14 papoai adapter + customer location pin contract ok');
