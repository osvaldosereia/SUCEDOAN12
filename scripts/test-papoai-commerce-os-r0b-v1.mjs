import fs from 'node:fs';
import assert from 'node:assert/strict';

const core=fs.readFileSync('supabase/migrations/20260921223000_papoai_commerce_brain_core_v1.sql','utf8');
const fixed=fs.readFileSync('supabase/migrations/20260921224500_papoai_commerce_fixed_adjustment_v2.sql','utf8');
const pricing=fs.readFileSync('supabase/migrations/20260921225500_papoai_commerce_mutation_pricing_v3.sql','utf8');
const idem=fs.readFileSync('supabase/migrations/20260921230500_papoai_commerce_turn_idempotency_v1.sql','utf8');
const runtime=fs.readFileSync('supabase/functions/_shared/papoai-commerce-runtime-v1.mjs','utf8');
const brain=fs.readFileSync('supabase/functions/_shared/papoai-commerce-brain-v1.mjs','utf8');
const edge=fs.readFileSync('supabase/functions/papo-external-agent-v1/index.ts','utf8');

assert.match(core,/enabled boolean not null default false/);
assert.match(core,/write_enabled boolean not null default false/);
assert.match(core,/ai_enabled boolean not null default false/);
assert.match(core,/component_prices_visible boolean not null default false check\(component_prices_visible=false\)/);
assert.match(core,/papoai_commerce_write_disabled/g);
assert.match(core,/hidden_adjustment_included',false/);
assert.match(core,/component_prices_included',false/);

assert.match(fixed,/hidden_adjustment numeric\(14,2\)/);
assert.match(fixed,/basket_hidden_adjustment numeric\(14,2\)/);
assert.match(fixed,/calculate_basket_hidden_adjustment_v1/);
assert.match(fixed,/recalculate_papoai_commerce_cart_v1/);
assert.match(fixed,/v_residual:=v_net_adjustment-v_hidden/);
assert.match(fixed,/v_other:=greatest\(v_hidden,0\)\+greatest\(v_residual,0\)/);
assert.match(fixed,/v_discount:=greatest\(-v_hidden,0\)\+greatest\(-v_residual,0\)/);

assert.match(pricing,/offer_price/);
assert.match(pricing,/commercial_unit_price/);
assert.match(pricing,/recalculate_papoai_commerce_cart_v1/g);
assert.match(pricing,/replacement_product_unavailable/);
assert.match(pricing,/quantity_exceeds_stock/);
assert.match(pricing,/product_already_in_basket/);

assert.match(idem,/provider_event_key/);
assert.match(idem,/papoai_commerce_turns_provider_event_uidx/);
assert.match(idem,/response_body jsonb/);

assert.match(edge,/runPapoAiCommerceTurn/);
assert.match(edge,/papoai-commerce-runtime-v1\.mjs/);
assert.match(edge,/internal_company_number/);
assert.match(edge,/handoff:false/);
assert.match(edge,/normalized\.providerSentAt/);

assert.match(runtime,/channelPhoneE164/);
assert.match(runtime,/\.eq\('phone_e164',normalized\.channelPhoneE164\)/);
assert.match(runtime,/max_history_messages/);
assert.match(runtime,/\.slice\(-maxHistory\)/);
assert.match(runtime,/get_papoai_commerce_customer_context_v1/);
assert.match(runtime,/get_papoai_commerce_basket_detail_v1/);
assert.match(runtime,/set_papoai_commerce_addon_quantity_v1/);
assert.match(runtime,/replace_papoai_commerce_basket_item_v1/);
assert.match(runtime,/media_url/);
assert.match(runtime,/papoai_commerce_turns/);
assert.doesNotMatch(runtime,/cpf_cnpj|customer\.cpf|document_number/);

assert.match(brain,/for\(const item of items\)/);
assert.match(brain,/formatBasketDetail/);
assert.doesNotMatch(brain,/hidden_adjustment_visible:true|component_prices_visible:true/);

console.log('PASS: PapoAI Commerce OS R0-B fail-closed contract');
