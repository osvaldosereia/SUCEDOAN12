import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractCatalogFromNfe } from "./xml-catalog-extractor.mjs";
import { assertCatalogXmlSize, assertCatalogXmlIntegrity, assertExistingXmlDigest } from "./xml-catalog-ingest-guard.mjs";
import { xmlFieldReviewGateway } from "./xml-catalog-field-review-gateway.mjs";
import { xmlFieldApplyGateway } from "./xml-catalog-field-apply-gateway.mjs";
import { catalogXmlComparison } from "./xml-catalog-comparison.mjs";
import { compareCandidateFullHistory } from "./xml-catalog-full-comparison.mjs";
import { loadFiscalDossier } from "./xml-catalog-fiscal-dossier.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const sb=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});
const BLING="https://api.bling.com.br/Api/v3";
const OAUTH=["https://api.bling.com.br/Api/v3/oauth/token","https://api.bling.com.br/oauth/token"];

const clean=(v:any,n=500)=>String(v??"").trim().slice(0,n);
const digits=(v:any)=>String(v??"").replace(/\D/g,"");
const obj=(v:any)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function cors(r:Request){const o=r.headers.get("origin")||"*";return {"Access-Control-Allow-Origin":o,"Access-Control-Allow-Headers":"authorization,content-type,x-dona-antonia-bling-hub-key","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin","Cache-Control":"no-store"}}
function js(r:Request,b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8"}})}
async function auth(r:Request){
  const internal=clean(r.headers.get("x-dona-antonia-bling-hub-key"),5000);
  if(internal){
    const q=await sb.rpc("get_bling_hub_key_v2");
    if(!q.error&&clean(q.data,5000)===internal)return {ok:true,internal:true,user_id:null,role:"system"};
  }
  const token=(r.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"admin_auth_required"};
  const u=await sb.auth.getUser(token);
  if(u.error||!u.data.user?.id)return {ok:false,status:401,error:"admin_session_invalid"};
  const a=await sb.from("admin_users").select("role,is_active").eq("user_id",u.data.user.id).maybeSingle();
  if(a.error)return {ok:false,status:500,error:"admin_lookup_failed"};
  if(!a.data?.is_active)return {ok:false,status:403,error:"admin_not_authorized"};
  return {ok:true,internal:false,user_id:u.data.user.id,role:a.data.role||"viewer"};
}
async function reserve(){const q=await sb.rpc("reserve_bling_hub_rate_slot_v2",{});if(q.error)throw new Error("rate_slot_failed");const ms=Math.max(0,Number(q.data||0));if(ms)await sleep(ms)}
async function oauth(){
  const owner=crypto.randomUUID();
  const lk=await sb.rpc("claim_bling_hub_oauth_lock_v2",{p_owner:owner,p_ttl_seconds:90});
  if(lk.error||lk.data!==true)throw new Error("oauth_busy");
  try{
    const q=await sb.rpc("get_bling_api_credentials_v1");
    if(q.error)throw new Error("credentials_lookup_failed");
    const id=clean(q.data?.client_id,500),secret=clean(q.data?.client_secret,500),refresh=clean(q.data?.refresh_token,5000);
    if(!id||!secret||!refresh)throw new Error("bling_credentials_missing");
    let last:any=null;
    for(const url of OAUTH){
      const rr=await fetch(url,{method:"POST",headers:{Authorization:"Basic "+btoa(id+":"+secret),"Content-Type":"application/x-www-form-urlencoded",Accept:"1.0","enable-jwt":"1"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh}),signal:AbortSignal.timeout(12000)});
      const raw=await rr.text();let d:any={};try{d=raw?JSON.parse(raw):{}}catch{}
      last={rr,d};
      if(rr.ok&&d?.access_token)break;
      if(![403,404,405].includes(rr.status))break;
    }
    if(!last?.rr?.ok||!last?.d?.access_token)throw new Error("oauth_http_"+String(last?.rr?.status||0));
    if(last.d.refresh_token&&last.d.refresh_token!==refresh){
      const s=await sb.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:String(last.d.refresh_token)});
      if(s.error)throw new Error("refresh_token_persist_failed");
    }
    return String(last.d.access_token);
  }finally{await sb.rpc("release_bling_hub_oauth_lock_v2",{p_owner:owner})}
}
async function bg(token:string,path:string){
  await reserve();
  const r=await fetch(BLING+path,{headers:{Authorization:"Bearer "+token,Accept:"application/json","enable-jwt":"1"},signal:AbortSignal.timeout(25000)});
  const raw=await r.text();let d:any={};try{d=raw?JSON.parse(raw):{}}catch{}
  return {ok:r.ok,status:r.status,data:d,raw};
}
async function bw(token:string,path:string,method:string,payload:any=undefined){
  await reserve();
  const init:any={method,headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},signal:AbortSignal.timeout(25000)};
  if(payload!==undefined)init.body=JSON.stringify(payload);
  const r=await fetch(BLING+path,init);
  const raw=await r.text();let d:any={};try{d=raw?JSON.parse(raw):{}}catch{}
  const detail=clean(d?.error?.message||d?.error?.description||d?.error?.type||d?.error||d?.message||raw,1200);
  return {ok:r.ok,status:r.status,data:d,error:detail,raw};
}

