const LI_BASE=(process.env.LOJA_INTEGRADA_BASE_URL||'https://api.awsli.com.br/v1').replace(/\/$/,'');
const AUTH=String(process.env.LOJA_INTEGRADA_AUTHORIZATION||'').trim();
const FIREBASE=(process.env.FIREBASE_BASE_URL||'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/,'');
const SKU='CF-TEMP-UX-001';
const NAME='[TESTE INTERNO] Caneca Personalizada Temporária';
const ALIAS='teste-interno-caneca-personalizada-temporaria-cf-temp-ux-001';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
if(!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');
let last=0;
async function li(path,{method='GET',body,allow404=false}={}){
  const wait=Math.max(0,900-(Date.now()-last)); if(wait) await sleep(wait); last=Date.now();
  const r=await fetch(`${LI_BASE}${path}`,{method,headers:{Authorization:AUTH,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),'User-Agent':'CanecaFacil-Temporary-Product-Test/1.0'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const raw=await r.text(); let data=null; try{data=raw?JSON.parse(raw):null}catch{data={raw}};
  if(allow404&&r.status===404) return null;
  if(!r.ok){const e=new Error(`${r.status} ${data?.error_message||data?.detail||data?.message||data?.error||raw}`);e.status=r.status;e.data=data;throw e;}
  return data;
}
async function listAll(endpoint){let out=[];for(let offset=0;offset<1000;offset+=100){const d=await li(`${endpoint}?limit=100&offset=${offset}`);const b=Array.isArray(d?.objects)?d.objects:[];out.push(...b);if(b.length<100)break;}return out;}
async function findBySku(){const d=await li(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);return (d?.objects||[]).find(x=>norm(x?.sku)===norm(SKU))||null;}
async function fbPut(value){const r=await fetch(`${FIREBASE}/canecas/integracoes/loja_integrada/teste_produto_temporario.json`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(!r.ok)throw new Error(`Firebase ${r.status}`);}
const brands=await listAll('/marca');
const categories=await listAll('/categoria');
const brand=brands.find(x=>norm(x?.nome)===norm('Caneca Fácil'));
const category=categories.find(x=>norm(x?.nome)===norm('Canecas Personalizáveis'));
if(!brand?.resource_uri||!category?.resource_uri) throw new Error('Marca/categoria padrão não encontrada.');
function body({ativo=false,visivelMarker=false}={}){
  const b={id_externo:null,sku:SKU,mpn:null,ncm:'69111090',gtin:null,nome:NAME,apelido:ALIAS,descricao_completa:'Produto técnico temporário para validar privacidade, carrinho e recursos nativos da Loja Integrada. NÃO COMPRAR.',ativo,destaque:false,peso:0.45,altura:14,largura:14,profundidade:14,tipo:'normal',usado:false,categorias:[category.resource_uri],marca:brand.resource_uri,removido:false,url_video_youtube:null};
  if(visivelMarker)b.visivel=false;
  return b;
}
let remote=await findBySku();
let id='';
if(!remote){
  const created=await li('/produto',{method:'POST',body:body({ativo:false})}); id=String(created?.id||''); if(!id)throw new Error('Criação não retornou ID.'); console.log(`CRIADO INATIVO · ID ${id} · SKU ${SKU}`);
}else{id=String(remote.id);await li(`/produto/${id}`,{method:'PUT',body:body({ativo:false})});console.log(`REUTILIZADO E MANTIDO INATIVO · ID ${id} · SKU ${SKU}`);}
await li(`/produto_preco/${id}`,{method:'PUT',body:{cheio:19.9,custo:10,sob_consulta:false,promocional:0}});
await li(`/produto_estoque/${id}`,{method:'PUT',body:{gerenciado:true,quantidade:1,situacao_em_estoque:0,situacao_sem_estoque:-1}});
let visibilityAccepted=false,visibilityPersisted=false,activatedInvisible=false,visibilityError='';
try{
  await li(`/produto/${id}`,{method:'PUT',body:body({ativo:false,visivelMarker:true})}); visibilityAccepted=true;
  const checked=await li(`/produto/${id}?descricao_completa=1`); visibilityPersisted=Object.prototype.hasOwnProperty.call(checked||{},'visivel')&&checked.visivel===false;
  console.log(`TESTE visivel:false · aceito=${visibilityAccepted} · persistido=${visibilityPersisted}`);
  if(visibilityPersisted){
    await li(`/produto/${id}`,{method:'PUT',body:body({ativo:true,visivelMarker:true})});
    const activeCheck=await li(`/produto/${id}?descricao_completa=1`);
    activatedInvisible=activeCheck?.ativo===true&&activeCheck?.visivel===false;
    console.log(`ATIVO + INVISÍVEL · confirmado=${activatedInvisible}`);
    if(!activatedInvisible) await li(`/produto/${id}`,{method:'PUT',body:body({ativo:false})});
  } else {
    await li(`/produto/${id}`,{method:'PUT',body:body({ativo:false})});
  }
}catch(error){visibilityError=error.message;console.log(`visivel:false NÃO suportado/persistido · ${error.message}`);await li(`/produto/${id}`,{method:'PUT',body:body({ativo:false})});}
const finalProduct=await li(`/produto/${id}?descricao_completa=1`);
const result={executado_em:new Date().toISOString(),produto_id:id,sku:SKU,nome:NAME,url:text(finalProduct?.url),alias:text(finalProduct?.apelido),ativo:finalProduct?.ativo===true,removido:finalProduct?.removido===true,api_tem_campo_visivel:Object.prototype.hasOwnProperty.call(finalProduct||{},'visivel'),visivel:finalProduct?.visivel??null,teste_visivel_aceito:visibilityAccepted,teste_visivel_persistido:visibilityPersisted,ativo_invisivel_confirmado:activatedInvisible,erro_visibilidade:visibilityError,status:activatedInvisible?'pronto_para_teste_loja':'mantido_inativo_por_seguranca'};
await fbPut(result);
console.log('RESULTADO '+JSON.stringify(result));
