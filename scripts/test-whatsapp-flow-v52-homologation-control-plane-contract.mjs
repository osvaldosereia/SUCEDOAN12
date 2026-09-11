import fs from 'node:fs';

const path = 'supabase/migrations/20260911231800_whatsapp_flow_v52_homologation_control_plane.sql';
const sql = fs.readFileSync(path, 'utf8');

const required = [
  'get_whatsapp_flow_v52_homologation_control_plane_v1',
  'get_whatsapp_flow_v51_owner_launch_runtime_readiness_v1',
  'get_whatsapp_flow_v49_physical_terminal_evidence_v1',
  "purpose = 'controlled_live_homologation'",
  "d.slug = 'flow-cestas-comercial-v8-stable'",
  "s.status in ('offered','open')",
  'safe_to_launch_owner_v8',
  'eligible_owner_conversations',
  'active_owner_homologation_sessions',
  "'wait_for_owner_service_window'",
  "'owner_conversation_ready_for_v8'",
  "'v52-read-only'",
  'writes_performed',
  'physical_send_performed',
  'revoke all on function public.get_whatsapp_flow_v52_homologation_control_plane_v1() from public, anon, authenticated',
  'grant execute on function public.get_whatsapp_flow_v52_homologation_control_plane_v1() to service_role'
];

for (const token of required) {
  if (!sql.includes(token)) throw new Error(`missing V52 contract token: ${token}`);
}

if (/queue_and_dispatch_whatsapp_flow_owner_homologation_v8\s*\(/.test(sql)) {
  throw new Error('V52 control plane must never dispatch the Flow');
}

if (/insert\s+into\s+public\.(orders|outbound_jobs|messages|experience_sessions)/i.test(sql)) {
  throw new Error('V52 control plane must remain read-only');
}

console.log('ok - WhatsApp Flow V52 homologation control plane contract');
