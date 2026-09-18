import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const API_BASE='https://api.bling.com.br/Api/v3';
const OAUTH_URLS=['https://api.bling.com.br/oauth/token','https://api.bling.com.br/Api/v3/oauth/token'];
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=(value:unknown,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const num=(value:unknown)=>{
  if(value&&typeof value==='object'&&'valor' in (value as any))return num((value as any).valor);
  const n=Number(value);return Number.isFinite(n)?n:0;
};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}

function basic(clientId:string,clientSecret:string){
  return btoa(`${clientId}:${clientSecret}`);
}

function dateOnly(value:unknown){
  const s=clean(value,40);
  const m=s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1]||'';
}

function object(value:unknown){
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
}

function addressFrom(detail:any){
  const etiqueta=object(detail?.transporte?.etiqueta);
  const geral=object(detail?.contato?.endereco?.geral);
  const src=Object.keys(etiqueta).length?etiqueta:geral;
  return {
    street:clean(src.endereco||src.logradouro,180)||null,
    number:clean(src.numero,40)||null,
    complement:clean(src.complemento,180)||null,
    neighborhood:clean(src.bairro,120)||null,
    city:clean(src.municipio||src.cidade,120)||null,
    state:clean(src.uf,10)||null,
    postal_code:digits(src.cep)||null,
    country:clean(src.pais||src.nomePais,80)||null
  };
}

function normalizeItem(item:any){
  const product=object(item?.produto);
  const quantity=num(item?.quantidade);
  const unitPrice=num(item?.valor ?? item?.preco ?? item?.valorUnitario);
  const explicitTotal=num(item?.total ?? item?.valorTotal ?? item?.valorTotalItem);
  return {
    bling_product_id:Number(product.id||item?.idProduto||0)||null,
    sku:clean(item?.codigo||product.codigo,120)||null,
    gtin:clean(item?.gtin||item?.ean||product.gtin||product.ean,32)||null,
    name:clean(item?.descricao||product.nome||item?.nome,220)||'Produto',
    quantity,
    unit_price:unitPrice,
    line_total:explicitTotal||quantity*unitPrice,
    raw:item||{}
  };
}

function normalizeOrder(summary:any,detail:any){
  const src=object(detail);
  const fallback=object(summary);
  const contact=object(src.contato||fallback.contato);
  const status=object(src.situacao||fallback.situacao);
  const orderDate=dateOnly(src.data||fallback.data);
  const items=Array.isArray(src.itens)?src.itens.map(normalizeItem):[];
  return {
    order:{
      bling_order_id:Number(src.id||fallback.id||0)||null,
      bling_contact_id:Number(contact.id||0)||null,
      order_number:clean(src.numero||fallback.numero,80)||null,
      store_order_number:clean(src.numeroLoja||fallback.numeroLoja,120)||null,
      order_date:orderDate||null,
      status_id:Number(status.id||0)||null,
      status_name:clean(status.valor||status.nome||status.descricao,120)||null,
      total:num(src.total??fallback.total),
      subtotal:num(src.totalProdutos??src.subtotal??fallback.totalProdutos),
      discount:num(src.desconto),
      other_expenses:num(src.outrasDespesas),
      customer_name:clean(contact.nome,180)||null,
      customer_document:digits(contact.numeroDocumento)||null,
      customer_phone:clean(contact.celular||contact.telefone||contact.fone,60)||null,
      delivery_address:addressFrom(src),
      raw:src
    },
    items
  };
}

