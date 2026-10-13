import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPostorderOffersTemplate,buildPostorderConfirmTemplate} from
  '../supabase/functions/_shared/customer-postorder-followup-templates-v1.mjs';
import {validateTemplateDraft} from '../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs';
import {parsePostorderReply,findPostorderReply} from
  '../supabase/functions/_shared/order-postorder-quickreply-v1.mjs';
const read=p=>fs.readFileSync(p,'utf8');
for(const channel of ['0975','1018']){
  const offer=validateTemplateDraft(buildPostorderOffersTemplate(channel));
  const confirm=validateTemplateDraft(buildPostorderConfirmTemplate(channel));
  assert.equal(offer.category,'MARKETING');
  assert.equal(confirm.category,'UTILITY');
  assert.equal(offer.components[1].buttons[0].url,'https://donaantonia.com.br/ofertas/?c={{1}}');
  assert.deepEqual(confirm.components[1].buttons.map(b=>b.text),['Confirmar pedido','Preciso alterar']);
  assert.equal(confirm.components[0].text.includes('{{2}}'),true);
}
assert.throws(()=>buildPostorderOffersTemplate('0000'));
const oid='123e4567-e89b-42d3-a456-426614174000',nonce='f'.repeat(32);
assert.deepEqual(parsePostorderReply('DA4:C:'+oid+':'+nonce),{action:'confirm',orderId:oid,nonce});
assert.deepEqual(parsePostorderReply('DA4:E:'+oid+':'+nonce),{action:'edit',orderId:oid,nonce});
for(const attempt of ['Confirmar pedido','SIM','DA4:C:'+oid+':short','DA4:C:'+oid+':'+nonce+'extra',
  'DA4:C:00000000-0000-0000-0000-000000000000:'+nonce]){
  assert.equal(parsePostorderReply(attempt),null,'reject free text and malformed Meta payload');
}
const payload={entry:[{changes:[{value:{messages:[{id:'wamid.inbound',
  type:'button',button:{text:'Confirmar pedido',payload:'DA4:C:'+oid+':'+nonce}}]}}]}]};
assert.equal(findPostorderReply(payload,'wamid.inbound').action,'confirm');
assert.equal(findPostorderReply(payload,'wamid.unrelated'),null);
const interactive={entry:[{changes:[{value:{messages:[{id:'wamid.edit',
  type:'interactive',interactive:{type:'button_reply',button_reply:{id:'DA4:E:'+oid+':'+nonce}}}]}}]}]};
assert.equal(findPostorderReply(interactive,'wamid.edit').action,'edit');

const queue=read('supabase/migrations/20261013190000_ops3_auto_queue_on_storefront_confirmation.sql');
const origin=read('supabase/migrations/20261013190100_ops3_customer_confirmation_queue_origin.sql');
const ledger=read('supabase/migrations/20261013190200_ops4_postorder_followup_ledger.sql');
const command=read('supabase/migrations/20261013190300_ops4_postorder_dispatch_command.sql');
const webhook=read('supabase/functions/whatsapp-meta-webhook-v1/index.ts');
const sender=read('supabase/functions/admin-orders-v1/index.ts');
const scheduler=read('supabase/functions/order-postorder-confirm-v1/index.ts');
assert.match(queue,/after update of status on public\.orders/);
assert.match(queue,/new\.status = 'confirmed'/);
assert.match(queue,/selected_by drop not null/,'system queue must not impersonate staff');
assert.match(queue,/selected_source/);
assert.match(queue,/on conflict \(order_id\) do nothing/);
assert.doesNotMatch(queue,/update public\.orders/i,'queue may not rewrite status');
assert.match(origin,/customer_confirmed/);
assert.match(ledger,/ops4_register_postorder_followup_v1/);
assert.match(ledger,/ops4_apply_postorder_quickreply_v1/);
assert.match(ledger,/f\.confirm_nonce_hash is distinct from p_nonce_hash/);
assert.match(ledger,/f\.whatsapp_account_id is distinct from p_account_id/);
assert.match(ledger,/f\.phone_e164 is distinct from p_phone_e164/);
assert.match(ledger,/ops3_confirm_customer_order_v1/);
assert.match(ledger,/f\.confirm_total,f\.confirm_order_updated_at/);
assert.match(ledger,/confirm_due_at<=now/);
assert.match(ledger,/t\.status='APPROVED'/);
assert.match(command,/net\.http_post/);
assert.match(command,/ops4_claim_postorder_dispatch_command_v1/);
assert.doesNotMatch(command,/cron\.schedule/,'scheduler must only be enabled after deployment');
assert.match(sender,/sendPostorderOffersOnce/);
assert.ok(sender.indexOf('await sendPostorderOffersOnce(')>sender.indexOf('ops2_accept_order_whatsapp_meta_v1'),
  'offer only after Meta accepted canonical order');
assert.match(sender,/p_order_id:orderId,p_status:"skipped"/);
assert.match(scheduler,/pedidoconfirmacao/);
assert.match(scheduler,/confirm_status/);
assert.match(scheduler,/ops4_complete_postorder_confirm_send_v1/);
assert.match(scheduler,/DA4:C:/);
assert.match(scheduler,/DA4:E:/);
assert.match(webhook,/findPostorderReply/);
assert.match(webhook,/ops4_apply_postorder_quickreply_v1/);
assert.match(webhook,/postorder\?\.recognized/);
assert.doesNotMatch(webhook,/text_body\s*===\s*['"]SIM/i,'plain messages must not confirm orders');
console.log('PASS: 3-step WhatsApp templates, order queue, exact version confirmation and signed quick replies');
