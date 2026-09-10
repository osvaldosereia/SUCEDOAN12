import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const guard = read('supabase/migrations/20260910124500_whatsapp_flow_v31_targeted_homologation_guard_v5.sql');
const runtime = read('supabase/migrations/20260910125000_whatsapp_flow_v31_runtime_v18_v22_backfill.sql');
const allowlist = read('supabase/migrations/20260910142700_whatsapp_flow_v31_owner_allowlist_purpose_unification_v1.sql');
const dispatch = read('supabase/migrations/20260910143500_whatsapp_flow_v31_owner_dispatch_contract_v2.sql');
const preflight3 = read('supabase/migrations/20260910144200_whatsapp_flow_v31_owner_preflight_v3_dispatch_v6.sql');
const terminal = read('supabase/migrations/20260910153000_whatsapp_flow_v31_terminal_nfm_bridge_v1.sql');
const edge = read('supabase/functions/whatsapp-flow-data-exchange-v1/index.ts');
const cards = read('supabase/functions/whatsapp-flow-data-exchange-v1/card-images.ts');
const crypto = read('supabase/functions/whatsapp-flow-data-exchange-v1/crypto.ts');
const ingest = read('supabase/functions/whatsapp-ingest-make-v1/index.ts');

// Global rollout must stay fail-closed while V31 is a DRAFT candidate.
assert.match(guard, /whatsapp_live_canary_percent,0\) <> 1/);
assert.match(guard, /experience_orchestrator_enabled,false\)/);
assert.match(guard, /whatsapp_flow_data_exchange_enabled,false\)/);
assert.match(guard, /whatsapp_flow_send_enabled,false\)/);
assert.match(guard, /whatsapp_flow_commercial_write_enabled,false\)/);
assert.match(guard, /bling_order_sync_enabled,false\)/);
assert.match(guard, /meta_status',''\) <> 'DRAFT'/);
assert.match(guard, /candidate_not_live/);
assert.match(guard, /customer_exposure/);
assert.match(guard, /default_for_new_sessions/);
assert.match(guard, /production_enabled/);

// Lease may renew only an already pre-authorized exact target; it must never insert a new number.
assert.match(guard, /where w\.phone_e164=v_phone[\s\S]*w\.purpose='controlled_live_homologation'/);
assert.doesNotMatch(guard, /insert\s+into\s+public\.whatsapp_test_allowlist/i);
assert.match(guard, /owner_number_not_pre_authorized/);
assert.match(guard, /owner_allowlist_target/);
assert.match(guard, /w\.phone_e164=v_target_phone/);
assert.match(guard, /target_conversation_consistent/);

// The token issuer and preflight/lease share one owner-only allowlist purpose.
assert.match(allowlist, /flow_v31_owner_homologation/);
assert.match(allowlist, /controlled_live_homologation/);
assert.match(allowlist, /issue_whatsapp_flow_owner_homologation_token_v1/);
assert.doesNotMatch(allowlist, /insert\s+into\s+public\.whatsapp_test_allowlist/i);

// Dedicated owner dispatch carries its session marker all the way to Make and never bypasses human control.
assert.match(dispatch, /w\.purpose='controlled_live_homologation'/);
assert.doesNotMatch(dispatch, /flow_v31_owner_homologation/);
assert.match(dispatch, /c\.mode<>'ai'/);
assert.match(dispatch, /human_handoffs[\s\S]*status in \('open','claimed'\)/);
assert.match(dispatch, /homologation_human_handoff_active/);
assert.match(dispatch, /'homologation_session_id',v_session_id::text/);
assert.match(dispatch, /'interactive',j\.payload->'interactive'/);
assert.match(dispatch, /net\.http_post/);

// V3 preflight catches unavailable/human-owned conversations before dispatch and V6 uses it before V5.
assert.match(preflight3, /get_whatsapp_flow_v31_homologation_preflight_v3/);
assert.match(preflight3, /owner_conversation_ai/);
assert.match(preflight3, /owner_service_window_open/);
assert.match(preflight3, /owner_handoff_clear/);
assert.match(preflight3, /human_handoffs[\s\S]*status in \('open','claimed'\)/);
assert.match(preflight3, /queue_and_dispatch_whatsapp_flow_owner_homologation_v6/);
assert.match(preflight3, /owner_conversation_preflight_failed/);
assert.match(preflight3, /queue_and_dispatch_whatsapp_flow_owner_homologation_v5/);

// Homologation helpers remain server-only.
for (const [source, fn] of [
  [guard, 'renew_whatsapp_flow_owner_homologation_lease_v1'],
  [guard, 'get_whatsapp_flow_v31_homologation_preflight_v2'],
  [guard, 'queue_and_dispatch_whatsapp_flow_owner_homologation_v5'],
  [guard, 'get_whatsapp_flow_v31_journey_audit_v3'],
  [dispatch, 'dispatch_whatsapp_flow_owner_homologation_job_v1'],
  [preflight3, 'get_whatsapp_flow_v31_homologation_preflight_v3'],
  [preflight3, 'queue_and_dispatch_whatsapp_flow_owner_homologation_v6'],
]) {
  assert.match(source, new RegExp(`revoke all on function public\\.${fn}`));
}

// V18: never load full catalog through a Flow response; terms/products are capped, upsell is optional and small.
assert.match(runtime, /handle_whatsapp_flow_commercial_exchange_v18/);
assert.match(runtime, /TERMOS_\[ABC\][\s\S]*limit 20/);
assert.match(runtime, /PRODUTOS_\[ABC\][\s\S]*limit 20/);
assert.match(runtime, /v_screen='UPSELL'[\s\S]*limit 6/);
assert.match(runtime, /Você pode continuar sem adicionar nada/);

// V20-V22: product truth comes from Supabase and quantity is constrained by stock and accumulated selection.
assert.match(runtime, /pr\.is_active=true/);
assert.match(runtime, /is_whatsapp_active,false\)=true/);
assert.match(runtime, /coalesce\(pr\.price,0\)>0/);
assert.match(runtime, /coalesce\(pr\.stock,0\)>0/);
assert.match(runtime, /v_limit:=least\(6,greatest\(0,v_stock\)\)/);
assert.match(runtime, /v_existing_qty\+v_qty>v_limit/);
assert.match(runtime, /quantity_exceeds_available_stock/);
assert.match(runtime, /flow_pending_addons/);
assert.match(runtime, /v_remaining := greatest\(0,v_limit-coalesce\(v_existing,0\)\)/);
assert.match(runtime, /generate_series\(1,v_remaining\)/);
assert.match(runtime, /limit 20/);

