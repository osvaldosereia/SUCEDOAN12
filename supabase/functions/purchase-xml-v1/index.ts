import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
async function bw(token:string,path:string,method:string,payload:any){
  await reserve();
  const r=await fetch(BLING+path,{method,headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  const raw=await r.text();let d:any={};try{d=raw?JSON.parse(raw):{}}catch{}
  return {ok:r.ok,status:r.status,data:d,error:clean(d?.error?.message||d?.error?.description||d?.error||raw,800)};
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
function parseXml(xml:string){
  const inf=block(xml,"infNFe")||xml,ide=block(inf,"ide"),emit=block(inf,"emit"),dest=block(inf,"dest"),prot=block(xml,"protNFe"),ip=block(prot,"infProt")||prot;
  const ea=block(emit,"enderEmit"),total=block(block(inf,"total"),"ICMSTot"),cobr=block(inf,"cobr");
  const cnpj=digits(tag(dest,"CNPJ")),cpf=digits(tag(dest,"CPF"));
  const items=blocks(inf,"det").map((d:string)=>{
    const p=block(d,"prod"),icms=block(block(d,"imposto"),"ICMS"),or=tag(icms,"orig"),ncm=digits(tag(p,"NCM")).slice(0,8),cest=digits(tag(p,"CEST")).slice(0,7);
    const qCom=num(tag(p,"qCom"))||0,qTrib=num(tag(p,"qTrib"))||0,uCom=unit(tag(p,"uCom")),uTrib=unit(tag(p,"uTrib"));
    const cst=digits(tag(icms,"CST")).slice(0,3),cs=digits(tag(icms,"CSOSN")).slice(0,4);
    const gross=num(tag(p,"vProd"))||0,discount=num(tag(p,"vDesc"))||0,freight=num(tag(p,"vFrete"))||0,insurance=num(tag(p,"vSeg"))||0,other=num(tag(p,"vOutro"))||0,net=gross-discount+freight+insurance+other;return {item_number:Number(attr(d,"nItem"))||0,supplier_item_code:clean(tag(p,"cProd"),120)||null,description:clean(tag(p,"xProd"),500),commercial_gtin:gtin(tag(p,"cEAN"))||null,tax_gtin:gtin(tag(p,"cEANTrib"))||null,ncm:ncm.length===8?ncm:null,cest:cest.length===7?cest:null,cfop:digits(tag(p,"CFOP")).slice(0,4)||null,tax_code:cst?"CST:"+cst:cs?"CSOSN:"+cs:null,origin_code:/^\d$/.test(or)?Number(or):null,purchase_unit:uCom||null,purchase_quantity:qCom,purchase_unit_price:num(tag(p,"vUnCom")),line_total:gross,item_discount:discount,item_freight:freight,item_insurance:insurance,item_other:other,net_line_total:net,tax_unit:uTrib||null,tax_quantity:qTrib};
  }).filter((x:any)=>x.item_number>0&&x.description);
  const installments=blocks(cobr,"dup").map((d:string,i:number)=>({number:clean(tag(d,"nDup"),40)||String(i+1),due_date:day(tag(d,"dVenc")),amount:num(tag(d,"vDup"))})).filter((x:any)=>x.due_date&&Number(x.amount)>0);
  return {
    document_key:digits(tag(ip,"chNFe")||attr(inf,"Id").replace(/^NFe/i,"")),
    cstat:Number(tag(ip,"cStat")||0),
    issued_at:clean(tag(ide,"dhEmi")||tag(ide,"dEmi"),50)||null,
    invoice_number:clean(tag(ide,"nNF"),40)||null,series:clean(tag(ide,"serie"),20)||null,
    supplier_document:digits(tag(emit,"CNPJ")||tag(emit,"CPF"))||null,supplier_name:clean(tag(emit,"xNome"),180)||null,supplier_trade_name:clean(tag(emit,"xFant"),180)||null,
    supplier_address:{street:clean(tag(ea,"xLgr"),180),number:clean(tag(ea,"nro"),40),district:clean(tag(ea,"xBairro"),120),city:clean(tag(ea,"xMun"),120),state:clean(tag(ea,"UF"),2),zip:digits(tag(ea,"CEP"))},
    recipient_document:cnpj||cpf||null,recipient_kind:cnpj?"CNPJ":cpf?"CPF":"unknown",
    total_amount:num(tag(total,"vNF")),items,installments
  };
}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function b64bytes(s:string){const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o}
async function unzipBase64(s:string){const raw=b64bytes(s),ds=new DecompressionStream("gzip");return await new Response(new Blob([raw]).stream().pipeThrough(ds)).text()}

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
function suggestedPackFactor(description:any,purchaseUnit:any){
  const s=clean(description,600).toUpperCase().replace(/\s+/g," ");
  const pu=unit(purchaseUnit);
  let m=s.match(/\b(?:CX|FD|PCT|DP)\s*\/\s*0*(\d{2,4})\b/);
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
async function conversionFor(product:any,p:any,item:any){
  const pu=unit(item.purchase_unit),tu=unit(item.tax_unit),catalog=unit(product?.unit);
  const qc=Number(item.purchase_quantity||0),qt=Number(item.tax_quantity||0),ratio=qc>0&&qt>0?qt/qc:0;
  const pack=itemLooksPackaged(item);
  if(pack.packaged){
    if(ratio>1&&ratio<=100000&&Math.abs(ratio-Math.round(ratio))<0.000001){
      const f=Math.round(ratio);
      return {status:"inferred_xml",factor:f,base_unit:"UN",chain:[{unit:pu||"EMB",contains:f,next_unit:"UN"},{unit:"UN",quantity:1}],confidence:.99,suggested_factor:f,suggestion_source:"xml_qtrib_ratio"};
    }
    let mq=sb.from("product_supplier_packaging").select("*").eq("product_id",product.id).eq("purchase_unit",pu).in("status",["confirmed","inferred_xml"]);
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
    if(f>1)return {status:"inferred_xml",factor:f,base_unit:base||"UN",chain:[{unit:pu||"EMB",contains:f,next_unit:base||"UN"},{unit:base||"UN",quantity:1}],confidence:.99,suggested_factor:f,suggestion_source:"xml_qtrib_ratio"};
    if(f===1)return {status:"not_needed",factor:1,base_unit:"UN",chain:[{unit:"UN",quantity:1}],confidence:1,suggested_factor:1,suggestion_source:"same_unit"};
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
async function createPayables(token:string,p:any,supplierId:number){
  if(p.recipient_kind!=="CNPJ")return {status:"blocked_personal",accounts:[],reason:"cpf_never_financial"};
  if(!supplierId)return {status:"pending_company_match",accounts:[],reason:"supplier_contact_missing"};
  if(!p.installments.length)return {status:"review",accounts:[],reason:"installments_missing"};
  const installmentTotal=p.installments.reduce((a:number,x:any)=>a+Number(x.amount||0),0);
  if(Number.isFinite(Number(p.total_amount))&&Math.abs(installmentTotal-Number(p.total_amount))>0.05){
    return {status:"review",accounts:[],reason:"installment_total_mismatch",installment_total:installmentTotal,invoice_total:Number(p.total_amount)};
  }
  const dueDates=p.installments.map((x:any)=>x.due_date).filter(Boolean).sort();
  const minDue=dueDates[0],maxDue=dueDates[dueDates.length-1];
  if(!minDue||!maxDue)return {status:"review",accounts:[],reason:"installment_due_date_missing"};
  const existing=await bg(token,"/contas/pagar?pagina=1&limite=100&situacao=1&dataVencimentoInicial="+encodeURIComponent(minDue)+"&dataVencimentoFinal="+encodeURIComponent(maxDue));
  if(!existing.ok)return {status:"review",accounts:[],reason:"payable_reconcile_http_"+existing.status};
  const rows=(Array.isArray(existing.data?.data)?existing.data.data:[]).filter((r:any)=>Number(r?.contato?.id||0)===supplierId);
  const issue=day(p.issued_at),accounts:any[]=[];
  for(let i=0;i<p.installments.length;i++){
    const x=p.installments[i],number=[p.invoice_number||p.document_key.slice(-9),x.number||String(i+1)].filter(Boolean).join("-");
    const targetCents=Math.round(Number(x.amount||0)*100);
    const dup=rows.find((r:any)=>clean(r?.numeroDocumento,120)===number||(clean(r?.vencimento,20).slice(0,10)===x.due_date&&Math.round(Number(r?.valor||0)*100)===targetCents));
    if(dup){accounts.push({id:Number(dup.id),number,existing:true});continue}
    const payload={vencimento:x.due_date,valor:Number(x.amount),contato:{id:supplierId},dataEmissao:issue||undefined,numeroDocumento:number,historico:"Compra NF-e "+(p.invoice_number||"")+" · chave "+p.document_key};
    const w=await bw(token,"/contas/pagar","POST",payload);
    if(!w.ok)return {status:"review",accounts,reason:"payable_create_http_"+w.status,detail:w.error};
    accounts.push({id:Number(w.data?.data?.id||0)||null,number,existing:false});
  }
  return {status:"posted",accounts,installment_total:installmentTotal};
}
async function processXml(token:string,xml:string,source:string,runId:string|null,sourceId:string|null=null,blingId:number|null=null,detailSupplement:any=null){
  const p:any=parseXml(xml);
  if(!p.installments.length&&Array.isArray(detailSupplement?.parcelas))p.installments=detailSupplement.parcelas.map((x:any,i:number)=>({number:String(i+1),due_date:day(x?.data||x?.vencimento),amount:num(x?.valor)})).filter((x:any)=>x.due_date&&Number(x.amount)>0);if(p.document_key.length!==44)throw new Error("invalid_nfe_access_key");
  if(p.cstat&&![100,150].includes(p.cstat))throw new Error("nfe_not_authorized_"+p.cstat);
  const hash=await sha256(xml);
  const ex=await sb.from("purchase_xml_documents").select("id,processing_status").eq("document_key",p.document_key).maybeSingle();
  if(ex.error)throw ex.error;
  if(ex.data?.id&&["processed","duplicate"].includes(ex.data.processing_status))return {duplicate:true,document_id:ex.data.id,items:p.items.length,matched:0,review:0};
  const co=await companyDocument(token);const company=co.doc,settings=co.settings;
  const eligible=p.recipient_kind==="CNPJ"&&company.length===14&&p.recipient_document===company;
  const y=day(p.issued_at)||new Date().toISOString().slice(0,10),parts=y.split("-");
  const storagePath=[parts[0],parts[1],p.document_key+".xml"].join("/");
  const upf=await sb.storage.from("purchase-xml").upload(storagePath,new Blob([xml],{type:"application/xml"}),{upsert:true,contentType:"application/xml"});
  if(upf.error)throw new Error("xml_storage_failed:"+upf.error.message);
  const contact=await ensureContact(token,p);
  const docUp=await sb.from("purchase_xml_documents").upsert({import_run_id:runId,source,source_document_id:sourceId,bling_nfe_id:blingId,document_key:p.document_key,content_sha256:hash,storage_path:storagePath,issued_at:p.issued_at,supplier_document:p.supplier_document,supplier_name:p.supplier_name,supplier_bling_contact_id:contact.id||null,recipient_document:p.recipient_document,recipient_kind:p.recipient_kind,financial_eligible:eligible,finance_status:p.recipient_kind==="CPF"?"blocked_personal":eligible?"eligible":p.recipient_kind==="CNPJ"&&!company?"pending_company_match":"not_applicable",receipt_status:"not_received",processing_status:"processing",total_amount:p.total_amount,item_count:p.items.length,metadata:{invoice_number:p.invoice_number,series:p.series,company_document:company||null,contact_created:Boolean(contact.created),installments:p.installments,source_mode:source},updated_at:new Date().toISOString()},{onConflict:"document_key"}).select("id").single();
  if(docUp.error)throw docUp.error;const documentId=docUp.data.id;
  let matched=0,review=0,created=0;
  for(const item of p.items){
    try{
      const ep=await ensureProduct(token,p,item);
      if(!ep.ok||!ep.product){review++;await sb.from("purchase_xml_items").upsert({document_id:documentId,item_number:item.item_number,...item,base_unit:unit(item.tax_unit||item.purchase_unit)||"UN",conversion_status:"review_required",processing_status:"review_required",match_method:ep.review||"unmatched",metadata:{reason:ep.review||"unmatched"}},{onConflict:"document_id,item_number"});continue}
      const conv:any=await conversionFor(ep.product,p,item);
      const bq=conv.factor?Number(item.purchase_quantity||0)*Number(conv.factor):null;
      const buc=bq&&bq>0&&Number.isFinite(Number(item.net_line_total))?Number(item.net_line_total)/bq:(conv.factor&&Number.isFinite(Number(item.purchase_unit_price))?Number(item.purchase_unit_price)/Number(conv.factor):null);
      const st=conv.status==="review_required"?"review_required":"matched";
      const it=await sb.from("purchase_xml_items").upsert({document_id:documentId,item_number:item.item_number,supplier_item_code:item.supplier_item_code,description:item.description,commercial_gtin:item.commercial_gtin,tax_gtin:item.tax_gtin,ncm:item.ncm,cest:item.cest,cfop:item.cfop,tax_code:item.tax_code,origin_code:item.origin_code,purchase_unit:item.purchase_unit,purchase_quantity:item.purchase_quantity,purchase_unit_price:item.purchase_unit_price,line_total:item.line_total,base_unit:conv.base_unit,conversion_status:conv.status,conversion_factor:conv.factor,conversion_chain:conv.chain,converted_quantity:bq,base_unit_cost:buc,product_id:ep.product.id,bling_product_id:ep.bling_id,match_method:ep.created?"created_from_gtin":"gtin_exact",processing_status:st,metadata:{conversion_confidence:conv.confidence,new_product:Boolean(ep.created),net_line_total:item.net_line_total,item_discount:item.item_discount,item_freight:item.item_freight,item_insurance:item.item_insurance,item_other:item.item_other}},{onConflict:"document_id,item_number"}).select("id").single();
      if(it.error)throw it.error;
      await evidence(p,item,ep.product.id);
      if(conv.factor){
        const pack=await sb.from("product_supplier_packaging").upsert({product_id:ep.product.id,supplier_document:digits(p.supplier_document)||"",supplier_bling_contact_id:contact.id||null,supplier_item_code:clean(item.supplier_item_code,120)||"",purchase_unit:unit(item.purchase_unit)||conv.base_unit,base_unit:conv.base_unit,conversion_factor:conv.factor,conversion_chain:conv.chain,confidence:conv.confidence,status:conv.status==="inferred_xml"?"inferred_xml":"confirmed",source_document_key:p.document_key,updated_at:new Date().toISOString()},{onConflict:"product_id,supplier_document,supplier_item_code,purchase_unit"});
        if(pack.error)throw pack.error;
      }
      const ph=await sb.from("product_purchase_history").upsert({document_id:documentId,purchase_item_id:it.data.id,product_id:ep.product.id,document_key:p.document_key,issued_at:p.issued_at,supplier_document:p.supplier_document,supplier_name:p.supplier_name,supplier_bling_contact_id:contact.id||null,original_unit:item.purchase_unit,original_quantity:item.purchase_quantity,conversion_factor:conv.factor,conversion_chain:conv.chain,base_unit:conv.base_unit,base_quantity:bq,line_total:item.line_total,purchase_unit_cost:item.purchase_unit_price,base_unit_cost:buc,source,metadata:{invoice_number:p.invoice_number}},{onConflict:"purchase_item_id"});if(ph.error)throw ph.error;
      const meta={...obj(ep.product.metadata),last_purchase_xml_at:p.issued_at||new Date().toISOString(),last_purchase_document_key:p.document_key,last_purchase_supplier:p.supplier_name||null,last_purchase_unit:item.purchase_unit||null,last_purchase_conversion_factor:conv.factor||null,purchase_catalog_review_required:true,purchase_catalog_review_item_id:it.data.id};
      const upd:any={supplier:p.supplier_name||ep.product.supplier||null,metadata:meta,updated_at:new Date().toISOString()};
      if(item.ncm)upd.ncm=item.ncm;
      const pu=await sb.from("products").update(upd).eq("id",ep.product.id);if(pu.error)throw pu.error;
      matched++;if(ep.created)created++;if(conv.status==="review_required")review++;
    }catch(e){
      review++;await sb.from("purchase_xml_items").upsert({document_id:documentId,item_number:item.item_number,supplier_item_code:item.supplier_item_code,description:item.description,commercial_gtin:item.commercial_gtin,tax_gtin:item.tax_gtin,ncm:item.ncm,cest:item.cest,cfop:item.cfop,tax_code:item.tax_code,origin_code:item.origin_code,purchase_unit:item.purchase_unit,purchase_quantity:item.purchase_quantity,purchase_unit_price:item.purchase_unit_price,line_total:item.line_total,base_unit:unit(item.tax_unit||item.purchase_unit)||"UN",conversion_status:"review_required",processing_status:"failed",metadata:{error:clean((e as Error)?.message||e,500)}},{onConflict:"document_id,item_number"});
    }
  }
  let finance:any={status:p.recipient_kind==="CPF"?"blocked_personal":eligible?"eligible":p.recipient_kind==="CNPJ"&&!company?"pending_company_match":"not_applicable",accounts:[]};
  if(p.recipient_kind==="CPF")finance={status:"blocked_personal",accounts:[],reason:"cpf_never_financial"};
  else if(eligible&&settings.auto_create_payables!==false)finance=await createPayables(token,p,Number(contact.id||0));
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

async function runBlingSync(source="bling_daily",windowInput:any=null){
  const token=await oauth(),settings=await sb.from("purchase_xml_settings").select("*").eq("id",1).single();if(settings.error)throw settings.error;
  await companyDocument(token);
  const run=await sb.from("purchase_xml_import_runs").insert({source,status:"running"}).select("id").single();if(run.error)throw run.error;
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
          const rr=await processXml(token,x.xml,source,id,String(row?.id||""),bid,detail);
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
async function summary(windowInput:any=null){
  const window=purchaseWindow(windowInput,90);
  const docsQ=sb.from("purchase_xml_documents")
    .select("id,document_key,issued_at,supplier_name,recipient_kind,financial_eligible,finance_status,receipt_status,processing_status,total_amount,item_count,matched_item_count,review_item_count,created_at")
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
  return {ok:true,filter:window,documents:docs.data||[],runs:runs.data||[],review_items:items.data||[],settings:settings.data,integration:{manual_max_range_days:365,daily_lookback_days:Number(settings.data?.daily_lookback_days||3),source_scope:"bling_imported_entry_nfe",sefaz_received_queue_exposed_by_public_api:false,received_notes_url:"https://www.bling.com.br/notas.entrada.php#list",manifestation_automated:false,stock_receipt_requires_human_confirmation:true}};
}
async function docDetail(id:string){
  const [d,it]=await Promise.all([
    sb.from("purchase_xml_documents").select("*").eq("id",id).maybeSingle(),
    sb.from("purchase_xml_items").select("*,products(id,name,gtin,bling_product_id,cost,price,stock,unit,is_active,category,subcategory,packaging,metadata)").eq("document_id",id).order("item_number")
  ]);
  if(d.error)throw d.error;if(it.error)throw it.error;if(!d.data)return {ok:false,status:404,error:"document_not_found"};
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
    return {...x,products:prod||null,pricing_preview:{
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
  return {ok:true,document:d.data,items,pricing_policy:{default_markup_percent:40,sale_unit:"UN",catalog_updates_require_human_approval:true,stock_receipt_separate:true}};
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
  if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isFinite(factor)||factor<1||factor>100000)return {ok:false,status:400,error:"invalid_conversion"};
  const q=await sb.from("purchase_xml_items").select("*,purchase_xml_documents(*)").eq("id",id).maybeSingle();if(q.error)throw q.error;if(!q.data)return {ok:false,status:404,error:"item_not_found"};
  const item:any=q.data,doc:any=item.purchase_xml_documents;if(!item.product_id)return {ok:false,status:409,error:"product_match_required"};
  const pack=itemLooksPackaged(item);
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
  const qty=Number(item.purchase_quantity||0),baseQty=qty*factor;
  const meta=obj(item.metadata);let net=Number(meta.net_line_total);
  if(!Number.isFinite(net)||net<=0)net=Number(item.line_total);
  if((!Number.isFinite(net)||net<=0)&&Number.isFinite(Number(item.purchase_unit_price)))net=Number(item.purchase_unit_price)*qty;
  const baseCost=baseQty>0&&Number.isFinite(net)?net/baseQty:null;
  if(baseCost===null||!Number.isFinite(baseCost)||baseCost<0)return {ok:false,status:409,error:"unit_cost_unavailable"};
  const updateCost=body?.update_cost!==false,updateSale=body?.update_sale_price!==false;
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
  const upd:any={unit:"UN",supplier:doc.supplier_name||product.supplier||null,metadata:pmeta,last_admin_edit_at:now,last_admin_edit_by:userId,updated_at:now};
  if(item.ncm)upd.ncm=item.ncm;
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
    if(action==="daily_sync"){if(!a.internal)return js(req,{ok:false,error:"internal_only"},403);return js(req,await runBlingSync("bling_daily"))}
    if(action==="bling_sync")return js(req,await runBlingSync("bling_manual",body));
    if(action==="browse_bling")return js(req,await browseBlingNfe(body));
    if(action==="manual_import"){const r=await manualImport(body?.files);return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="summary")return js(req,await summary(body));
    if(action==="document"){const r=await docDetail(clean(body?.id||u.searchParams.get("id"),80));return js(req,r,r.ok?200:Number(r.status||404))}
    if(action==="xml_url"){const r=await signedXml(clean(body?.id||u.searchParams.get("id"),80));return js(req,r,r.ok?200:Number(r.status||404))}
    if(action==="set_conversion"){const r=await setConversion(body);return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="apply_item_update"){if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);const r=await applyItemUpdate(body,a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400))}
    if(action==="confirm_receipt"){
      if(a.internal)return js(req,{ok:false,error:"human_confirmation_required"},409);
      if(clean(body?.confirmation,80)!=="CONFIRMAR_ENTRADA")return js(req,{ok:false,error:"confirmation_required"},409);
      const q=await sb.rpc("apply_purchase_stock_receipt_v1",{p_document_id:clean(body?.document_id,80),p_user_id:a.user_id});if(q.error)return js(req,{ok:false,error:q.error.message},409);return js(req,{ok:true,result:q.data});
    }
    return js(req,{ok:false,error:"not_found"},404);
  }catch(e){console.error("purchase_xml_error",String((e as Error)?.message||e));return js(req,{ok:false,error:"service_error",detail:clean((e as Error)?.message||e,800)},500)}
}
