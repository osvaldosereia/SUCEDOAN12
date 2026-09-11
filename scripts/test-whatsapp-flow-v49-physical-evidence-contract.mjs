import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260911203000_whatsapp_flow_v49_physical_terminal_evidence_v1.sql', 'utf8');

const required = [
  'get_whatsapp_flow_v48_physical_homologation_preflight_v1',
  "slug='flow-cestas-comercial-v8-stable'",
  "requested_by_owner",
  "homologation_test",
  "status='accepted'",
  "'UPSELL'",
  "'REVISAO'",
  "'CLIENTE_EXISTENTE'",
  "'CLIENTE_NOVO'",
  "'FINALIZAR'",
  "event_type='flow_nfm_reply'",
  "message_type,''))='location'",
  "m.created_at>=v_nfm_at",
  "whatsapp_live_canary_percent",
  "revoke all on function public.get_whatsapp_flow_v49_physical_terminal_evidence_v1() from public, anon, authenticated",
  "grant execute on function public.get_whatsapp_flow_v49_physical_terminal_evidence_v1() to service_role"
];

for (const marker of required) {
  if (!sql.includes(marker)) throw new Error(`missing V49 contract marker: ${marker}`);
}

if (/insert\s+into|update\s+public\.|delete\s+from/i.test(sql)) {
  throw new Error('V49 evidence monitor must stay read-only');
}

console.log('ok - WhatsApp Flow V49 physical evidence contract');
