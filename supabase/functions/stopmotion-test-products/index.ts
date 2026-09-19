import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});
 if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!key)return json({ok:false,error:'server_config'},500);
 let b:any={};try{b=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 if(String(b.action||'')!=='random_products')return json({ok:false,error:'unknown_action'},400);
 const limit=Math.min(60,Math.max(10,Number(b.limit||30)));
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const r=await sb.from('products').select('id,name,image_url').eq('is_active',true).not('image_url','is',null).neq('image_url','').limit(400);
 if(r.error)return json({ok:false,error:'products_load_failed'},500);
 const rows=(r.data||[]).filter((p:any)=>/^https?:\/\//i.test(String(p.image_url||'')));
 for(let i=rows.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]]}
 return json({ok:true,products:rows.slice(0,limit)});
});