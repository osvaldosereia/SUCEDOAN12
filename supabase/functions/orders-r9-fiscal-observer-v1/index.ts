import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {runFiscalR9ObserverPass} from "../_shared/order-fiscal-r9-observer-v1.mjs";

// R09 is OFF until deploy and explicit rollout. No automatic schedule here.
// The only Bling operation is a GET-only internal probe; OAuth refreshing may
// write token credentials, but no sale or NF-e is created/changed.
function secureEquals(a:string,b:string){
  const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);
  if(aa.length!==bb.length||!aa.length)return false;
  let diff=0;
  for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
  return diff===0;
}
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
Deno.serve(async (req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(Deno.env.get("R9_FISCAL_OBSERVER_ENABLED")!=="true")
    return json({ok:false,error:"r9_observer_disabled",invoice_created:false},503);
  const secret=Deno.env.get("R9_FISCAL_OBSERVER_RUN_KEY")||"";
  if(secret.length<32||!secureEquals(req.headers.get("x-r9-observer-key")||"",secret))
    return json({ok:false,error:"unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!key)return json({ok:false,error:"service_unconfigured"},503);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const seeded=await sb.rpc("ops2_seed_fiscal_r9_observations_v1",{p_limit:5});
    if(seeded.error||seeded.data?.ok!==true)
      throw Error("r9_seed_failed");
    const hubKey=await sb.rpc("get_bling_hub_key_v2");
    if(hubKey.error||!hubKey.data)throw Error("r9_hub_auth_unavailable");
    const result=await runFiscalR9ObserverPass({
      limit:3,
      claim:async(limit:number)=>{
        const c=await sb.rpc("ops2_claim_fiscal_r9_observation_v1",{p_limit:limit});
        if(c.error||c.data?.ok!==true)throw Error("r9_claim_failed");
        return c.data;
      },
      probe:async(row:any)=>{
        const remote=await fetch(url+"/functions/v1/admin-service-intelligence-v1",{
          method:"POST",
          headers:{
            "content-type":"application/json","apikey":key,
            authorization:"Bearer "+key,
            "x-dona-antonia-bling-hub-key":String(hubKey.data)
          },
          body:JSON.stringify({action:"vitrine_bling_hub_internal",
            subaction:"fiscal_r9_observe_readonly",source_order_id:row.order_id}),
          signal:AbortSignal.timeout(30000)
        });
        const body=await remote.json().catch(()=>null);
        if(!remote.ok||body?.ok!==true)return {
          verdict:"uncertain",error:"r9_remote_read_unavailable"
        };
        if(!["no_invoice","one_invoice","uncertain","conflict"].includes(body?.verdict))
          return {verdict:"uncertain",error:"r9_remote_verdict_invalid"};
        return {verdict:body.verdict,evidence:body.evidence||{},
          error:body.error||null};
      },
      finish:async(row:any,observation:any)=>{
        const result=await sb.rpc("ops2_finish_fiscal_r9_observation_v1",{
          p_order_id:row.order_id,p_claim_token:row.claim_token,
          p_verdict:observation.verdict,p_evidence:observation.evidence||{},
          p_error:observation.error||null
        });
        if(result.error)throw Error("r9_finish_failed");
        return result.data;
      }
    });
    return json({...result,seeded:Number(seeded.data.seeded||0)});
  }catch(e){
    console.error("r9_observer_internal_error",String((e as Error)?.message||"unknown").slice(0,120));
    return json({ok:false,error:"r9_observer_unavailable",invoice_created:false},503);
  }
});
