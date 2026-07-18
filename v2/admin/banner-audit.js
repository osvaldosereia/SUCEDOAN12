function text(value){return String(value??'').trim();}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function list(raw){return Array.isArray(raw)?raw:Object.values(raw||{});}
function norm(value){return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function parseDate(value,end=false){const raw=text(value);if(!raw)return null;const normalized=/^\d{4}-\d{2}-\d{2}$/.test(raw)?`${raw}T${end?'23:59:59':'00:00:00'}`:raw;const time=new Date(normalized).getTime();return Number.isFinite(time)?time:null;}
function refs(raw={}){const linked=raw.produtos||raw.products||raw.itens||raw.productRefs||[];const values=list(linked).map(item=>item&&typeof item==='object'?item.firebaseKey||item.id||item.codigo||item.gtin||item.ean:item).map(text).filter(Boolean);const direct=raw.produto||raw.product||raw.firebaseKey||raw.produto_id||raw.codigo_produto||raw.codigo;const one=direct&&typeof direct==='object'?direct.firebaseKey||direct.id||direct.codigo||direct.gtin||direct.ean:direct;if(one)values.unshift(text(one));return [...new Set(values)];}

export function normalizeBanner(raw={},index=0){
  const link=raw.link&&typeof raw.link==='object'?raw.link:{};
  const target=text(raw.categoria||raw.category||raw.posicao_categoria||raw.segmento||link.valor);
  const position=text(raw.posicao||raw.position||raw.local||raw.slot||'sem_posicao');
  const start=text(raw.inicio||raw.data_inicio||raw.start_at||raw.startsAt);
  const end=text(raw.fim||raw.data_fim||raw.validade||raw.end_at||raw.endsAt);
  const image=text(raw.imagem||raw.image||raw.arquivo||raw.url||raw.desktop||raw.mobile||raw?.arquivos?.desktop||raw?.arquivos?.mobile);
  return Object.freeze({id:text(raw.id||raw.banner_id||`banner-${index+1}`),title:text(raw.titulo||raw.title||raw.nome||raw.alt||`Banner ${index+1}`),position,target,start,end,image,active:raw.ativo!==false&&raw.active!==false,productRefs:refs(raw),raw});
}

function findProduct(index,ref){if(!(index instanceof Map))return null;return index.get(norm(ref))||index.get(text(ref).toLowerCase())||null;}

export function auditBanner(banner,productIndex,now=Date.now()){
  const products=[],missingProducts=[],unavailableProducts=[];
  for(const ref of banner.productRefs){const product=findProduct(productIndex,ref);if(!product){missingProducts.push(ref);continue;}products.push(product);if(product.situacao==='I'||number(product.estoque)<=0||number(product.preco)<=0)unavailableProducts.push(product.id||ref);}
  const start=parseDate(banner.start),end=parseDate(banner.end,true);
  const invalidPeriod=start!==null&&end!==null&&end<start;
  const scheduled=start!==null&&start>now;
  const expired=end!==null&&end<now;
  const status=!banner.active?'inactive':invalidPeriod?'invalid-period':expired?'expired':scheduled?'scheduled':'active';
  const orphan=banner.productRefs.length>0&&products.length===0;
  const issues=[...missingProducts.map(ref=>`Produto não encontrado: ${ref}`),...unavailableProducts.map(ref=>`Produto indisponível: ${ref}`),...(invalidPeriod?['Período inválido.']:[]),...(!banner.image?['Imagem não informada.']:[]),...(!banner.position?['Posição não informada.']:[])];
  return Object.freeze({banner,products,missingProducts,unavailableProducts,status,orphan,issues,valid:issues.length===0&&status==='active'});
}

export function auditBannerDocument(document={},productIndex,categories=[]){
  const banners=list(document.banners).map(normalizeBanner);
  const rows=banners.map(banner=>auditBanner(banner,productIndex));
  const coverage=new Map(categories.filter(Boolean).map(category=>[category,0]));
  for(const row of rows){if(row.status==='inactive'||row.status==='expired')continue;const category=row.banner.target;if(category)coverage.set(category,(coverage.get(category)||0)+1);}
  const max=number(document?.settings?.automatic_positioning?.max_active_per_category||document?.settings?.banner_limits?.max_active_per_category||8)||8;
  const coverageRows=[...coverage.entries()].map(([category,count])=>Object.freeze({category,count,missing:Math.max(0,max-count),complete:count>=max})).sort((a,b)=>a.count-b.count||a.category.localeCompare(b.category,'pt-BR'));
  return Object.freeze({settings:document.settings||{},schemaVersion:document.schema_version||document.schemaVersion||'',updatedAt:document.updated_at||document.updatedAt||'',rows,total:rows.length,active:rows.filter(row=>row.status==='active').length,scheduled:rows.filter(row=>row.status==='scheduled').length,expired:rows.filter(row=>row.status==='expired').length,blocked:rows.filter(row=>row.issues.length>0).length,orphaned:rows.filter(row=>row.orphan).length,coverage:coverageRows,maxPerCategory:max});
}

export function filterBannerAudits(rows=[],query='',filter=''){const q=norm(query);return rows.filter(row=>{const haystack=norm([row.banner.title,row.banner.id,row.banner.position,row.banner.target,...row.banner.productRefs].join(' '));if(q&&!haystack.includes(q))return false;if(filter==='active'&&row.status!=='active')return false;if(filter==='scheduled'&&row.status!=='scheduled')return false;if(filter==='expired'&&row.status!=='expired')return false;if(filter==='blocked'&&!row.issues.length)return false;if(filter==='orphan'&&!row.orphan)return false;return true;});}
