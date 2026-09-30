import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createSimplesService } from "../admin-service-intelligence-v1/simples-v1/index.ts";
import { collectFiscalEvidence, type FiscalInvoice, type FiscalSourceSnapshot } from "../admin-service-intelligence-v1/simples-v1/source.ts";
import { reconcilePeriod } from "../admin-service-intelligence-v1/simples-v1/reconciliation.ts";
import { classifyRevenueLine } from "../admin-service-intelligence-v1/simples-v1/classifier.ts";
import { calculateEffectiveRate } from "../admin-service-intelligence-v1/simples-v1/calculator.ts";
import { collectMonthlyRevenueEvidence, priorTwelveCompetences, buildRbt12FromHistory } from "../admin-service-intelligence-v1/simples-v1/history.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const sb=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});
const BLING="https://api.bling.com.br/Api/v3";
const OAUTH=["https://api.bling.com.br/Api/v3/oauth/token","https://api.bling.com.br/oauth/token"];
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const clean=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n);
const digits=(v:any)=>String(v??"").replace(/\D/g,"");
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const round2=(n:number)=>Math.round((Number(n||0)+Number.EPSILON)*100)/100;
async function sha256Text(v:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function cors(r:Request){const o=r.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://www.donaantonia.com.br","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin","Cache-Control":"no-store"}}
function json(r:Request,b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8"}})}
async function auth(r:Request){
  const token=(r.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"admin_auth_required"};
  const u=await sb.auth.getUser(token);
  if(u.error||!u.data.user?.id)return {ok:false,status:401,error:"admin_session_invalid"};
  const a=await sb.from("admin_users").select("role,is_active").eq("user_id",u.data.user.id).maybeSingle();
  if(a.error)return {ok:false,status:500,error:"admin_lookup_failed"};
  if(!a.data?.is_active)return {ok:false,status:403,error:"admin_not_authorized"};
  return {ok:true,status:200,user_id:u.data.user.id,role:a.data.role||"viewer"};
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
    if(last.d.refresh_token&&last.d.refresh_token!==refresh){const s=await sb.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:String(last.d.refresh_token)});if(s.error)throw new Error("refresh_token_persist_failed")}
    return String(last.d.access_token);
  }finally{await sb.rpc("release_bling_hub_oauth_lock_v2",{p_owner:owner})}
}
async function bg(token:string,path:string){
  await reserve();
  try{
    const r=await fetch(BLING+path,{headers:{Authorization:"Bearer "+token,Accept:"application/json","enable-jwt":"1"},signal:AbortSignal.timeout(25000)});
    const raw=await r.text();let d:any={};try{d=raw?JSON.parse(raw):{}}catch{}
    return {ok:r.ok,status:r.status,data:d,error:r.ok?null:clean(d?.error?.message||d?.error?.description||raw,500)};
  }catch(e){return {ok:false,status:0,data:{},error:clean((e as Error)?.message||e,500)}}
}
function monthRange(c:string){
  if(!/^\d{4}-\d{2}$/.test(c))throw new Error("invalid_competence");
  const [y,m]=c.split("-").map(Number),next=new Date(Date.UTC(y,m,1));
  const last=new Date(next.getTime()-86400000);
  const end=`${last.getUTCFullYear()}-${String(last.getUTCMonth()+1).padStart(2,"0")}-${String(last.getUTCDate()).padStart(2,"0")}`;
  return {start:`${c}-01`,end,next:`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,"0")}-01`};
}
const cuiabaIso=(v:any)=>{const s=clean(v,40);if(!s)return new Date().toISOString();if(/[zZ]$|[+-]\d\d:\d\d$/.test(s))return new Date(s).toISOString();return new Date(s.replace(" ","T")+"-04:00").toISOString()};
function ruleEffective(rule:any,date:string){return rule&&rule.status==='active'&&rule.application_mode==='strict_auto'&&date>=String(rule.effective_from||'')&&(!rule.effective_to||date<=String(rule.effective_to))}
function ruleMatches(rule:any,product:any){
  const c=rule?.match_criteria&&typeof rule.match_criteria==='object'?rule.match_criteria:{};
  const ids=Array.isArray(c.product_ids)?c.product_ids.map(String):[];
  const ncms=Array.isArray(c.ncms)?c.ncms.map((x:any)=>digits(x)):[];
  const prefixes=Array.isArray(c.ncm_prefixes)?c.ncm_prefixes.map((x:any)=>digits(x)):[];
  const cests=Array.isArray(c.cests)?c.cests.map((x:any)=>digits(x)):[];
  const pncm=digits(product?.ncm),pcest=digits(product?.cest);
  const tests:number[]=[];
  if(ids.length)tests.push(ids.includes(String(product?.product_id||product?.id))?1:0);
  if(ncms.length)tests.push(ncms.includes(pncm)?1:0);
  if(prefixes.length)tests.push(prefixes.some((x:string)=>pncm.startsWith(x))?1:0);
  if(cests.length)tests.push(cests.includes(pcest)?1:0);
  return tests.length>0&&tests.every(Boolean);
}
async function loadProductMap(){
  const q=await sb.from("products").select("id,sku,gtin,ncm").limit(5000);if(q.error)throw q.error;
  const byGtin=new Map<string,any>(),bySku=new Map<string,any>();
  for(const p of q.data||[]){const g=digits(p.gtin),s=clean(p.sku,120);if(g&&!byGtin.has(g))byGtin.set(g,p);if(s&&!bySku.has(s))bySku.set(s,p)}
  return {byGtin,bySku};
}
async function invoiceOrderMap(ids:number[]){
  const out=new Map<number,string>();if(!ids.length)return out;
  for(let i=0;i<ids.length;i+=200){
    const part=ids.slice(i,i+200);
    const [j,c]=await Promise.all([
      sb.from("dispatch_fiscal_jobs").select("bling_invoice_id,order_id").in("bling_invoice_id",part),
      sb.from("order_fiscal_controls").select("bling_invoice_id,order_id").in("bling_invoice_id",part)
    ]);
    if(j.error)throw j.error;if(c.error)throw c.error;
    for(const x of [...(j.data||[]),...(c.data||[])])if(Number(x.bling_invoice_id)&&x.order_id&&!out.has(Number(x.bling_invoice_id)))out.set(Number(x.bling_invoice_id),String(x.order_id));
  }
  return out;
}
async function listNfeRows(token:string,c:string,tipo:'0'|'1',situacao:2|5){
  const range=monthRange(c),rows:any[]=[];
  for(let page=1;page<=30;page++){
    const q=new URLSearchParams({tipo,pagina:String(page),limite:"100",situacao:String(situacao),dataEmissaoInicial:range.start+" 00:00:00",dataEmissaoFinal:range.end+" 23:59:59"});
    const r=await bg(token,"/nfe?"+q.toString());
    if(!r.ok)return {ok:false,rows,error:`bling_nfe_list_http_${r.status}:${r.error||''}`};
    const batch=Array.isArray(r.data?.data)?r.data.data:[];rows.push(...batch);
    if(batch.length<100)return {ok:true,rows,error:null};
  }
  return {ok:false,rows,error:"bling_nfe_pagination_limit"};
}
async function getHistoryStatus(c:string){
  const expected=priorTwelveCompetences(c),dates=expected.map(x=>x+"-01");
  const q=await sb.from("simples_monthly_revenue_history").select("competence_month,gross_sales,returns_amount,net_revenue,document_count,return_document_count,collection_status,review_reason,collected_at,evidence").in("competence_month",dates).order("competence_month");
  if(q.error)throw q.error;
  const rows=(q.data||[]).map((x:any)=>({competenceMonth:String(x.competence_month).slice(0,7),grossSales:Number(x.gross_sales||0),returnsAmount:Number(x.returns_amount||0),netRevenue:Number(x.net_revenue||0),documentCount:Number(x.document_count||0),returnDocumentCount:Number(x.return_document_count||0),collectionStatus:String(x.collection_status||'incomplete'),reviewReason:x.review_reason||null,collectedAt:x.collected_at||null,evidence:x.evidence||{}}));
  const rbt=buildRbt12FromHistory(c,rows);
  const by=new Map(rows.map((x:any)=>[x.competenceMonth,x]));
  return {target:c,...rbt,rows:expected.map(month=>by.get(month)||{competenceMonth:month,collectionStatus:'missing',netRevenue:null})};
}
async function collectHistoryMonth(c:string,actor:any){
  const token=await oauth();
  const result=await collectMonthlyRevenueEvidence(c,{
    listAuthorizedSales:(month:string)=>listNfeRows(token,month,'1',5),
    listAuthorizedIncoming:(month:string)=>listNfeRows(token,month,'0',5),
    getInvoiceDetail:(id:string|number)=>bg(token,"/nfe/"+id),
  });
  const evidence={...result.evidence,source_errors:result.sourceErrors,actor_id:actor?.userId||null};
  const sourceHash=await sha256Text(JSON.stringify({competence:c,gross_sales:result.grossSales,returns_amount:result.returnsAmount,net_revenue:result.netRevenue,document_count:result.documentCount,return_document_count:result.returnDocumentCount,collection_status:result.collectionStatus,review_reason:result.reviewReason,evidence}));
  const row={competence_month:c+"-01",gross_sales:result.grossSales,returns_amount:result.returnsAmount,net_revenue:result.netRevenue,document_count:result.documentCount,return_document_count:result.returnDocumentCount,source:'bling_nfe',source_hash:sourceHash,collection_status:result.collectionStatus,review_reason:result.reviewReason,evidence,collected_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const q=await sb.from("simples_monthly_revenue_history").upsert(row,{onConflict:'competence_month'}).select("*").single();
  if(q.error)throw q.error;
  return {competenceMonth:c,grossSales:Number(q.data.gross_sales||0),returnsAmount:Number(q.data.returns_amount||0),netRevenue:Number(q.data.net_revenue||0),documentCount:Number(q.data.document_count||0),returnDocumentCount:Number(q.data.return_document_count||0),collectionStatus:q.data.collection_status,reviewReason:q.data.review_reason||null,sourceErrors:result.sourceErrors,collectedAt:q.data.collected_at};
}
async function loadBlingInvoices(input:{competenceMonth:string}):Promise<FiscalSourceSnapshot>{
  const token=await oauth(),errors:string[]=[];
  const [authOut,cancelOut,authIn]=await Promise.all([
    listNfeRows(token,input.competenceMonth,'1',5),listNfeRows(token,input.competenceMonth,'1',2),listNfeRows(token,input.competenceMonth,'0',5)
  ]);
  for(const x of [authOut,cancelOut,authIn])if(!x.ok&&x.error)errors.push(x.error);
  const tagged=[...authOut.rows.map((x:any)=>({row:x,status:'authorized'})),...cancelOut.rows.map((x:any)=>({row:x,status:'cancelled'})),...authIn.rows.map((x:any)=>({row:x,status:'incoming'}))];
  const unique=new Map<number,any>();for(const x of tagged){const id=Number(x.row?.id||0);if(id)unique.set(id,x)}
  const ids=[...unique.keys()],orderMap=await invoiceOrderMap(ids),products=await loadProductMap(),invoices:FiscalInvoice[]=[];
  for(const id of ids){
    const tag=unique.get(id),d=await bg(token,"/nfe/"+id);
    if(!d.ok){errors.push(`bling_nfe_detail_${id}_http_${d.status}`);continue}
    const n=d.data?.data||{};
    if(tag.status==='incoming'&&Number(n.finalidade||0)!==4)continue;
    const status=tag.status==='cancelled'?'cancelled':tag.status==='incoming'?'returned':'authorized';
    const items=(Array.isArray(n.itens)?n.itens:[]).filter((x:any)=>String(x?.tipo||'P')!=='S').map((x:any)=>{
      const local=products.byGtin.get(digits(x?.gtin))||products.bySku.get(clean(x?.codigo,120));
      const qty=Number(x?.quantidade||0),unit=Number(x?.valor||0),total=Number.isFinite(Number(x?.valorTotal))?Number(x.valorTotal):qty*unit;
      return {productId:local?.id||null,amount:round2(total),quantity:qty};
    });
    invoices.push({
      sourceDocumentId:String(id),accessKey:/^\d{44}$/.test(digits(n.chaveAcesso))?digits(n.chaveAcesso):null,blingInvoiceId:id,
      orderId:orderMap.get(id)||null,issuedAt:cuiabaIso(n.dataEmissao||n.dataOperacao),status,total:round2(Number(n.valorNota||0)),items,sourceRefs:['bling']
    });
  }
  return {status:errors.length?'incomplete':'complete',invoices,error:errors.join(' | ')||undefined};
}
async function loadLocalInvoices(_input:{competenceMonth:string}):Promise<FiscalSourceSnapshot>{return {status:'complete',invoices:[]}}
async function loadOrders(c:string){
  const r=monthRange(c),from=r.start+"T04:00:00Z",to=new Date(Date.parse(r.next+"T04:00:00Z")-1).toISOString();
  const q=await sb.from("orders").select("id,total,status,created_at,bling_order_id").gte("created_at",from).lte("created_at",to).limit(5000);if(q.error)throw q.error;
  return (q.data||[]).map((x:any)=>({id:x.id,total:Number(x.total||0),status:x.status,createdAt:x.created_at,blingInvoiceId:null}));
}
async function loadProfiles(productIds:string[],date:string){
  const profiles:Record<string,any>={},productMap=new Map<string,any>();
  if(!productIds.length)return {profiles,detail:new Map(),monoRules:[]};
  for(let i=0;i<productIds.length;i+=300){
    const ids=productIds.slice(i,i+300);
    const [p,prod]=await Promise.all([
      sb.from("product_fiscal_profiles").select("product_id,ncm,cest,st_status,matched_st_rule_id,review_status,rule_version,classification_source,classification_confidence").in("product_id",ids),
      sb.from("products").select("id,ncm").in("id",ids)
    ]);
    if(p.error)throw p.error;if(prod.error)throw prod.error;
    for(const x of prod.data||[])productMap.set(x.id,x);
    for(const x of p.data||[])profiles[x.product_id]={...x,product_id:x.product_id};
  }
  const rs=await sb.from("simples_tax_classification_rules").select("*").eq("status","active").lte("effective_from",date).or(`effective_to.is.null,effective_to.gte.${date}`).order("version",{ascending:false});
  if(rs.error)throw rs.error;
  const monoRules=rs.data||[];
  const detail=new Map<string,any>();
  const stIds=[...new Set(Object.values(profiles).map((x:any)=>x.matched_st_rule_id).filter(Boolean))] as string[];
  const stMap=new Map<string,any>();
  if(stIds.length){const s=await sb.from("fiscal_st_rules_mt").select("id,ncm,cest,legal_description,valid_from,valid_to,status,rule_set_id").in("id",stIds);if(s.error)throw s.error;for(const x of s.data||[])stMap.set(x.id,x)}
  for(const id of productIds){
    const f=profiles[id],prod=productMap.get(id)||{};
    if(!f){detail.set(id,{profile:null,stRule:null,monophaseRule:null});continue}
    const merged={...prod,...f,product_id:id};
    const mono=monoRules.find((r:any)=>r.tax_bucket==='monophase'&&ruleEffective(r,date)&&ruleMatches(r,merged));
    const exclusion=monoRules.find((r:any)=>r.tax_bucket==='normal_resale'&&r.match_criteria?.effect==='monophase_not_applicable'&&ruleEffective(r,date)&&ruleMatches(r,merged));
    f.monophaseStatus=mono?'applicable':exclusion?'not_applicable':'unknown';
    let stRule:any=null;
    if(f.st_status==='applicable'&&f.matched_st_rule_id){const s=stMap.get(f.matched_st_rule_id);if(s&&s.status==='active'&&date>=String(s.valid_from||'')&&(!s.valid_to||date<=String(s.valid_to)))stRule={id:s.id,version:1,taxBucket:'icms_st',applicationMode:'strict_auto',status:'active',effectiveFrom:String(s.valid_from||'1900-01-01'),effectiveTo:s.valid_to?String(s.valid_to):null,confidence:Number(f.classification_confidence||1),evidence:{source:f.classification_source||'fiscal_st_rules_mt',ncm:s.ncm,cest:s.cest,legal_description:s.legal_description,rule_set_id:s.rule_set_id}}}
    const monoRule=mono?{id:mono.id,version:Number(mono.version||1),taxBucket:'monophase',applicationMode:mono.application_mode,status:mono.status,effectiveFrom:String(mono.effective_from),effectiveTo:mono.effective_to?String(mono.effective_to):null,confidence:Number(mono.metadata?.confidence??1),evidence:{legal_basis:mono.legal_basis,required_evidence:mono.required_evidence,match_criteria:mono.match_criteria}}:null;
    detail.set(id,{profile:f,stRule,monophaseRule:monoRule});
  }
  return {profiles,detail,monoRules};
}
async function currentRuleSet(date:string){
  const q=await sb.from("simples_rule_sets").select("*").eq("status","active").lte("effective_from",date).or(`effective_to.is.null,effective_to.gte.${date}`).order("effective_from",{ascending:false}).limit(2);if(q.error)throw q.error;
  return (q.data||[]).length===1?q.data![0]:null;
}
async function findPeriodByCompetence(c:string){const q=await sb.from("simples_periods").select("*").eq("competence_month",c+"-01").order("version",{ascending:false}).limit(1).maybeSingle();if(q.error)throw q.error;return q.data}
async function getPeriod(id:string){const q=await sb.from("simples_periods").select("*").eq("id",id).maybeSingle();if(q.error)throw q.error;return q.data}
async function listIssues(id:string){const q=await sb.from("simples_reconciliation_issues").select("*").eq("period_id",id).order("severity").order("created_at");if(q.error)throw q.error;return q.data||[]}
async function recalculatePeriod(c:string,actor:any){
  let period=await findPeriodByCompetence(c);const started=Date.now(),date=c+"-01";
  if(!period){const ins=await sb.from("simples_periods").insert({competence_month:date,version:1,status:'draft',collection_status:'incomplete'}).select("*").single();if(ins.error)throw ins.error;period=ins.data}
  if(['locked','superseded'].includes(String(period.status)))throw new Error('period_locked');
  const run=await sb.from("simples_validation_runs").insert({period_id:period.id,run_kind:'recalculate',status:'running',actor_id:actor.userId||null,input_summary:{competence:c}}).select("id").single();if(run.error)throw run.error;
  try{
    await Promise.all([sb.from("simples_revenue_lines").delete().eq("period_id",period.id),sb.from("simples_reconciliation_issues").delete().eq("period_id",period.id)]);
    const ruleSet=await currentRuleSet(date);
    const fiscal=await collectFiscalEvidence({competenceMonth:c},{loadLocal:loadLocalInvoices,loadBling:loadBlingInvoices});
    const orders=await loadOrders(c),productIds=[...new Set(fiscal.invoices.flatMap(x=>x.items||[]).map(x=>String(x.productId||'')).filter(Boolean))];
    const profileBundle=await loadProfiles(productIds,date);
    const rec=reconcilePeriod({competenceMonth:c,invoices:fiscal.invoices,orders,profiles:profileBundle.profiles});
    const dbLines:any[]=[],issues:any[]=[...rec.issues];
    if(fiscal.collectionStatus!=='complete')issues.push({issueType:'collection_incomplete',severity:'blocking',title:'Coleta fiscal incompleta',explanation:'O Bling nao foi lido completamente; o mes nao pode ser fechado.',evidence:{status:fiscal.collectionStatus,errors:fiscal.errors}});
    for(const x of rec.candidates){
      const d=x.productId?profileBundle.detail.get(String(x.productId)):null;
      const cls=classifyRevenueLine({transactionKind:x.transactionKind,date:String(x.issuedAt).slice(0,10),fiscalProfile:d?.profile?{reviewStatus:d.profile.review_status,stStatus:d.profile.st_status}:{reviewStatus:'pending',stStatus:'unknown'},stRule:d?.stRule||null,monophaseRule:d?.monophaseRule||null});
      if(cls.status!=='classified')issues.push({issueType:'other',severity:'blocking',title:'Classificacao tributaria pendente',explanation:cls.reason||'Linha fiscal precisa de revisao.',sourceDocumentId:x.sourceDocumentId,orderId:x.orderId,productId:x.productId,amount:x.recognizedAmount,evidence:{classification:cls}});
      if(x.transactionKind==='return')issues.push({issueType:'return_status_mismatch',severity:'blocking',title:'Devolucao requer conciliacao com a venda original',explanation:'A devolucao foi identificada, mas o tratamento tributario original deve ser confirmado antes do fechamento.',sourceDocumentId:x.sourceDocumentId,orderId:x.orderId,productId:x.productId,amount:x.recognizedAmount});
      dbLines.push({period_id:period.id,source_type:'bling_nfe',source_document_id:x.sourceDocumentId,access_key:x.accessKey||null,bling_invoice_id:x.blingInvoiceId||null,order_id:x.orderId||null,product_id:x.productId||null,issued_at:x.issuedAt,gross_amount:x.grossAmount,recognized_amount:x.recognizedAmount,tax_bucket:cls.taxBucket,classification_status:cls.status,classification_rule_id:cls.taxBucket==='monophase'&&cls.ruleId?cls.ruleId:null,classification_rule_version:cls.ruleVersion||null,confidence:cls.confidence??null,evidence:{...cls.evidence,relief_components:cls.reliefComponents,tags:cls.tags,additional_rules:cls.additionalRules||[]},blocking_reason:cls.status==='classified'?null:cls.reason||'manual_review'});
    }
    const rbt=await getHistoryStatus(c);
    if(!rbt.complete)issues.push({issueType:'rbt12_history_incomplete',severity:'blocking',title:'Historico RBT12 incompleto',explanation:'Faltam competencias anteriores completas para calcular a aliquota do Simples.',evidence:{missing_months:rbt.missingMonths,months:rbt.months.map((x:any)=>x.month)}});
    if(!ruleSet)issues.push({issueType:'rule_not_effective_for_date',severity:'blocking',title:'Regra do Simples nao encontrada',explanation:'Nao existe um unico conjunto de regras ativo para esta competencia.',evidence:{competence:c}});
    if(dbLines.length){const ins=await sb.from("simples_revenue_lines").insert(dbLines);if(ins.error)throw ins.error}
    if(issues.length){const rows=issues.map((x:any)=>({period_id:period.id,issue_type:x.issueType||'other',severity:x.severity||'blocking',status:'open',source_document_id:x.sourceDocumentId||null,access_key:x.accessKey||null,order_id:x.orderId||null,product_id:x.productId||null,amount:x.amount??null,title:x.title||'Pendencia',explanation:x.explanation||'Revisao necessaria',evidence:x.evidence||{}}));const ins=await sb.from("simples_reconciliation_issues").insert(rows);if(ins.error)throw ins.error}
    const gross=round2(rec.candidates.reduce((s,x)=>s+Number(x.recognizedAmount||0),0));
    const grouped=new Map<string,{name:string,amount:number,reliefComponents:any[]}>();
    for(const l of dbLines.filter(x=>x.classification_status==='classified'&&Number(x.recognized_amount)>0)){
      const relief=Array.isArray(l.evidence?.relief_components)?l.evidence.relief_components:[],key=relief.slice().sort().join('+')||'normal';
      const g=grouped.get(key)||{name:key,amount:0,reliefComponents:relief};g.amount+=Number(l.recognized_amount||0);grouped.set(key,g);
    }
    let calc:any=null;
    if(rbt.complete&&ruleSet&&Array.isArray(ruleSet.brackets)&&ruleSet.brackets.length){calc=calculateEffectiveRate({rbt12:Number(rbt.rbt12),brackets:ruleSet.brackets,bases:[...grouped.values()].map(x=>({...x,amount:round2(x.amount)}))})}
    const segregated:any={};for(const l of dbLines)segregated[l.tax_bucket]=round2(Number(segregated[l.tax_bucket]||0)+Number(l.recognized_amount||0));
    const blocking=issues.filter((x:any)=>x.severity!=='warning').length,warnings=issues.filter((x:any)=>x.severity==='warning').length;
    const status=blocking===0&&fiscal.collectionStatus==='complete'&&rbt.complete&&ruleSet&&calc?'ready':'review_required';
    const meta:any={source:'bling_nfe',fiscal_document_count:fiscal.invoices.length,order_count:orders.length,source_errors:fiscal.errors||[],rbt12_source:'simples_monthly_revenue_history'};if(!rbt.complete)meta.block_reason='rbt12_history_incomplete';
    const upd=await sb.from("simples_periods").update({status,rule_set_id:ruleSet?.id||null,collection_status:fiscal.collectionStatus,gross_revenue_month:gross,segregated_revenue:segregated,rbt12:rbt.rbt12,nominal_rate:calc?.nominalRate??null,deduction_amount:calc?.deduction??null,effective_rate:calc?.effectiveRate??null,estimated_das_amount:calc?.estimatedDas??null,blocking_issue_count:blocking,warning_count:warnings,calculation_memory:calc||{},calculated_at:new Date().toISOString(),metadata:meta,updated_at:new Date().toISOString()}).eq("id",period.id).select("*").single();if(upd.error)throw upd.error;period=upd.data;
    await sb.from("simples_validation_runs").update({status:status==='ready'?'succeeded':'blocked',result_summary:{period_status:status,documents:fiscal.invoices.length,lines:dbLines.length,blocking,warnings,rbt12:rbt.rbt12,estimated_das:calc?.estimatedDas??null},finished_at:new Date().toISOString(),duration_ms:Date.now()-started}).eq("id",run.data.id);
    return period;
  }catch(e){await sb.from("simples_validation_runs").update({status:'failed',error_detail:clean((e as Error)?.message||e,1200),finished_at:new Date().toISOString(),duration_ms:Date.now()-started}).eq("id",run.data.id);throw e}
}
async function getGate(id:string){const q=await sb.rpc("get_simples_period_gate_v1",{p_period_id:id});if(q.error)throw q.error;return q.data}
async function resolveIssue(id:string,resolution:any,actor:any){const status=resolution.status==='ignored_with_reason'?'ignored_with_reason':'resolved';const q=await sb.from("simples_reconciliation_issues").update({status,resolution,resolved_at:new Date().toISOString(),resolved_by:actor.userId||null,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(q.error)throw q.error;return q.data}
async function lockPeriod(id:string,actor:any){const q=await sb.from("simples_periods").update({status:'locked',locked_at:new Date().toISOString(),locked_by:actor.userId||null,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(q.error)throw q.error;return q.data}
async function saveHomologation(input:any,actor:any){const p=await getPeriod(input.period_id);if(!p)throw new Error('period_not_found');const sys=Number(p.estimated_das_amount||0),acc=Number(input.accountant_das_amount||0),abs=round2(Math.abs(sys-acc)),pct=acc===0?(sys===0?0:null):Math.abs(sys-acc)/acc;const q=await sb.from("simples_homologation_checks").insert({period_id:p.id,accountant_das_amount:acc,accountant_values:input.accountant_values||{},system_das_amount:sys,absolute_difference:abs,percentage_difference:pct,notes:clean(input.notes,2000)||null,created_by:actor.userId||null}).select("*").single();if(q.error)throw q.error;return q.data}
async function getExportSnapshot(id:string){
  const p=await getPeriod(id);if(!p)throw new Error('period_not_found');
  const [rule,lines,issues]=await Promise.all([p.rule_set_id?sb.from("simples_rule_sets").select("code,name").eq("id",p.rule_set_id).maybeSingle():Promise.resolve({data:null,error:null} as any),sb.from("simples_revenue_lines").select("source_document_id,access_key,order_id,product_id,tax_bucket,recognized_amount").eq("period_id",id).order("source_document_id"),sb.from("simples_reconciliation_issues").select("severity,status").eq("period_id",id)]);
  if(rule.error)throw rule.error;if(lines.error)throw lines.error;if(issues.error)throw issues.error;
  const open=(issues.data||[]).filter((x:any)=>x.status==='open');return {period:p,ruleSet:rule.data||{},totals:p.segregated_revenue||{},issues:{blocking:open.filter((x:any)=>x.severity==='blocking').length,warnings:open.filter((x:any)=>x.severity==='warning').length,total:open.length},memory:p.calculation_memory||{},lines:lines.data||[]};
}
const service=createSimplesService({findPeriodByCompetence,getPeriod,recalculatePeriod,listIssues,resolveIssue,getGate,lockPeriod,saveHomologation,getExportSnapshot,getHistoryStatus,collectHistoryMonth});

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  const a:any=await auth(req);if(!a.ok)return json(req,{ok:false,error:a.error},a.status);
  try{
    const url=new URL(req.url);let body:any={};if(req.method==='POST'){try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}}
    const action=clean(url.searchParams.get('action')||body?.action||'simples_summary',80).toLowerCase();
    const query:Record<string,string>={};for(const [k,v] of url.searchParams.entries())query[k]=v;
    const result=await service.dispatch({action,method:req.method,query,body,actor:{userId:a.user_id||null,role:a.role||'viewer'}});
    if(result.rawBody!==undefined)return new Response(result.rawBody,{status:result.status,headers:{...cors(req),'Content-Type':result.contentType||'text/plain; charset=utf-8','Content-Disposition':action==='simples_export'&&query.format==='csv'?`attachment; filename="simples-${clean(query.period_id,60)}.csv"`:'inline'}});
    return json(req,result.body,result.status);
  }catch(e){const message=clean((e as Error)?.message||e,1200);return json(req,{ok:false,error:'simples_service_error',detail:message},message==='period_locked'?409:500)}
});
