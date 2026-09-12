import {createSign} from 'node:crypto';

const text=v=>String(v??'').trim();
const numberOrNull=v=>{if(v===null||v===undefined||text(v)==='')return null;if(typeof v==='number'&&Number.isFinite(v))return v;const raw=text(v).replace(/[^0-9,.-]/g,'');if(!raw)return null;const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.');const n=Number(comma>dot?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,''));return Number.isFinite(n)?n:null};
const first=(source,...keys)=>keys.map(k=>source?.[k]).find(v=>v!==undefined&&v!==null&&text(v)!=='');
const cleanDigits=v=>text(v).replace(/\D/g,'')||null;
const dateOrNull=v=>{const s=text(v);if(!s)return null;const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return br?`${br[3]}-${br[2]}-${br[1]}`:null};
const imageValue=s=>{const v=text(first(s,'url_imagem','imagem_url','image_url','urlImagem','foto_url','foto','imagem'));return /^https?:\/\//i.test(v)?v:null};

export function firebaseIsActive(source={}){
  if(source.ativo===false||source.visivel===false)return false;
  const raw=text(source.situacao??source.status).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  if(['I','INATIVO','INACTIVE','0','FALSE','E','EXCLUIDO'].includes(raw))return false;
  return true;
}

export function normalizeFirebaseProduct(firebaseKey,source={}){
  return {
    firebase_key:text(firebaseKey)||null,
    sku:text(first(source,'codigo','sku','id'))||null,
    name:text(first(source,'nome','name','descricao'))||`Produto ${text(firebaseKey)}`,
    gtin:cleanDigits(first(source,'gtin','ean','codigo_barras')),
    ncm:cleanDigits(source.ncm),
    price:numberOrNull(first(source,'preco','price','preco_venda','valor')),
    cost:numberOrNull(first(source,'preco_custo','custo','cost')),
    stock:numberOrNull(first(source,'estoque','stock','quantidade')),
    image_url:imageValue(source),
    brand:text(first(source,'marca','brand'))||null,
    category:text(first(source,'categoria','category'))||null,
    subcategory:text(first(source,'subcategoria','subcategory'))||null,
    subsubcategory:text(first(source,'subsubcategoria','subsubcategory'))||null,
    packaging:text(first(source,'embalagem','packaging','unidade_embalagem'))||null,
    supplier:text(first(source,'fornecedor','supplier'))||null,
    validity_date:dateOrNull(first(source,'validade','data_validade','dataValidade')),
    gondola:text(first(source,'gondola','gôndola'))||null,
    shelf:text(first(source,'prateleira','shelf'))||null,
    unit:text(first(source,'unidade','unit'))||null,
    description_short:text(first(source,'descricaoCurta','descricao_curta','description_short'))||null,
    description_long:text(first(source,'descricaoComplementar','descricao_complementar','descricao','description_long'))||null,
    firebase_snapshot:source
  };
}

export function findExistingProduct(product,rows=[]){
  const by=(field,value)=>value?rows.filter(r=>text(r?.[field])===text(value)):[];
  for(const [field,value] of [['firebase_key',product.firebase_key],['gtin',product.gtin],['sku',product.sku]]){
    const matches=by(field,value);
    if(matches.length===1)return {row:matches[0],matched_by:field,conflict:false};
    if(matches.length>1)return {row:null,matched_by:field,conflict:true,matches};
  }
  return {row:null,matched_by:null,conflict:false};
}

const commonFields=p=>({
  firebase_key:p.firebase_key,sku:p.sku,name:p.name,gtin:p.gtin,ncm:p.ncm,price:p.price,cost:p.cost,stock:p.stock,
  image_url:p.image_url,image_original_url:p.image_url,brand:p.brand,category:p.category,subcategory:p.subcategory,
  subsubcategory:p.subsubcategory,packaging:p.packaging,supplier:p.supplier,validity_date:p.validity_date,gondola:p.gondola,
  shelf:p.shelf,unit:p.unit,description_short:p.description_short,description_long:p.description_long,firebase_snapshot:p.firebase_snapshot
});

export function buildNewProductRow(p){
  return {
    ...commonFields(p),
    is_active:false,
    is_whatsapp_active:false,
    is_offer:false,
    physically_verified:false,
    storefront_featured:false,
    source_system:'firebase_import',
    sync_status:'firebase_imported_inactive',
    desired_bling_status:'I',
    metadata:{firebase_import:true,firebase_source_active:true},
    tags:[]
  };
}

function aliasEntry(p){return {firebase_key:p.firebase_key,sku:p.sku,gtin:p.gtin,name:p.name,snapshot:p.firebase_snapshot}}
export function buildExistingPatch(existing,p,matchedBy='firebase_key'){
  const source=commonFields(p),patch={};
  const aliasMatch=matchedBy!=='firebase_key'&&text(existing?.firebase_key)&&text(p.firebase_key)&&text(existing.firebase_key)!==text(p.firebase_key);
  if(aliasMatch){
    const metadata=existing?.metadata&&typeof existing.metadata==='object'&&!Array.isArray(existing.metadata)?{...existing.metadata}:{};
    const aliases=Array.isArray(metadata.firebase_aliases)?[...metadata.firebase_aliases]:[];
    const idx=aliases.findIndex(a=>text(a?.firebase_key)===text(p.firebase_key));
    if(idx>=0)aliases[idx]=aliasEntry(p);else aliases.push(aliasEntry(p));
    patch.metadata={...metadata,firebase_aliases:aliases};
  }else{
    patch.firebase_snapshot=p.firebase_snapshot;
  }
  const fillable=['firebase_key','sku','name','gtin','ncm','price','cost','stock','image_url','image_original_url','brand','category','subcategory','subsubcategory','packaging','supplier','validity_date','gondola','shelf','unit','description_short','description_long'];
  for(const key of fillable){
    const current=existing?.[key];
    if((current===null||current===undefined||text(current)==='')&&source[key]!==null&&source[key]!==undefined&&text(source[key])!=='')patch[key]=source[key];
  }
  return patch;
}

export function rememberInsertedProduct(rows,row){if(row&&typeof row==='object')rows.push(row);return row}
export async function collectPages(fetchPage,pageSize=1000){
  const rows=[];
  for(let from=0;;from+=pageSize){
    const page=await fetchPage(from,from+pageSize-1);
    const list=Array.isArray(page)?page:[];
    rows.push(...list);
    if(list.length<pageSize)break;
  }
  return rows;
}

let firebaseAccessToken='';
function base64Url(v){return Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')}
async function firebaseHeaders(){
  if(firebaseAccessToken)return {Authorization:`Bearer ${firebaseAccessToken}`};
  const source=text(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);if(!source)return {};
  const c=JSON.parse(source);const now=Math.floor(Date.now()/1000);
  const unsigned=`${base64Url({alg:'RS256',typ:'JWT'})}.${base64Url({iss:c.client_email,scope:'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const assertion=`${unsigned}.${signer.sign(c.private_key,'base64url')}`;
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if(!r.ok)throw new Error(`Google OAuth ${r.status}: ${(await r.text()).slice(0,400)}`);const d=await r.json();firebaseAccessToken=d.access_token;return {Authorization:`Bearer ${firebaseAccessToken}`};
}
async function readFirebaseProducts(){
  const base=text(process.env.FIREBASE_DATABASE_URL||'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/+$/,'');
  const auth=text(process.env.FIREBASE_AUTH_TOKEN);const url=`${base}/produtos.json${auth?`?auth=${encodeURIComponent(auth)}`:''}`;
  const r=await fetch(url,{headers:{Accept:'application/json',...await firebaseHeaders()}});if(!r.ok)throw new Error(`Firebase ${r.status}: ${(await r.text()).slice(0,500)}`);const data=await r.json();if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Firebase /produtos inválido');return data;
}
function supabaseHeaders(extra={}){const key=text(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente');return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...extra}}
async function sb(path,options={}){const base=text(process.env.SUPABASE_URL||'https://ssbesxgaijknwsjbsbcz.supabase.co').replace(/\/+$/,'');const r=await fetch(`${base}/rest/v1/${path}`,{...options,headers:supabaseHeaders(options.headers)});if(!r.ok)throw new Error(`Supabase ${options.method||'GET'} ${path}: ${r.status} ${(await r.text()).slice(0,1000)}`);if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null}
const SUPABASE_PRODUCT_FIELDS='id,firebase_key,sku,name,gtin,ncm,price,cost,stock,image_url,image_original_url,brand,category,subcategory,subsubcategory,packaging,supplier,validity_date,gondola,shelf,unit,description_short,description_long,is_active,is_whatsapp_active,physically_verified,firebase_snapshot,metadata,source_system,sync_status';
async function readSupabaseProducts(){
  return collectPages(async(from,to)=>await sb(`products?select=${SUPABASE_PRODUCT_FIELDS}&order=id.asc&offset=${from}&limit=${to-from+1}`)||[],1000);
}
async function insertRow(row){const data=await sb('products',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});return Array.isArray(data)?data[0]:data}
async function patchRow(id,patch){return sb(`products?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)})}

