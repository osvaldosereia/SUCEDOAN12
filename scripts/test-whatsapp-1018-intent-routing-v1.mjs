import assert from 'node:assert/strict';
import {plan1018Intent} from '../supabase/functions/_shared/ana-1018-intent-routing-v1.mjs';
for(const [intent,view] of [['new_order','catalog'],['offers','offers'],['existing_order','order_lookup'],['human','human_queue']]){
 const out=plan1018Intent({channel:'1018',flowVerified:true,intent});
 assert.equal(out.ok,true);assert.equal(out.view,view);assert.equal(out.mutationAllowed,false);assert.equal(out.customerMessageSent,false);
}
assert.equal(plan1018Intent({channel:'0975',flowVerified:true,intent:'human'}).ok,false);
assert.equal(plan1018Intent({channel:'1018',flowVerified:false,intent:'new_order'}).ok,false);
assert.equal(plan1018Intent({channel:'1018',flowVerified:true,intent:'delete_order'}).ok,false);
console.log('PASS 1018 intent routing: signed-only, four paths, 0975 excluded, no writes');
