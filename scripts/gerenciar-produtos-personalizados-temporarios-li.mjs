import crypto from 'node:crypto';

const FIREBASE=(process.env.FIREBASE_BASE_URL||'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/,'');
const LI_BASE=(process.env.LOJA_INTEGRADA_BASE_URL||'https://api.awsli.com.br/v1').replace(/\/$/,'');
const AUTH=String(process.env.LOJA_INTEGRADA_AUTHORIZATION||'').trim();
const CREATIONS='canecas/personalizadas';
const LIMIT=Math.max(1,Math.min(30,Number(process.env.LIMIT||10)||10));
const REQUEST_MS=900;
const UNBOUGHT_DAYS=8;
const BOUGHT_DAYS=30;
const text=v=>String(v??'').trim();
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0;};
const digits=v=>text(v).replace(/\D+/g,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const isoAfterDays=days=>new Date(Date.now()+days*86400000).toISOString();
const now=()=>new Date().toISOString();
const safeKey=v=>encodeURIComponent(text(v));
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const slug=v=>norm(v).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,130)||`cf-temp-${Date.now()}`;
if(!AUTH)throw new Error('Token Loja Integrada ausente.');

async function jsonFetch(url,options={},{allow404=false}={}){let r;try{r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});}catch(cause){const e=new Error(`Falha de rede: ${cause?.message||cause}`);e.network=true;throw e;}const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data={raw}};if(allow404&&r.status===404)return null;if(!r.ok){const e=new Error(`${r.status} ${data?.error_message||data?.detail||data?.message||data?.error||raw}`);e.status=r.status;throw e;}return data;}
async function fbGet(path){return jsonFetch(`${FIREBASE}/${path}.json`,{headers:{Accept:'application/json'}});}
async function fbPatch(path,value){return jsonFetch(`${FIREBASE}/${path}.json`,{method:'PATCH',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(value)});}
let lastLi=0;
async function li(path,{method='GET',body,allow404=false}={}){const wait=Math.max(0,REQUEST_MS-(Date.now()-lastLi));if(wait)await sleep(wait);lastLi=Date.now();return jsonFetch(`${LI_BASE}${path}`,{method,headers:{Authorization:AUTH,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),'User-Agent':'CanecaFacil-Temporary-Personalized-Products/1.0'},...(body===undefined?{}:{body:JSON.stringify(body)})},{allow404});}