async function run(){
  const mode=text(process.env.MIGRATION_MODE||'dry-run').toLowerCase();if(!['dry-run','apply'].includes(mode))throw new Error('MIGRATION_MODE deve ser dry-run ou apply');
  const firebase=await readFirebaseProducts();const supabase=await readSupabaseProducts();
  const summary={mode,firebase_total:Object.keys(firebase).length,firebase_active:0,supabase_loaded:supabase.length,matched_firebase_key:0,matched_gtin:0,matched_sku:0,new_products:0,updated_existing:0,alias_records:0,conflicts:[],missing_image:[],skipped_invalid:[]};
  for(const [key,raw] of Object.entries(firebase)){
    if(!firebaseIsActive(raw))continue;summary.firebase_active++;
    const p=normalizeFirebaseProduct(key,raw);
    if(!p.name){summary.skipped_invalid.push({key,reason:'name_missing'});continue}
    if(!p.image_url)summary.missing_image.push({key,name:p.name});
    const match=findExistingProduct(p,supabase);
    if(match.conflict){summary.conflicts.push({key,name:p.name,matched_by:match.matched_by,count:match.matches.length});continue}
    if(match.row){
      summary[`matched_${match.matched_by}`]++;
      const isAlias=match.matched_by!=='firebase_key'&&text(match.row.firebase_key)&&text(match.row.firebase_key)!==text(p.firebase_key);
      if(isAlias)summary.alias_records++;
      const patch=buildExistingPatch(match.row,p,match.matched_by);
      summary.updated_existing++;
      if(mode==='apply')await patchRow(match.row.id,patch);
      Object.assign(match.row,patch);
    }else{
      summary.new_products++;
      const row=buildNewProductRow(p);
      if(mode==='apply'){
        const created=await insertRow(row);
        rememberInsertedProduct(supabase,created||{...row,id:`inserted:${key}`});
      }else{
        rememberInsertedProduct(supabase,{...row,id:`dry-run:${key}`});
      }
    }
  }
  console.log('MIGRATION_SUMMARY '+JSON.stringify(summary));
  if(summary.conflicts.length)process.exitCode=2;
}

if(import.meta.url===`file://${process.argv[1]}`)run().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
