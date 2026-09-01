const FIREBASE=(process.env.FIREBASE_BASE_URL||'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/,'');
const LI_BASE=(process.env.LOJA_INTEGRADA_BASE_URL||'https://api.awsli.com.br/v1').replace(/\/$/,'');
const AUTH=String(process.env.LOJA_INTEGRADA_AUTHORIZATION||'').trim();
const LIMIT=Math.max(1,Math.min(100,Number(process.env.LIMIT||100)||100));
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(!AUTH)throw new Error('Token Loja Integrada ausente.');

async function jsonFetch(url,options={},{allow404=false}={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data={raw}};if(allow404&&r.status===404)return null;if(!r.ok)throw new Error(`${r.status} ${text(data?.error_message||data?.detail||data?.message||raw)}`);return data;}
async function fbGet(path){return jsonFetch(`${FIREBASE}/${path}.json`,{headers:{Accept:'application/json'}});}
async function fbPatch(path,data){return jsonFetch(`${FIREBASE}/${path}.json`,{method:'PATCH',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});}
let last=0;
async function li(path,{method='GET',body,allow404=false}={}){const wait=Math.max(0,850-(Date.now()-last));if(wait)await sleep(wait);last=Date.now();return jsonFetch(`${LI_BASE}${path}`,{method,headers:{Authorization:AUTH,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),'User-Agent':'CanecaFacil-Disable-Legacy-Temporary/1.0'},...(body===undefined?{}:{body:JSON.stringify(body)})},{allow404});}
async function fetchProduct(id){return li(`/produto/${encodeURIComponent(id)}?descricao_completa=1`,{allow404:true});}
async function deactivate(id){const p=await fetchProduct(id);if(!p)return 'missing';if(p.ativo===false)return 'already';const body={id_externo:p.id_externo??null,sku:p.sku,mpn:p.mpn??null,ncm:p.ncm??null,gtin:p.gtin??null,nome:p.nome,apelido:p.apelido,descricao_completa:p.descricao_completa??'',ativo:false,bloqueado:p.bloqueado===true,destaque:false,peso:Number(p.peso)||0.45,altura:Number(p.altura)||14,largura:Number(p.largura)||14,profundidade:Number(p.profundidade)||14,tipo:p.tipo||'normal',usado:p.usado===true,categorias:Array.isArray(p.categorias)?p.categorias:[],marca:p.marca??null,removido:false,url_video_youtube:p.url_video_youtube??null};await li(`/produto/${encodeURIComponent(id)}`,{method:'PUT',body});const check=await fetchProduct(id);if(check?.ativo!==false)throw new Error(`Produto ${id} continuou ativo.`);return 'disabled';}

const creations=await fbGet('canecas/personalizadas')||{};let processed=0,disabled=0,already=0,missing=0,errors=0;
for(const [code,creation] of Object.entries(creations)){
  if(processed>=LIMIT)break;
  const meta=creation?.loja_integrada_temporario&&typeof creation.loja_integrada_temporario==='object'?creation.loja_integrada_temporario:{};
  const id=text(meta.produto_id);
  if(!id)continue;
  if(text(meta.status)==='legado_desativado_v15')continue;
  processed++;
  try{
    const result=await deactivate(id);
    if(result==='disabled')disabled++;else if(result==='already')already++;else missing++;
    await fbPatch(`canecas/personalizadas/${encodeURIComponent(code)}/loja_integrada_temporario`,{...meta,status:'legado_desativado_v15',desativado_em:now(),atualizado_em:now(),motivo:'arquitetura_v15_usa_produto_original_no_carrinho',erro:''});
    console.log(`LEGADO ${code} · produto=${id} · ${result}`);
  }catch(error){errors++;console.warn(`ERRO ${code} · produto=${id} · ${error.message}`);await fbPatch(`canecas/personalizadas/${encodeURIComponent(code)}/loja_integrada_temporario`,{...meta,status:'erro_desativacao_legado',atualizado_em:now(),erro:String(error.message||error).slice(0,400)}).catch(()=>{});}
}
console.log(`RESUMO LEGADO processados=${processed} desativados=${disabled} ja_inativos=${already} ausentes=${missing} erros=${errors}`);
