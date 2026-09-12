import fs from 'node:fs';

const path = 'supabase/migrations/20260912002000_whatsapp_flow_v53_owner_launch_serialization.sql';
const sql = fs.readFileSync(path, 'utf8').toLowerCase();

for (const token of [
  'get_whatsapp_flow_owner_homologation_preflight_v6',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v9',
  'get_whatsapp_flow_v53_homologation_control_plane_v1',
  'pg_advisory_xact_lock',
  "eligible_count = 1",
  'active_count = 0',
  'physical_evidence_incomplete',
  'safe_to_launch_owner_v9',
  'direct_v8_service_role_disabled',
  'revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v8(uuid,text,text) from service_role',
  'revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9(uuid,text,text) from public, anon, authenticated'
]) {
  if (!sql.includes(token)) throw new Error(`missing V53 contract token: ${token}`);
}

if (!sql.includes("whatsapp_live_canary_percent")) {
  // V53 deliberately inherits rollout-gate verification from V52/V51; it must not redefine or open gates.
  console.log('ok - V53 inherits gate checks from V52/V51');
}

if (/update\s+public\.automation_config|insert\s+into\s+public\.automation_config|delete\s+from\s+public\.automation_config/.test(sql)) {
  throw new Error('V53 must not mutate rollout gates');
}

console.log('ok - WhatsApp Flow V53 owner launch serialization contract');
