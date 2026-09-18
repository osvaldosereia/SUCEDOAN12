import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const API_BASE='https://api.bling.com.br/Api/v3';
const OAUTH_URLS=['https://api.bling.com.br/oauth/token','https://api.bling.com.br/Api/v3/oauth/token'];
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=(value:unknown,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
const basic=(id:string,secret:string)=>btoa(`${id}:${secret}`);

function normalizePhone(value:unknown){
  let d=digits(value);
  if(d.startsWith('00'))d=d.slice(2);
  if(d.startsWith('0')&&(d.length===11||d.length===12))d=d.slice(1);
  if(d.length===10||d.length===11)d='55'+d;
  if(!d.startsWith('55')||(d.length!==12&&d.length!==13))return '';
  return '+'+d;
}

function genericName(name:string){
  const n=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  return !n||n==='consumidor final'||n==='consumidor'||n==='cliente'||n==='cliente final';
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return response({ok:false,error:'method_not_allowed'},405);

  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey)return response({ok:false,error:'server_config'},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:expected,error:keyError}=await sb.rpc('get_bling_history_import_key_v1');
  if(keyError||!expected)return response({ok:false,error:'import_key_not_configured'},503);
  const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const supplied=clean(req.headers.get('x-dona-antonia-import-key')||bearer,200);
  if(!supplied||!safeEqual(supplied,String(expected)))return response({ok:false,error:'unauthorized'},401);

  let body:any={};try{body=await req.json()}catch{body={}}
  const limit=Math.max(1,Math.min(Number(body?.limit)||10,25));

  const {data:credentials,error:credentialError}=await sb.rpc('get_bling_api_credentials_v1');
  if(credentialError)return response({ok:false,error:'credentials_lookup_failed'},500);
  const clientId=clean(credentials?.client_id||Deno.env.get('BLING_CLIENT_ID'),500);
  const clientSecret=clean(credentials?.client_secret||Deno.env.get('BLING_CLIENT_SECRET'),500);
  const refreshToken=clean(credentials?.refresh_token||Deno.env.get('BLING_REFRESH_TOKEN'),5000);
  if(!clientId||!clientSecret||!refreshToken)return response({ok:false,error:'bling_credentials_missing'},503);

  let oauthResponse:Response|null=null;
  let oauth:any={};
  for(const oauthUrl of OAUTH_URLS){
    const oauthBody=new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken});
    const attempt=await fetch(oauthUrl,{
      method:'POST',
      headers:{
        Authorization:`Basic ${basic(clientId,clientSecret)}`,
        'Content-Type':'application/x-www-form-urlencoded',
        Accept:'1.0',
        'enable-jwt':'1'
      },
      body:oauthBody
    });
    const raw=await attempt.text();
    let parsed:any={};try{parsed=raw?JSON.parse(raw):{}}catch{}
    oauthResponse=attempt;oauth=parsed;
    if(attempt.ok&&clean(parsed?.access_token,5000))break;
    if(![403,404,405].includes(attempt.status))break;
  }
  if(!oauthResponse?.ok||!clean(oauth?.access_token,5000))return response({ok:false,error:'bling_oauth_failed',http_status:oauthResponse?.status||0},502);

  const rotated=clean(oauth?.refresh_token,5000);
  if(rotated&&rotated!==refreshToken){
    const {error:rotateError}=await sb.rpc('set_bling_api_refresh_token_v1',{p_refresh_token:rotated});
    if(rotateError)return response({ok:false,error:'refresh_token_persist_failed'},500);
  }

  const accessToken=clean(oauth.access_token,5000);
  const {data:staged,error:stagedError}=await sb.from('bling_history_staging_orders')
    .select('id,bling_order_id,bling_contact_id,customer_name,customer_document,customer_phone')
    .eq('canonical_status','delivered')
    .eq('reconciliation_status','review')
    .is('matched_customer_id',null)
    .not('bling_contact_id','is',null)
    .order('order_date',{ascending:false})
    .limit(200);

  if(stagedError)return response({ok:false,error:'staging_lookup_failed',detail:stagedError.message},500);

  const contactIds=[...new Set((staged||[]).map((x:any)=>Number(x.bling_contact_id)).filter((x:number)=>x>0))].slice(0,limit);
  const result:any[]=[];
  let lastRequestAt=0;

  for(const contactId of contactIds){
    const wait=Math.max(0,420-(Date.now()-lastRequestAt));if(wait)await sleep(wait);
    lastRequestAt=Date.now();

    const apiResponse=await fetch(`${API_BASE}/contatos/${encodeURIComponent(String(contactId))}`,{
      headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','enable-jwt':'1'}
    });
    const raw=await apiResponse.text();
    let envelope:any={};try{envelope=raw?JSON.parse(raw):{}}catch{}
    if(!apiResponse.ok){
      result.push({contact_id:contactId,status:'error',error:'contact_fetch_failed',http_status:apiResponse.status});
      continue;
    }

    const contact=envelope?.data||{};
    const name=clean(contact?.nome,180);
    const document=digits(contact?.numeroDocumento);
    const phone=normalizePhone(contact?.celular||contact?.telefone);
    const rows=(staged||[]).filter((x:any)=>Number(x.bling_contact_id)===contactId);

    await sb.from('bling_history_staging_orders').update({
      customer_name:name||rows[0]?.customer_name||null,
      customer_document:document||rows[0]?.customer_document||null,
      customer_phone:phone||rows[0]?.customer_phone||null,
      updated_at:new Date().toISOString()
    }).eq('bling_contact_id',contactId).eq('canonical_status','delivered').eq('reconciliation_status','review');

    let matched:any=null;
    let matchMethod='';

    const {data:byBling}=await sb.from('customers').select('id,bling_contact_id').eq('bling_contact_id',contactId).maybeSingle();
    if(byBling?.id){matched=byBling;matchMethod='bling_contact_id'}

    if(!matched&&document){
      const {data:byDoc}=await sb.from('customers').select('id,bling_contact_id').eq('cpf_cnpj',document).limit(2);
      if((byDoc||[]).length===1){matched=byDoc![0];matchMethod='document_exact'}
    }

    if(!matched&&phone){
      const {data:byPhone}=await sb.from('customers').select('id,bling_contact_id').eq('primary_whatsapp_e164',phone).limit(2);
      if((byPhone||[]).length===1){matched=byPhone![0];matchMethod='phone_exact'}
    }

    let created=false;
    if(!matched&&!genericName(name)&&(document||phone)){
      const insert:any={
        bling_contact_id:contactId,
        name:name||null,
        cpf_cnpj:document||null,
        primary_whatsapp_e164:phone||null,
        last_bling_sync_at:new Date().toISOString()
      };
      const {data:newCustomer,error:createError}=await sb.from('customers').insert(insert).select('id,bling_contact_id').single();
      if(!createError&&newCustomer?.id){
        matched=newCustomer;matchMethod='created_from_bling_contact';created=true;
      }
    }

    if(matched?.id&&matchMethod!=='bling_contact_id'&&!created){
      if(!matched.bling_contact_id){
        await sb.from('customers').update({bling_contact_id:contactId,last_bling_sync_at:new Date().toISOString()}).eq('id',matched.id).is('bling_contact_id',null);
      }
    }

    const reconciled:any[]=[];
    for(const row of rows){
      const {data:rec,error:recError}=await sb.rpc('reconcile_bling_history_order_v1',{p_staging_order_id:row.id});
      reconciled.push({bling_order_id:row.bling_order_id,status:rec?.status||null,error:recError?.message||null});
    }

    result.push({
      contact_id:contactId,
      status:matched?.id?'matched':(genericName(name)?'generic_skipped':'unmatched'),
      match_method:matchMethod||null,
      customer_id:matched?.id||null,
      created,
      has_document:Boolean(document),
      has_phone:Boolean(phone),
      orders:rows.length,
      reconciled
    });
  }

  return response({
    ok:true,
    processed_contacts:result.length,
    matched_contacts:result.filter(x=>x.customer_id).length,
    created_customers:result.filter(x=>x.created).length,
    remaining_unmatched:result.filter(x=>!x.customer_id).length,
    results:result
  });
});
