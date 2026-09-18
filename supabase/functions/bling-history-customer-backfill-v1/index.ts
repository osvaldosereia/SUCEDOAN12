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
const object=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const basic=(id:string,secret:string)=>btoa(`${id}:${secret}`);

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
function dateOnly(value:unknown){
  const s=clean(value,40),m=s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1]||'';
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
  const src=object(detail),fallback=object(summary);
  const contact=object(src.contato||fallback.contato);
  const status=object(src.situacao||fallback.situacao);
  return {
    order:{
      bling_order_id:Number(src.id||fallback.id||0)||null,
      bling_contact_id:Number(contact.id||0)||null,
      order_number:clean(src.numero||fallback.numero,80)||null,
      store_order_number:clean(src.numeroLoja||fallback.numeroLoja,120)||null,
      order_date:dateOnly(src.data||fallback.data)||null,
      status_id:Number(status.id||0)||null,
      status_name:clean(status.nome||status.descricao||status.valor,120)||null,
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
    items:Array.isArray(src.itens)?src.itens.map(normalizeItem):[]
  };
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

  let body:any={};try{body=await req.json()}catch{}
  const batchSize=Math.max(1,Math.min(Number(body?.batch_size)||5,5));

  const lockOwner=crypto.randomUUID();
  const {data:lockClaimed,error:lockError}=await sb.rpc('claim_bling_history_import_lock_v1',{p_owner:lockOwner,p_ttl_seconds:300});
  if(lockError)return response({ok:false,error:'import_lock_failed',detail:lockError.message},500);
  if(lockClaimed!==true)return response({ok:false,error:'import_already_running'},409);

  let activeCustomerId:string|null=null;

  try{
    const {data:firstQueue,error:firstClaimError}=await sb.rpc('claim_bling_history_customer_backfill_v1');
    if(firstClaimError)return response({ok:false,error:'queue_claim_failed',detail:firstClaimError.message},500);
    if(!firstQueue||!firstQueue.customer_id)return response({ok:true,done:true,message:'queue_empty',processed:0,results:[]});

    const {data:credentials,error:credentialError}=await sb.rpc('get_bling_api_credentials_v1');
    if(credentialError)throw new Error('credentials_lookup_failed');
    const clientId=clean(credentials?.client_id||Deno.env.get('BLING_CLIENT_ID'),500);
    const clientSecret=clean(credentials?.client_secret||Deno.env.get('BLING_CLIENT_SECRET'),500);
    const refreshToken=clean(credentials?.refresh_token||Deno.env.get('BLING_REFRESH_TOKEN'),5000);
    if(!clientId||!clientSecret||!refreshToken)throw new Error('bling_credentials_missing');

    let oauthResponse:Response|null=null,oauth:any={};
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
      const raw=await attempt.text();let parsed:any={};try{parsed=raw?JSON.parse(raw):{}}catch{}
      oauthResponse=attempt;oauth=parsed;
      if(attempt.ok&&clean(parsed?.access_token,5000))break;
      if(![403,404,405].includes(attempt.status))break;
    }
    if(!oauthResponse?.ok||!clean(oauth?.access_token,5000))throw new Error(`bling_oauth_failed_${oauthResponse?.status||0}`);

    const rotated=clean(oauth?.refresh_token,5000);
    if(rotated&&rotated!==refreshToken){
      const {error:rotateError}=await sb.rpc('set_bling_api_refresh_token_v1',{p_refresh_token:rotated});
      if(rotateError)throw new Error('refresh_token_persist_failed');
    }

    const accessToken=clean(oauth.access_token,5000);
    let lastRequestAt=0;
    const bling=async(path:string)=>{
      let last:Response|null=null;
      for(let attempt=0;attempt<4;attempt++){
        const wait=Math.max(0,450-(Date.now()-lastRequestAt));if(wait)await sleep(wait);
        lastRequestAt=Date.now();
        const r=await fetch(`${API_BASE}${path}`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','enable-jwt':'1'}});
        last=r;
        if(r.status!==429&&r.status<500)return r;
        const retryAfter=Math.max(0,Number(r.headers.get('retry-after')||0)*1000);
        await sleep(Math.max(retryAfter,700*(attempt+1)));
      }
      return last as Response;
    };

    const results:any[]=[];
    let queue:any=firstQueue;

    for(let batchIndex=0;batchIndex<batchSize;batchIndex++){
      if(batchIndex>0){
        const {data:nextQueue,error:nextClaimError}=await sb.rpc('claim_bling_history_customer_backfill_v1');
        if(nextClaimError){results.push({ok:false,error:'queue_claim_failed'});break}
        if(!nextQueue||!nextQueue.customer_id)break;
        queue=nextQueue;
      }

      activeCustomerId=String(queue.customer_id);
      const page=Math.max(1,Number(queue.page)||1);

      try{
        const query=new URLSearchParams({
          pagina:String(page),
          limite:'20',
          idContato:String(queue.bling_contact_id),
          dataInicial:String(queue.window_start),
          dataFinal:String(queue.window_end)
        });
        query.append('idsSituacoes[]','9');

        const listResponse=await bling(`/pedidos/vendas?${query.toString()}`);
        const listRaw=await listResponse.text();let list:any={};try{list=listRaw?JSON.parse(listRaw):{}}catch{}
        if(!listResponse.ok)throw new Error(`bling_list_failed_${listResponse.status}`);

        const rows=Array.isArray(list?.data)?list.data:[];
        let staged=0,ready=0;
        const itemErrors:any[]=[];

        for(const summary of rows){
          const id=Number(summary?.id||0);
          if(!id){itemErrors.push({error:'missing_order_id'});continue}
          const detailResponse=await bling(`/pedidos/vendas/${encodeURIComponent(String(id))}`);
          const detailRaw=await detailResponse.text();let envelope:any={};try{envelope=detailRaw?JSON.parse(detailRaw):{}}catch{}
          if(!detailResponse.ok){itemErrors.push({id,error:`detail_${detailResponse.status}`});continue}

          const normalized=normalizeOrder(summary,envelope?.data||{});
          const {data:stageResult,error:stageError}=await sb.rpc('stage_bling_history_order_v1',{
            p_run_id:null,p_order:normalized.order,p_items:normalized.items
          });
          if(stageError){itemErrors.push({id,error:'stage_failed'});continue}
          staged++;
          if(stageResult?.reconciliation?.status==='ready')ready++;
        }

        const hasMore=rows.length===20;
        const errorText=itemErrors.length?('partial_'+itemErrors.length+'_errors'):null;
        const {data:finished,error:finishError}=await sb.rpc('finish_bling_history_customer_backfill_v1',{
          p_customer_id:queue.customer_id,
          p_fetched:rows.length,
          p_staged:staged,
          p_ready:ready,
          p_has_more:hasMore,
          p_error:errorText
        });
        if(finishError)throw new Error('queue_finish_failed');

        results.push({
          ok:itemErrors.length===0,
          customer_id:queue.customer_id,
          page,
          listed:rows.length,
          staged,
          ready,
          has_more:hasMore,
          errors:itemErrors.length,
          queue:finished
        });
      }catch(customerError:any){
        await sb.rpc('finish_bling_history_customer_backfill_v1',{
          p_customer_id:queue.customer_id,
          p_fetched:0,p_staged:0,p_ready:0,p_has_more:false,
          p_error:clean(customerError?.message||customerError,500)
        });
        results.push({ok:false,customer_id:queue.customer_id,error:clean(customerError?.message||customerError,200)});
      }finally{
        activeCustomerId=null;
      }
    }

    const {data:promotion,error:promotionError}=await sb.rpc('promote_bling_history_ready_batch_v1',{p_limit:20});
    const {data:summary}=await sb.rpc('bling_history_customer_backfill_summary_v1');
    return response({
      ok:results.every((x:any)=>x.ok!==false)&&!promotionError,
      processed:results.length,
      results,
      promotion:promotionError?{ok:false,error:promotionError.message}:promotion,
      queue_summary:summary||{}
    },results.some((x:any)=>x.ok===false)||promotionError?207:200);
  }catch(error:any){
    if(activeCustomerId){
      await sb.rpc('finish_bling_history_customer_backfill_v1',{
        p_customer_id:activeCustomerId,
        p_fetched:0,p_staged:0,p_ready:0,p_has_more:false,p_error:clean(error?.message||error,500)
      });
    }
    return response({ok:false,error:'customer_backfill_failed',detail:clean(error?.message||error,500)},500);
  }finally{
    await sb.rpc('release_bling_history_import_lock_v1',{p_owner:lockOwner});
  }
});
