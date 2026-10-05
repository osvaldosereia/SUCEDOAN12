import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const file='supabase/functions/admin-service-intelligence-v1/index.ts';
let src=fs.readFileSync(file,'utf8');
const old=`    const checked=await sb.from("ops_order_check_sessions").select("id,verified_at").eq("order_id",sourceOrderId).eq("status","verified").not("verified_at","is",null).order("verified_at",{ascending:false}).limit(1).maybeSingle();\n    if(checked.error)throw checked.error;\n    if(!checked.data?.id)return {ok:false,error:"order_check_required_before_bling_verified",status:409,external_write:false};`;
const replacement=`    const checked=await sb.from("ops_order_check_sessions").select("id,verified_at").eq("order_id",sourceOrderId).eq("status","verified").not("verified_at","is",null).order("verified_at",{ascending:false}).limit(1).maybeSingle();\n    if(checked.error)throw checked.error;\n    let separationVerified=false;\n    if(!checked.data?.id){\n      const [completion,items,pending]=await Promise.all([\n        sb.from("order_separation_completions_v1").select("metadata").eq("order_id",sourceOrderId).maybeSingle(),\n        sb.from("order_separation_items_v1").select("id",{count:"exact",head:true}).eq("order_id",sourceOrderId),\n        sb.from("order_separation_items_v1").select("id",{count:"exact",head:true}).eq("order_id",sourceOrderId).eq("state","pending")\n      ]);\n      if(completion.error)throw completion.error;\n      if(items.error)throw items.error;\n      if(pending.error)throw pending.error;\n      separationVerified=completion.data?.metadata?.stock_applied===true&&Number(items.count||0)>0&&Number(pending.count||0)===0;\n    }\n    if(!checked.data?.id&&!separationVerified)return {ok:false,error:"order_check_required_before_bling_verified",status:409,external_write:false};`;
const matches=src.split(old).length-1;
if(matches<1)throw new Error('verified gate anchor not found');
src=src.split(old).join(replacement);
fs.writeFileSync(file,src);
execFileSync(process.execPath,['scripts/test-order-separation-verified-gate-v4.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-admin-orders-fiscal-flow-v4.mjs'],{stdio:'inherit'});
console.log(`patched ${matches} verified gate(s)`);
