// R10: pure fiscal XML/protocol verifier. No network or persistence.
// Proof comes from authenticated provider read-back, not client input.
// This validates XML fields, NOT cryptographic XMLDSig/certificate chains.
const digits=v=>String(v??"").replace(/\D/g,"");
const block=(xml,tag)=>{
  const m=String(xml||"").match(new RegExp("<(?:[\\w-]+:)?"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?"+tag+"\\s*>","i"));
  return m?m[1]:"";
};
const field=(xml,tag)=>block(xml,tag).replace(/<[^>]*>/g,"").trim();
const cents=v=>{
  if(v===null||v===undefined||v==="")return NaN;
  const n=Number(v);
  return Number.isFinite(n)&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100):NaN;
};
function validCnpj(value){
  const d=digits(value);
  if(d.length!==14||/^(\d)\1+$/.test(d))return false;
  const a=d.split("").map(Number);
  const dv=(ns,ws)=>{const r=ns.reduce((s,n,i)=>s+n*ws[i],0)%11;return r<2?0:11-r};
  return a[12]===dv(a.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])
    &&a[13]===dv(a.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2]);
}
export function validNfeAccessKey(value){
  const k=digits(value);
  if(k.length!==44||/^(\d)\1+$/.test(k))return false;
  let w=2,s=0;
  for(let i=42;i>=0;i--){s+=Number(k[i])*w;w=w===9?2:w+1}
  const check=(11-(s%11))%11;
  return check===Number(k[43]);
}
export function extractNfeAuthorizationProofR10(xml){
  if(typeof xml!=="string"||xml.length>3_000_000
    ||!/<(?:\w+:)?nfeProc[\s>]/i.test(xml))
    return {ok:false,error:"nfeproc_xml_missing"};
  const nfe=block(xml,"NFe"),info=block(nfe,"infNFe");
  const match=nfe.match(/<(?:\w+:)?infNFe\b[^>]*\bId=["']NFe(\d{44})["']/i);
  const protocol=block(block(xml,"protNFe"),"infProt");
  if(!nfe||!info||!protocol||!match)
    return {ok:false,error:"nfe_protocol_xml_incomplete"};
  const proof={
    key:digits(field(protocol,"chNFe")),document_key:match[1],
    cstat:Number(field(protocol,"cStat")),
    protocol:digits(field(protocol,"nProt")),received_at:field(protocol,"dhRecbto"),
    environment:field(block(info,"ide"),"tpAmb"),
    emitter_cnpj:digits(field(block(info,"emit"),"CNPJ")),
    invoice_total:field(block(info,"ICMSTot"),"vNF")
  };
  return {ok:true,proof};
}
export function verifySefazNfeAuthorizationR10(input){
  const x=input||{},errors=[],remote=x.bling_detail||{},f=x.proof||{};
  const add=s=>{if(!errors.includes(s))errors.push(s)};
  const oid=String(x.order_id||""),invoice=Number(x.bling_invoice_id);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(oid)
    ||!Number.isSafeInteger(invoice)||invoice<=0)add("invalid_order_or_invoice");
  if(Number(remote.id)!==invoice||remote.numeroLoja!=="VITRINE-"+oid)
    add("invoice_order_identity_mismatch");
  if(remote.situation?.authorized!==true)add("bling_invoice_not_authorized");
  if(!validNfeAccessKey(f.key)||f.key!==f.document_key||
     digits(remote.chaveAcesso)!==f.key)add("access_key_mismatch_or_invalid");
  if(![100,150].includes(Number(f.cstat)))add("sefaz_authorization_code_invalid");
  if(!/^\d{15}$/.test(String(f.protocol||"")))add("sefaz_protocol_missing");
  const received=new Date(f.received_at||"").getTime();
  const now=new Date(x.as_of??Date.now()).getTime();
  if(!Number.isFinite(received)||received>Date.now()+300_000
    ||received<Date.UTC(2000,0,1))add("sefaz_protocol_timestamp_invalid");
  if(String(f.environment)!==String(x.expected_environment||"1"))
    add("sefaz_environment_mismatch");
  if(!validCnpj(x.expected_emitter_cnpj)||
     digits(f.emitter_cnpj)!==digits(x.expected_emitter_cnpj))
    add("issuer_cnpj_mismatch");
  if(cents(f.invoice_total)!==cents(x.expected_total))
    add("invoice_total_mismatch");
  const fetchedAt=new Date(x.bling_fetched_at||"").getTime();
  if(!Number.isFinite(fetchedAt)||fetchedAt>now+30_000||now-fetchedAt>300_000)
    add("bling_authorization_evidence_stale");
  return {ok:true,authorized:errors.length===0,blockers:errors,invoice_id:invoice,
    cstat:Number(f.cstat)||null,
    protocol:/^\d{15}$/.test(String(f.protocol||""))?f.protocol:null,
    external_write:false};
}
