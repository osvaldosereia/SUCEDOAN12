import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);

for (const sqlPath of [
  'supabase/sql/20261001_registration_catalog_return_v1.sql',
  'supabase/sql/20261001_registration_catalog_return_rate_limit_v2.sql'
]) assert.ok(exists(sqlPath), `missing migration: ${sqlPath}`);

const sql = read('supabase/sql/20261001_registration_catalog_return_rate_limit_v2.sql');
assert.match(sql, /ops2_issue_papoai_catalog_link_v1/i, 'must issue canonical catalog identity link');
assert.match(sql, /bling_hub_jobs_v2/i, 'must validate registration receipt capability');
assert.match(sql, /channel_phone_e164/i, 'must resolve the WhatsApp channel from the recent conversation');
assert.match(sql, /registration_complete/i, 'must refuse incomplete registrations');
assert.match(sql, /consume_public_rate_limit/i, 'rate limit must live inside the protected RPC');

const edgePath = 'supabase/functions/whatsapp-outbound-v1/index.ts';
assert.ok(exists(edgePath), 'reused whatsapp-outbound-v1 edge slot must exist');
const edge = read(edgePath);
assert.match(edge, /SUPABASE_ANON_KEY/i, 'public return bridge must use anon key only');
assert.doesNotMatch(edge, /SERVICE_ROLE|SUPABASE_SECRET_KEYS/i, 'public return bridge must not carry privileged keys');
assert.match(edge, /ops2_issue_registration_catalog_return_v1/i, 'edge function must call protected registration return RPC');
assert.match(edge, /customer_id/i, 'edge function must require customer id');
assert.match(edge, /registration_job_id/i, 'edge function must require registration job receipt');

const cadastro = read('cadastro/index.html');
assert.match(cadastro, /whatsapp-outbound-v1/i, '/cadastro must request an identified catalog link after registration');
assert.match(cadastro, /Enviar link no WhatsApp/i, '/cadastro must offer the one-tap WhatsApp return');
assert.match(cadastro, /wa\.me/i, '/cadastro must build the WhatsApp return URL');
assert.match(cadastro, /catalog_url/i, '/cadastro must use the identified catalog URL returned by backend');
assert.ok(!cadastro.includes('submit_order'), '/cadastro must still never create an order');

console.log('registration catalog return contract: OK');