function creationApproved(c={}){return Boolean(c.aprovada===true||c.arte_aprovada?.url||c.arte_versao_aprovada||['aprovada','arte_aprovada','pronta_para_compra'].includes(text(c.status)));}
function tempMeta(c={}){return c.loja_integrada_temporario&&typeof c.loja_integrada_temporario==='object'?c.loja_integrada_temporario:{};}
function tempSku(id){const raw=text(id).toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(-18);const hash=crypto.createHash('sha1').update(text(id)).digest('hex').slice(0,6).toUpperCase();return `CFP-${raw||'CRIACAO'}-${hash}`.slice(0,30);}
function modelKey(c={}){return text(c.modelo_key||c.produto_key||c.model_id);}
function baseImage(p={}){return [p.mockup_2,p.mockup_1,p.url_imagem,p.imagem_url].map(text).find(v=>/^https?:\/\//i.test(v))||'';}
function productBody({creationId,sku,base,active,alias}){return {id_externo:null,sku,mpn:null,ncm:digits(base.ncm||'69111090')||'69111090',gtin:null,nome:`Caneca personalizada reservada · ${creationId.slice(-10).toUpperCase()}`,apelido:alias,descricao_completa:`Caneca personalizada reservada no CanecaFácil. Código técnico: ${creationId}. A arte aprovada permanece protegida no sistema CanecaFácil e não é publicada neste produto.`,ativo:active,bloqueado:false,destaque:false,peso:num(base.peso_embalado_kg||base.peso)||0.45,altura:Math.ceil(num(base.altura_embalada_cm||base.altura))||14,largura:Math.ceil(num(base.largura_embalada_cm||base.largura))||14,profundidade:Math.ceil(num(base.comprimento_embalado_cm||base.comprimento))||14,tipo:'normal',usado:false,categorias:[],marca:null,removido:false,url_video_youtube:null};}
function priceBody(base={}){return {cheio:num(base.preco)||19.9,custo:num(base.preco_custo||base.custo)||10,sob_consulta:false,promocional:num(base.preco_oferta||base.preco_promocional)||0};}
async function findBySku(sku){const d=await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`);const exact=(d?.objects||[]).filter(p=>norm(p?.sku)===norm(sku));if(exact.length>1)throw new Error(`SKU temporário ${sku} duplicado na Loja Integrada.`);return exact[0]||null;}
async function fetchProduct(id){return li(`/produto/${encodeURIComponent(id)}?descricao_completa=1`,{allow404:true});}
async function setActive(id,active){const p=await fetchProduct(id);if(!p)return false;const body={id_externo:p.id_externo??null,sku:p.sku,mpn:p.mpn??null,ncm:p.ncm??null,gtin:p.gtin??null,nome:p.nome,apelido:p.apelido,descricao_completa:p.descricao_completa??'',ativo:active,bloqueado:false,destaque:false,peso:num(p.peso)||0.45,altura:Number(p.altura)||14,largura:Number(p.largura)||14,profundidade:Number(p.profundidade)||14,tipo:'normal',usado:false,categorias:[],marca:null,removido:false,url_video_youtube:null};await li(`/produto/${id}`,{method:'PUT',body});const check=await fetchProduct(id);return check?.ativo===active;}
async function ensureImage(productId,url){if(!url)return '';const p=await fetchProduct(productId);if(Array.isArray(p?.imagens)&&p.imagens.length)return String(p.imagens[0]?.id||'');const created=await li('/produto_imagem',{method:'POST',body:{produto:`/api/v1/produto/${productId}`,imagem_url:url}});return String(created?.id||'');}

async function createOrReactivate(creationId,c){if(!creationApproved(c))return {status:'skip'};const meta=tempMeta(c);const key=modelKey(c);if(!key){await fbPatch(`${CREATIONS}/${safeKey(creationId)}`,{loja_integrada_temporario:{...meta,status:'revisar',erro:'Criação aprovada sem modelo/produto-base.',atualizado_em:now()}});return {status:'review'};}const base=await fbGet(`produtos/${safeKey(key)}`);if(!base){await fbPatch(`${CREATIONS}/${safeKey(creationId)}`,{loja_integrada_temporario:{...meta,status:'revisar',erro:'Produto-base não encontrado.',atualizado_em:now()}});return {status:'review'};}const sku=text(meta.sku)||tempSku(creationId);const alias=text(meta.alias)||slug(`caneca-personalizada-${sku}`);let remote=meta.produto_id?await fetchProduct(meta.produto_id):null;if(!remote)remote=await findBySku(sku);let id=text(remote?.id);if(remote){await li(`/produto/${id}`,{method:'PUT',body:productBody({creationId,sku,base,active:true,alias})});}else{const created=await li('/produto',{method:'POST',body:productBody({creationId,sku,base,active:true,alias})});id=text(created?.id);if(!id)throw new Error('Loja Integrada não retornou ID do produto temporário.');}
await li(`/produto_preco/${id}`,{method:'PUT',body:priceBody(base)});
await li(`/produto_estoque/${id}`,{method:'PUT',body:{gerenciado:false,quantidade:0,situacao_em_estoque:0,situacao_sem_estoque:0}});
const imageId=await ensureImage(id,baseImage(base));
const confirmed=await fetchProduct(id);if(!confirmed||confirmed.ativo!==true||norm(confirmed.sku)!==norm(sku))throw new Error('Produto temporário não foi confirmado pela Loja Integrada.');
const at=now();await fbPatch(`${CREATIONS}/${safeKey(creationId)}`,{loja_integrada_temporario:{...meta,status:'ativo',sku,produto_id:id,alias,url:text(confirmed.url),imagem_id:imageId,produto_base_key:key,criado_em:meta.criado_em||at,ativado_em:at,atualizado_em:at,expira_em:text(meta.comprado_em)?isoAfterDays(BOUGHT_DAYS):isoAfterDays(UNBOUGHT_DAYS),dias_sem_compra:UNBOUGHT_DAYS,dias_pos_compra:BOUGHT_DAYS,privacidade:'sem_arte_ou_dados_pessoais_na_loja_integrada',erro:''}});console.log(`TEMP OK ${creationId} · SKU ${sku} · ID ${id}`);return {status:'ok'};}

async function cleanup(creationId,c){const meta=tempMeta(c);if(meta.status!=='ativo'||!meta.produto_id)return {status:'skip'};const expires=Date.parse(text(meta.expira_em));if(!Number.isFinite(expires)||expires>Date.now())return {status:'skip'};const ok=await setActive(meta.produto_id,false);if(!ok)throw new Error(`Não foi possível confirmar desativação do produto temporário ${meta.produto_id}.`);const at=now();await fbPatch(`${CREATIONS}/${safeKey(creationId)}`,{loja_integrada_temporario:{...meta,status:'expirado',desativado_em:at,atualizado_em:at,erro:''}});console.log(`EXPIRADO ${creationId} · ID ${meta.produto_id}`);return {status:'expired'};}

const all=await fbGet(CREATIONS)||{};const entries=Object.entries(all);let created=0,expired=0,reviews=0,errors=0;
for(const [id,c] of entries){if(created+expired>=LIMIT)break;try{const meta=tempMeta(c);if(['solicitado','reativar'].includes(text(meta.status))){const r=await createOrReactivate(id,c);if(r.status==='ok')created++;else if(r.status==='review')reviews++;continue;}const r=await cleanup(id,c);if(r.status==='expired')expired++;}catch(error){errors++;const meta=tempMeta(c);const at=now();await fbPatch(`${CREATIONS}/${safeKey(id)}`,{loja_integrada_temporario:{...meta,status:'pendente_retry',erro:String(error?.message||error).slice(0,500),atualizado_em:at,proxima_tentativa_em:new Date(Date.now()+10*60000).toISOString()}}).catch(()=>{});console.warn(`TEMP RETRY ${id} · ${error.message}`);}}
console.log(`RESUMO TEMP · ativados=${created} · expirados=${expired} · revisar=${reviews} · erros=${errors} · limite=${LIMIT}`);