function dec(s:string){return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#x([0-9a-f]+);/gi,(_:string,h:string)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_:string,d:string)=>String.fromCodePoint(parseInt(d,10)))}
function tag(b:string,n:string){const m=b.match(new RegExp("<(?:\\w+:)?"+n+"\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?"+n+">","i"));return m?dec(m[1]).trim():""}
function block(b:string,n:string){const m=b.match(new RegExp("<(?:\\w+:)?"+n+"\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?"+n+">","i"));return m?m[0]:""}
function blocks(b:string,n:string){return [...b.matchAll(new RegExp("<(?:\\w+:)?"+n+"\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?"+n+">","gi"))].map((m:any)=>m[0])}
function attr(b:string,n:string){const h=b.match(/^<[^>]+>/)?.[0]||"",m=h.match(new RegExp("\\b"+n+"=[\"']([^\"']+)[\"']","i"));return m?dec(m[1]):""}
function num(v:any){const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:null}
function unit(v:any){const s=clean(v,20).toUpperCase().replace(/[^A-Z0-9]/g,"");const m:any={UNIDADE:"UN",UN:"UN",UND:"UN",CAIXA:"CX",CX:"CX",FARDO:"FD",FD:"FD",PACOTE:"PCT",PCT:"PCT",DISPLAY:"DP",DP:"DP",QUILO:"KG",KILO:"KG",KG:"KG",LITRO:"L",LT:"L",L:"L"};return m[s]||s.slice(0,6)}

function preliminaryBaseUnit(item:any,productUnit:any=""){
  const pu=unit(item?.purchase_unit),tu=unit(item?.tax_unit),catalog=unit(productUnit);
  const qc=Number(item?.purchase_quantity||0),qt=Number(item?.tax_quantity||0),ratio=qc>0&&qt>0?qt/qc:0;
  const packaging=new Set(["CX","FD","PCT","DP"]);
  if(ratio>1){
    if(catalog&&!packaging.has(catalog))return catalog;
    if(tu&&tu!==pu&&!packaging.has(tu))return tu;
    return "UN";
  }
  return catalog||tu||pu||"UN";
}
function gtin(v:any){const d=digits(v);return [8,12,13,14].includes(d.length)?d:""}
function validGtin(v:any){const g=digits(v);if(![8,12,13,14].includes(g.length))return false;const e=Number(g.at(-1));let s=0;for(let i=g.length-2,o=0;i>=0;i--,o++)s+=Number(g[i])*(o%2===0?3:1);return (10-s%10)%10===e}
function day(v:any){const s=clean(v,40),m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:""}
const PAYMENT_LABELS:any={
  "01":"Dinheiro","02":"Cheque","03":"Cartão de crédito","04":"Cartão de débito","05":"Crédito da loja",
  "10":"Vale alimentação","11":"Vale refeição","12":"Vale presente","13":"Vale combustível",
  "14":"Duplicata mercantil","15":"Boleto bancário","16":"Depósito bancário","17":"PIX",
  "18":"Transferência bancária / carteira digital","19":"Fidelidade / cashback / crédito virtual",
  "90":"Sem pagamento","91":"Pagamento posterior","99":"Outros"
};
const CARD_BRANDS:any={"01":"Visa","02":"Mastercard","03":"American Express","04":"Sorocred","05":"Diners Club","06":"Elo","07":"Hipercard","08":"Aura","09":"Cabal","99":"Outros"};
function paymentSummary(payments:any[],invoiceTotal:any,troco:any=0){
  const rows=Array.isArray(payments)?payments:[];
  const gross=rows.reduce((a:number,x:any)=>a+Number(x?.amount||0),0);
  const change=Number(troco||0);
  const net=Math.round((gross-change)*100)/100;
  const total=Number(invoiceTotal||0);
  const difference=Math.round((net-total)*100)/100;
  const total_matches=Number.isFinite(total)&&Math.abs(difference)<=0.05;
  const codes=[...new Set(rows.map((x:any)=>clean(x?.code,2)).filter(Boolean))];
  const immediate=new Set(["01","03","04","10","11","12","13","16","17","18","19"]);
  const deferred=new Set(["05","14","15","91"]);
  const has_no_payment=codes.includes("90");
  const all_immediate=codes.length>0&&codes.every((x:any)=>immediate.has(x));
  const has_deferred=codes.some((x:any)=>deferred.has(x));
  const paid_at_purchase_likely=all_immediate&&total_matches&&net>0;
  let hint="unknown";
  if(paid_at_purchase_likely)hint="paid_at_purchase_likely";
  else if(has_no_payment)hint="no_payment";
  else if(has_deferred)hint="deferred_or_later";
  else if(rows.length)hint="review";
  const labels=codes.map((x:any)=>PAYMENT_LABELS[x]||("Código "+x));
  const guidance=codes.includes("03")?"credit_card":codes.includes("04")?"debit_card":codes.includes("17")?"pix":codes.includes("01")?"cash":codes.includes("18")||codes.includes("16")?"bank_transfer":codes.some((x:any)=>["10","11","12","13"].includes(x))?"voucher":"other";
  return {
    hint,paid_at_purchase_likely,total_matches,payment_total:net,gross_payment_total:Math.round(gross*100)/100,
    change:Math.round(change*100)/100,invoice_total:total,difference,codes,method_labels:labels,guidance,
    payment_count:rows.length
  };
}
function parseXml(xml:string){
  const inf=block(xml,"infNFe")||xml,ide=block(inf,"ide"),emit=block(inf,"emit"),dest=block(inf,"dest"),prot=block(xml,"protNFe"),ip=block(prot,"infProt")||prot;
  const ea=block(emit,"enderEmit"),total=block(block(inf,"total"),"ICMSTot"),cobr=block(inf,"cobr"),pag=block(inf,"pag");
  const issuedAt=clean(tag(ide,"dhEmi")||tag(ide,"dEmi"),50)||null,totalAmount=num(tag(total,"vNF"));
  const cnpj=digits(tag(dest,"CNPJ")),cpf=digits(tag(dest,"CPF"));
  const items=blocks(inf,"det").map((d:string)=>{
    const p=block(d,"prod"),icms=block(block(d,"imposto"),"ICMS"),or=tag(icms,"orig"),ncm=digits(tag(p,"NCM")).slice(0,8),cest=digits(tag(p,"CEST")).slice(0,7);
    const qCom=num(tag(p,"qCom"))||0,qTrib=num(tag(p,"qTrib"))||0,uCom=unit(tag(p,"uCom")),uTrib=unit(tag(p,"uTrib"));
    const cst=digits(tag(icms,"CST")).slice(0,3),cs=digits(tag(icms,"CSOSN")).slice(0,4);
    const gross=num(tag(p,"vProd"))||0,discount=num(tag(p,"vDesc"))||0,freight=num(tag(p,"vFrete"))||0,insurance=num(tag(p,"vSeg"))||0,other=num(tag(p,"vOutro"))||0,net=gross-discount+freight+insurance+other;
    const lot_traces=blocks(p,"rastro").map((r:string,i:number)=>({
      trace_index:i+1,
      lot_code:clean(tag(r,"nLote"),120)||null,
      quantity:num(tag(r,"qLote")),
      manufacture_date:day(tag(r,"dFab"))||null,
      expiration_date:day(tag(r,"dVal"))||null,
      aggregation_code:clean(tag(r,"cAgreg"),120)||null
    })).filter((x:any)=>x.lot_code||x.expiration_date||Number(x.quantity)>0);
    return {item_number:Number(attr(d,"nItem"))||0,supplier_item_code:clean(tag(p,"cProd"),120)||null,description:clean(tag(p,"xProd"),500),commercial_gtin:gtin(tag(p,"cEAN"))||null,tax_gtin:gtin(tag(p,"cEANTrib"))||null,ncm:ncm.length===8?ncm:null,cest:cest.length===7?cest:null,cfop:digits(tag(p,"CFOP")).slice(0,4)||null,tax_code:cst?"CST:"+cst:cs?"CSOSN:"+cs:null,origin_code:/^\d$/.test(or)?Number(or):null,purchase_unit:uCom||null,purchase_quantity:qCom,purchase_unit_price:num(tag(p,"vUnCom")),line_total:gross,item_discount:discount,item_freight:freight,item_insurance:insurance,item_other:other,net_line_total:net,tax_unit:uTrib||null,tax_quantity:qTrib,lot_traces};
  }).filter((x:any)=>x.item_number>0&&x.description);
  const installments=blocks(cobr,"dup").map((d:string,i:number)=>({number:clean(tag(d,"nDup"),40)||String(i+1),due_date:day(tag(d,"dVenc")),amount:num(tag(d,"vDup"))})).filter((x:any)=>x.due_date&&Number(x.amount)>0);
  const payments=blocks(pag,"detPag").map((d:string,i:number)=>{
    const code=digits(tag(d,"tPag")).slice(0,2),card=block(d,"card"),brand=digits(tag(card,"tBand")).slice(0,2);
    return {
      number:i+1,code:code||null,label:PAYMENT_LABELS[code]||null,amount:num(tag(d,"vPag"))||0,
      payment_date:day(tag(d,"dPag"))||day(issuedAt)||null,description:clean(tag(d,"xPag"),120)||null,
      integration_type:digits(tag(card,"tpIntegra")).slice(0,1)||null,brand_code:brand||null,brand_label:CARD_BRANDS[brand]||null,
      authorization:clean(tag(card,"cAut"),80)||null,acquirer_document:digits(tag(card,"CNPJ"))||null
    };
  }).filter((x:any)=>x.code||Number(x.amount)>0);
  const change=num(tag(pag,"vTroco"))||0,payment_summary=paymentSummary(payments,totalAmount,change);
  return {
    document_key:digits(tag(ip,"chNFe")||attr(inf,"Id").replace(/^NFe/i,"")),
    cstat:Number(tag(ip,"cStat")||0),
    issued_at:issuedAt,
    invoice_number:clean(tag(ide,"nNF"),40)||null,series:clean(tag(ide,"serie"),20)||null,
    supplier_document:digits(tag(emit,"CNPJ")||tag(emit,"CPF"))||null,supplier_name:clean(tag(emit,"xNome"),180)||null,supplier_trade_name:clean(tag(emit,"xFant"),180)||null,
    supplier_address:{street:clean(tag(ea,"xLgr"),180),number:clean(tag(ea,"nro"),40),district:clean(tag(ea,"xBairro"),120),city:clean(tag(ea,"xMun"),120),state:clean(tag(ea,"UF"),2),zip:digits(tag(ea,"CEP"))},
    recipient_document:cnpj||cpf||null,recipient_kind:cnpj?"CNPJ":cpf?"CPF":"unknown",
    total_amount:totalAmount,items,installments,payments,payment_summary
  };
}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function b64bytes(s:string){const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o}
async function unzipBase64(s:string){const raw=b64bytes(s),ds=new DecompressionStream("gzip");return await new Response(new Blob([raw]).stream().pipeThrough(ds)).text()}

async function enrichPaymentMetadata(documentId:string,documentData:any=null){
  const q=documentData?{data:documentData,error:null}:await sb.from("purchase_xml_documents").select("id,storage_path,metadata,total_amount").eq("id",documentId).maybeSingle();
  if(q.error)throw q.error;
  const d:any=q.data;if(!d?.id||!d?.storage_path)return {ok:false,error:"document_or_xml_missing"};
  const meta=obj(d.metadata);
  if(meta.payment_summary&&typeof meta.payment_summary==="object"&&Object.keys(meta.payment_summary).length)return {ok:true,changed:false,metadata:meta};
  const dl=await sb.storage.from("purchase-xml").download(d.storage_path);
  if(dl.error)return {ok:false,error:"xml_download_failed",detail:clean(dl.error.message,300)};
  const xml=await dl.data.text(),parsed:any=parseXml(xml);
  const next={...meta,payments:parsed.payments||[],payment_summary:parsed.payment_summary||{}};
  const u=await sb.from("purchase_xml_documents").update({metadata:next,updated_at:new Date().toISOString()}).eq("id",d.id);
  if(u.error)throw u.error;
  return {ok:true,changed:true,metadata:next,payment_summary:parsed.payment_summary||{}};
}
async function backfillPaymentMetadata(limit=100){
  const q=await sb.from("purchase_xml_documents").select("id,storage_path,metadata,total_amount").order("created_at",{ascending:false}).limit(Math.max(1,Math.min(500,Number(limit||100))));
  if(q.error)throw q.error;
  let changed=0,skipped=0,failed=0,likely=0;const results:any[]=[];
  for(const d of q.data||[]){
    const meta=obj(d.metadata);
    if(meta.payment_summary&&typeof meta.payment_summary==="object"&&Object.keys(meta.payment_summary).length){skipped++;continue}
    try{
      const r=await enrichPaymentMetadata(d.id,d);
      if(r.changed)changed++;
      if(r.payment_summary?.paid_at_purchase_likely)likely++;
      results.push({id:d.id,ok:r.ok,changed:Boolean(r.changed),hint:r.payment_summary?.hint||null});
    }catch(e){failed++;results.push({id:d.id,ok:false,error:clean((e as Error)?.message||e,200)})}
  }
  return {ok:true,changed,skipped,failed,paid_at_purchase_likely:likely,results};
}
async function listFinancialAccounts(token:string){
  const out:any[]=[];
  for(let page=1;page<=10;page++){
    const r=await bg(token,"/contas-contabeis?pagina="+page+"&limite=100");
    if(!r.ok)return {ok:false,status:r.status,error:"financial_accounts_http_"+r.status,accounts:out};
    const rows=Array.isArray(r.data?.data)?r.data.data:[];
    for(const x of rows)out.push({id:Number(x?.id||0)||null,description:clean(x?.descricao||x?.nome||"",180)||("Conta "+String(x?.id||""))});
    if(rows.length<100)break;
  }
  return {ok:true,accounts:out.filter((x:any)=>x.id),count:out.filter((x:any)=>x.id).length};
}
async function paymentAccountConfig(token:string|null=null){
  const s=await sb.from("purchase_xml_settings").select("id,metadata,updated_at").eq("id",1).single();
  if(s.error)throw s.error;
  const meta=obj(s.data.metadata),mappings=obj(meta.payment_account_mappings);
  let accounts:any[]=[];
  if(token){
    const r=await listFinancialAccounts(token);
    if(r.ok)accounts=r.accounts;
  }
  return {ok:true,mappings,accounts,updated_at:s.data.updated_at};
}
async function savePaymentAccountConfig(body:any,userId:string|null){
  const allowed=["credit_card","debit_card","pix","cash","voucher","bank_transfer","other"],incoming=obj(body?.mappings);
  const s=await sb.from("purchase_xml_settings").select("id,metadata").eq("id",1).single();if(s.error)throw s.error;
  const token=await oauth(),remote=await listFinancialAccounts(token);
  if(!remote.ok)return {ok:false,status:remote.status||502,error:remote.error};
  const validIds=new Set((remote.accounts||[]).map((x:any)=>Number(x.id))),next:any={};
  for(const key of allowed){
    const raw=obj(incoming[key]),id=Number(raw?.bling_account_id||0);
    if(!id)continue;
    if(!validIds.has(id))return {ok:false,status:409,error:"financial_account_not_found",key,bling_account_id:id};
    const found=(remote.accounts||[]).find((x:any)=>Number(x.id)===id);
    next[key]={bling_account_id:id,description:clean(found?.description||raw?.description,180),updated_at:new Date().toISOString()};
  }
  const meta={...obj(s.data.metadata),payment_account_mappings:next,payment_account_mappings_updated_at:new Date().toISOString(),payment_account_mappings_updated_by:userId};
  const u=await sb.from("purchase_xml_settings").update({metadata:meta,updated_at:new Date().toISOString()}).eq("id",1).select("metadata,updated_at").single();
  if(u.error)throw u.error;
  await sb.from("bling_hub_audit_v2").insert({event_type:"purchase_payment_account_mapping_updated",severity:"info",domain:"finance",source_system:"vitrine_admin",details:{mappings:next,user_id:userId}});
  return {ok:true,mappings:next,accounts:remote.accounts,updated_at:u.data.updated_at};
}
async function paymentSettlementPreview(documentId:string){
  const q=await sb.from("purchase_xml_documents").select("*").eq("id",documentId).maybeSingle();
  if(q.error)throw q.error;if(!q.data)return {ok:false,status:404,error:"document_not_found"};
  const d:any=q.data,meta=obj(d.metadata),ps=obj(meta.payment_summary),payments=Array.isArray(meta.payments)?meta.payments:[];
  if(!ps.paid_at_purchase_likely)return {ok:true,ready:false,reason:"not_paid_at_purchase_likely",document_id:documentId};
  if(d.finance_status!=="posted"||!d.finance_reconciled_at)return {ok:true,ready:false,reason:"payable_not_reconciled",document_id:documentId};
  const refs=Array.isArray(d.finance_reference?.accounts)?d.finance_reference.accounts:[];
  const payableIds=[...new Set(refs.map((x:any)=>Number(x?.id||0)).filter(Boolean))];
  if(payableIds.length!==1)return {ok:true,ready:false,reason:"requires_single_payable",payable_count:payableIds.length,document_id:documentId};
  const codes=[...new Set(payments.map((x:any)=>clean(x?.code,2)).filter(Boolean))];
  const methods=[...new Set(payments.map((x:any)=>clean(x?.label,120)).filter(Boolean))];
  if(codes.length!==1)return {ok:true,ready:false,reason:"split_payment_requires_review",payment_methods:methods,document_id:documentId};
  const cfg=await paymentAccountConfig(null),guidance=clean(ps.guidance,40)||"other",mapping=obj(cfg.mappings?.[guidance]);
  const accountId=Number(mapping?.bling_account_id||0);
  if(!accountId)return {ok:true,ready:false,reason:"financial_account_mapping_missing",guidance,payment_methods:methods,document_id:documentId};
  const token=await oauth(),payable=await bg(token,"/contas/pagar/"+payableIds[0]);
  if(!payable.ok)return {ok:false,status:payable.status,error:"payable_detail_http_"+payable.status,document_id:documentId};
  const p:any=payable.data?.data||{},situation=Number(p?.situacao||0),saldo=Number(p?.saldo??p?.valor??0);
  if(situation===2||saldo<=0.005)return {ok:true,ready:false,reason:"already_settled",already_settled:true,payable_id:payableIds[0],situation,saldo,document_id:documentId};
  if(situation!==1&&situation!==3)return {ok:true,ready:false,reason:"payable_status_not_settleable",payable_id:payableIds[0],situation,saldo,document_id:documentId};
  const paymentTotal=Number(ps.payment_total||0),difference=Math.round((paymentTotal-saldo)*100)/100;
  if(!Number.isFinite(paymentTotal)||Math.abs(difference)>0.05)return {ok:true,ready:false,reason:"payment_and_payable_amount_mismatch",payment_total:paymentTotal,payable_balance:saldo,difference,document_id:documentId};
  const paymentDate=clean(payments[0]?.payment_date||day(d.issued_at),10);
  const payload={data:paymentDate,usarDataVencimento:false,portador:{id:accountId},historico:"Baixa de compra conforme pagamento informado na NF-e "+clean(meta.invoice_number,40),juros:0,desconto:0,acrescimo:0,valorRecebido:Math.round(saldo*100)/100};
  return {ok:true,ready:true,write_external:false,document_id:documentId,payable_id:payableIds[0],payment_method:methods[0]||null,guidance,financial_account:{id:accountId,description:mapping.description||null},payable:{situation,saldo,vencimento:p?.vencimento||null,valor:Number(p?.valor||0)},preview:payload};
}
async function executePaymentSettlement(documentId:string,userId:string|null){
  const preview=await paymentSettlementPreview(documentId);
  if(!preview.ok)return preview;
  if(!preview.ready)return {ok:false,status:409,error:"settlement_not_ready",preview};
  const token=await oauth(),payableId=Number(preview.payable_id||0);
  const check=await bg(token,"/contas/pagar/"+payableId);
  if(!check.ok)return {ok:false,status:check.status,error:"payable_recheck_http_"+check.status};
  const before:any=check.data?.data||{},situation=Number(before?.situacao||0),saldo=Number(before?.saldo??before?.valor??0);
  if(situation===2||saldo<=0.005){
    const dq=await sb.from("purchase_xml_documents").select("metadata").eq("id",documentId).maybeSingle();
    if(!dq.error&&dq.data){
      const meta={...obj(dq.data.metadata),settlement:{status:"already_settled",verified:true,payable_id:payableId,checked_at:new Date().toISOString()}};
      await sb.from("purchase_xml_documents").update({metadata:meta,updated_at:new Date().toISOString()}).eq("id",documentId);
    }
    return {ok:true,already_settled:true,verified:true,payable_id:payableId};
  }
  if(Math.abs(Number(preview.preview?.valorRecebido||0)-saldo)>0.05)return {ok:false,status:409,error:"payable_balance_changed",expected:preview.preview?.valorRecebido,current_balance:saldo};
  const w=await bw(token,"/contas/pagar/"+payableId+"/baixar","POST",preview.preview);
  if(!w.ok)return {ok:false,status:w.status,error:"payable_settlement_http_"+w.status,detail:w.error};
  await sleep(350);
  const after=await bg(token,"/contas/pagar/"+payableId);
  const ad:any=after.ok?(after.data?.data||{}):{},afterSituation=Number(ad?.situacao||0),afterSaldo=Number(ad?.saldo??0);
  const verified=after.ok&&(afterSituation===2||afterSaldo<=0.005),now=new Date().toISOString();
  const dq=await sb.from("purchase_xml_documents").select("metadata").eq("id",documentId).maybeSingle();
  if(dq.error)throw dq.error;
  const meta={...obj(dq.data?.metadata),settlement:{
    status:verified?"settled":"submitted_unverified",
    verified,payable_id:payableId,bordero_id:Number(w.data?.bordero?.id||0)||null,
    financial_account:preview.financial_account,payment_method:preview.payment_method,
    amount:Number(preview.preview?.valorRecebido||0),payment_date:preview.preview?.data||null,
    submitted_at:now,verified_at:verified?now:null,user_id:userId
  }};
  const u=await sb.from("purchase_xml_documents").update({metadata:meta,updated_at:now}).eq("id",documentId);
  if(u.error)throw u.error;
  await sb.from("bling_hub_audit_v2").insert({event_type:"purchase_payable_settled",severity:verified?"info":"warning",domain:"finance",source_system:"vitrine_admin",source_id:documentId,details:{payable_id:payableId,bordero_id:Number(w.data?.bordero?.id||0)||null,financial_account:preview.financial_account,payment_method:preview.payment_method,amount:preview.preview?.valorRecebido,payment_date:preview.preview?.data,verified,user_id:userId}});
  return {ok:true,verified,payable_id:payableId,bordero_id:Number(w.data?.bordero?.id||0)||null,after:{situation:afterSituation,saldo:afterSaldo},financial_account:preview.financial_account,amount:preview.preview?.valorRecebido,payment_date:preview.preview?.data};
}
async function companyDocument(token:string){
  const st=await sb.from("purchase_xml_settings").select("*").eq("id",1).single();
  if(st.error)throw st.error;
  let doc=digits(st.data.company_document);
  if(doc.length===14)return {doc,settings:st.data};
  const r=await bg(token,"/empresas/me/dados-basicos");
  if(r.ok){
    doc=digits(r.data?.data?.cnpj);
    if(doc.length===14)await sb.from("purchase_xml_settings").update({company_document:doc,updated_at:new Date().toISOString()}).eq("id",1);
  }
  return {doc,settings:st.data};
}
async function findContact(token:string,doc:string){
  if(![11,14].includes(doc.length))return null;
  const r=await bg(token,"/contatos?pagina=1&limite=20&criterio=1&numeroDocumento="+encodeURIComponent(doc));
  if(!r.ok)return null;
  const ids=(Array.isArray(r.data?.data)?r.data.data:[]).map((x:any)=>Number(x?.id||0)).filter(Boolean);
  for(const id of ids.slice(0,10)){const d=await bg(token,"/contatos/"+id);if(d.ok&&digits(d.data?.data?.numeroDocumento)===doc)return id}
  return null;
}
async function ensureContact(token:string,p:any){
  const doc=digits(p.supplier_document);
  let id=await findContact(token,doc);if(id)return {id,created:false};
  const a=p.supplier_address||{};
  const payload:any={nome:p.supplier_name||("Fornecedor "+doc),numeroDocumento:doc,tipo:doc.length===14?"J":"F",situacao:"A"};
  if(p.supplier_trade_name)payload.fantasia=p.supplier_trade_name;
  const geral:any={};
  if(a.street)geral.endereco=a.street;if(a.number)geral.numero=a.number;if(a.district)geral.bairro=a.district;if(a.city)geral.municipio=a.city;if(a.state)geral.uf=a.state;if(a.zip)geral.cep=a.zip;
  if(Object.keys(geral).length)payload.endereco={geral};
  const w=await bw(token,"/contatos","POST",payload);
  if(!w.ok)return {id:null,created:false,error:"contact_create_http_"+w.status,detail:w.error};
  id=Number(w.data?.data?.id||0)||null;
  return {id,created:Boolean(id)};
}
async function remoteProductByGtin(token:string,g:string){
  if(!validGtin(g))return null;
  const q=new URLSearchParams({pagina:"1",limite:"20"});q.append("gtins[]",g);
  const r=await bg(token,"/produtos?"+q.toString());if(!r.ok)return null;
  const exact=(Array.isArray(r.data?.data)?r.data.data:[]).filter((x:any)=>[x?.gtin,x?.gtinEmbalagem].map(digits).includes(g));
  if(exact.length>1)throw new Error("multiple_bling_gtin");
  return exact.length===1?exact[0]:null;
}
async function ensureProduct(token:string,p:any,item:any){
  const gs=[item.commercial_gtin,item.tax_gtin].map(digits).filter(validGtin);
  let local:any=null;
  if(gs.length){
    const q=await sb.from("products").select("id,bling_product_id,sku,name,gtin,ncm,cost,stock,unit,supplier,metadata,is_active").in("gtin",gs).limit(5);
    if(q.error)throw q.error;if((q.data||[]).length===1)local=q.data![0];
    if((q.data||[]).length>1)return {ok:false,review:"multiple_local_gtin",product:null,bling_id:null,created:false};
  }
  let remote:any=null;
  for(const g of gs){remote=await remoteProductByGtin(token,g);if(remote)break}
  if(!remote&&local?.bling_product_id){
    const d=await bg(token,"/produtos/"+Number(local.bling_product_id));
    if(!d.ok)return {ok:false,review:"existing_bling_product_http_"+d.status,product:null,bling_id:null,created:false};
    remote=d.data?.data||null;
  }
  if(local?.bling_product_id&&remote?.id&&Number(local.bling_product_id)!==Number(remote.id))return {ok:false,review:"bling_gtin_binding_conflict",product:null,bling_id:null,created:false};
  if(!local&&remote){
    const q=await sb.from("products").select("id,bling_product_id,sku,name,gtin,ncm,cost,stock,unit,supplier,metadata,is_active").eq("bling_product_id",Number(remote.id)).maybeSingle();
    if(q.error)throw q.error;local=q.data||null;
  }
  if(!local&&!gs.length)return {ok:false,review:"valid_gtin_required",product:null,bling_id:null,created:false};
  if(!remote&&gs.length){
    const g=gs[0];
    const payload:any={nome:item.description,codigo:g,tipo:"P",formato:"S",situacao:"A",unidade:preliminaryBaseUnit(item)||"UN",gtin:g};
    const w=await bw(token,"/produtos","POST",payload);
    if(w.ok){remote={id:Number(w.data?.data?.id||0),gtin:g,nome:item.description,codigo:g,unidade:payload.unidade}}
    else{remote=await remoteProductByGtin(token,g);if(!remote)return {ok:false,review:"bling_product_create_http_"+w.status,product:null,bling_id:null,created:false}}
  }
  const bid=Number(remote?.id||local?.bling_product_id||0)||null;
  if(!local){
    const g=gs[0];
    const ins=await sb.from("products").insert({bling_product_id:bid,sku:g,name:item.description,gtin:g,ncm:item.ncm||null,price:null,cost:null,stock:0,is_active:false,is_whatsapp_active:false,is_offer:false,supplier:p.supplier_name||null,unit:"UN",packaging:item.purchase_unit||null,source_system:"operational",sync_status:"local",desired_bling_status:"A",metadata:{purchase_xml_created:true,purchase_xml_document_key:p.document_key,new_product_review_required:true}}).select("id,bling_product_id,sku,name,gtin,ncm,cost,stock,unit,supplier,metadata,is_active").single();
    if(ins.error)throw ins.error;local=ins.data;
    if(bid)await sb.from("bling_hub_entity_links_v2").upsert({source_system:"canonical_ssbes",entity_type:"product",source_id:local.id,bling_id:bid,identity_kind:"gtin",identity_value:g,status:"matched",last_verified_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{method:"purchase_xml_gtin",verified:true}},{onConflict:"source_system,entity_type,source_id"});
    return {ok:true,product:local,bling_id:bid,created:true};
  }
  if(bid&&!local.bling_product_id)await sb.from("products").update({bling_product_id:bid,updated_at:new Date().toISOString()}).eq("id",local.id).is("bling_product_id",null);
  return {ok:true,product:local,bling_id:bid,created:false};
}
const PURCHASE_PACK_UNITS=new Set(["CX","FD","PCT","DP"]);
function isPurchasePackUnit(v:any){return PURCHASE_PACK_UNITS.has(unit(v))}
const BASE_UNIT_CODES=new Set(["UN","UND","UNID","PC","PCE","PCS","EA"]);
function isBaseUnitCode(v:any){return BASE_UNIT_CODES.has(unit(v))}
function suggestedPackFactor(description:any,purchaseUnit:any){
  const s=clean(description,600).toUpperCase().replace(/\s+/g," ");
  const pu=unit(purchaseUnit);
  let m=s.match(/\b(?:CX|FD|FT|FDO|FARDO|PCT|DP)\s*0*(\d{1,4})\s*X\s*\d+(?:[.,]\d+)?(?:\s*(?:KG|G|GR|L|ML))?\b/);
  if(m&&Number(m[1])>1)return {factor:Number(m[1]),source:"description_pack_count_x_size",evidence:m[0]};
  m=s.match(/\b(?:CX|FD|PCT|DP)\s*\/\s*0*(\d{2,4})\b/);
  if(m&&Number(m[1])>1)return {factor:Number(m[1]),source:"description_pack_slash",evidence:m[0]};
  m=s.match(/\b(\d{2,4})\s*(?:UN|UND|PC|PCS|FS)\s*X\s*0*1\s*(?:CX|FD|PCT|DP)\b/);
  if(m&&Number(m[1])>1)return {factor:Number(m[1]),source:"description_units_per_pack",evidence:m[0]};
  m=s.match(/\b(\d{2,4})\s*(?:PC|PCS|UN|UND|FS)\s*X\s*\d+(?:[.,]\d+)?\s*(?:G|GR|KG|ML|L)\b/);
  if(m&&Number(m[1])>1)return {factor:Number(m[1]),source:"description_piece_count",evidence:m[0]};
  m=s.match(/\b(\d{2,4})\s*X\s*\d+(?:[.,]\d+)?\s*(?:G|GR|KG|ML|L)\b/);
  if(m&&Number(m[1])>1&&(isPurchasePackUnit(pu)||/\b(?:CX|FD|PCT|DP)\b/.test(s)))return {factor:Number(m[1]),source:"description_leading_count",evidence:m[0]};
  return {factor:null,source:null,evidence:null};
}
function itemLooksPackaged(item:any){
  const suggestion=suggestedPackFactor(item?.description,item?.purchase_unit);
  return {packaged:isPurchasePackUnit(item?.purchase_unit)||Boolean(suggestion.factor),suggestion};
}

// PURCHASE_IDENTITY_V1
function inferredPurchaseGtinRole(item:any){
  const qc=Number(item?.purchase_quantity||0),qt=Number(item?.tax_quantity||0),ratio=qc>0&&qt>0?qt/qc:0;
  const pack=itemLooksPackaged(item);
  if(pack.packaged||ratio>1)return "package";
  const pu=unit(item?.purchase_unit),tu=unit(item?.tax_unit);
  if((pu&&isBaseUnitCode(pu))||(tu&&isBaseUnitCode(tu)))return "base_unit";
  return "unknown";
}
async function confirmedIdentifier(kind:string,value:any,supplierDocument=""){
  const v=kind==="supplier_code"?clean(value,120):digits(value);
  if(!v)return null;
  let q=sb.from("product_identifiers").select("id,product_id,identifier_value,identifier_kind,packaging_unit,conversion_factor,supplier_document,status,source,metadata").eq("identifier_kind",kind).eq("identifier_value",v).eq("status","confirmed");
  if(kind==="supplier_code")q=q.eq("supplier_document",digits(supplierDocument));
  const r=await q.limit(2);if(r.error)throw r.error;
  if((r.data||[]).length>1)throw new Error("identifier_conflict_"+kind);
  return r.data?.[0]||null;
}
async function canonicalProduct(id:any){
  if(!id)return null;
  const q=await sb.from("products").select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").eq("id",id).maybeSingle();
  if(q.error)throw q.error;return q.data||null;
}
async function ensureProductSafe(_token:string,p:any,item:any){
  const codes=[...new Set([item.commercial_gtin,item.tax_gtin].map(digits).filter(validGtin))];
  const role=inferredPurchaseGtinRole(item),supplierDoc=digits(p?.supplier_document);
  const hits:any[]=[];
  const kinds=role==="package"?["package_gtin"]:role==="base_unit"?["base_gtin"]:["base_gtin","package_gtin"];
  for(const kind of kinds){for(const g of codes){const h=await confirmedIdentifier(kind,g);if(h)hits.push(h)}}
  const productIds=[...new Set(hits.map(x=>String(x.product_id)))];
  if(productIds.length>1)return {ok:false,review:"identifier_conflict",product:null,bling_id:null,created:false,gtin_role:role};
  if(hits.length){
    const hit=hits[0],product=await canonicalProduct(hit.product_id);
    if(product)return {ok:true,product,bling_id:Number(product.bling_product_id||0)||null,created:false,gtin_role:hit.identifier_kind==="package_gtin"?"package":"base_unit",match_method:hit.identifier_kind==="package_gtin"?"package_gtin_confirmed":"base_gtin_confirmed",identifier:hit,conversion_factor:Number(hit.conversion_factor||0)||null};
  }
  if(supplierDoc&&clean(item.supplier_item_code,120)){
    const h=await confirmedIdentifier("supplier_code",item.supplier_item_code,supplierDoc);
    if(h){const product=await canonicalProduct(h.product_id);if(product)return {ok:true,product,bling_id:Number(product.bling_product_id||0)||null,created:false,gtin_role:role,match_method:"supplier_code_confirmed",identifier:h,conversion_factor:null}}
  }
  if(role!=="package"&&codes.length){
    const q=await sb.from("products").select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").in("gtin",codes).limit(3);
    if(q.error)throw q.error;
    if((q.data||[]).length===1){const product=q.data![0];return {ok:true,product,bling_id:Number(product.bling_product_id||0)||null,created:false,gtin_role:"base_unit",match_method:"legacy_gtin_exact",conversion_factor:null}}
    if((q.data||[]).length>1)return {ok:false,review:"multiple_local_gtin",product:null,bling_id:null,created:false,gtin_role:role};
  }
  return {ok:false,review:"identity_confirmation_required",product:null,bling_id:null,created:false,gtin_role:role,match_method:"identity_confirmation_required"};
}
async function persistConfirmedIdentifier(input:any){
  const kind=clean(input?.identifier_kind,40),value=kind==="supplier_code"?clean(input?.identifier_value,120):digits(input?.identifier_value),supplierDocument=kind==="supplier_code"?digits(input?.supplier_document):"";
  if(!value)return null;
  let q=sb.from("product_identifiers").select("*").eq("identifier_kind",kind).eq("identifier_value",value).eq("status","confirmed");
  if(kind==="supplier_code")q=q.eq("supplier_document",supplierDocument);
  const found=await q.limit(2);if(found.error)throw found.error;
  const existing=found.data?.[0];
  if(existing&&String(existing.product_id)!==String(input.product_id))throw new Error("identifier_already_linked");
  const row={product_id:input.product_id,identifier_value:value,identifier_kind:kind,packaging_unit:input.packaging_unit||null,conversion_factor:input.conversion_factor||null,supplier_document:supplierDocument,source:input.source||"purchase_identity_admin",confidence:1,status:"confirmed",metadata:input.metadata||{},updated_at:new Date().toISOString()};
  if(existing){const u=await sb.from("product_identifiers").update(row).eq("id",existing.id).select("*").single();if(u.error)throw u.error;return u.data}
  const ins=await sb.from("product_identifiers").insert(row).select("*").single();if(ins.error)throw ins.error;return ins.data;
}
async function searchPurchaseProducts(body:any){
  const term=clean(body?.query,160);if(term.length<2)return {ok:true,items:[]};
  const d=digits(term),seen=new Map<string,any>();
  if(d){
    const ex=await sb.from("products").select("id,name,gtin,sku,unit,packaging,cost,price,is_active,image_url,brand,category,subcategory").or(`gtin.eq.${d},sku.eq.${d}`).limit(8);
    if(!ex.error)for(const x of ex.data||[])seen.set(String(x.id),x);
    const ids=await sb.from("product_identifiers").select("product_id").eq("identifier_value",d).eq("status","confirmed").limit(12);
    if(!ids.error&&ids.data?.length){const pq=await sb.from("products").select("id,name,gtin,sku,unit,packaging,cost,price,is_active,image_url,brand,category,subcategory").in("id",ids.data.map((x:any)=>x.product_id));if(!pq.error)for(const x of pq.data||[])seen.set(String(x.id),x)}
  }
  const safe=term.replace(/[%_]/g,"");
  if(safe.length>=2){const nq=await sb.from("products").select("id,name,gtin,sku,unit,packaging,cost,price,is_active,image_url,brand,category,subcategory").ilike("name","%"+safe+"%").order("is_active",{ascending:false}).limit(12);if(!nq.error)for(const x of nq.data||[])seen.set(String(x.id),x)}
  return {ok:true,items:[...seen.values()].slice(0,12)};
}
async function resolvePurchaseItemIdentity(body:any,userId:string|null){
  const id=clean(body?.item_id,80);if(!/^[0-9a-f-]{36}$/i.test(id))return {ok:false,status:400,error:"invalid_item"};
  const q=await sb.from("purchase_xml_items").select("*,purchase_xml_documents(*)").eq("id",id).maybeSingle();if(q.error)throw q.error;if(!q.data)return {ok:false,status:404,error:"item_not_found"};
  const item:any=q.data,doc:any=item.purchase_xml_documents,role=clean(body?.gtin_role,30),createNew=body?.create_new===true;
  const catalogEvidenceOnly=body?.catalog_evidence_only===true;
  if(catalogEvidenceOnly){
    // New catalog identities must have a human-reviewed commercial unit name.
    // Do not fall back to supplier XML descriptions, including on direct API calls.
    if(createNew){
      const newName=clean(body?.proposed_name,300).trim();
      if(newName.length<3||/^(?:CX|CAIXA|FD|FDO|FAR|FARDO|PCT|PACOTE)\b/i.test(newName))
        return {ok:false,status:409,error:"xml_identity_commercial_unit_name_required"};
    }
    // R21: never perform multi-table catalog writes from this Edge function.
    // PostgreSQL owns the transaction and rejects race, fiscal, lot and stock effects.
    if(!userId||body?.confirmation!==(createNew?"CRIAR_INATIVO_XML":"VINCULAR_ITEM_XML"))
      return {ok:false,status:409,error:"xml_identity_confirmation_required"};
    if(!["commercial","tax"].includes(body?.gtin_source))
      return {ok:false,status:409,error:"xml_identity_gtin_source_required"};
    const rawFactor=body?.conversion_factor;
    if(typeof rawFactor!=="number"||!Number.isInteger(rawFactor)||
       rawFactor<1||rawFactor>100000)
      return {ok:false,status:409,error:"xml_identity_factor_invalid"};
    const r=await sb.rpc("purchase_xml_resolve_catalog_identity_v1",{
      p_item_id:id,p_product_id:createNew?null:body?.product_id||null,
      p_create_new:createNew,p_proposed_name:createNew?clean(body?.proposed_name,300):null,
      p_gtin_source:body.gtin_source,p_gtin_role:role,p_conversion_factor:rawFactor,
      p_actor_id:userId,p_confirmation:body.confirmation
    });
    if(r.error){
      const code=String(r.error.message||"").match(/xml_identity_[a-z_]+/);
      return {ok:false,status:code?409:503,
        error:code?code[0]:"xml_identity_service_unavailable"};
    }
    return r.data&&r.data.ok===true?r.data:
      {ok:false,status:503,error:"xml_identity_service_unavailable"};
  }
  if(!["base_unit","package"].includes(role))return {ok:false,status:409,error:"gtin_role_required"};
  let factor=Number(body?.conversion_factor??item.conversion_factor??0);if(!Number.isFinite(factor)||factor<1)factor=1;
  if(role==="package"&&factor<=1)return {ok:false,status:409,error:"packaging_factor_must_be_greater_than_one"};
  const proposedName=clean(body?.proposed_name,300)||clean(item.description,300),
    xmlGtin=catalogEvidenceOnly
      ?(validGtin(digits(item.commercial_gtin))?digits(item.commercial_gtin):digits(item.tax_gtin))
      :digits(item.commercial_gtin||item.tax_gtin);
  if(catalogEvidenceOnly){
    const purchaseUnit=unit(item.purchase_unit);
    const explicitFactor=Number(body?.conversion_factor);
    if(!validGtin(xmlGtin))return {ok:false,status:409,error:"xml_catalog_gtin_requires_manual_review"};
    if(["KG","G","LT","L","LTS","M","MT","TON"].includes(purchaseUnit))
      return {ok:false,status:409,error:"xml_catalog_weight_unit_requires_manual_review"};
    if(!Number.isInteger(explicitFactor)||explicitFactor<1||explicitFactor>100000)
      return {ok:false,status:409,error:"xml_catalog_conversion_factor_required"};
    if(["CX","FD","FAR","FARDO","CAIXA","FDO"].includes(purchaseUnit)&&role!=="package")
      return {ok:false,status:409,error:"xml_catalog_outer_pack_role_required"};
    if(role==="base_unit"&&explicitFactor!==1)
      return {ok:false,status:409,error:"xml_catalog_unit_factor_must_be_one"};
    const selectedId=clean(body?.product_id,80)||item.product_id||"";
    const existing=await sb.from("products").select("id").eq("gtin",xmlGtin).limit(4);
    if(existing.error)throw existing.error;
    if((existing.data||[]).some((x:any)=>createNew||String(x.id)!==String(selectedId)))
      return {ok:false,status:409,error:"xml_catalog_gtin_linked_to_another_product"};
    const identifiers=await sb.from("product_identifiers")
      .select("product_id").eq("identifier_value",xmlGtin).eq("status","confirmed").limit(6);
    if(identifiers.error)throw identifiers.error;
    if((identifiers.data||[]).some((x:any)=>createNew||String(x.product_id)!==String(selectedId)))
      return {ok:false,status:409,error:"xml_catalog_identifier_conflict"};
  }
  // A second click from the evidence-only catalog must not create another product.
  if(catalogEvidenceOnly&&item.product_id)
    return {ok:false,status:409,error:"xml_catalog_item_already_linked",product_id:item.product_id};
  let product:any=null,created=false;
  if(createNew){
    const sku="XML-"+String(item.id).replace(/-/g,"").slice(0,12).toUpperCase();
    const payload:any={sku,name:proposedName,ncm:catalogEvidenceOnly?null:(item.ncm||null),price:null,cost:null,stock:0,is_active:false,is_whatsapp_active:false,is_offer:false,supplier:doc?.supplier_name||null,unit:"UN",packaging:item.purchase_unit||null,source_system:"operational",sync_status:"local",desired_bling_status:"A",metadata:{purchase_xml_created:true,purchase_xml_document_key:doc?.document_key,
      new_product_review_required:true,identity_confirmed_at:new Date().toISOString(),
      ...(catalogEvidenceOnly?{fiscal_review_required:true,xml_ncm_candidate:item.ncm||null,xml_cest_candidate:item.cest||null}:{} )}};
    if(role==="base_unit"&&validGtin(xmlGtin))payload.gtin=xmlGtin;
    const ins=await sb.from("products").insert(payload).select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").single();if(ins.error)throw ins.error;product=ins.data;created=true;
  }else{
    product=await canonicalProduct(clean(body?.product_id,80)||item.product_id);if(!product)return {ok:false,status:404,error:"product_not_found"};
    const upd:any={last_admin_edit_at:new Date().toISOString(),last_admin_edit_by:userId,updated_at:new Date().toISOString()};
    // Linking an XML observation may not rename an existing sellable SKU.
    if(!catalogEvidenceOnly&&proposedName&&proposedName!==product.name)upd.name=proposedName;
    if(role==="package"&&product?.metadata?.purchase_xml_created===true&&digits(product.gtin)===xmlGtin)upd.gtin=null;
    if(Object.keys(upd).length>3){const pu=await sb.from("products").update(upd).eq("id",product.id).select("id,bling_product_id,sku,name,gtin,ncm,cost,price,stock,unit,packaging,supplier,metadata,is_active,image_url,brand,category,subcategory").single();if(pu.error)throw pu.error;product=pu.data}
  }
  if(validGtin(xmlGtin))await persistConfirmedIdentifier({product_id:product.id,identifier_value:xmlGtin,identifier_kind:role==="package"?"package_gtin":"base_gtin",packaging_unit:role==="package"?unit(item.purchase_unit):null,conversion_factor:role==="package"?factor:null,source:"purchase_identity_admin",metadata:{purchase_item_id:id,document_key:doc?.document_key}});
  if(clean(item.supplier_item_code,120)&&digits(doc?.supplier_document))await persistConfirmedIdentifier({product_id:product.id,identifier_value:item.supplier_item_code,identifier_kind:"supplier_code",supplier_document:doc.supplier_document,source:"purchase_identity_admin",metadata:{purchase_item_id:id,document_key:doc?.document_key}});
  const qty=Number(item.purchase_quantity||0),baseQty=qty*factor,meta=obj(item.metadata);let net=Number(meta.net_line_total);if(!Number.isFinite(net)||net<=0)net=Number(item.line_total);if((!Number.isFinite(net)||net<=0)&&Number.isFinite(Number(item.purchase_unit_price)))net=Number(item.purchase_unit_price)*qty;
  const baseCost=baseQty>0&&Number.isFinite(net)?net/baseQty:null,chain=factor>1?[{unit:unit(item.purchase_unit)||"EMB",contains:factor,next_unit:"UN"},{unit:"UN",quantity:1}]:[{unit:"UN",quantity:1}],now=new Date().toISOString();
  const matchMethod=created?"human_created_inactive":"human_confirmed_existing";
  const iu=await sb.from("purchase_xml_items").update({product_id:product.id,bling_product_id:product.bling_product_id||null,match_method:matchMethod,base_unit:"UN",conversion_status:factor>1?"known":"not_needed",conversion_factor:factor,conversion_chain:chain,converted_quantity:baseQty,base_unit_cost:baseCost,processing_status:"matched",metadata:{...meta,identity_state:"resolved",identity_reason:matchMethod,gtin_role:role,identity_confirmed_at:now,identity_confirmed_by:userId},updated_at:now}).eq("id",id);if(iu.error)throw iu.error;
  if(factor>1){const pr=await sb.from("product_supplier_packaging").upsert({product_id:product.id,supplier_document:digits(doc?.supplier_document)||"",supplier_bling_contact_id:doc?.supplier_bling_contact_id||null,supplier_item_code:clean(item.supplier_item_code,120)||"",purchase_unit:unit(item.purchase_unit),base_unit:"UN",conversion_factor:factor,conversion_chain:chain,confidence:1,status:"confirmed",source_document_key:doc?.document_key||null,metadata:{identity_confirmed_from_admin:true,confirmed_at:now},updated_at:now},{onConflict:"product_id,supplier_document,supplier_item_code,purchase_unit"});if(pr.error)throw pr.error}
  await sb.from("product_purchase_history").update({product_id:product.id,conversion_factor:factor,conversion_chain:chain,base_unit:"UN",base_quantity:baseQty,base_unit_cost:baseCost,metadata:{identity_confirmed_from_admin:true,confirmed_at:now}}).eq("purchase_item_id",id);
  await sb.from("bling_hub_audit_v2").insert({event_type:"purchase_product_identity_resolved",severity:"info",domain:"catalog",source_system:"vitrine_admin",source_id:id,details:{product_id:product.id,created,gtin_role:role,conversion_factor:factor,match_method:matchMethod,stock_unchanged:true,user_id:userId}});
  const readiness=await refreshDocumentReadiness(item.document_id);
  return {ok:true,item_id:id,product,created,match_method:matchMethod,gtin_role:role,conversion_factor:factor,stock_unchanged:true,...readiness};
}

async function conversionFor(product:any,p:any,item:any){
  const pu=unit(item.purchase_unit),tu=unit(item.tax_unit),catalog=unit(product?.unit);
  const qc=Number(item.purchase_quantity||0),qt=Number(item.tax_quantity||0),ratio=qc>0&&qt>0?qt/qc:0;
  const pack=itemLooksPackaged(item);
  if(pack.packaged){
    if(ratio>1&&ratio<=100000&&Math.abs(ratio-Math.round(ratio))<0.000001&&isBaseUnitCode(tu)){
      const f=Math.round(ratio);
      if(pack.suggestion.factor&&Number(pack.suggestion.factor)!==f){
        return {status:"review_required",factor:null,base_unit:"UN",chain:[],confidence:0,
          suggested_factor:Number(pack.suggestion.factor),suggestion_source:pack.suggestion.source,
          suggestion_evidence:pack.suggestion.evidence,conflict:{xml_ratio:f,tax_unit:tu,description_factor:Number(pack.suggestion.factor)}};
      }
      return {status:"inferred_xml",factor:f,base_unit:"UN",chain:[{unit:pu||"EMB",contains:f,next_unit:"UN"},{unit:"UN",quantity:1}],confidence:.99,suggested_factor:f,suggestion_source:"xml_qtrib_ratio_unit_safe"};
    }
    if(pack.suggestion.factor){
      const f=Number(pack.suggestion.factor);
      return {status:"inferred_xml",factor:f,base_unit:"UN",chain:[{unit:pu||"EMB",contains:f,next_unit:"UN"},{unit:"UN",quantity:1}],
        confidence:.97,suggested_factor:f,suggestion_source:pack.suggestion.source,suggestion_evidence:pack.suggestion.evidence};
    }
    let mq=sb.from("product_supplier_packaging").select("*").eq("product_id",product.id).eq("purchase_unit",pu).eq("status","confirmed");
    const supplierDoc=digits(p.supplier_document);
    mq=supplierDoc?mq.in("supplier_document",[supplierDoc,""]):mq.eq("supplier_document","");
    const q=await mq.order("confidence",{ascending:false}).limit(3);
    if(q.error)throw q.error;
    const m=(q.data||[]).find((x:any)=>Number(x?.conversion_factor)>1);
    if(m)return {status:"known",factor:Number(m.conversion_factor),base_unit:"UN",chain:m.conversion_chain||[],confidence:Number(m.confidence||1),suggested_factor:Number(m.conversion_factor),suggestion_source:"saved_supplier_packaging"};
    return {status:"review_required",factor:null,base_unit:"UN",chain:[],confidence:0,suggested_factor:pack.suggestion.factor,suggestion_source:pack.suggestion.source,suggestion_evidence:pack.suggestion.evidence};
  }
  if(ratio>=1&&ratio<=100000&&Math.abs(ratio-Math.round(ratio))<0.000001){
    const f=Math.round(ratio),base=preliminaryBaseUnit(item,catalog);
    if(f>1&&isBaseUnitCode(tu))return {status:"inferred_xml",factor:f,base_unit:"UN",chain:[{unit:pu||"EMB",contains:f,next_unit:"UN"},{unit:"UN",quantity:1}],confidence:.99,suggested_factor:f,suggestion_source:"xml_qtrib_ratio_unit_safe"};
    if(f===1&&(!tu||isBaseUnitCode(tu)||pu===tu))return {status:"not_needed",factor:1,base_unit:"UN",chain:[{unit:"UN",quantity:1}],confidence:1,suggested_factor:1,suggestion_source:"same_unit"};
  }
  if(pu&&tu&&pu===tu)return {status:"not_needed",factor:1,base_unit:"UN",chain:[{unit:"UN",quantity:1}],confidence:1,suggested_factor:1,suggestion_source:"same_unit"};
  return {status:"review_required",factor:null,base_unit:"UN",chain:[],confidence:0,suggested_factor:null,suggestion_source:null};
}
async function syncSupplierLink(token:string,blingProductId:number,supplierId:number,item:any,c:any){
  if(!blingProductId||!supplierId)return {ok:false,skipped:true};
  const q="/produtos/fornecedores?pagina=1&limite=100&idProduto="+blingProductId+"&idFornecedor="+supplierId;
  const r=await bg(token,q);const rows=r.ok&&Array.isArray(r.data?.data)?r.data.data:[];
  const existing=rows.find((x:any)=>Number(x?.produto?.id||0)===blingProductId&&Number(x?.fornecedor?.id||0)===supplierId);
  const payload:any={descricao:item.description,codigo:item.supplier_item_code||"",produto:{id:blingProductId},fornecedor:{id:supplierId},padrao:Boolean(existing?.padrao)};
  if(Number.isFinite(Number(c?.base_unit_cost))){payload.precoCompra=Number(c.base_unit_cost);payload.precoCusto=Number(c.base_unit_cost)}
  const w=existing?.id?await bw(token,"/produtos/fornecedores/"+Number(existing.id),"PUT",payload):await bw(token,"/produtos/fornecedores","POST",payload);
  return {ok:w.ok,status:w.status,id:Number(existing?.id||w.data?.data?.id||0)||null,error:w.ok?null:w.error};
}
async function evidence(p:any,item:any,productId:string){
  const ev={evidence_key:["purchase_xml",p.document_key,productId,item.item_number,item.ncm||"-",item.cest||"-"].join(":"),product_id:productId,evidence_type:"company_purchase_nfe_xml",source_name:"NF-e de compra",document_key:p.document_key,supplier_document:p.supplier_document||null,gtin:item.commercial_gtin||item.tax_gtin||null,ncm:item.ncm||null,cest:item.cest||null,origin_code:item.origin_code,cfop:item.cfop||null,tax_code:item.tax_code||null,fiscal_description:item.description,evidence_confidence:.97,observed_at:p.issued_at,evidence_payload:{source:"purchase_xml_v1",recipient_kind:p.recipient_kind,purchase_unit:item.purchase_unit,tax_unit:item.tax_unit,raw_xml_stored:true}};
  const q=await sb.from("product_fiscal_evidence").upsert(ev,{onConflict:"evidence_key"});if(q.error)throw q.error;
}
async function reconcilePayables(token:string,p:any,supplierId:number){
  if(p.recipient_kind!=="CNPJ")return {ok:true,complete:false,status:"blocked_personal",accounts:[],missing:[],reason:"cpf_never_financial"};
  if(!supplierId)return {ok:true,complete:false,status:"pending_company_match",accounts:[],missing:[],reason:"supplier_contact_missing"};
  const installments=(Array.isArray(p.installments)?p.installments:[]).map((x:any,i:number)=>({
    number:clean(x?.number||String(i+1),80)||String(i+1),
    due_date:day(x?.due_date||x?.vencimento||x?.data),
    amount:Number(x?.amount??x?.valor??0)
  })).filter((x:any)=>x.due_date&&Number.isFinite(x.amount)&&x.amount>0);
  if(!installments.length)return {ok:true,complete:false,status:"review",accounts:[],missing:[],reason:"installments_missing"};
  const installmentTotal=installments.reduce((a:number,x:any)=>a+x.amount,0);
  if(Number.isFinite(Number(p.total_amount))&&Math.abs(installmentTotal-Number(p.total_amount))>0.05){
    return {ok:true,complete:false,status:"review",accounts:[],missing:installments,reason:"installment_total_mismatch",installment_total:installmentTotal,invoice_total:Number(p.total_amount)};
  }
  const dates=installments.map((x:any)=>x.due_date).sort(),minDue=dates[0],maxDue=dates[dates.length-1];
  const q=new URLSearchParams({pagina:"1",limite:"100",dataVencimentoInicial:minDue,dataVencimentoFinal:maxDue,idContato:String(supplierId)});
  const existing=await bg(token,"/contas/pagar?"+q.toString());
  if(!existing.ok)return {ok:false,complete:false,status:"review",accounts:[],missing:installments,reason:"payable_reconcile_http_"+existing.status,detail:clean(existing.raw,800)};
  const rows=Array.isArray(existing.data?.data)?existing.data.data:[],used=new Set<number>(),accounts:any[]=[],missing:any[]=[],ambiguous:any[]=[];
  const invoiceNo=clean(p.invoice_number||"",60),keyTail=clean(String(p.document_key||"").slice(-12),20);
  for(let i=0;i<installments.length;i++){
    const x=installments[i],amountCents=Math.round(x.amount*100);
    const candidates=rows.map((r:any,idx:number)=>({r,idx})).filter((y:any)=>{
      if(used.has(y.idx))return false;
      const due=clean(y.r?.vencimento,20).slice(0,10),cents=Math.round(Number(y.r?.valor||0)*100);
      return due===x.due_date&&cents===amountCents;
    });
    const docCandidates=candidates.filter((y:any)=>{
      const n=clean(y.r?.numeroDocumento,160);
      return Boolean(n&&((invoiceNo&&n.includes(invoiceNo))||(keyTail&&n.includes(keyTail))));
    });
    const pool=docCandidates.length?docCandidates:candidates;
    if(pool.length===1){
      const y=pool[0];used.add(y.idx);
      accounts.push({id:Number(y.r?.id||0)||null,number:clean(y.r?.numeroDocumento,160)||null,due_date:x.due_date,amount:x.amount,situation:y.r?.situacao??null,existing:true});
    }else if(pool.length>1){
      ambiguous.push({installment:x,candidate_ids:pool.map((y:any)=>Number(y.r?.id||0)).filter(Boolean)});
    }else missing.push(x);
  }
  const complete=accounts.length===installments.length&&missing.length===0&&ambiguous.length===0;
  return {ok:true,complete,status:complete?"posted":"review",accounts,missing,ambiguous,installment_total:installmentTotal,rows_scanned:rows.length,reason:complete?"reconciled_existing":"payables_missing_or_ambiguous"};
}
async function createPayables(token:string,p:any,supplierId:number,blingNfeId:number|null,allowWrite=true){
  if(p.recipient_kind!=="CNPJ")return {status:"blocked_personal",accounts:[],reason:"cpf_never_financial",method:"none"};
  if(!supplierId)return {status:"pending_company_match",accounts:[],reason:"supplier_contact_missing",method:"none"};
  const pre=await reconcilePayables(token,p,supplierId);
  if(!pre.ok)return {status:"review",accounts:pre.accounts||[],reason:pre.reason||"payable_reconcile_failed",detail:pre.detail||null,method:"reconcile",reconciliation:pre};
  if(pre.complete)return {status:"posted",accounts:pre.accounts,reason:"reconciled_existing",method:"reconcile_existing",reconciled:true,reconciliation:pre};
  if(!allowWrite)return {status:"review",accounts:pre.accounts||[],reason:pre.reason||"payables_missing_in_bling",method:"reconcile_only",reconciled:false,reconciliation:pre};
  if(!blingNfeId)return {status:"review",accounts:pre.accounts||[],reason:"bling_nfe_id_missing_for_native_payables",method:"native_nfe",reconciled:false,reconciliation:pre};
  const launch=await bw(token,"/nfe/"+Number(blingNfeId)+"/lancar-contas","POST");
  if(launch.ok){
    let post:any=pre;
    try{await new Promise(r=>setTimeout(r,350));post=await reconcilePayables(token,p,supplierId)}catch{}
    return {status:"posted",accounts:post?.accounts||[],reason:"native_nfe_accounts_launched",method:"bling_nfe_lancar_contas",native_http_status:launch.status,reconciled:Boolean(post?.complete),reconciliation:post};
  }
  let after:any=pre;
  try{after=await reconcilePayables(token,p,supplierId)}catch{}
  if(after?.complete)return {status:"posted",accounts:after.accounts||[],reason:"native_launch_error_but_reconciled",method:"reconcile_existing",native_http_status:launch.status,reconciled:true,reconciliation:after};
  return {status:"review",accounts:after?.accounts||pre.accounts||[],reason:"nfe_lancar_contas_http_"+launch.status,detail:launch.error||"Bling recusou o lançamento das contas da NF-e.",method:"bling_nfe_lancar_contas",native_http_status:launch.status,reconciled:false,reconciliation:after};
}
function financeDocPayload(d:any){
  const meta=obj(d?.metadata),installments=Array.isArray(meta.installments)?meta.installments:[];
  return {recipient_kind:d?.recipient_kind,total_amount:Number(d?.total_amount||0),document_key:clean(d?.document_key,60),invoice_number:clean(meta.invoice_number,60),issued_at:d?.issued_at,installments};
}
async function financeAttention(documentId:string,d:any,finance:any){
  try{
    const key="purchase_finance:"+documentId,now=new Date().toISOString();
    if((finance?.status==="posted"&&finance?.reconciled===true)||finance?.status==="blocked_personal"||finance?.status==="not_applicable"){
      const q=await sb.from("ops_attention").select("id,status").eq("idempotency_key",key).maybeSingle();
      if(!q.error&&q.data?.id&&["open","acknowledged"].includes(q.data.status)){
        await sb.from("ops_attention").update({status:"resolved",resolved_at:now,updated_at:now,resolution:"Financeiro conciliado com o Bling.",resolution_ref:clean(finance?.method||finance?.reason,180)}).eq("id",q.data.id);
      }
      return;
    }
    if(d?.financial_eligible!==true)return;
    const total=Number(d?.total_amount||0),p=financeDocPayload(d),due=(p.installments.map((x:any)=>day(x?.due_date)).filter(Boolean).sort()[0]||"");
    const priority=total>=5000?"high":"normal";
    const row:any={opened_at:now,updated_at:now,type:"purchase_finance",entity_type:"purchase_xml_document",entity_id:documentId,priority,owner_role:"owner",status:"open",summary:"Financeiro da NF-e não sincronizado: "+clean(d?.supplier_name||"Fornecedor",120)+" · R$ "+total.toFixed(2),recommended_action:"Abra Compras e XML, reconcilie com o Bling e, se continuar ausente, use “Lançar contas no Bling”.",evidence:{document_key:d?.document_key,bling_nfe_id:d?.bling_nfe_id,supplier_name:d?.supplier_name,total_amount:total,finance_status:finance?.status,reason:finance?.reason,detail:finance?.detail||null,method:finance?.method||null,attempt_count:Number(d?.finance_attempt_count||0)},source_system:"purchase_xml_v1",idempotency_key:key,due_at:due?due+"T23:59:59-04:00":null,resolved_at:null,resolution:null,resolution_ref:null};
    const ex=await sb.from("ops_attention").select("id").eq("idempotency_key",key).maybeSingle();
    if(ex.error)throw ex.error;
    if(ex.data?.id)await sb.from("ops_attention").update(row).eq("id",ex.data.id);
    else await sb.from("ops_attention").insert(row);
  }catch(e){console.error("purchase_finance_attention",clean((e as Error)?.message||e,500))}
}
async function syncFinanceDocument(documentId:string,opts:any={}){
  const q=await sb.from("purchase_xml_documents").select("*").eq("id",documentId).maybeSingle();
  if(q.error)throw q.error;if(!q.data)return {ok:false,status:404,error:"document_not_found"};
  const d:any=q.data,p=financeDocPayload(d),allowWrite=opts?.allowWrite===true,token=opts?.token||await oauth();
  let finance:any;
  if(d.recipient_kind==="CPF")finance={status:"blocked_personal",accounts:[],reason:"cpf_never_financial",method:"none",reconciled:true};
  else if(d.financial_eligible!==true)finance={status:"not_applicable",accounts:[],reason:"not_financially_eligible",method:"none",reconciled:true};
  else finance=await createPayables(token,p,Number(d.supplier_bling_contact_id||0),Number(d.bling_nfe_id||0)||null,allowWrite);
  const now=new Date().toISOString(),attempts=Number(d.finance_attempt_count||0)+(allowWrite?1:0);
  const upd:any={finance_status:finance.status,finance_reference:finance,finance_last_attempt_at:now,finance_last_error:finance.status==="review"||finance.status==="pending_company_match"?clean(finance.detail||finance.reason,1000):null,finance_method:clean(finance.method,120)||null,finance_attempt_count:attempts,updated_at:now};
  if(finance.status==="posted"&&!d.finance_posted_at)upd.finance_posted_at=now;
  if(finance.reconciled===true)upd.finance_reconciled_at=now;
  const u=await sb.from("purchase_xml_documents").update(upd).eq("id",documentId).select("*").single();if(u.error)throw u.error;
  await financeAttention(documentId,u.data,finance);
  await sb.from("bling_hub_audit_v2").insert({event_type:finance.status==="posted"?"purchase_finance_synced":"purchase_finance_attention",severity:finance.status==="posted"?"info":"warning",domain:"finance",source_system:clean(opts?.source,80)||"purchase_xml_v1",source_id:documentId,details:{document_key:d.document_key,bling_nfe_id:d.bling_nfe_id,financial_eligible:d.financial_eligible,finance_status:finance.status,reason:finance.reason,method:finance.method,write_attempted:allowWrite,attempt_count:attempts,reconciled:Boolean(finance.reconciled),accounts:Array.isArray(finance.accounts)?finance.accounts:[]}});  
  return {ok:true,document_id:documentId,finance,document:u.data};
}
async function reconcilePendingFinance(limit=50){
  const q=await sb.from("purchase_xml_documents").select("id").eq("financial_eligible",true).or("finance_status.neq.posted,finance_reconciled_at.is.null").order("issued_at",{ascending:false}).limit(Math.max(1,Math.min(100,Number(limit||50))));
  if(q.error)throw q.error;const token=await oauth(),results:any[]=[];
  for(const row of q.data||[]){
    try{const r=await syncFinanceDocument(row.id,{allowWrite:false,source:"purchase_finance_reconcile_batch",token});results.push({id:row.id,ok:true,status:r.finance?.status,reason:r.finance?.reason})}
    catch(e){results.push({id:row.id,ok:false,error:clean((e as Error)?.message||e,300)})}
  }
  return {ok:true,write_external:false,count:results.length,results};
}
// Every XML item must survive even when its identity is not known.
function stagedReviewItem(documentId:string,item:any,status:"review_required"|"failed",reason:string){
  return {
    document_id:documentId,item_number:item.item_number,
    supplier_item_code:item.supplier_item_code,description:item.description,
    commercial_gtin:item.commercial_gtin,tax_gtin:item.tax_gtin,
    ncm:item.ncm,cest:item.cest,cfop:item.cfop,tax_code:item.tax_code,origin_code:item.origin_code,
    purchase_unit:item.purchase_unit,purchase_quantity:item.purchase_quantity,
    purchase_unit_price:item.purchase_unit_price,line_total:item.line_total,
    base_unit:unit(item.tax_unit||item.purchase_unit)||"UN",
    conversion_status:"review_required",processing_status:status,
    match_method:status==="failed"?"processing_failed":reason,
    metadata:{reason,identity_state:"unresolved",identity_reason:reason,
      gtin_role:inferredPurchaseGtinRole(item),net_line_total:item.net_line_total,
      item_discount:item.item_discount,item_freight:item.item_freight,
      item_insurance:item.item_insurance,item_other:item.item_other,
      tax_unit:item.tax_unit,tax_quantity:item.tax_quantity,
      lot_traces:Array.isArray(item.lot_traces)?item.lot_traces:[]}
  };
}
async function processXml(token:string,xml:string,source:string,runId:string|null,sourceId:string|null=null,blingId:number|null=null,detailSupplement:any=null){
  // Reject oversize inputs before even parsing the operational XML tree.
  assertCatalogXmlSize(xml);
  const p:any=parseXml(xml);
  if(!p.installments.length&&Array.isArray(detailSupplement?.parcelas))p.installments=detailSupplement.parcelas.map((x:any,i:number)=>({number:String(i+1),due_date:day(x?.data||x?.vencimento),amount:num(x?.valor)})).filter((x:any)=>x.due_date&&Number(x.amount)>0);if(p.document_key.length!==44)throw new Error("invalid_nfe_access_key");
  if(p.cstat&&![100,150].includes(p.cstat))throw new Error("nfe_not_authorized_"+p.cstat);
  // Validate source identity, SEFAZ protocol and byte limit BEFORE Bling, storage,
  // contact, product or financial writes. Existing purchase flow follows unchanged.
  assertCatalogXmlIntegrity(xml,p.document_key);
  const hash=await sha256(xml);
  const ex=await sb.from("purchase_xml_documents").select("id,processing_status,financial_eligible,finance_status,bling_nfe_id,content_sha256,metadata").eq("document_key",p.document_key).maybeSingle();
  if(ex.error)throw ex.error;
  if(ex.data?.id&&(["processed","duplicate"].includes(ex.data.processing_status)||ex.data.metadata?.catalog_only===true)){
    assertExistingXmlDigest(ex.data.content_sha256,hash);
    if(blingId&&!ex.data.bling_nfe_id)await sb.from("purchase_xml_documents").update({bling_nfe_id:blingId,updated_at:new Date().toISOString()}).eq("id",ex.data.id);
    let financeStatus=ex.data.finance_status;
    if(ex.data.financial_eligible===true&&financeStatus!=="posted"){
      try{const rr=await syncFinanceDocument(ex.data.id,{allowWrite:false,source:"purchase_duplicate_reconcile",token});financeStatus=rr.finance?.status||financeStatus}catch{}
    }
    return {duplicate:true,document_id:ex.data.id,items:p.items.length,matched:0,review:0,finance_status:financeStatus};
  }
  const co=await companyDocument(token);const company=co.doc,settings=co.settings;
  const eligible=p.recipient_kind==="CNPJ"&&company.length===14&&p.recipient_document===company;
  const y=day(p.issued_at)||new Date().toISOString().slice(0,10),parts=y.split("-");
  const storagePath=[parts[0],parts[1],p.document_key+".xml"].join("/");
  const upf=await sb.storage.from("purchase-xml").upload(storagePath,new Blob([xml],{type:"application/xml"}),{upsert:true,contentType:"application/xml"});
  if(upf.error)throw new Error("xml_storage_failed:"+upf.error.message);
  const contact=await ensureContact(token,p);
  const docUp=await sb.from("purchase_xml_documents").upsert({import_run_id:runId,source,source_document_id:sourceId,bling_nfe_id:blingId,document_key:p.document_key,content_sha256:hash,storage_path:storagePath,issued_at:p.issued_at,supplier_document:p.supplier_document,supplier_name:p.supplier_name,supplier_bling_contact_id:contact.id||null,recipient_document:p.recipient_document,recipient_kind:p.recipient_kind,financial_eligible:eligible,finance_status:p.recipient_kind==="CPF"?"blocked_personal":eligible?"eligible":p.recipient_kind==="CNPJ"&&!company?"pending_company_match":"not_applicable",receipt_status:"not_received",processing_status:"processing",total_amount:p.total_amount,item_count:p.items.length,metadata:{invoice_number:p.invoice_number,series:p.series,company_document:company||null,contact_created:Boolean(contact.created),installments:p.installments,payments:p.payments||[],payment_summary:p.payment_summary||{},source_mode:source},updated_at:new Date().toISOString()},{onConflict:"document_key"}).select("id").single();
  if(docUp.error)throw docUp.error;const documentId=docUp.data.id;
  // Event-driven cataloging: no scheduler, no product/cost/stock writes.
  // A malformed external XML cannot block existing purchase/finance processing.
  try{
    await persistXmlCatalogEvidence(documentId,p.document_key,xml,hash);
    await resolveXmlCatalogFailure(documentId);
  }catch(e){
    await recordXmlCatalogFailure(documentId,e);
    console.warn("xml_catalog_observation_deferred",clean((e as Error)?.message||e,160));
  }
  let matched=0,review=0,created=0;
  for(const item of p.items){
    try{
      const ep=await ensureProductSafe(token,p,item);
      if(!ep.ok||!ep.product){
        review++;
        const saved=await sb.from("purchase_xml_items").upsert(
          stagedReviewItem(documentId,item,"review_required",ep.review||"identity_confirmation_required"),
          {onConflict:"document_id,item_number"});
        if(saved.error)throw new Error("xml_staging_failed:"+saved.error.message);
        continue;
      }
      const conv:any=await conversionFor(ep.product,p,item);
      const bq=conv.factor?Number(item.purchase_quantity||0)*Number(conv.factor):null;
      const buc=bq&&bq>0&&Number.isFinite(Number(item.net_line_total))?Number(item.net_line_total)/bq:(conv.factor&&Number.isFinite(Number(item.purchase_unit_price))?Number(item.purchase_unit_price)/Number(conv.factor):null);
      const st=conv.status==="review_required"?"review_required":"matched";
      const it=await sb.from("purchase_xml_items").upsert({document_id:documentId,item_number:item.item_number,supplier_item_code:item.supplier_item_code,description:item.description,commercial_gtin:item.commercial_gtin,tax_gtin:item.tax_gtin,ncm:item.ncm,cest:item.cest,cfop:item.cfop,tax_code:item.tax_code,origin_code:item.origin_code,purchase_unit:item.purchase_unit,purchase_quantity:item.purchase_quantity,purchase_unit_price:item.purchase_unit_price,line_total:item.line_total,base_unit:conv.base_unit,conversion_status:conv.status,conversion_factor:conv.factor,conversion_chain:conv.chain,converted_quantity:bq,base_unit_cost:buc,product_id:ep.product.id,bling_product_id:ep.bling_id,match_method:ep.match_method||"gtin_exact",processing_status:st,metadata:{conversion_confidence:conv.confidence,new_product:false,identity_state:"resolved",identity_reason:ep.match_method||"gtin_exact",gtin_role:ep.gtin_role||inferredPurchaseGtinRole(item),net_line_total:item.net_line_total,item_discount:item.item_discount,item_freight:item.item_freight,item_insurance:item.item_insurance,item_other:item.item_other,lot_traces:Array.isArray(item.lot_traces)?item.lot_traces:[],tax_unit:item.tax_unit||null,tax_quantity:item.tax_quantity??null,conversion_suggestion_source:conv.suggestion_source||null,conversion_suggestion_evidence:conv.suggestion_evidence||null,conversion_conflict:conv.conflict||null}},{onConflict:"document_id,item_number"}).select("id").single();
      if(it.error)throw it.error;
      if(Array.isArray(item.lot_traces)&&item.lot_traces.length){
        const traceTotal=item.lot_traces.reduce((sum:number,x:any)=>sum+Number(x?.quantity||0),0);
        const traceMatches=Math.abs(traceTotal-Number(item.purchase_quantity||0))<=0.0001;
        const del=await sb.from("purchase_xml_item_lot_evidence").delete().eq("purchase_item_id",it.data.id);
        if(del.error)throw del.error;
        const rows=item.lot_traces.map((x:any)=>({
          purchase_item_id:it.data.id,
          trace_index:Number(x?.trace_index||1),
          lot_code:clean(x?.lot_code,120)||null,
          manufacture_date:day(x?.manufacture_date)||null,
          expiration_date:day(x?.expiration_date)||null,
          xml_quantity:Number.isFinite(Number(x?.quantity))?Number(x.quantity):null,
          base_quantity:conv.factor&&Number.isFinite(Number(x?.quantity))?Number(x.quantity)*Number(conv.factor):null,
          conversion_factor:conv.factor||null,
          status:conv.status!=="review_required"&&traceMatches&&day(x?.expiration_date)?"ready":"review_required",
          source:"nfe_rastro",
          metadata:{trace_quantity_matches_purchase:traceMatches,aggregation_code:clean(x?.aggregation_code,120)||null,document_key:p.document_key}
        }));
        const ins=await sb.from("purchase_xml_item_lot_evidence").insert(rows);
        if(ins.error)throw ins.error;
      }
      await evidence(p,item,ep.product.id);
      if(conv.factor){
        const pack=await sb.from("product_supplier_packaging").upsert({product_id:ep.product.id,supplier_document:digits(p.supplier_document)||"",supplier_bling_contact_id:contact.id||null,supplier_item_code:clean(item.supplier_item_code,120)||"",purchase_unit:unit(item.purchase_unit)||conv.base_unit,base_unit:conv.base_unit,conversion_factor:conv.factor,conversion_chain:conv.chain,confidence:conv.confidence,status:conv.status==="inferred_xml"?"inferred_xml":"confirmed",source_document_key:p.document_key,updated_at:new Date().toISOString()},{onConflict:"product_id,supplier_document,supplier_item_code,purchase_unit"});
        if(pack.error)throw pack.error;
      }
      const ph=await sb.from("product_purchase_history").upsert({document_id:documentId,purchase_item_id:it.data.id,product_id:ep.product.id,document_key:p.document_key,issued_at:p.issued_at,supplier_document:p.supplier_document,supplier_name:p.supplier_name,supplier_bling_contact_id:contact.id||null,original_unit:item.purchase_unit,original_quantity:item.purchase_quantity,conversion_factor:conv.factor,conversion_chain:conv.chain,base_unit:conv.base_unit,base_quantity:bq,line_total:item.line_total,purchase_unit_cost:item.purchase_unit_price,base_unit_cost:buc,source,metadata:{invoice_number:p.invoice_number}},{onConflict:"purchase_item_id"});if(ph.error)throw ph.error;
      const meta={...obj(ep.product.metadata),last_purchase_xml_at:p.issued_at||new Date().toISOString(),last_purchase_document_key:p.document_key,last_purchase_supplier:p.supplier_name||null,last_purchase_unit:item.purchase_unit||null,last_purchase_conversion_factor:conv.factor||null,purchase_catalog_review_required:true,purchase_catalog_review_item_id:it.data.id};
      const upd:any={supplier:p.supplier_name||ep.product.supplier||null,metadata:meta,updated_at:new Date().toISOString()};
      // XML tax codes are fiscal evidence, not permission to overwrite catalog NCM.
      const pu=await sb.from("products").update(upd).eq("id",ep.product.id);if(pu.error)throw pu.error;
      matched++;if(ep.created)created++;if(conv.status==="review_required")review++;
    }catch(e){
      review++;
      const reason=clean((e as Error)?.message||e,500);
      const saved=await sb.from("purchase_xml_items").upsert(
        stagedReviewItem(documentId,item,"failed",reason),
        {onConflict:"document_id,item_number"});
      if(saved.error)throw new Error("xml_item_persist_failed:"+saved.error.message);
    }
  }
  let finance:any={status:p.recipient_kind==="CPF"?"blocked_personal":eligible?"eligible":p.recipient_kind==="CNPJ"&&!company?"pending_company_match":"not_applicable",accounts:[]};
  if(p.recipient_kind==="CPF")finance={status:"blocked_personal",accounts:[],reason:"cpf_never_financial",method:"none",reconciled:true};
  else if(eligible&&settings.auto_create_payables!==false){
    const fr=await syncFinanceDocument(documentId,{allowWrite:true,source:"purchase_xml_auto",token});
    finance=fr.finance;
  }else if(eligible)finance={status:"eligible",accounts:[],reason:"automatic_payables_disabled",method:"none"};
  const finalStatus=review?"review_required":"processed";
  const dfin=await sb.from("purchase_xml_documents").update({matched_item_count:matched,review_item_count:review,processing_status:finalStatus,finance_status:finance.status,finance_reference:finance,receipt_status:matched&&review===0?"ready":"review",processed_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:review?String(review)+" item(ns) requer(em) revisão":null}).eq("id",documentId);if(dfin.error)throw dfin.error;
  await sb.from("bling_hub_audit_v2").insert({event_type:"purchase_xml_processed",severity:review?"warning":"info",domain:"fiscal",source_system:"canonical",source_id:documentId,details:{document_key:p.document_key,source,recipient_kind:p.recipient_kind,financial_eligible:eligible,finance_status:finance.status,items:p.items.length,matched,review,new_products:created,raw_xml_stored:true,make_used:false}});
  return {duplicate:false,document_id:documentId,items:p.items.length,matched,review,new_products:created,finance_status:finance.status};
}

async function linkedXml(urlRaw:any){
  const url=clean(urlRaw,3000);
  if(!/^https?:\/\//i.test(url))return {ok:false,status:0,xml:""};
  try{
    const r=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(30000)});
    const raw=await r.text();
    if(!r.ok)return {ok:false,status:r.status,xml:""};
    if(/<(?:\w+:)?(?:nfeProc|NFe)\b/i.test(raw))return {ok:true,status:r.status,xml:raw};
    return {ok:false,status:502,xml:""};
  }catch{return {ok:false,status:0,xml:""}}
}
async function blingXml(token:string,key:string){
  const r=await bg(token,"/nfe/documento/"+encodeURIComponent(key)+"?formato=xml");
  if(!r.ok)return {ok:false,status:r.status,xml:""};
  const d=Array.isArray(r.data?.data)?r.data.data.find((x:any)=>x?.conteudo):null;
  if(!d?.conteudo)return {ok:false,status:502,xml:""};
  try{return {ok:true,status:r.status,xml:await unzipBase64(String(d.conteudo))}}catch{return {ok:false,status:502,xml:""}}
}
function cuiabaDate(offset=0){
  const d=new Date(Date.now()+offset*86400000),p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d),m:any={};for(const x of p)m[x.type]=x.value;return m.year+"-"+m.month+"-"+m.day;
}
function isoDayFromUtc(d:Date){return d.toISOString().slice(0,10)}
function validIsoDay(v:any){
  const x=clean(v,20);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return "";
  const d=new Date(x+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&isoDayFromUtc(d)===x?x:"";
}
function monthRange(offsetMonths=0){
  const now=cuiabaDate(0),[y,m]=now.split("-").map(Number);
  const first=new Date(Date.UTC(y,m-1+offsetMonths,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));
  return {start:isoDayFromUtc(first),end:isoDayFromUtc(last)};
}
function purchaseWindow(input:any=null,fallbackDays=90){
  const cfg=obj(input),preset=clean(cfg?.period||cfg?.preset,30).toLowerCase();
  let start="",end="",label="",key=preset||"";
  if(preset==="this_month"){const r=monthRange(0);start=r.start;end=r.end;label="Este mês";}
  else if(preset==="last_month"){const r=monthRange(-1);start=r.start;end=r.end;label="Mês passado";}
  else if(["days_90","days_120","days_180"].includes(preset)){
    const days=Number(preset.replace("days_",""));start=cuiabaDate(-(days-1));end=cuiabaDate(0);label="Últimos "+days+" dias";
  }else if(preset==="custom"){
    start=validIsoDay(cfg?.start_date);end=validIsoDay(cfg?.end_date);
    if(!start||!end||start>end)throw new Error("invalid_date_range");
    const span=Math.floor((Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000)+1;
    if(span>365)throw new Error("date_range_over_365_days");
    label=start+" a "+end;
  }else{
    const requested=Number(cfg?.lookback_days??input),days=Math.max(1,Math.min(365,Number.isFinite(requested)&&requested>0?requested:fallbackDays));
    start=cuiabaDate(-(days-1));end=cuiabaDate(0);label="Últimos "+days+" dias";key="days_"+days;
  }
  const spanDays=Math.floor((Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000)+1;
  if(spanDays<1||spanDays>365)throw new Error("invalid_date_range");
  return {period:key||"custom",label,start,end,span_days:spanDays};
}

async function purchaseXmlProbe(){
  const token=await oauth();
  const company=await companyDocument(token);
  const probes:any={};
  for(const [key,path] of [
    ["company","/empresas/me/dados-basicos"],
    ["nfe","/nfe?pagina=1&limite=1&tipo=0"],
    ["product_suppliers","/produtos/fornecedores?pagina=1&limite=1"],
    ["payables","/contas/pagar?pagina=1&limite=1&situacao=1"]
  ]){
    const r=await bg(token,path);
    probes[key]={ok:r.ok,http_status:r.status,scope_missing:r.status===403};
  }
  return {ok:Object.values(probes).every((x:any)=>x.ok===true),readonly:true,company_document_resolved:company.doc.length===14,probes};
}
async function purchaseXmlPreviewLatest(){
  const token=await oauth(),company=await companyDocument(token);
  const q=new URLSearchParams({tipo:"0",pagina:"1",limite:"10"});
  const ls=await bg(token,"/nfe?"+q.toString());
  if(!ls.ok)return {ok:false,status:ls.status,error:"bling_nfe_list_http_"+ls.status,readonly:true};
  const out:any[]=[];
  for(const row of (Array.isArray(ls.data?.data)?ls.data.data:[]).slice(0,5)){
    let key=digits(row?.chaveAcesso),bid=Number(row?.id||0)||null;
    if(key.length!==44&&bid){const d=await bg(token,"/nfe/"+bid);if(d.ok)key=digits(d.data?.data?.chaveAcesso)}
    if(key.length!==44){out.push({bling_nfe_id:bid,error:"missing_access_key"});continue}
    const x=await blingXml(token,key);if(!x.ok){
      if(bid){
        const det=await bg(token,"/nfe/"+bid);
        if(det.ok){
          const d=det.data?.data||{},sample=Array.isArray(d?.itens)?d.itens.slice(0,5):[];
          const linked=await linkedXml(d?.xml);
          if(linked.ok){const px:any=parseXml(linked.xml);out.push({bling_nfe_id:bid,key_suffix:key.slice(-10),source_mode:"detail_xml_url",recipient_kind:px.recipient_kind,recipient_matches_company:company.doc.length===14&&px.recipient_document===company.doc,total_amount:px.total_amount,items:px.items.slice(0,10).map((it:any)=>({description:it.description,gtin:it.commercial_gtin||it.tax_gtin,purchase_unit:it.purchase_unit,purchase_quantity:it.purchase_quantity,tax_unit:it.tax_unit,tax_quantity:it.tax_quantity,inferred_factor:Number(it.purchase_quantity)>0&&Number(it.tax_quantity)>0?Number(it.tax_quantity)/Number(it.purchase_quantity):null,purchase_unit_price:it.purchase_unit_price}))});continue}
          out.push({bling_nfe_id:bid,key_suffix:key.slice(-10),source_mode:"registered_detail",xml_http_status:x.status,detail_keys:Object.keys(d).sort(),xml_info:{present:Boolean(d?.xml),length:String(d?.xml||"").length,looks_xml:/^\s*</.test(String(d?.xml||"")),looks_url:/^https?:\/\//i.test(String(d?.xml||""))},contact:{id:d?.contato?.id||null,nome:d?.contato?.nome||null,numeroDocumento:d?.contato?.numeroDocumento||d?.contato?.cpfCnpj||null},parcelas:(Array.isArray(d?.parcelas)?d.parcelas.slice(0,8):[]).map((x:any)=>({keys:Object.keys(x||{}).sort(),data:x?.data||x?.vencimento||null,valor:x?.valor??null,numero:x?.numero||null})),items:sample.map((it:any)=>({keys:Object.keys(it||{}).sort(),codigo:it?.codigo||null,descricao:it?.descricao||null,gtin:it?.gtin||null,unidade:it?.unidade||null,unidadeTributavel:it?.unidadeTributavel||null,quantidade:it?.quantidade??null,valor:it?.valor??it?.valorUnitario??null,valorTotal:it?.valorTotal??null,classificacaoFiscal:it?.classificacaoFiscal||null,cest:it?.cest||null,cfop:it?.cfop||null}))});continue;
        }
      }
      out.push({bling_nfe_id:bid,key_suffix:key.slice(-10),error:"xml_http_"+x.status});continue
    }
    const p:any=parseXml(x.xml);
    out.push({
      bling_nfe_id:bid,key_suffix:p.document_key.slice(-10),issued_at:p.issued_at,
      supplier_name:p.supplier_name,recipient_kind:p.recipient_kind,
      recipient_matches_company:company.doc.length===14&&p.recipient_document===company.doc,
      total_amount:p.total_amount,
      items:p.items.slice(0,30).map((it:any)=>{
        const qc=Number(it.purchase_quantity||0),qt=Number(it.tax_quantity||0),ratio=qc>0&&qt>0?qt/qc:null;
        return {description:it.description,gtin:it.commercial_gtin||it.tax_gtin,purchase_unit:it.purchase_unit,purchase_quantity:qc,tax_unit:it.tax_unit,tax_quantity:qt,inferred_factor:ratio&&ratio>=1?ratio:null,purchase_unit_price:it.purchase_unit_price};
      })
    });
  }
  return {ok:true,readonly:true,company_document_resolved:company.doc.length===14,documents:out};
}

async function closeStalePurchaseRuns(){
  const cutoff=new Date(Date.now()-5*60*1000).toISOString(),now=new Date().toISOString();
  const q=await sb.from("purchase_xml_import_runs").select("id,source,started_at").eq("status","running").lt("started_at",cutoff).limit(100);
  if(q.error)throw q.error;
  const ids=(q.data||[]).map((x:any)=>x.id);
  if(ids.length){
    const u=await sb.from("purchase_xml_import_runs").update({
      status:"failed",
      finished_at:now,
      metadata:{stale_closed:true,reason:"execucao_interrompida_ou_timeout",closed_at:now},
      updated_at:now
    }).in("id",ids);
    if(u.error)throw u.error;
    await sb.from("bling_hub_audit_v2").insert({
      event_type:"purchase_xml_stale_runs_closed",
      severity:"warning",
      domain:"fiscal",
      source_system:"purchase_xml_v1",
      details:{count:ids.length,run_ids:ids}
    });
  }

  const dq=await sb.from("purchase_xml_documents")
    .select("id,item_count")
    .eq("processing_status","processing")
    .lt("updated_at",cutoff)
    .limit(100);
  if(dq.error)throw dq.error;
  let repaired=0;
  for(const d of dq.data||[]){
    const iq=await sb.from("purchase_xml_items")
      .select("id,product_id,processing_status,conversion_status,converted_quantity")
      .eq("document_id",d.id);
    if(iq.error)continue;
    const rows=iq.data||[],matched=rows.filter((x:any)=>Boolean(x.product_id)).length;
    const pending=rows.filter((x:any)=>!x.product_id||["review_required","failed","pending"].includes(String(x.processing_status||""))||x.conversion_status==="review_required"||Number(x.converted_quantity||0)<=0).length;
    const noItems=rows.length===0;
    const update:any={
      matched_item_count:matched,
      review_item_count:noItems?Number(d.item_count||0):pending,
      processing_status:noItems?"failed":pending?"review_required":"processed",
      receipt_status:noItems||pending?"review":"ready",
      last_error:noItems?"processamento_interrompido_sem_itens":pending?String(pending)+" item(ns) requer(em) revisão":null,
      updated_at:now
    };
    const u=await sb.from("purchase_xml_documents").update(update).eq("id",d.id);
    if(!u.error)repaired++;
  }
  if(repaired){
    await sb.from("bling_hub_audit_v2").insert({
      event_type:"purchase_xml_stale_documents_repaired",
      severity:"warning",
      domain:"fiscal",
      source_system:"purchase_xml_v1",
      details:{count:repaired}
    });
  }
  return {runs_closed:ids.length,documents_repaired:repaired};
}
async function runBlingSync(source="bling_daily",windowInput:any=null){
  await closeStalePurchaseRuns();
  const token=await oauth(),settings=await sb.from("purchase_xml_settings").select("*").eq("id",1).single();if(settings.error)throw settings.error;
  // R2: reading incoming XML must never create products, supplier links or payables.
  // The only import operation is catalog evidence; the user decides changes later.
  const run=await sb.from("purchase_xml_import_runs").insert({source,status:"running",metadata:{mode:"catalog_only",writes_products:false,writes_stock:false,writes_finance:false}}).select("id").single();if(run.error)throw run.error;
  const fallback=source==="bling_daily"?Number(settings.data.daily_lookback_days||3):90,window=purchaseWindow(windowInput,fallback);
  const id=run.data.id,start=window.start,end=window.end,look=window.span_days;
  let seen=0,processed=0,dup=0,failed=0,items=0,matched=0,review=0;
  try{
    for(let page=1;page<=20;page++){
      const q=new URLSearchParams({tipo:"0",pagina:String(page),limite:"100",dataEmissaoInicial:start+" 00:00:00",dataEmissaoFinal:end+" 23:59:59"});
      const ls=await bg(token,"/nfe?"+q.toString());if(!ls.ok)throw new Error("bling_nfe_list_http_"+ls.status);
      const rows=Array.isArray(ls.data?.data)?ls.data.data:[];seen+=rows.length;
      for(const row of rows){
        try{
          let key=digits(row?.chaveAcesso);const bid=Number(row?.id||0)||null;
          if(key.length!==44&&bid){const d=await bg(token,"/nfe/"+bid);if(d.ok)key=digits(d.data?.data?.chaveAcesso)}
          if(key.length!==44){failed++;continue}
          let x=await blingXml(token,key),detail:any=null;
          if(bid){
            const det=await bg(token,"/nfe/"+bid);
            if(det.ok){detail=det.data?.data||null;if(!x.ok)x=await linkedXml(detail?.xml)}
          }
          if(!x.ok){failed++;continue}
          const catalog=await manualCatalogOnlyImport([{name:"bling-nfe-"+key+".xml",xml:x.xml}],{source,runId:id});
          const result=catalog.results?.[0];
          if(!result?.ok)throw new Error(result?.error||"bling_catalog_import_failed");
          // Attach the Bling source reference only; no product/finance/stock mutations.
          if(bid&&result.document_id){
            const linked=await sb.from("purchase_xml_documents").update({
              bling_nfe_id:bid,updated_at:new Date().toISOString()
            }).eq("id",result.document_id).is("bling_nfe_id",null);
            if(linked.error)throw linked.error;
          }
          const rr={items:result.items||0,matched:0,review:result.items||0,duplicate:result.duplicate===true};
          items+=rr.items||0;matched+=rr.matched||0;review+=rr.review||0;if(rr.duplicate)dup++;else processed++;
        }catch{failed++}
      }
      if(rows.length<100)break;
    }
    const status=failed||review?"completed_with_review":"completed";
    await sb.from("purchase_xml_import_runs").update({status,finished_at:new Date().toISOString(),documents_seen:seen,documents_processed:processed,documents_duplicate:dup,documents_failed:failed,items_seen:items,items_matched:matched,items_review:review,metadata:{start,end,period:window.period,label:window.label,span_days:window.span_days},updated_at:new Date().toISOString()}).eq("id",id);
    return {ok:true,run_id:id,status,window,lookback_days:look,source_scope:"bling_imported_entry_nfe",sefaz_received_queue_exposed_by_public_api:false,documents_seen:seen,processed,duplicates:dup,failed,items,matched,review};
  }catch(e){
    await sb.from("purchase_xml_import_runs").update({status:"failed",finished_at:new Date().toISOString(),documents_seen:seen,documents_processed:processed,documents_duplicate:dup,documents_failed:failed+1,items_seen:items,items_matched:matched,items_review:review,metadata:{start,end,period:window.period,label:window.label,span_days:window.span_days,error:clean((e as Error)?.message||e,500)},updated_at:new Date().toISOString()}).eq("id",id);
    throw e;
  }
}
async function manualImport(files:any[]){
  await closeStalePurchaseRuns();
  if(!Array.isArray(files)||!files.length)return {ok:false,status:400,error:"xml_files_required"};
  if(files.length>100)return {ok:false,status:400,error:"max_100_files"};
  const token=await oauth(),source=files.length>1?"bulk_xml":"manual_xml";
  const run=await sb.from("purchase_xml_import_runs").insert({source,status:"running"}).select("id").single();if(run.error)throw run.error;
  let processed=0,dup=0,failed=0,items=0,matched=0,review=0;const results:any[]=[];
  for(const f of files){
    try{
      let xml=clean(f?.xml,12*1024*1024);
      if(!xml&&f?.content_base64)xml=new TextDecoder().decode(b64bytes(String(f.content_base64)));
      if(!/<(?:\w+:)?NFe\b|<(?:\w+:)?nfeProc\b/i.test(xml))throw new Error("invalid_xml");
      const rr=await processXml(token,xml,source,run.data.id,clean(f?.name,180)||null,null);
      items+=rr.items||0;matched+=rr.matched||0;review+=rr.review||0;if(rr.duplicate)dup++;else processed++;
      results.push({name:clean(f?.name,180),ok:true,...rr});
    }catch(e){failed++;results.push({name:clean(f?.name,180),ok:false,error:clean((e as Error)?.message||e,300)})}
  }
  const status=failed||review?"completed_with_review":"completed";
  await sb.from("purchase_xml_import_runs").update({status,finished_at:new Date().toISOString(),documents_seen:files.length,documents_processed:processed,documents_duplicate:dup,documents_failed:failed,items_seen:items,items_matched:matched,items_review:review,updated_at:new Date().toISOString()}).eq("id",run.data.id);
  return {ok:true,status,run_id:run.data.id,processed,duplicates:dup,failed,items,matched,review,results};
}
async function browseBlingNfe(windowInput:any=null){
  const window=purchaseWindow(windowInput,90),token=await oauth(),out:any[]=[];
  let truncated=false;
  for(let page=1;page<=20;page++){
    const q=new URLSearchParams({tipo:"0",pagina:String(page),limite:"100",dataEmissaoInicial:window.start+" 00:00:00",dataEmissaoFinal:window.end+" 23:59:59"});
    const r=await bg(token,"/nfe?"+q.toString());
    if(!r.ok)throw new Error("bling_nfe_list_http_"+r.status);
    const rows=Array.isArray(r.data?.data)?r.data.data:[];
    for(const x of rows)out.push({
      bling_nfe_id:Number(x?.id||0)||null,
      number:clean(x?.numero||x?.numeroNota||"",40)||null,
      issued_at:clean(x?.dataEmissao||x?.dataOperacao||x?.data||"",50)||null,
      contact_name:clean(x?.contato?.nome||x?.fornecedor?.nome||x?.nome||"",180)||null,
      contact_document:digits(x?.contato?.numeroDocumento||x?.contato?.cpfCnpj||x?.fornecedor?.numeroDocumento||"")||null,
      total_amount:num(x?.valorNota??x?.valor??x?.total??x?.valorTotal),
      status:clean(x?.situacao?.nome||x?.situacao||x?.status||"",100)||null,
      access_key:digits(x?.chaveAcesso||"")||null
    });
    if(rows.length<100)break;
    if(page===20)truncated=true;
  }
  return {ok:true,readonly:true,window,count:out.length,truncated,documents:out,source_scope:"bling_imported_entry_nfe",sefaz_received_queue_exposed_by_public_api:false};
}
async function backfillLotEvidence(limitRaw:any=100){
  const limit=Math.max(1,Math.min(500,Number(limitRaw||100)||100));
  const docs=await sb.from("purchase_xml_documents")
    .select("id,document_key,storage_path")
    .not("storage_path","is",null)
    .order("issued_at",{ascending:false})
    .limit(limit);
  if(docs.error)throw docs.error;
  let documents=0,items=0,traces=0,failed=0;const results:any[]=[];
  for(const d of docs.data||[]){
    try{
      const existing=await sb.from("purchase_xml_items")
        .select("id,item_number,purchase_quantity,conversion_factor,conversion_status")
        .eq("document_id",d.id);
      if(existing.error)throw existing.error;
      const byNo=new Map((existing.data||[]).map((x:any)=>[Number(x.item_number),x]));
      const dl=await sb.storage.from("purchase-xml").download(d.storage_path);
      if(dl.error)throw new Error("xml_download_failed:"+clean(dl.error.message,300));
      const parsed:any=parseXml(await dl.data.text());
      let docTraces=0;
      for(const item of parsed.items||[]){
        const stored:any=byNo.get(Number(item.item_number));if(!stored?.id)continue;
        const list=Array.isArray(item.lot_traces)?item.lot_traces:[];
        if(!list.length)continue;
        items++;
        const factor=Number(stored.conversion_factor||0);
        const traceTotal=list.reduce((sum:number,x:any)=>sum+Number(x?.quantity||0),0);
        const traceMatches=Math.abs(traceTotal-Number(stored.purchase_quantity||0))<=0.0001;
        const del=await sb.from("purchase_xml_item_lot_evidence").delete().eq("purchase_item_id",stored.id);
        if(del.error)throw del.error;
        const rows=list.map((x:any)=>({
          purchase_item_id:stored.id,trace_index:Number(x?.trace_index||1),
          lot_code:clean(x?.lot_code,120)||null,
          manufacture_date:day(x?.manufacture_date)||null,
          expiration_date:day(x?.expiration_date)||null,
          xml_quantity:Number.isFinite(Number(x?.quantity))?Number(x.quantity):null,
          base_quantity:factor>0&&Number.isFinite(Number(x?.quantity))?Number(x.quantity)*factor:null,
          conversion_factor:factor>0?factor:null,
          status:stored.conversion_status!=="review_required"&&factor>0&&traceMatches&&day(x?.expiration_date)?"ready":"review_required",
          source:"nfe_rastro",
          metadata:{trace_quantity_matches_purchase:traceMatches,aggregation_code:clean(x?.aggregation_code,120)||null,document_key:d.document_key,backfilled:true}
        }));
        const ins=await sb.from("purchase_xml_item_lot_evidence").insert(rows);
        if(ins.error)throw ins.error;
        traces+=rows.length;docTraces+=rows.length;
      }
      documents++;results.push({document_id:d.id,document_key:d.document_key,traces:docTraces,ok:true});
    }catch(e){failed++;results.push({document_id:d.id,ok:false,error:clean((e as Error)?.message||e,300)})}
  }
  return {ok:true,write_scope:"lot_evidence_only",documents,items,traces,failed,results};
}

async function summary(windowInput:any=null){
  const stale_cleanup=await closeStalePurchaseRuns();
  const window=purchaseWindow(windowInput,90);
  const docsQ=sb.from("purchase_xml_documents")
    .select("id,document_key,bling_nfe_id,issued_at,supplier_name,recipient_kind,financial_eligible,finance_status,finance_reference,finance_attempt_count,finance_last_attempt_at,finance_last_error,finance_posted_at,finance_reconciled_at,finance_method,receipt_status,processing_status,total_amount,item_count,matched_item_count,review_item_count,metadata,created_at")
    .gte("issued_at",window.start+"T00:00:00")
    .lte("issued_at",window.end+"T23:59:59.999")
    .order("issued_at",{ascending:false})
    .limit(500);
  const [docs,runs,items,settings]=await Promise.all([
    docsQ,
    sb.from("purchase_xml_import_runs").select("*").order("created_at",{ascending:false}).limit(8),
    sb.from("purchase_xml_items").select("id,document_id,item_number,description,purchase_unit,purchase_quantity,purchase_unit_price,base_unit,conversion_status,conversion_factor,converted_quantity,base_unit_cost,product_id,processing_status,metadata").in("processing_status",["review_required","failed"]).order("created_at",{ascending:false}).limit(100),
    sb.from("purchase_xml_settings").select("*").eq("id",1).single()
  ]);
  if(docs.error)throw docs.error;if(runs.error)throw runs.error;if(items.error)throw items.error;if(settings.error)throw settings.error;
  return {ok:true,filter:window,documents:docs.data||[],runs:runs.data||[],review_items:items.data||[],settings:settings.data,stale_runs_closed:Number(stale_cleanup?.runs_closed||0),stale_documents_repaired:Number(stale_cleanup?.documents_repaired||0),integration:{manual_max_range_days:365,daily_lookback_days:Number(settings.data?.daily_lookback_days||3),source_scope:"bling_imported_entry_nfe",sefaz_received_queue_exposed_by_public_api:false,received_notes_url:"https://www.bling.com.br/notas.entrada.php#list",manifestation_automated:false,stock_receipt_requires_human_confirmation:true}};
}

async function receiptLotPlanStatus(documentId:string){
  const iq=await sb.from("purchase_xml_items")
    .select("id,document_id,product_id,description,converted_quantity,conversion_factor,purchase_quantity,purchase_unit,inventory_lot_id,lot_expiration_date")
    .eq("document_id",documentId).order("item_number");
  if(iq.error)throw iq.error;
  const items=iq.data||[];
  const lotIds=[...new Set(items.map((x:any)=>x.inventory_lot_id).filter(Boolean))];
  const lq=lotIds.length
    ?await sb.from("product_inventory_lots").select("id,product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,created_at,metadata").in("id",lotIds)
    :{data:[],error:null};
  if(lq.error)throw lq.error;
  const lotMap=new Map((lq.data||[]).map((x:any)=>[String(x.id),x]));
  const detail=items.map((it:any)=>{
    const expected=Number(it.converted_quantity||0);
    const lot=it.inventory_lot_id?lotMap.get(String(it.inventory_lot_id))||null:null;
    const valid=Boolean(it.product_id&&expected>0&&it.inventory_lot_id&&lot);
    return {
      item_id:it.id,product_id:it.product_id||null,description:it.description||"",
      expected_base_quantity:expected,planned_base_quantity:expected,
      inventory_lot_id:it.inventory_lot_id||null,
      expiration_date:day(it.lot_expiration_date||lot?.expiration_date)||null,
      expiration_optional:true,inventory_lot:lot,valid
    };
  });
  return {
    complete:detail.length>0&&detail.every((x:any)=>x.valid),
    item_count:detail.length,
    ready_count:detail.filter((x:any)=>x.valid).length,
    pending_count:detail.filter((x:any)=>!x.valid).length,
    expiration_required:false,items:detail
  };
}

async function saveReceiptLotPlan(body:any,userId:string|null){
  const documentId=clean(body?.document_id||body?.id,80);
  if(!/^[0-9a-f-]{36}$/i.test(documentId))return {ok:false,status:400,error:"invalid_document"};
  const requested=Array.isArray(body?.items)?body.items:[];
  const iq=await sb.from("purchase_xml_items")
    .select("id,document_id,product_id,converted_quantity,inventory_lot_id,lot_expiration_date")
    .eq("document_id",documentId).order("item_number");
  if(iq.error)throw iq.error;
  const items=iq.data||[];
  if(!items.length)return {ok:false,status:404,error:"document_without_items"};
  const byId=new Map(items.map((x:any)=>[String(x.id),x]));
  if(requested.length!==items.length)return {ok:false,status:409,error:"all_receipt_items_required"};
  for(const entry of requested){
    const item=byId.get(String(entry?.item_id||""));
    if(!item)return {ok:false,status:409,error:"invalid_receipt_item"};
    const raw=clean(entry?.expiration_date??entry?.lots?.[0]?.expiration_date??"",20);
    const exp=raw?day(raw):"";
    if(raw&&!exp)return {ok:false,status:409,error:"invalid_expiration_date",item_id:item.id};
    const up=await sb.from("purchase_xml_items")
      .update({lot_expiration_date:exp||null,updated_at:new Date().toISOString()})
      .eq("id",item.id);
    if(up.error)throw up.error;
  }
  const status=await receiptLotPlanStatus(documentId);
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"purchase_receipt_lot_validity_saved",severity:"info",domain:"stock",source_system:"canonical",source_id:documentId,
    details:{item_count:status.item_count,ready_count:status.ready_count,pending_count:status.pending_count,complete:status.complete,expiration_required:false,user_id:userId||null,stock_changed:false}
  });
  return {ok:true,document_id:documentId,lot_plan:status,stock_changed:false,expiration_required:false};
}

async function materializeReceiptLots(documentId:string,userId:string|null){
  const q=await sb.rpc("activate_purchase_xml_inventory_lots_v1",{p_document_id:documentId,p_user_id:userId});
  if(q.error)throw q.error;
  const result=q.data||{};
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"purchase_receipt_internal_lots_activated",severity:"info",domain:"stock",source_system:"canonical",source_id:documentId,
    details:{active_lots:Number(result?.active_lots||0),items_touched:Number(result?.items_touched||0),user_id:userId||null,physical_stock_changed:false,local_product_stock_mutated:false}
  });
  return {
    ok:result?.ok!==false,
    materialized_lots:Number(result?.active_lots||0),
    items_touched:Number(result?.items_touched||0),
    physical_stock_changed:false,
    local_product_stock_mutated:false,
    lot_tracking_complete_changed:false
  };
}

async function docDetail(id:string){
  let [d,it,plan]=await Promise.all([
    sb.from("purchase_xml_documents").select("*").eq("id",id).maybeSingle(),
    sb.from("purchase_xml_items").select("*,products(id,name,gtin,bling_product_id,cost,price,stock,unit,is_active,category,subcategory,packaging,metadata)").eq("document_id",id).order("item_number"),
    sb.from("purchase_stock_receipt_plans_v1").select("id,status,stock_authority,deposit_id,expected_items,baseline_snapshot,verification_snapshot,lot_evidence_summary,verified_at,review_reason,created_at,updated_at").eq("document_id",id).maybeSingle()
  ]);
  if(d.error)throw d.error;if(it.error)throw it.error;if(plan.error)throw plan.error;if(!d.data)return {ok:false,status:404,error:"document_not_found"};
  const meta=obj(d.data.metadata);
  if(!meta.payment_summary||!Object.keys(obj(meta.payment_summary)).length){
    try{const er=await enrichPaymentMetadata(id,d.data);if(er?.changed){d=await sb.from("purchase_xml_documents").select("*").eq("id",id).maybeSingle()}}catch{}
  }
  const itemIds=(it.data||[]).map((x:any)=>x.id);
  const productIds=[...new Set((it.data||[]).map((x:any)=>x.product_id).filter(Boolean))];
  const entryLotIds=[...new Set((it.data||[]).map((x:any)=>x.inventory_lot_id).filter(Boolean))];
  const [lotQ,currentLotQ,entryLotQ]=await Promise.all([
    itemIds.length?sb.from("purchase_xml_item_lot_evidence").select("*").in("purchase_item_id",itemIds).order("purchase_item_id").order("trace_index"):Promise.resolve({data:[],error:null}),
    productIds.length?sb.from("product_inventory_lots").select("id,product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,created_at,metadata").in("product_id",productIds).in("status",["active","expired","depleted"]):Promise.resolve({data:[],error:null}),
    entryLotIds.length?sb.from("product_inventory_lots").select("id,product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,created_at,metadata").in("id",entryLotIds):Promise.resolve({data:[],error:null})
  ]);
  if(lotQ.error)throw lotQ.error;if(currentLotQ.error)throw currentLotQ.error;if(entryLotQ.error)throw entryLotQ.error;
  const lotMap=new Map<string,any[]>(),currentLotMap=new Map<string,any[]>(),entryLotMap=new Map<string,any>();
  for(const lot of lotQ.data||[]){const k=String(lot.purchase_item_id);if(!lotMap.has(k))lotMap.set(k,[]);lotMap.get(k)!.push(lot)}
  for(const lot of currentLotQ.data||[]){const k=String(lot.product_id);if(!currentLotMap.has(k))currentLotMap.set(k,[]);currentLotMap.get(k)!.push(lot)}
  for(const lot of entryLotQ.data||[])entryLotMap.set(String(lot.id),lot)
  const items=(it.data||[]).map((x:any)=>{
    const prod=Array.isArray(x.products)?x.products[0]:x.products;
    const pack=itemLooksPackaged(x);
    const currentFactor=Number(x.conversion_factor||0);
    const proposedFactor=pack.packaged?(currentFactor>1?currentFactor:(pack.suggestion.factor||null)):(currentFactor>0?currentFactor:1);
    const qty=Number(x.purchase_quantity||0);
    const meta=obj(x.metadata);
    let net=Number(meta.net_line_total);
    if(!Number.isFinite(net)||net<=0)net=Number(x.line_total);
    if((!Number.isFinite(net)||net<=0)&&Number.isFinite(Number(x.purchase_unit_price)))net=Number(x.purchase_unit_price)*qty;
    const baseQty=proposedFactor&&qty>0?qty*Number(proposedFactor):null;
    const proposedCost=baseQty&&baseQty>0&&Number.isFinite(net)?net/baseQty:null;
    const suggestedSale=proposedCost!==null?Math.round(proposedCost*1.40*100)/100:null;
    return {...x,products:prod||null,lot_evidence:lotMap.get(String(x.id))||[],entry_inventory_lot:entryLotMap.get(String(x.inventory_lot_id))||null,current_inventory_lots:currentLotMap.get(String(x.product_id))||[],pricing_preview:{
      markup_percent:40,
      current_cost:prod?.cost==null?null:Number(prod.cost),
      current_sale_price:prod?.price==null?null:Number(prod.price),
      suggested_conversion_factor:proposedFactor,
      conversion_suggestion_source:currentFactor>1?"stored_conversion":pack.suggestion.source,
      conversion_suggestion_evidence:currentFactor>1?null:pack.suggestion.evidence,
      requires_conversion_confirmation:Boolean(pack.packaged&&currentFactor<=1),
      proposed_unit_cost:proposedCost,
      suggested_sale_price:suggestedSale,
      proposed_base_quantity:baseQty,
      base_unit:"UN",
      can_apply:Boolean(x.product_id&&proposedCost!==null&&(!pack.packaged||Number(proposedFactor)>1))
    }};
  });
  const receiptLotPlan=await receiptLotPlanStatus(id);
  return {ok:true,document:d.data,items,receipt_plan:plan.data||null,receipt_lot_plan:receiptLotPlan,pricing_policy:{default_markup_percent:40,sale_unit:"UN",catalog_updates_require_human_approval:true,stock_receipt_separate:true,stock_authority:"bling",receipt_requires_bling_verification:true,receipt_internal_lot_required:true,receipt_expiration_optional:true,lot_number_required:false,lot_allocation_policy:"fifo"}};
}

// Read-only reporting and on-demand, idempotent re-reading of original private XMLs.
// Never calls Bling, never changes products, prices, NCM master or stock.
// Used by both new purchases and historical re-reads; extracts evidence only.
// Record a non-blocking catalog error so no NF-e is silently dropped from review.
async function recordXmlCatalogFailure(documentId:string,error:unknown){
  const details=clean((error as Error)?.message||String(error)||"catalog_processing_failed",400)||"catalog_processing_failed";
  const at=new Date().toISOString();
  const audit=await sb.from("purchase_xml_catalog_ingest_errors_v1").upsert({
    document_id:documentId,error_code:"xml_catalog_processing_failed",
    error_message:details,last_failed_at:at,resolved_at:null
  },{onConflict:"document_id"});
  if(audit.error)console.error("xml_catalog_failure_audit_unavailable",audit.error.message);
}
async function resolveXmlCatalogFailure(documentId:string){
  const audit=await sb.from("purchase_xml_catalog_ingest_errors_v1")
    .update({resolved_at:new Date().toISOString()})
    .eq("document_id",documentId).is("resolved_at",null);
  if(audit.error)console.warn("xml_catalog_failure_resolution_not_recorded",audit.error.message);
}

async function persistXmlCatalogEvidence(documentId:string,documentKey:string,xml:string,hash:string){
      const parsed=extractCatalogFromNfe(xml,documentKey);
      if(parsed.items.length>5000)throw new Error("xml_item_limit");
      const now=new Date().toISOString();
      const rows=parsed.items.map((item:any)=>({
        document_id:documentId,item_number:item.item_number,document_key:documentKey,
        supplier_item_code:item.supplier_item_code,description:item.description,
        commercial_gtin:item.commercial_gtin,tax_gtin:item.tax_gtin,
        ncm:item.ncm,cest:item.cest,cfop:item.cfop,tax_code:item.tax_code,origin_code:item.origin_code,
        purchase_unit:item.purchase_unit,purchase_quantity:item.purchase_quantity,
        purchase_unit_price:item.purchase_unit_price,tax_unit:item.tax_unit,
        tax_quantity:item.tax_quantity,line_total:item.line_total,net_line_total:item.net_line_total,
        lot_traces:item.lot_traces,tax_detail:item.tax_detail,raw_item:item.raw_item,
        source_state:"xml_verified",source_content_sha256:hash,parser_version:"fast_xml_parser_5_11_2",
        extracted_at:now,updated_at:now
      }));
      // Catalog data first: independent of recognition, purchase, finance and inventory.
      const saved=await sb.from("purchase_xml_catalog_observations_v1")
        .upsert(rows,{onConflict:"document_id,item_number"});
      if(saved.error)throw new Error("catalog_observation_save_failed:"+saved.error.message);
      return parsed;
}
// Manual XML catalog-only ingestion. Does not call OAuth, Bling or product mutations.
// Legacy manual_import is routed here by the dispatcher; no operational writes.
async function manualCatalogOnlyImport(input:any,options:{source?:string;runId?:string}={}){
  const files=Array.isArray(input)?input:[];
  if(!files.length||files.length>10)return {ok:false,status:400,error:"catalog_xml_1_to_10_files_required"};
  const source=options.source||(files.length===1?"manual_xml":"bulk_xml");
  const externalRunId=options.runId||null;
  let runId=externalRunId;
  if(!runId){
    const run=await sb.from("purchase_xml_import_runs").insert({
      source,status:"running",documents_seen:files.length,
      metadata:{mode:"catalog_only",writes_products:false,writes_stock:false,writes_finance:false}
    }).select("id").single();
    if(run.error)throw run.error;
    runId=run.data.id;
  }
  const results:any[]=[];let processed=0,duplicates=0,failed=0,items=0;
  for(const file of files){
    const filename=clean(file?.name,160);
    try{
      const xml=String(file?.xml??"");
      assertCatalogXmlSize(xml);
      const original=parseXml(xml);
      if(original.document_key.length!==44)throw new Error("invalid_nfe_key");
      if(original.cstat&&![100,150].includes(original.cstat))throw new Error("nfe_not_authorized");
      const evidence=assertCatalogXmlIntegrity(xml,original.document_key);
      const hash=await sha256(xml);
      const exist=await sb.from("purchase_xml_documents").select("id,content_sha256")
        .eq("document_key",evidence.key).maybeSingle();
      if(exist.error)throw exist.error;
      if(exist.data){
        assertExistingXmlDigest(exist.data.content_sha256,hash);
        const replay=await xmlCatalogReprocess({document_id:exist.data.id});
        if(!replay.results?.[0]?.ok)throw new Error(replay.results?.[0]?.error||"duplicate_replay_failed");
        duplicates++;
        results.push({name:filename,ok:true,duplicate:true,items:evidence.items.length,document_id:exist.data.id});
        continue;
      }
      const issued=day(original.issued_at)||new Date().toISOString().slice(0,10);
      const [year,month]=issued.split("-");
      const path=year+"/"+month+"/"+evidence.key+".xml";
      const upload=await sb.storage.from("purchase-xml").upload(path,
        new Blob([xml],{type:"application/xml"}),
        {upsert:false,contentType:"application/xml"});
      if(upload.error)throw new Error("xml_storage_failed:"+upload.error.message);
      const personal=original.recipient_kind==="CPF";
      const inserted=await sb.from("purchase_xml_documents").insert({
        import_run_id:runId,source,source_document_id:filename||null,
        document_key:evidence.key,content_sha256:hash,storage_path:path,
        issued_at:original.issued_at||null,supplier_document:original.supplier_document||null,
        supplier_name:original.supplier_name||null,
        recipient_document:original.recipient_document||null,
        recipient_kind:original.recipient_kind||"unknown",
        financial_eligible:false,
        finance_status:personal?"blocked_personal":"not_applicable",
        finance_reference:{accounts:[],reason:"catalog_only_no_finance"},
        receipt_status:"review",processing_status:"review_required",
        total_amount:original.total_amount||0,item_count:evidence.items.length,
        matched_item_count:0,review_item_count:evidence.items.length,
        metadata:{catalog_only:true,invoice_number:original.invoice_number,
          series:original.series,catalog_imported_at:new Date().toISOString()}
      }).select("id").single();
      if(inserted.error){
        // This request created the storage object, but no DB document owns it.
        // Remove only that new object so a corrected retry is not blocked.
        const cleanup=await sb.storage.from("purchase-xml").remove([path]);
        if(cleanup.error)console.error("xml_catalog_orphan_cleanup_failed",cleanup.error.message);
        throw inserted.error;
      }
      const replay=await xmlCatalogReprocess({document_id:inserted.data.id});
      if(!replay.results?.[0]?.ok)
        throw new Error(replay.results?.[0]?.error||"catalog_recovery_pending");
      processed++;items+=evidence.items.length;
      results.push({name:filename,ok:true,document_id:inserted.data.id,items:evidence.items.length});
    }catch(e){
      failed++;
      results.push({name:filename,ok:false,error:clean((e as Error)?.message||e,220)});
    }
  }
  if(!externalRunId){
  const done=await sb.from("purchase_xml_import_runs").update({
    status:failed?"completed_with_review":"completed",finished_at:new Date().toISOString(),
    documents_processed:processed,documents_duplicate:duplicates,documents_failed:failed,
    items_seen:items,items_matched:0,items_review:items,
    metadata:{mode:"catalog_only",writes_products:false,writes_stock:false,writes_finance:false},
    updated_at:new Date().toISOString()
  }).eq("id",runId);
  if(done.error)throw done.error;
  }
  return {ok:true,catalog_only:true,processed,duplicates,failed,items,results,
    bling_called:false,products_updated:false,stock_updated:false,finance_updated:false};
}

// Return source evidence and any existing product link; no modification is permitted.
async function xmlCatalogCandidateDetail(body:any){
  const key=clean(body?.candidate_key,210);
  if(!key||! /^(?:gtin:|tax_gtin:|supplier:|unidentified:)/.test(key))
    return {ok:false,status:400,error:"invalid_candidate_key"};
  const offset=Math.max(0,Math.min(100000,Math.trunc(Number(body?.offset)||0)));
  const limit=60;
  const candidate=await sb.from("purchase_xml_catalog_candidates_v1")
    .select("candidate_key,display_name,gtin,tax_gtin,last_observed_ncm,last_observed_cest,last_purchase_unit,observations_count,distinct_invoices,suppliers_count,ncm_variations,cest_variations,matched_product_variations,linked_product_id,xml_verified,first_seen,last_seen,review_status")
    .eq("candidate_key",key).maybeSingle();
  if(candidate.error)throw candidate.error;
  if(!candidate.data)return {ok:false,status:404,error:"candidate_not_found"};
  const evidence=await sb.from("purchase_xml_catalog_observation_details_v2")
    .select("observation_id,document_id,item_number,purchase_item_id,linked_product_id,linked_product_name,linked_product_gtin,linked_product_ncm,linked_product_cest,linked_product_active,issued_at,supplier_name,supplier_document,source,catalog_only,xml_description,supplier_item_code,commercial_gtin,tax_gtin,xml_ncm,xml_cest,xml_cfop,purchase_unit,purchase_quantity,purchase_unit_price,line_total,net_line_total,tax_unit,tax_quantity,lot_traces,source_state,conversion_status,conversion_factor,item_status",{count:"exact"})
    .eq("candidate_key",key)
    .order("issued_at",{ascending:false,nullsFirst:false})
    .order("document_id",{ascending:true}).order("item_number",{ascending:true})
    .range(offset,offset+limit-1);
  if(evidence.error)throw evidence.error;
  // Product identity suggestions are read-only and require an operator decision.
  const gtin=clean(candidate.data.gtin||candidate.data.tax_gtin,24);
  const suggestions=gtin?await searchPurchaseProducts({query:gtin}):{ok:true,items:[]};
  const observations=evidence.data||[];
  const total=Number(evidence.count??candidate.data.observations_count??0);
  const hasMore=total>offset+observations.length;
  return {ok:true,readonly:true,candidate:candidate.data,observations,
    offset,limit,total_observations:total,has_more:hasMore,
    next_offset:hasMore?offset+observations.length:null,truncated:hasMore,
    field_comparisons:catalogXmlComparison(evidence.data||[]),
    comparison_scope:{kind:"loaded_page_only",compared_observations:observations.length,
      total_observations:total,partial:total>observations.length},
    suggested_existing_products:Array.isArray(suggestions.items)?suggestions.items:[],
    can_auto_match:false,can_auto_apply_fiscal:false,can_auto_move_stock:false};
}

async function xmlCatalogList(body:any){
  const limit=Math.max(1,Math.min(100,Math.trunc(Number(body?.limit)||30)));
  const offset=Math.max(0,Math.min(100000,Math.trunc(Number(body?.offset)||0)));
  const term=clean(body?.search,100).replace(/[%_,().]/g,"").trim();
  let q=sb.from("purchase_xml_catalog_candidates_v1")
    .select("candidate_key,display_name,gtin,tax_gtin,last_observed_ncm,last_observed_cest,last_purchase_unit,observations_count,distinct_invoices,suppliers_count,ncm_variations,cest_variations,matched_product_variations,linked_product_id,xml_verified,first_seen,last_seen,review_status",{count:"exact"})
    .order("last_seen",{ascending:false,nullsFirst:false}).range(offset,offset+limit-1);
  if(term.length>=2){
    if(/^\d+$/.test(term))q=q.or("gtin.eq."+term+",tax_gtin.eq."+term+",last_observed_ncm.eq."+term);
    else q=q.ilike("display_name","%"+term+"%");
  }
  if(["identity_conflict","fiscal_conflict","cest_conflict","not_linked","linked_reviewable"].includes(clean(body?.status,40)))q=q.eq("review_status",body.status);
  const r=await q;
  if(r.error)throw r.error;
  return {ok:true,readonly:true,total:r.count||0,offset,limit,items:r.data||[],
    no_catalog_mutation:true};
}
async function xmlCatalogProgress(){
  const q=await sb.from("purchase_xml_catalog_reconciliation_v1")
    .select("document_id,declared_items,items_staged,observations_captured,xml_verified_items,missing_staging_items,missing_observations,catalog_readiness").limit(5000);
  if(q.error)throw q.error;
  // Only the Admin can read this service-role-only view.
  const failures=await sb.from("purchase_xml_catalog_ingest_failures_v1")
    .select("document_id,error_code,error_message,last_failed_at,supplier_name,source",
      {count:"exact"}).order("last_failed_at",{ascending:false}).limit(15);
  if(failures.error)throw failures.error;
  const docs=q.data||[];
  const add=(field:string)=>docs.reduce((a:number,d:any)=>a+Number(d?.[field]||0),0);
  return {ok:true,documents:docs.length,declared_items:add("declared_items"),
    staged_items:add("items_staged"),catalog_observations:add("observations_captured"),
    verified_from_xml:add("xml_verified_items"),
    missing_staging_items:add("missing_staging_items"),
    missing_catalog_observations:add("missing_observations"),
    documents_verified:docs.filter((d:any)=>d.catalog_readiness==="complete_from_xml").length,
    documents_still_incomplete:docs.filter((d:any)=>d.catalog_readiness==="incomplete").length,
    catalog_ingest_failures:failures.count||0,
    catalog_recent_failures:failures.data||[],
    readonly:true};
}
async function xmlCatalogReprocess(body:any){
  const limit=Math.max(1,Math.min(5,Math.trunc(Number(body?.limit)||3)));
  const offset=Math.max(0,Math.min(100000,Math.trunc(Number(body?.offset)||0)));
  const id=clean(body?.document_id,80);
  let query=sb.from("purchase_xml_documents").select("id,document_key,storage_path,item_count,content_sha256,created_at")
    .order("created_at",{ascending:true}).order("id",{ascending:true});
  if(id){
    if(!/^[0-9a-f-]{36}$/i.test(id))return {ok:false,error:"invalid_document"};
    query=query.eq("id",id).limit(1);
  }else{
    query=query.range(offset,offset+limit-1);
  }
  const docs=await query;
  if(docs.error)throw docs.error;
  const result:any[]=[];
  for(const d of docs.data||[]){
    try{
      if(!d.storage_path)throw new Error("xml_storage_path_missing");
      const downloaded=await sb.storage.from("purchase-xml").download(d.storage_path);
      if(downloaded.error||!downloaded.data)throw new Error("xml_download_failed");
      const xml=await downloaded.data.text();
      assertCatalogXmlSize(xml);
      assertCatalogXmlIntegrity(xml,d.document_key);
      const hash=await sha256(xml);
      if(d.content_sha256&&hash!==d.content_sha256)throw new Error("xml_hash_mismatch");
      const parsed=await persistXmlCatalogEvidence(d.id,d.document_key,xml,hash);
      await resolveXmlCatalogFailure(d.id);
      const existing=await sb.from("purchase_xml_items").select("item_number").eq("document_id",d.id);
      if(existing.error)throw existing.error;
      const seen=new Set((existing.data||[]).map((x:any)=>Number(x.item_number)));
      const missing=parsed.items.filter((x:any)=>!seen.has(x.item_number));
      if(missing.length){
        const staged=missing.map((x:any)=>({
          document_id:d.id,item_number:x.item_number,
          supplier_item_code:x.supplier_item_code,description:x.description||("Item "+x.item_number),
          commercial_gtin:validGtin(x.commercial_gtin)?digits(x.commercial_gtin):null,
          tax_gtin:validGtin(x.tax_gtin)?digits(x.tax_gtin):null,
          ncm:x.ncm,cest:x.cest,cfop:x.cfop,tax_code:x.tax_code,
          origin_code:x.origin_code,purchase_unit:x.purchase_unit,
          purchase_quantity:x.purchase_quantity,purchase_unit_price:x.purchase_unit_price,
          line_total:x.line_total,conversion_status:"review_required",
          processing_status:"review_required",match_method:"xml_raw_recovery",
          base_unit:unit(x.tax_unit||x.purchase_unit)||"UN",
          metadata:{identity_state:"unresolved",reason:"xml_raw_recovery",
            net_line_total:x.net_line_total,tax_unit:x.tax_unit,tax_quantity:x.tax_quantity,
            lot_traces:x.lot_traces,verified_source_document_key:d.document_key,
            fiscal_review_required:true}
        }));
        const recovered=await sb.from("purchase_xml_items")
          .upsert(staged,{onConflict:"document_id,item_number",ignoreDuplicates:true});
        if(recovered.error)throw new Error("recover_purchase_items_failed:"+recovered.error.message);
      }
      result.push({document_id:d.id,ok:true,items_in_xml:parsed.items.length,
        items_declared:Number(d.item_count||0),new_staged_items:missing.length,
        count_mismatch:parsed.items.length!==Number(d.item_count||0)});
    }catch(e){
      await recordXmlCatalogFailure(d.id,e);
      result.push({document_id:d.id,ok:false,error:clean((e as Error)?.message||e,200)});
    }
  }
  return {ok:true,processed:result.length,results:result,
    next_offset:id?null:offset+result.length,has_more:!id&&result.length===limit,
    products_updated:false,stock_updated:false,bling_called:false,finance_updated:false};
}

async function catalogQueue(windowInput:any=null){
  const requested=obj(windowInput);
  const window=purchaseWindow(
    requested?.period||requested?.preset||requested?.start_date||requested?.end_date||requested?.lookback_days
      ?requested
      :{lookback_days:31},
    31
  );
  const docs=await sb.from("purchase_xml_documents")
    .select("id,document_key,bling_nfe_id,issued_at,supplier_name,recipient_kind,total_amount,processing_status,metadata,created_at")
    .gte("issued_at",window.start+"T00:00:00")
    .lte("issued_at",window.end+"T23:59:59.999")
    .order("issued_at",{ascending:false})
    .limit(500);
  if(docs.error)throw docs.error;
  const docRows=docs.data||[];
  if(!docRows.length)return {ok:true,filter:window,counts:{total:0,new_products:0,existing_products:0,needs_review:0,ready_for_approval:0,approved:0},items:[]};
  const docMap=new Map(docRows.map((d:any)=>[String(d.id),d]));
  const ids=docRows.map((d:any)=>d.id);
  const iq=await sb.from("purchase_xml_items")
    .select("id,document_id,item_number,supplier_item_code,description,commercial_gtin,tax_gtin,ncm,cest,cfop,purchase_unit,purchase_quantity,purchase_unit_price,line_total,base_unit,conversion_status,conversion_factor,converted_quantity,base_unit_cost,product_id,bling_product_id,processing_status,metadata,created_at,products(id,name,gtin,bling_product_id,cost,price,stock,unit,is_active,category,subcategory,packaging,supplier,metadata)")
    .in("document_id",ids)
    .limit(3000);
  if(iq.error)throw iq.error;
  const enriched=(iq.data||[]).map((x:any)=>{
    const prod=Array.isArray(x.products)?x.products[0]:x.products;
    const doc=docMap.get(String(x.document_id))||{};
    const pack=itemLooksPackaged(x);
    const currentFactor=Number(x.conversion_factor||0);
    const proposedFactor=pack.packaged?(currentFactor>1?currentFactor:(pack.suggestion.factor||null)):(currentFactor>0?currentFactor:1);
    const qty=Number(x.purchase_quantity||0),meta=obj(x.metadata);
    let net=Number(meta.net_line_total);
    if(!Number.isFinite(net)||net<=0)net=Number(x.line_total);
    if((!Number.isFinite(net)||net<=0)&&Number.isFinite(Number(x.purchase_unit_price)))net=Number(x.purchase_unit_price)*qty;
    const baseQty=proposedFactor&&qty>0?qty*Number(proposedFactor):null;
    const proposedCost=baseQty&&baseQty>0&&Number.isFinite(net)?net/baseQty:null;
    const suggestedSale=proposedCost!==null?Math.round(proposedCost*1.40*100)/100:null;
    const currentSale=prod?.price==null?null:Number(prod.price);
    const recommendedSale=suggestedSale===null?currentSale:(Number.isFinite(currentSale)&&Number(currentSale)>0?Math.max(Number(currentSale),suggestedSale):suggestedSale);
    const reasons:string[]=[];
    const gtinRole=inferredPurchaseGtinRole(x),identityNeedsReview=Boolean(x.match_method==="created_from_gtin"||meta.identity_state==="unresolved"||meta.identity_state==="ambiguous"||x.match_method==="identity_confirmation_required");
    if(identityNeedsReview)reasons.push("identity_confirmation_required");
    if(!x.product_id)reasons.push("product_match_required");
    if(x.processing_status==="failed")reasons.push("processing_failed");
    if(x.processing_status==="review_required")reasons.push("item_review_required");
    if(x.conversion_status==="review_required")reasons.push("conversion_review_required");
    if(pack.packaged&&!(Number(proposedFactor)>1))reasons.push("packaging_factor_required");
    if(proposedCost===null||!Number.isFinite(Number(proposedCost)))reasons.push("unit_cost_unavailable");
    const isNew=Boolean(prod?.metadata?.purchase_xml_created===true||prod?.metadata?.purchase_xml_created==="true");
    const approvedAt=clean(meta.catalog_approved_at,80)||null;
    const productNeedsReview=Boolean(prod?.metadata?.purchase_catalog_review_required===true||prod?.metadata?.purchase_catalog_review_required==="true");
    const safe=Boolean(x.product_id&&reasons.length===0);
    const needsApproval=productNeedsReview||!approvedAt;
    return {...x,identity_state:identityNeedsReview?"unresolved":"resolved",match_reason:meta.identity_reason||x.match_method||(identityNeedsReview?"identity_confirmation_required":"gtin_exact"),gtin_role:gtinRole,products:prod||null,document:doc,flags:{
      is_new:isNew,
      is_existing:Boolean(prod?.id&&!isNew),
      needs_review:reasons.length>0,
      review_reasons:reasons,
      safe_to_approve:safe,
      needs_approval:needsApproval,
      approved:Boolean(approvedAt&&!productNeedsReview),
      approved_at:approvedAt
    },pricing_preview:{
      markup_percent:40,
      current_cost:prod?.cost==null?null:Number(prod.cost),
      current_sale_price:currentSale,
      suggested_conversion_factor:proposedFactor,
      conversion_suggestion_source:currentFactor>1?"stored_conversion":pack.suggestion.source,
      conversion_suggestion_evidence:currentFactor>1?null:pack.suggestion.evidence,
      requires_conversion_confirmation:Boolean(pack.packaged&&currentFactor<=1),
      proposed_unit_cost:proposedCost,
      suggested_sale_price:suggestedSale,
      recommended_sale_price:recommendedSale,
      proposed_base_quantity:baseQty,
      update_sale_recommended:Boolean(suggestedSale!==null&&(!Number.isFinite(currentSale)||Number(currentSale)<=0||Number(currentSale)+0.005<suggestedSale)),
      base_unit:"UN",
      can_apply:safe
    }};
  }).sort((a:any,b:any)=>String(b?.document?.issued_at||"").localeCompare(String(a?.document?.issued_at||""))||String(b.created_at||"").localeCompare(String(a.created_at||"")));
  const grouped=new Map<string,any>();
  for(const row of enriched){
    const gtin=digits(row.commercial_gtin||row.tax_gtin||row?.products?.gtin||"");
    const key=row.product_id?"p:"+row.product_id:(gtin?"g:"+gtin:"i:"+row.id);
    if(!grouped.has(key)){
      grouped.set(key,{...row,occurrence_count:1,note_count:1,suppliers:[row?.document?.supplier_name].filter(Boolean),latest_issued_at:row?.document?.issued_at||null,first_issued_at:row?.document?.issued_at||null,_notes:new Set([String(row.document_id)])});
    }else{
      const g=grouped.get(key);g.occurrence_count++;
      g._notes.add(String(row.document_id));g.note_count=g._notes.size;
      const s=row?.document?.supplier_name;if(s&&!g.suppliers.includes(s))g.suppliers.push(s);
      if(String(row?.document?.issued_at||"")<String(g.first_issued_at||""))g.first_issued_at=row?.document?.issued_at||g.first_issued_at;
    }
  }
  const items=[...grouped.values()].map((g:any)=>{delete g._notes;return g});
  const counts={
    total:items.length,
    new_products:items.filter((x:any)=>x.flags.is_new).length,
    existing_products:items.filter((x:any)=>x.flags.is_existing).length,
    needs_review:items.filter((x:any)=>x.flags.needs_review).length,
    ready_for_approval:items.filter((x:any)=>x.flags.safe_to_approve&&x.flags.needs_approval&&!x.flags.approved).length,
    approved:items.filter((x:any)=>x.flags.approved&&!x.flags.needs_approval).length
  };
  return {ok:true,filter:window,counts,items,policy:{lookback_days:31,auto_create_products:false,approval_mode:"human_batch_for_safe_items",stock_unchanged:true,default_markup_percent:40}};
}

async function signedXml(id:string){
  const d=await sb.from("purchase_xml_documents").select("storage_path").eq("id",id).maybeSingle();if(d.error)throw d.error;if(!d.data?.storage_path)return {ok:false,status:404,error:"xml_not_found"};
  const s=await sb.storage.from("purchase-xml").createSignedUrl(d.data.storage_path,300,{download:true});if(s.error)throw s.error;return {ok:true,url:s.data.signedUrl,expires_in:300};
}
async function refreshDocumentReadiness(documentId:string){
  const q=await sb.from("purchase_xml_items").select("id,product_id,purchase_unit,description,conversion_factor,conversion_status,processing_status,converted_quantity").eq("document_id",documentId);
  if(q.error)throw q.error;
  const rows=q.data||[];
  const pending=rows.filter((x:any)=>{
    const pack=itemLooksPackaged(x);
    return !x.product_id||x.processing_status==="review_required"||x.processing_status==="failed"||x.processing_status==="pending"||x.conversion_status==="review_required"||Number(x.converted_quantity||0)<=0||(pack.packaged&&Number(x.conversion_factor||0)<=1);
  });
  const matched=rows.filter((x:any)=>Boolean(x.product_id)).length;
  const ready=rows.length>0&&pending.length===0;
  const u=await sb.from("purchase_xml_documents").update({matched_item_count:matched,review_item_count:pending.length,processing_status:ready?"processed":"review_required",receipt_status:ready?"ready":"review",last_error:ready?null:String(pending.length)+" item(ns) requer(em) revisão",updated_at:new Date().toISOString()}).eq("id",documentId);
  if(u.error)throw u.error;
  return {ready,review_items:pending.length,matched_items:matched};
}
async function setConversion(body:any){
  const id=clean(body?.item_id,80),factor=Number(body?.conversion_factor),base="UN";
  if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isInteger(factor)||factor<1||factor>100000)return {ok:false,status:400,error:"invalid_conversion"};
  const q=await sb.from("purchase_xml_items").select("*,purchase_xml_documents(*)").eq("id",id).maybeSingle();if(q.error)throw q.error;if(!q.data)return {ok:false,status:404,error:"item_not_found"};
  const item:any=q.data,doc:any=item.purchase_xml_documents;if(!item.product_id)return {ok:false,status:409,error:"product_match_required"};
  const pack=itemLooksPackaged(item);
  if(["UN","UND","UNID","UNIDADE","PC","PÇ"].includes(unit(item.purchase_unit))&&factor!==1)
    return {ok:false,status:409,error:"unit_purchase_factor_must_be_one"};
  if(pack.packaged&&factor<=1)return {ok:false,status:409,error:"packaging_factor_must_be_greater_than_one"};
  const baseQty=Number(item.purchase_quantity||0)*factor;
  const meta=obj(item.metadata);let net=Number(meta.net_line_total);
  if(!Number.isFinite(net)||net<=0)net=Number(item.line_total);
  if((!Number.isFinite(net)||net<=0)&&Number.isFinite(Number(item.purchase_unit_price)))net=Number(item.purchase_unit_price)*Number(item.purchase_quantity||0);
  const baseCost=baseQty>0&&Number.isFinite(net)?net/baseQty:null;
  const chain=factor>1?[{unit:unit(item.purchase_unit)||"EMB",contains:factor,next_unit:base},{unit:base,quantity:1}]:[{unit:base,quantity:1}];
  const u=await sb.from("purchase_xml_items").update({base_unit:base,conversion_status:factor>1?"known":"not_needed",conversion_factor:factor,conversion_chain:chain,converted_quantity:baseQty,base_unit_cost:baseCost,processing_status:"matched",metadata:{...meta,conversion_confirmed_at:new Date().toISOString()},updated_at:new Date().toISOString()}).eq("id",id);if(u.error)throw u.error;
  if(factor>1){
    const p=await sb.from("product_supplier_packaging").upsert({product_id:item.product_id,supplier_document:digits(doc.supplier_document)||"",supplier_bling_contact_id:doc.supplier_bling_contact_id,supplier_item_code:clean(item.supplier_item_code,120)||"",purchase_unit:unit(item.purchase_unit),base_unit:base,conversion_factor:factor,conversion_chain:chain,confidence:1,status:"confirmed",source_document_key:doc.document_key,updated_at:new Date().toISOString()},{onConflict:"product_id,supplier_document,supplier_item_code,purchase_unit"});if(p.error)throw p.error;
  }
  await sb.from("product_purchase_history").update({conversion_factor:factor,conversion_chain:chain,base_unit:base,base_quantity:baseQty,base_unit_cost:baseCost}).eq("purchase_item_id",id);
  const readiness=await refreshDocumentReadiness(item.document_id);
  return {ok:true,item_id:id,conversion_factor:factor,base_unit:base,base_quantity:baseQty,base_unit_cost:baseCost,catalog_unchanged:true,...readiness};
}
async function applyItemUpdate(body:any,userId:string|null){
  const id=clean(body?.item_id,80);
  if(!/^[0-9a-f-]{36}$/i.test(id))return {ok:false,status:400,error:"invalid_item"};
  const q=await sb.from("purchase_xml_items").select("*,purchase_xml_documents(*)").eq("id",id).maybeSingle();
  if(q.error)throw q.error;if(!q.data)return {ok:false,status:404,error:"item_not_found"};
  const item:any=q.data,doc:any=item.purchase_xml_documents;
  if(!item.product_id)return {ok:false,status:409,error:"product_match_required"};
  const prodQ=await sb.from("products").select("id,name,gtin,bling_product_id,cost,price,unit,stock,is_active,supplier,metadata").eq("id",item.product_id).maybeSingle();
  if(prodQ.error)throw prodQ.error;if(!prodQ.data)return {ok:false,status:404,error:"product_not_found"};
  const product:any=prodQ.data,pack=itemLooksPackaged(item);
  let factor=Number(body?.conversion_factor??item.conversion_factor??0);
  if(!Number.isFinite(factor)||factor<=0)factor=pack.packaged?0:1;
  if(pack.packaged&&factor<=1)return {ok:false,status:409,error:"packaging_factor_must_be_greater_than_one"};
  if(factor<1||factor>100000)return {ok:false,status:400,error:"invalid_conversion"};
  if(!Number.isInteger(factor))return {ok:false,status:400,error:"conversion_must_be_integer"};
  const purchaseUnit=unit(item.purchase_unit);
  if(["UN","UND","UNID","UNIDADE","PC","PÇ"].includes(purchaseUnit)&&factor!==1)
    return {ok:false,status:409,error:"unit_purchase_factor_must_be_one"};
  const proposedName=clean(body?.proposed_name,300);
  if(proposedName&&proposedName!==String(product.name||""))
    return {ok:false,status:409,error:"existing_product_name_preserved"};
  const qty=Number(item.purchase_quantity||0),baseQty=qty*factor;
  const meta=obj(item.metadata);let net=Number(meta.net_line_total);
  if(!Number.isFinite(net)||net<=0)net=Number(item.line_total);
  if((!Number.isFinite(net)||net<=0)&&Number.isFinite(Number(item.purchase_unit_price)))net=Number(item.purchase_unit_price)*qty;
  const baseCost=baseQty>0&&Number.isFinite(net)?net/baseQty:null;
  if(baseCost===null||!Number.isFinite(baseCost)||baseCost<0)return {ok:false,status:409,error:"unit_cost_unavailable"};
  // R2: XML is evidence, not consent to change existing retail prices or costs.
  // Both mutations require explicit true; an omitted field is always read-only.
  const updateCost=body?.update_cost===true,updateSale=body?.update_sale_price===true;
  const salePrice=Number(body?.sale_price);
  if(updateSale&&(!Number.isFinite(salePrice)||salePrice<0))return {ok:false,status:400,error:"invalid_sale_price"};
  const chain=factor>1?[{unit:unit(item.purchase_unit)||"EMB",contains:factor,next_unit:"UN"},{unit:"UN",quantity:1}]:[{unit:"UN",quantity:1}];
  const now=new Date().toISOString(),operator=clean(body?.operator_name,80)||null;
  const itemMeta={...meta,catalog_approved_at:now,catalog_approved_by:userId,catalog_operator:operator,approved_cost:updateCost?baseCost:null,approved_sale_price:updateSale?salePrice:null};
  const iu=await sb.from("purchase_xml_items").update({base_unit:"UN",conversion_status:factor>1?"known":"not_needed",conversion_factor:factor,conversion_chain:chain,converted_quantity:baseQty,base_unit_cost:baseCost,processing_status:"matched",metadata:itemMeta,updated_at:now}).eq("id",id);if(iu.error)throw iu.error;
  if(factor>1){
    const pr=await sb.from("product_supplier_packaging").upsert({product_id:item.product_id,supplier_document:digits(doc.supplier_document)||"",supplier_bling_contact_id:doc.supplier_bling_contact_id,supplier_item_code:clean(item.supplier_item_code,120)||"",purchase_unit:unit(item.purchase_unit),base_unit:"UN",conversion_factor:factor,conversion_chain:chain,confidence:1,status:"confirmed",source_document_key:doc.document_key,metadata:{approved_from_admin:true,approved_at:now},updated_at:now},{onConflict:"product_id,supplier_document,supplier_item_code,purchase_unit"});if(pr.error)throw pr.error;
  }
  await sb.from("product_purchase_history").update({conversion_factor:factor,conversion_chain:chain,base_unit:"UN",base_quantity:baseQty,base_unit_cost:baseCost,metadata:{approved_from_admin:true,approved_at:now,operator}}).eq("purchase_item_id",id);
  const pmeta={...obj(product.metadata),purchase_catalog_review_required:false,last_purchase_catalog_approval_at:now,last_purchase_catalog_document_key:doc.document_key,last_purchase_catalog_item_id:id,last_purchase_conversion_factor:factor,last_purchase_supplier:doc.supplier_name||null,last_purchase_unit_cost:baseCost};
  // R2: Existing product names and sales tax profiles are never overwritten
  // by the supplier's incoming invoice. Keep XML NCM as evidence for review.
  const upd:any={unit:"UN",supplier:doc.supplier_name||product.supplier||null,metadata:pmeta,last_admin_edit_at:now,last_admin_edit_by:userId,updated_at:now};
  if(updateCost)upd.cost=baseCost;
  if(updateSale)upd.price=Math.round(salePrice*100)/100;
  const pu=await sb.from("products").update(upd).eq("id",item.product_id).select("id,name,cost,price,unit,stock,is_active,bling_product_id").single();if(pu.error)throw pu.error;
  if(updateCost&&item.bling_product_id&&doc.supplier_bling_contact_id){
    try{await syncSupplierLink(await oauth(),Number(item.bling_product_id),Number(doc.supplier_bling_contact_id),item,{base_unit_cost:baseCost})}catch(e){console.error("purchase_supplier_link_sync",String((e as Error)?.message||e))}
  }
  const readiness=await refreshDocumentReadiness(item.document_id);
  await sb.from("bling_hub_audit_v2").insert({event_type:"purchase_catalog_item_approved",severity:"info",domain:"catalog",source_system:"vitrine_admin",source_id:id,details:{document_id:item.document_id,document_key:doc.document_key,product_id:item.product_id,operator,user_id:userId,conversion_factor:factor,base_unit_cost:baseCost,old_cost:product.cost,old_price:product.price,new_cost:updateCost?baseCost:product.cost,new_price:updateSale?Math.round(salePrice*100)/100:product.price,update_cost:updateCost,update_sale_price:updateSale,stock_unchanged:true}});
  return {ok:true,item_id:id,document_id:item.document_id,product:pu.data,conversion_factor:factor,base_unit_cost:baseCost,stock_unchanged:true,...readiness};
}
export async function handlePurchaseXmlRequest(req:Request,body:any={},trustedInternal=false){
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const a:any=trustedInternal?{ok:true,internal:true,user_id:null,role:"system"}:await auth(req);if(!a.ok)return js(req,{ok:false,error:a.error},a.status);
  try{
    const u=new URL(req.url);
    const action=clean(body?.purchase_action||body?.subaction||u.searchParams.get("action")||(req.method==="GET"?"summary":""),80).toLowerCase();
    if(action==="health")return js(req,{ok:true,service:"purchase-xml-v1",version:1});
    if(action==="probe")return js(req,await purchaseXmlProbe());
    if(action==="preview_latest"){const r=await purchaseXmlPreviewLatest();return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="daily_sync"){
      if(!a.internal)return js(req,{ok:false,error:"internal_only"},403);
      const sync=await runBlingSync("bling_daily");
      return js(req,{...sync,finance_skipped:true,reason:"xml_catalog_only_no_financial_mutations"});
    }
    if(action==="bling_sync")return js(req,await runBlingSync("bling_manual",body));
    if(action==="browse_bling")return js(req,await browseBlingNfe(body));
    if(action==="manual_import"){
      if(a.internal||a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      const files=Array.isArray(body?.files)?body.files:[];
      // Compatibility action now shares the same safe ingestion as the catalog tab.
      // Admin uploads >10 are chunked client-side, avoiding oversized Edge requests.
      const r=await manualCatalogOnlyImport(files);
      return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="catalog_queue")return js(req,await catalogQueue(body));
    if(action==="xml_catalog_only_import"){
      if(a.internal||a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      const result=await manualCatalogOnlyImport(body?.files);return js(req,result,result.ok?200:Number(result.status||400));
    }
    if(action==="xml_catalog_list")return js(req,await xmlCatalogList(body));
    if(action==="xml_catalog_candidate_detail"){
      const r=await xmlCatalogCandidateDetail(body);
      return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="xml_catalog_fiscal_dossier"){
      // Human-only on-demand fiscal EVIDENCE, never a tax/apply operation.
      if(a.internal||!["owner","admin"].includes(a.role))
        return js(req,{ok:false,error:"human_admin_required"},403);
      try{
        const r=await loadFiscalDossier(sb,body?.candidate_key);
        return js(req,r,r.ok?200:Number(r.status||400));
      }catch(_e){
        return js(req,{ok:false,error:"xml_fiscal_dossier_unavailable"},503);
      }
    }
    if(action==="xml_catalog_full_comparison"){
      // Explicit human Admin request: high-volume, private, read-only evidence.
      // Internal hub, viewer and operator tokens must never trigger full scans.
      if(a.internal||!["owner","admin"].includes(a.role))
        return js(req,{ok:false,error:"human_admin_required"},403);
      try{
        const r=await compareCandidateFullHistory(sb,body?.candidate_key);
        return js(req,r,r.ok?200:Number(r.status||400));
      }catch(_e){
        return js(req,{ok:false,error:"xml_full_comparison_unavailable"},503);
      }
    }
    if(action==="xml_catalog_progress")return js(req,await xmlCatalogProgress());
    // Decision ledger only. JWT + active Admin role are checked by auth(req).
    // The gateway rejects internal keys and all non-owner/admin sessions.
    if(["xml_field_review_list","xml_field_review_open","xml_field_review_decide"].includes(action)){
      const r=await xmlFieldReviewGateway(sb,action,body,a);
      return js(req,r,r.ok?200:Number(r.status||400));
    }
    // R24: only explicit owner/admin commands can preview/apply/rollback NAME on inactive products.
    // R2 contract: supplier XML never authorizes renaming an existing product.
    // Keep rollback available to undo previously applied changes.
    if(action==="xml_field_apply_commit")return js(req,{ok:false,error:"existing_product_name_preserved"},409);
    if(["xml_field_apply_list","xml_field_apply_preview",
        "xml_field_apply_commit","xml_field_apply_rollback"].includes(action)){
      const r=await xmlFieldApplyGateway(sb,action,body,a);
      return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="xml_catalog_reprocess"){
      // Trusted hub requests may perform source-only recovery, but NEVER product, fiscal or stock writes.
      if(a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      const r=await xmlCatalogReprocess(body);return js(req,r,r.ok?200:400);
    }

    if(action==="search_products")return js(req,await searchPurchaseProducts(body));
    if(action==="resolve_item_identity"){if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);if(body?.catalog_evidence_only!==true)return js(req,{ok:false,error:"xml_catalog_evidence_only_required"},409);if(!["owner","admin"].includes(a.role))return js(req,{ok:false,error:"human_admin_required"},403);const r=await resolvePurchaseItemIdentity(body,a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="summary")return js(req,await summary(body));
    if(action==="finance_reconcile"){const r=await syncFinanceDocument(clean(body?.document_id||body?.id||u.searchParams.get("id"),80),{allowWrite:false,source:"vitrine_admin_reconcile"});return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="finance_post"||action==="finance_retry"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(clean(body?.confirmation,80)!=="CONFIRMAR_CONTAS")return js(req,{ok:false,error:"confirmation_required"},409);
      const r=await syncFinanceDocument(clean(body?.document_id||body?.id,80),{allowWrite:true,source:"vitrine_admin_finance_post"});
      return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="finance_reconcile_pending"){if(!a.internal)return js(req,{ok:false,error:"internal_only"},403);return js(req,await reconcilePendingFinance(body?.limit||50))}
    if(action==="payment_backfill"){if(!a.internal)return js(req,{ok:false,error:"internal_only"},403);return js(req,await backfillPaymentMetadata(body?.limit||100))}
    if(action==="lot_evidence_backfill"){if(!a.internal)return js(req,{ok:false,error:"internal_only"},403);return js(req,await backfillLotEvidence(body?.limit||100))}
    if(action==="payment_accounts"){const token=await oauth();return js(req,await paymentAccountConfig(token))}
    if(action==="payment_accounts_save"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      const r=await savePaymentAccountConfig(body,a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="payment_settlement_preview"){
      const r=await paymentSettlementPreview(clean(body?.document_id||body?.id,80));return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="payment_settlement_execute"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      if(clean(body?.confirmation,80)!=="CONFIRMAR_BAIXA")return js(req,{ok:false,error:"confirmation_required"},409);
      const r=await executePaymentSettlement(clean(body?.document_id||body?.id,80),a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="document"){const r=await docDetail(clean(body?.id||u.searchParams.get("id"),80));return js(req,r,r.ok?200:Number(r.status||404))}
    if(action==="xml_url"){const r=await signedXml(clean(body?.id||u.searchParams.get("id"),80));return js(req,r,r.ok?200:Number(r.status||404))}
    if(action==="set_conversion"){if(a.internal||!["owner","admin"].includes(a.role))return js(req,{ok:false,error:"human_admin_required"},403);const r=await setConversion(body);return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="apply_item_update"){if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);const r=await applyItemUpdate(body,a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="save_receipt_lots"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      const r=await saveReceiptLotPlan(body,a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400));
    }
    if(action==="receipt_preflight"){
      const q=await sb.rpc("get_purchase_xml_receipt_preflight_v1",{p_document_id:clean(body?.document_id||body?.id,80)});
      if(q.error)return js(req,{ok:false,error:q.error.message},409);
      return js(req,{ok:true,preflight:q.data});
    }
    if(action==="prepare_receipt_plan"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      if(clean(body?.confirmation,80)!=="CONFIRMAR_ENTRADA")return js(req,{ok:false,error:"confirmation_required"},409);
      const docId=clean(body?.document_id||body?.id,80);
      const lotPlan=await receiptLotPlanStatus(docId);
      if(!lotPlan.complete)return js(req,{ok:false,error:"receipt_lots_required",lot_plan:lotPlan},409);
      const q=await sb.rpc("prepare_purchase_stock_receipt_plan_v1",{p_document_id:docId});
      if(q.error)return js(req,{ok:false,error:q.error.message},409);
      return js(req,{ok:q.data?.ok!==false,result:q.data},q.data?.ok===false?409:200);
    }
    if(action==="verify_receipt_plan"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(a.role==="viewer")return js(req,{ok:false,error:"admin_write_required"},403);
      if(clean(body?.confirmation,80)!=="VERIFICAR_ENTRADA_BLING")return js(req,{ok:false,error:"confirmation_required"},409);
      const docId=clean(body?.document_id||body?.id,80);
      const lotPlan=await receiptLotPlanStatus(docId);
      if(!lotPlan.complete)return js(req,{ok:false,error:"receipt_lots_required",lot_plan:lotPlan},409);
      const q=await sb.rpc("verify_purchase_stock_receipt_plan_v1",{p_document_id:docId,p_user_id:a.user_id});
      if(q.error)return js(req,{ok:false,error:q.error.message},409);
      let lot_materialization:any=null;
      if(q.data?.verified===true){
        lot_materialization=await materializeReceiptLots(docId,a.user_id||null);
      }
      return js(req,{ok:true,result:q.data,lot_materialization});
    }
    if(action==="confirm_receipt"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(clean(body?.confirmation,80)!=="CONFIRMAR_ENTRADA")return js(req,{ok:false,error:"confirmation_required"},409);
      const docId=clean(body?.document_id,80);
      const lotPlan=await receiptLotPlanStatus(docId);
      if(!lotPlan.complete)return js(req,{ok:false,error:"receipt_lots_required",lot_plan:lotPlan},409);
      const pre=await sb.rpc("get_purchase_xml_receipt_preflight_v1",{p_document_id:docId});
      if(pre.error)return js(req,{ok:false,error:pre.error.message},409);
      if(pre.data?.stock_authority==="bling"){
        const q=await sb.rpc("prepare_purchase_stock_receipt_plan_v1",{p_document_id:docId});
        if(q.error)return js(req,{ok:false,error:q.error.message},409);
        return js(req,{ok:q.data?.ok!==false,result:q.data,message:"Entrada preparada. Atualize/receba o estoque no Bling e depois use a verificação do recebimento."},q.data?.ok===false?409:200);
      }
      const q=await sb.rpc("apply_purchase_stock_receipt_v1",{p_document_id:docId,p_user_id:a.user_id});
      if(q.error)return js(req,{ok:false,error:q.error.message},409);
      return js(req,{ok:true,result:q.data});
    }
    return js(req,{ok:false,error:"not_found"},404);
  }catch(e){console.error("purchase_xml_error",String((e as Error)?.message||e));return js(req,{ok:false,error:"service_error",detail:clean((e as Error)?.message||e,800)},500)}
}
