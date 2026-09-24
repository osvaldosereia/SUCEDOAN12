import fs from 'node:fs';
import path from 'node:path';

const APPLY=process.argv.includes('--apply');
const ROOT=path.resolve(process.env.FISCAL_XML_ROOT||'fiscal/nfe-importadas');
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const SUPABASE_SERVICE_ROLE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
const REPORT_FILE=String(process.env.FISCAL_EVIDENCE_REPORT_FILE||'');

function required(name,value){if(!value)throw new Error(name+' não configurado.');return value}
function digits(v){return String(v??'').replace(/\D/g,'')}
function decodeXml(v){return String(v??'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim()}
function tag(xml,name){
  const m=String(xml||'').match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
  return m?decodeXml(m[1]):'';
}
function block(xml,name){
  const m=String(xml||'').match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
  return m?m[1]:'';
}
function dets(xml){
  const out=[]; const re=/<det\b([^>]*)>([\s\S]*?)<\/det>/gi; let m;
  while((m=re.exec(xml))){
    const n=(m[1].match(/\bnItem="([^"]+)"/i)||[])[1]||String(out.length+1);
    out.push({nItem:n,body:m[2]});
  }
  return out;
}
function validGtin(v){const d=digits(v);return [8,12,13,14].includes(d.length)?d:''}
function xmlFiles(dir){
  const out=[];
  if(!fs.existsSync(dir))return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...xmlFiles(full));
    else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.xml'))out.push(full);
  }
  return out.sort();
}
async function sb(pathname,options={}){
  const r=await fetch(SUPABASE_URL+pathname,{
    ...options,
    headers:{
      apikey:SUPABASE_SERVICE_ROLE_KEY,
      Authorization:'Bearer '+SUPABASE_SERVICE_ROLE_KEY,
      Accept:'application/json',
      'Content-Type':'application/json',
      ...(options.headers||{})
    }
  });
  const raw=await r.text();
  if(!r.ok)throw new Error('Supabase '+r.status+': '+raw.slice(0,1200));
  return raw?JSON.parse(raw):null;
}
async function loadProducts(){
  const rows=[];
  for(let offset=0;;offset+=1000){
    const q=new URLSearchParams({
      select:'id,name,gtin,ncm,is_active',
      order:'id.asc',
      limit:'1000',
      offset:String(offset)
    });
    const page=await sb('/rest/v1/products?'+q.toString());
    rows.push(...(page||[]));
    if(!Array.isArray(page)||page.length<1000)break;
  }
  const buckets=new Map();
  for(const p of rows){
    const g=validGtin(p.gtin); if(!g)continue;
    if(!buckets.has(g))buckets.set(g,[]);
    buckets.get(g).push(p);
  }
  return {rows,buckets};
}
function evidenceFromXml(file,xml,products){
  const emit=block(xml,'emit'),ide=block(xml,'ide');
  const documentKey=digits(tag(xml,'chNFe'))||digits((xml.match(/<infNFe\b[^>]*\bId="NFe(\d{44})"/i)||[])[1]);
  const supplier=tag(emit,'xNome');
  const supplierDocument=digits(tag(emit,'CNPJ')||tag(emit,'CPF'));
  const supplierCrt=tag(emit,'CRT');
  const observedAt=tag(ide,'dhEmi')||tag(ide,'dEmi')||null;
  const rows=[]; const skipped=[];
  for(const det of dets(xml)){
    const prod=block(det.body,'prod'); if(!prod)continue;
    const commercialGtin=validGtin(tag(prod,'cEAN'));
    const taxGtin=validGtin(tag(prod,'cEANTrib'));
    const candidates=[commercialGtin,taxGtin].filter(Boolean);
    let matched=null,matchGtin='';
    for(const g of candidates){
      const bucket=products.buckets.get(g)||[];
      if(bucket.length===1){matched=bucket[0];matchGtin=g;break}
      if(bucket.length>1){skipped.push({reason:'ambiguous_gtin',gtin:g,item:det.nItem,file});matched=null;matchGtin='';break}
    }
    if(!matched){
      skipped.push({reason:candidates.length?'gtin_not_found':'gtin_missing',gtin:candidates[0]||'',item:det.nItem,file});
      continue;
    }
    const icms=block(det.body,'ICMS');
    const cst=tag(icms,'CST'),csosn=tag(icms,'CSOSN');
    const originRaw=tag(icms,'orig');
    const origin=/^[0-8]$/.test(originRaw)?Number(originRaw):null;
    const ncm=digits(tag(prod,'NCM')); const cest=digits(tag(prod,'CEST')); const cfop=digits(tag(prod,'CFOP'));
    const rel=path.relative(process.cwd(),file).split(path.sep).join('/');
    const evidenceKey='supplier_nfe_xml:'+documentKey+':'+det.nItem+':'+matchGtin;
    rows.push({
      evidence_key:evidenceKey,
      product_id:matched.id,
      evidence_type:'supplier_nfe_xml',
      source_name:supplier||'Fornecedor NF-e',
      source_url:'https://github.com/osvaldosereia/SUCEDOAN12/blob/main/'+encodeURI(rel),
      document_key:documentKey||null,
      supplier_document:supplierDocument||null,
      gtin:matchGtin||null,
      ncm:/^\d{8}$/.test(ncm)?ncm:null,
      cest:/^\d{7}$/.test(cest)?cest:null,
      origin_code:origin,
      cfop:/^\d{4}$/.test(cfop)?cfop:null,
      tax_code:csosn?('CSOSN:'+csosn):(cst?('CST:'+cst):null),
      fiscal_description:tag(prod,'xProd')||null,
      evidence_confidence:null,
      observed_at:observedAt,
      evidence_payload:{
        source_path:rel,
        item_number:det.nItem,
        supplier_code:tag(prod,'cProd')||null,
        commercial_gtin:commercialGtin||null,
        tax_gtin:taxGtin||null,
        commercial_unit:tag(prod,'uCom')||null,
        tax_unit:tag(prod,'uTrib')||null,
        supplier_crt:supplierCrt||null,
        icms_tax_code_kind:csosn?'CSOSN':(cst?'CST':null)
      }
    });
  }
  return {rows,skipped};
}
async function writeEvidence(rows){
  for(let i=0;i<rows.length;i+=100){
    const batch=rows.slice(i,i+100);
    await sb('/rest/v1/product_fiscal_evidence?on_conflict=evidence_key',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(batch)
    });
  }
}
async function main(){
  required('SUPABASE_URL',SUPABASE_URL); required('SUPABASE_SERVICE_ROLE_KEY',SUPABASE_SERVICE_ROLE_KEY);
  const products=await loadProducts(),files=xmlFiles(ROOT);
  const all=[],skipped=[];let parseErrors=0,itemLines=0;
  for(const file of files){
    try{
      const xml=fs.readFileSync(file,'utf8');
      const parsed=evidenceFromXml(file,xml,products);
      all.push(...parsed.rows); skipped.push(...parsed.skipped); itemLines+=dets(xml).length;
    }catch(e){parseErrors++;skipped.push({reason:'parse_error',file,error:String(e?.message||e).slice(0,300)})}
  }
  const dedup=[...new Map(all.map(x=>[x.evidence_key,x])).values()];
  if(APPLY&&dedup.length)await writeEvidence(dedup);
  const report={
    mode:APPLY?'apply':'dry-run',
    xml_files:files.length,
    canonical_products:products.rows.length,
    item_lines:itemLines,
    matched_evidence:dedup.length,
    skipped:skipped.length,
    parse_errors:parseErrors,
    skipped_by_reason:Object.fromEntries([...new Set(skipped.map(x=>x.reason))].map(k=>[k,skipped.filter(x=>x.reason===k).length]))
  };
  if(REPORT_FILE)fs.writeFileSync(REPORT_FILE,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
