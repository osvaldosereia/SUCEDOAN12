import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve('supabase/migrations/20260912102035_whatsapp_flow_v64_no_order_contamination_guard.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

const required = [
  'get_whatsapp_flow_v64_no_order_contamination_guard_v1',
  "'order_contamination_detected'",
  "'orders_created_in_homologation_window'",
  "'confirmed_order_nfm_events_after_finalize'",
  "'order_bound_outbound_jobs_in_homologation_window'",
  'get_whatsapp_flow_owner_homologation_preflight_v8',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v11',
  'get_whatsapp_flow_v64_homologation_control_plane_v1',
  'revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v10(uuid,text,text) from service_role',
  "'safe_to_launch_owner_v11'",
  "'writes_performed', false",
  'security invoker',
  "'v64-no-order-contamination-guard'"
];

for (const token of required) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`Missing V64 contract token: ${token}`);
  }
}

console.log(`PASS ${required.length} V64 contract checks`);
