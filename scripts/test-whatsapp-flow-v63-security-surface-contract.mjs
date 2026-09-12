import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260912091900_whatsapp_flow_v63_security_surface_scope_fix.sql', 'utf8').toLowerCase();

const required = [
  'security invoker',
  "p.proname ilike '%whatsapp%'",
  "p.proname ilike '%basket%'",
  "p.proname ilike '%nfm%'",
  "p.proname ilike '%outbound%'",
  'security_definer_client_exposure_count',
  'get_whatsapp_flow_v57_homologation_control_plane_v1',
  'get_whatsapp_flow_v60_terminal_commercial_readiness_v1',
  'revoke all on function public.get_whatsapp_flow_v62_security_surface_readiness_v1() from anon',
  'revoke all on function public.get_whatsapp_flow_v62_security_surface_readiness_v1() from authenticated',
  'grant execute on function public.get_whatsapp_flow_v62_security_surface_readiness_v1() to service_role'
];

for (const token of required) {
  if (!sql.includes(token)) throw new Error(`V63 contract missing: ${token}`);
}

if (sql.includes("p.proname ilike '%flow%'")) {
  throw new Error('V63 must not use generic %flow% matching because it captures unrelated agent_workflow functions');
}

console.log('V63 security surface contract OK');
