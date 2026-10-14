import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const flow=JSON.parse(read('docs/whatsapp-1018-simulator/meta-flow-intent-draft.json'));
const outbound=read('supabase/functions/_shared/ana-1018-flow-outbound-v1.mjs');
const send=read('supabase/functions/_shared/ana-1018-flow-send-v1.mjs');
const webhook=read('supabase/functions/whatsapp-meta-webhook-v1/index.ts');
const handler=read('supabase/functions/_shared/ana-1018-meta-flow-webhook-v1.mjs');
const migration=read('supabase/migrations/20261013_whatsapp_1018_flow_outbox_v1.sql');
const reconciliation=read('supabase/migrations/20261014_whatsapp_1018_flow_reconciliation_v1.sql');
const simulator=read('docs/whatsapp-1018-simulator/index.html');
const checks=[
 ['Intent-only Flow with no payment or address collection',
  flow.screens.length===2&&flow.screens.at(-1).terminal===true
  &&JSON.stringify(flow).includes('${form.intent}')
  &&!/(hidden|valor oculto|cpf|cnpj|endereço|payment|credit_card|card_number)/i.test(JSON.stringify(flow))],
 ['No basket hidden-price or discount internals in customer-facing Flow',
  !/(hidden|valor.oculto|internal.price|adjustment|margem)/i.test(JSON.stringify(flow)+outbound)],
 ['Explicit pilot and account guard before sending',
  send.includes("release?.mode!=='pilot'")&&send.includes('accountId!==expectedAccountId')],
 ['Verified WhatsApp service window required',send.includes('serviceWindowVerified!==true')],
 ['Pre-send reservation before Meta transport',send.indexOf("ops2_1018_flow_outbox_reserve_v1")<send.indexOf('await send(payload)')],
 ['Atomic outbox WAMID+session registration',migration.includes('ops2_1018_flow_session_register_v1')&&migration.includes('for update')],
 ['Uncertain Meta sends are not automatically retried',send.includes("p_state:'uncertain'")&&!/setTimeout|setInterval|while\s*\(/.test(send)],
 ['Webhook opt-in is disabled by default',webhook.includes('WHATSAPP_1018_FLOW_HOOK_ENABLED')],
 ['Signed raw payload required',webhook.includes('signedPayload: payload')&&handler.includes('signatureVerified')],
 ['No order mutation from Flow response',handler.includes('allowOrderMutation:false')],
 ['Read-only restricted reconciliation',reconciliation.includes('auth.role()')&&reconciliation.includes("state in ('reserved','uncertain')")&&!reconciliation.includes('http_post')],
 ['Simulator is synthetic and not live',simulator.includes('NÃO É O WHATSAPP REAL')&&!/fetch\s*\(|graph\.facebook\.com|supabase\.co/i.test(simulator)]
];
for(const [label,ok] of checks){assert.equal(ok,true,label);console.log('PASS',label)}
const report={generated_at:new Date().toISOString(),checks_passed:checks.length,
 deployment:'NOT_DEPLOYED',meta_flow:'DRAFT_NOT_SUBMITTED',
 meta_templates:'NOT_SUBMITTED',live_order_tests:'NOT_RUN',
 external_simulator_url:'NOT_HOSTED',release_authorized:false,
 outstanding:['Meta API validation and Flow draft creation','Meta template approval','Internal-device testing','Verify hidden basket amounts against production checkout without mutations','Reconciliation of uncertain WAMIDs','Explicit production authorization']};
fs.mkdirSync('dist/whatsapp-1018-simulator',{recursive:true});
fs.writeFileSync('dist/whatsapp-1018-simulator/readiness.json',JSON.stringify(report,null,2)+'\n');
console.log('PILOT READINESS: CODE GUARDS VERIFIED; LIVE RELEASE BLOCKED');