Deno.serve(async(req:Request)=>{
  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey)return response({ok:false,error:'server_config'},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==='GET'){
    const [{data:runtime},{data:credentials}]=await Promise.all([
      sb.from('bling_history_import_runtime').select('enabled,fetch_enabled,promotion_enabled,max_orders_per_run,start_date,end_date,updated_at').eq('id',1).maybeSingle(),
      sb.rpc('get_bling_api_credentials_v1')
    ]);
    const envCredentials={
      client_id:Deno.env.get('BLING_CLIENT_ID')||'',
      client_secret:Deno.env.get('BLING_CLIENT_SECRET')||'',
      refresh_token:Deno.env.get('BLING_REFRESH_TOKEN')||''
    };
    const c={
      client_id:credentials?.client_id||envCredentials.client_id,
      client_secret:credentials?.client_secret||envCredentials.client_secret,
      refresh_token:credentials?.refresh_token||envCredentials.refresh_token
    };
    return response({
      ok:true,
      service:'bling-history-import-v1',
      supabase_first:true,
      make:false,
      runtime:runtime||null,
      credentials:{
        client_id:Boolean(c.client_id),
        client_secret:Boolean(c.client_secret),
        refresh_token:Boolean(c.refresh_token),
        ready:Boolean(c.client_id&&c.client_secret&&c.refresh_token),
        client_id_source:credentials?.client_id?'vault':(envCredentials.client_id?'edge_secret':'missing'),
        client_secret_source:credentials?.client_secret?'vault':(envCredentials.client_secret?'edge_secret':'missing'),
        refresh_token_source:credentials?.refresh_token?'vault':(envCredentials.refresh_token?'edge_secret':'missing')
      }
    });
  }

  if(req.method!=='POST')return response({ok:false,error:'method_not_allowed'},405);

  let body:any={};
  try{body=await req.json()}catch{return response({ok:false,error:'invalid_json'},400)}

  const {data:expected,error:keyError}=await sb.rpc('get_bling_history_import_key_v1');
  if(keyError||!expected)return response({ok:false,error:'import_key_not_configured'},503);
  const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const supplied=clean(req.headers.get('x-dona-antonia-import-key')||bearer,200);
  if(!supplied||!safeEqual(supplied,String(expected)))return response({ok:false,error:'unauthorized'},401);

  const action=clean(body?.action||'fetch_page',50).toLowerCase();

  if(action==='readiness'){
    const {data,error}=await sb.rpc('bling_history_import_readiness_v1');
    if(error)return response({ok:false,error:'readiness_failed',detail:error.message},500);
    return response({ok:true,readiness:data});
  }

  if(action==='reconcile_pending'){
    const limit=Math.max(1,Math.min(Number(body?.limit)||20,100));
    const {data:rows,error}=await sb.from('bling_history_staging_orders')
      .select('id,bling_order_id').in('reconciliation_status',['pending','review']).order('order_date',{ascending:true}).limit(limit);
    if(error)return response({ok:false,error:'staging_lookup_failed',detail:error.message},500);
    const results:any[]=[];
    for(const row of rows||[]){
      const {data,error:re}=await sb.rpc('reconcile_bling_history_order_v1',{p_staging_order_id:row.id});
      results.push({bling_order_id:row.bling_order_id,ok:!re,result:data||null,error:re?.message||null});
    }
    return response({ok:true,processed:results.length,results});
  }

  if(action!=='fetch_page')return response({ok:false,error:'unknown_action'},400);

  const {data:runtime,error:runtimeError}=await sb.from('bling_history_import_runtime')
    .select('enabled,fetch_enabled,promotion_enabled,max_orders_per_run,start_date,end_date').eq('id',1).maybeSingle();
  if(runtimeError||!runtime)return response({ok:false,error:'runtime_unavailable'},503);
  if(runtime.enabled!==true)return response({ok:false,error:'bling_history_import_disabled'},409);
  if(runtime.fetch_enabled!==true)return response({ok:false,error:'bling_history_fetch_disabled'},409);

  const startDate=dateOnly(body?.start_date||runtime.start_date);
  const endDate=dateOnly(body?.end_date||runtime.end_date);
  if(!startDate||!endDate)return response({ok:false,error:'date_range_required'},400);

  const page=Math.max(1,Number(body?.page)||1);
  const pageSize=Math.max(1,Math.min(Number(body?.page_size)||10,Math.min(Number(runtime.max_orders_per_run)||10,10)));

  const {data:credentials,error:credentialError}=await sb.rpc('get_bling_api_credentials_v1');
  if(credentialError)return response({ok:false,error:'credentials_lookup_failed'},500);
  const envClientId=Deno.env.get('BLING_CLIENT_ID')||'';
  const envClientSecret=Deno.env.get('BLING_CLIENT_SECRET')||'';
  const envRefreshToken=Deno.env.get('BLING_REFRESH_TOKEN')||'';
  const clientId=clean(credentials?.client_id||envClientId,500);
  const clientSecret=clean(credentials?.client_secret||envClientSecret,500);
  const refreshToken=clean(credentials?.refresh_token||envRefreshToken,5000);
  const missing:string[]=[];
  if(!clientId)missing.push('client_id');
  if(!clientSecret)missing.push('client_secret');
  if(!refreshToken)missing.push('refresh_token');
  if(missing.length)return response({ok:false,error:'bling_credentials_missing',missing},503);

  if(!credentials?.refresh_token&&envRefreshToken){
    const {error:seedRefreshError}=await sb.rpc('set_bling_api_refresh_token_v1',{p_refresh_token:envRefreshToken});
    if(seedRefreshError)return response({ok:false,error:'refresh_token_seed_failed'},500);
  }

  const {data:runId,error:beginError}=await sb.rpc('begin_bling_history_import_run_v1',{
    p_start_date:startDate,p_end_date:endDate,p_page:page,p_page_size:pageSize
  });
  if(beginError||!runId)return response({ok:false,error:'run_start_failed',detail:beginError?.message||null},400);

  const finish=async(status:string,summary:any,cursor:any={},error:string|null=null)=>{
    await sb.rpc('finish_bling_history_import_run_v1',{
      p_run_id:runId,p_status:status,p_summary:summary||{},p_cursor:cursor||{},p_error:error
    });
  };

  try{
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
      const oauthText=await attempt.text();
      let parsed:any={};try{parsed=oauthText?JSON.parse(oauthText):{}}catch{}
      oauthResponse=attempt;
      oauth=parsed;
      if(attempt.ok&&clean(parsed?.access_token,5000))break;
      if(![403,404,405].includes(attempt.status))break;
    }
    if(!oauthResponse?.ok||!clean(oauth?.access_token,5000)){
      await finish('error',{stage:'oauth',http_status:oauthResponse?.status||0},{page},'bling_oauth_failed');
      return response({ok:false,error:'bling_oauth_failed',http_status:oauthResponse?.status||0},502);
    }

    const accessToken=clean(oauth.access_token,5000);
    const rotatedRefresh=clean(oauth.refresh_token,5000);
    if(rotatedRefresh&&rotatedRefresh!==refreshToken){
      const {error:rotateError}=await sb.rpc('set_bling_api_refresh_token_v1',{p_refresh_token:rotatedRefresh});
      if(rotateError){
        await finish('error',{stage:'refresh_token_rotation'},{page},'refresh_token_persist_failed');
        return response({ok:false,error:'refresh_token_persist_failed'},500);
      }
    }

    let lastRequestAt=0;
    const bling=async(path:string)=>{
      const wait=Math.max(0,420-(Date.now()-lastRequestAt));if(wait)await sleep(wait);
      lastRequestAt=Date.now();
      return fetch(`${API_BASE}${path}`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','enable-jwt':'1'}});
    };

    const query=new URLSearchParams({
      pagina:String(page),
      limite:String(pageSize),
      dataInicial:startDate,
      dataFinal:endDate
    });
    const listResponse=await bling(`/pedidos/vendas?${query.toString()}`);
    const listText=await listResponse.text();
    let list:any={};try{list=listText?JSON.parse(listText):{}}catch{}
    if(!listResponse.ok){
      await finish('error',{stage:'list',http_status:listResponse.status},{page},'bling_list_failed');
      return response({ok:false,error:'bling_list_failed',http_status:listResponse.status},502);
    }

    const rows=Array.isArray(list?.data)?list.data:[];
    const staged:any[]=[];
    const errors:any[]=[];

    for(const summary of rows){
      const id=Number(summary?.id||0);
      if(!id){errors.push({id:null,error:'missing_order_id'});continue}
      const detailResponse=await bling(`/pedidos/vendas/${encodeURIComponent(String(id))}`);
      const detailText=await detailResponse.text();
      let detailEnvelope:any={};try{detailEnvelope=detailText?JSON.parse(detailText):{}}catch{}
      if(!detailResponse.ok){
        errors.push({id,http_status:detailResponse.status,error:'detail_failed'});
        continue;
      }

      const detail=detailEnvelope?.data||{};
      const normalized=normalizeOrder(summary,detail);
      const {data:stageResult,error:stageError}=await sb.rpc('stage_bling_history_order_v1',{
        p_run_id:runId,p_order:normalized.order,p_items:normalized.items
      });
      if(stageError)errors.push({id,error:'stage_failed',detail:stageError.message});
      else staged.push(stageResult);
    }

    const hasMore=rows.length===pageSize;
    const status=errors.length?'partial':'done';
    const summary={
      page,page_size:pageSize,listed:rows.length,staged:staged.length,errors:errors.length,
      has_more:hasMore,start_date:startDate,end_date:endDate
    };
    const cursor={page,next_page:hasMore?page+1:null,has_more:hasMore};
    await finish(status,summary,cursor,errors.length?'partial_item_failures':null);

    return response({
      ok:errors.length===0,
      partial:errors.length>0,
      run_id:runId,
      summary,
      cursor,
      staged,
      errors
    },errors.length?207:200);
  }catch(error:any){
    await finish('error',{stage:'unexpected'},{page},clean(error?.message||error,500));
    return response({ok:false,error:'unexpected_import_error',detail:clean(error?.message||error,500)},500);
  }
});