// Review/final totals remain deterministic backend output.
assert.match(runtime, /format_whatsapp_flow_session_preview_v1/);
assert.match(runtime, /v_screen in \('REVISAO','FINALIZAR'\)/);

// Terminal nfm_reply bridge: V31 is explicitly supported, completed sessions are valid,
// only a confirmed order triggers the location request, and duplicate replies are idempotent.
assert.match(terminal, /process_whatsapp_flow_nfm_reply_legacy_v1/);
assert.match(terminal, /flow-cestas-comercial-v8-stable/);
assert.match(terminal, /s\.status not in \('offered','open','completed'\)/);
assert.match(terminal, /status='confirmed'/);
assert.match(terminal, /confirmed_at is not null/);
assert.match(terminal, /coalesce\(total,0\)>0/);
assert.match(terminal, /event_type='flow_nfm_reply'/);
assert.match(terminal, /v_duplicate/);
assert.match(terminal, /location_required/);
assert.match(terminal, /envie sua localização/i);
assert.match(terminal, /get_whatsapp_flow_v31_terminal_readiness_v1/);
assert.match(terminal, /wrapper_delegates_commercial/);
assert.match(terminal, /global_flow_gates_off/);
assert.match(terminal, /revoke all on function public\.process_whatsapp_flow_nfm_reply_legacy_v1/);
assert.match(terminal, /revoke all on function public\.get_whatsapp_flow_v31_terminal_readiness_v1/);

// Make inbound payload must carry nfm_reply JSON to the deterministic processor.
assert.match(ingest, /interactive_type==="nfm_reply"/);
assert.match(ingest, /interactiveResponseJson/);
assert.match(ingest, /process_whatsapp_flow_nfm_reply_v1/);

// Edge: V31 always remains owner-only and routes to the current deterministic handler.
assert.match(edge, /resolvedDefinitionSlug==="flow-cestas-comercial-v8-stable"/);
assert.match(edge, /flow_candidate_homologation_only/);
assert.match(edge, /if\(!await ownerHomologationAllowed\(sb,resolved\)\)/);
assert.match(edge, /definitionSlug==="flow-cestas-comercial-v8-stable"[\s\S]*handle_whatsapp_flow_commercial_exchange_v22/);
assert.match(edge, /!readiness\?\.data_exchange_enabled/);
assert.match(edge, /claim_whatsapp_flow_request_v1/);

// Product-list images stay stripped for the stable candidate; one detail image is still allowed.
assert.match(cards, /stableV31=definitionSlug==="flow-cestas-comercial-v8-stable"/);
assert.match(cards, /stripNavigationProductImages/);
assert.match(cards, /items\.slice\(0,20\)/);
assert.match(cards, /delete start\.src/);
assert.match(cards, /delete start\.image/);
assert.match(cards, /PRODUTO_\[A-L\]/);
assert.match(cards, /products\/\$\{productId\}\.jpg/);

// Crypto implementation remains the stricter production-safe variant.
assert.match(crypto, /iv\.length<12\|\|iv\.length>16/);
assert.match(crypto, /aesKeyBytes\.length!==16/);
assert.match(crypto, /invalid_flow_json/);
assert.match(crypto, /invalid_flow_body/);
assert.match(crypto, /flow_key_decrypt_failed/);

// Every V18-V22 RPC remains explicitly server-only in the reproducible migration.
for (let version = 18; version <= 22; version++) {
  assert.match(runtime, new RegExp(`revoke all on function public\\.handle_whatsapp_flow_commercial_exchange_v${version}`));
  assert.match(runtime, new RegExp(`grant execute on function public\\.handle_whatsapp_flow_commercial_exchange_v${version}\\([^;]+\\) to service_role`));
}

console.log('WhatsApp Flow V31 runtime + owner-only homologation + terminal nfm_reply contract: ok');
