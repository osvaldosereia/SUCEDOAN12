import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const gateway=read('supabase/functions/admin-products-live-v1/index.ts');
const ui=read('montar/app.js');
const schema=read('supabase/sql/orders-r5-separation-meta-gates-v1.sql');
const r4=read('supabase/sql/orders-r4-meta-button-confirmation-contract-v1.sql');

test('R05 gate stays OFF by default and fails closed on missing readiness RPC',()=>{
  assert.match(gateway,/ORDER_META_CONFIRMATION_GUARD_ENABLED=\(Deno\.env\.get\("ORDER_META_CONFIRMATION_GUARD_ENABLED"\)\|\|""\)\.trim\(\)==="true"/);
  assert.match(gateway,/db\.rpc\("ops2_order_meta_confirmation_status_v1"/);
  assert.match(gateway,/meta_confirmation_readiness_unavailable/);
  assert.match(gateway,/meta_customer_confirmation_required/);
  assert.match(r4,/enforce_new_orders boolean NOT NULL DEFAULT false/i);
});

test('R05 all four critical Admin actions guard BEFORE mutating rows',()=>{
  for(const [fn,mutation] of [
    ['orderSeparationGet','ops2_get_order_separation_v2'],
    ['orderSeparationAssign','ops2_set_order_separator_v2'],
    ['orderSeparationItemSet','ops2_set_order_separation_item_v2'],
    ['orderSeparationComplete','ops2_prepare_order_separation_completion_v2']
  ]){
    const start=gateway.indexOf('async function '+fn+'(');
    const end=gateway.indexOf('\n}',start);
    assert.ok(start>=0&&end>start,fn+' not found');
    const body=gateway.slice(start,end);
    const guard=body.indexOf('await orderMetaSeparationMutationGuard(oid)');
    const effect=body.indexOf(mutation);
    assert.ok(guard>=0&&effect>guard,fn+' must check Meta before any writes or init');
  }
  assert.match(gateway,/order_separation_meta_status/);
});

test('R05 SQL guards INSERT, UPDATE and UPSERT on assignments, picks, completion',()=>{
  assert.match(schema,/BEFORE INSERT OR UPDATE ON public\.order_separation_assignments_v1/i);
  assert.match(schema,/BEFORE INSERT OR UPDATE ON public\.order_separation_items_v1/i);
  assert.match(schema,/BEFORE INSERT OR UPDATE ON public\.order_separation_completions_v1/i);
  assert.match(r4,/BEFORE UPDATE OF status ON public\.orders/i);
  assert.match(schema,/REVOKE ALL ON FUNCTION public\.ops2_order_meta_confirmation_status_v1\(uuid\)\s+FROM PUBLIC,anon,authenticated/i);
  assert.match(schema,/GRANT EXECUTE ON FUNCTION public\.ops2_order_meta_confirmation_status_v1\(uuid\) TO service_role/i);
});

test('R05 Admin queue exposes proof only to authenticated active staff',()=>{
  assert.match(schema,/v_uid uuid:=auth\.uid\(\)/i);
  assert.match(schema,/FROM public\.admin_users a WHERE a\.user_id=v_uid AND a\.is_active=true/i);
  assert.match(schema,/v_base:=public\.manual_pick_queue_feed_v1\(\)/i);
  assert.match(schema,/meta_confirmation_required/i);
  assert.match(schema,/meta_confirmation_verified/i);
  assert.match(schema,/REVOKE ALL ON FUNCTION public\.manual_pick_queue_meta_feed_v1\(\)\s+FROM PUBLIC,anon/i);
  assert.match(schema,/GRANT EXECUTE ON FUNCTION public\.manual_pick_queue_meta_feed_v1\(\)\s+TO authenticated,service_role/i);
});

test('R05 picker never redirects to original vitrine before backend approval',()=>{
  assert.match(ui,/const openOrder = async id =>/);
  assert.match(ui,/await action\('order_separation_meta_status',null,\{id\}\)/);
  const open=ui.slice(ui.indexOf('const openOrder = async id =>'),ui.indexOf('const backToQueue = async'));
  assert.ok(open.indexOf("await action('order_separation_meta_status'")<open.indexOf('window.location.assign('));
  assert.match(open,/approval\.confirmation_required===true/);
  assert.match(ui,/NÃO MONTAR ESSE PEDIDO/);
  assert.match(ui,/const queueFeed = async/);
  assert.match(ui,/manual_pick_queue_meta_feed_v1/);
  assert.match(ui,/meta_confirmation_check_unavailable:true/);
  assert.doesNotMatch(ui,/const legacy = await queueFeed\(\)/);
});

test('R05 picker preserves original 4-digit, legacy and dated labels',()=>{
  const start=ui.indexOf('const originalNumber = value =>');
  const end=ui.indexOf('const progress = counts =>',start);
  assert.ok(start>=0&&end>start);
  const sub=ui.slice(start,end);
  const matcher=sub.match(/return (\/\^\(\?:[\s\S]*?\$\/)\.test\(code\)/);
  assert.ok(matcher,'full format validator missing');
  const rx=Function('"use strict"; return '+matcher[1])();
  for(const label of ['AB123','1234','08|10|2026 - 001','09|10|2026 - 002']){
    assert.equal(rx.test(label),true,label+' rejected');
  }
  for(const invalid of ['123','INVALID','08/10/2026-001']){
    assert.equal(rx.test(invalid),false,invalid+' accepted');
  }
  assert.match(ui,/savedCode=originalNumber\(detail\)/);
  assert.match(ui,/\$\('packageCode'\)\.textContent=savedCode/);
});

test('R05 completion retains fiscal independence and refreshes final queue',()=>{
  const finish=ui.slice(ui.indexOf('const completeOrder = async'),ui.indexOf("$('loginForm').addEventListener("));
  assert.match(finish,/await action\('order_separation_complete'/);
  assert.match(finish,/packageModal/);
  assert.doesNotMatch(finish,/autoIssueFiscalAfterSeparation|SEFAZ|emit_nfe/);
  assert.match(ui,/loadQueue\(\)/);
});
