const LI_BASE=(process.env.LOJA_INTEGRADA_BASE_URL||'https://api.awsli.com.br/v1').replace(/\/$/,'');
const AUTH=String(process.env.LOJA_INTEGRADA_AUTHORIZATION||'').trim();
const SKU='CF-TEMP-UX-001';
const text=v=>String(v??'').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(!AUTH)throw new Error('Token Loja Integrada ausente.');
async function li(path,{method='GET',body}={}){const r=await fetch(`${LI_BASE}${path}`,{method,headers:{Authorization:AUTH,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),'User-Agent':'CanecaFacil-Temp-Lifecycle-Test/1.0'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data={raw}};if(!r.ok)throw new Error(`${r.status} ${data?.message||data?.detail||data?.error_message||raw}`);return data;}
const search=await li(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);
const remote=(search?.objects||[]).find(p=>text(p.sku).toLowerCase()===SKU.toLowerCase());
if(!remote)throw new Error(`Produto técnico ${SKU} não encontrado.`);
const id=String(remote.id);
const full=await li(`/produto/${id}?descricao_completa=1`);
function body(ativo){return {
  id_externo:full.id_externo??null,
  sku:SKU,
  mpn:full.mpn??null,
  ncm:full.ncm||'69111090',
  gtin:full.gtin??null,
  nome:'[TESTE INTERNO] Caneca Personalizada Temporária',
  apelido:text(full.apelido)||'teste-interno-caneca-personalizada-temporaria-cf-temp-ux-001',
  descricao_completa:'Produto técnico temporário do CanecaFácil. Sem arte, nome, foto ou dado de cliente. NÃO COMPRAR.',
  ativo,
  bloqueado:false,
  destaque:false,
  peso:Number(full.peso)||0.45,
  altura:Number(full.altura)||14,
  largura:Number(full.largura)||14,
  profundidade:Number(full.profundidade)||14,
  tipo:'normal',
  usado:false,
  categorias:[],
  marca:null,
  removido:false,
  url_video_youtube:null,
};}
let activated=false;
try{
  await li(`/produto/${id}`,{method:'PUT',body:body(true)});
  const check=await li(`/produto/${id}?descricao_completa=1`);
  activated=check.ativo===true;
  console.log(`ATIVAÇÃO_CONFIRMADA=${activated} · ID=${id} · categorias=${Array.isArray(check.categorias)?check.categorias.length:'?'} · marca=${check.marca??'null'} · destaque=${check.destaque}`);
  if(!activated)throw new Error('API não confirmou ativação do produto técnico.');
  await sleep(1800);
} finally {
  await li(`/produto/${id}`,{method:'PUT',body:body(false)}).catch(()=>{});
}
const final=await li(`/produto/${id}?descricao_completa=1`);
console.log(`DESATIVAÇÃO_CONFIRMADA=${final.ativo===false} · ID=${id}`);
if(final.ativo!==false)throw new Error('Produto técnico não ficou desativado ao final do teste.');
console.log('RESULTADO '+JSON.stringify({produto_id:id,sku:SKU,ativacao_confirmada:activated,desativacao_confirmada:true,categorias:Array.isArray(final.categorias)?final.categorias.length:null,marca:final.marca??null,destaque:final.destaque,sem_dados_pessoais:true}));
