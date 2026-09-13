export const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_INPUT_PHOTOS = 3;
export const CARD_IMAGE_ORDER = Object.freeze(['hero','lifestyle','detail']);
export const FIVE_NAME_FIELDS = Object.freeze(['tipo_produto','devocao_tema','material_modelo','cor_acabamento','diferencial_tamanho']);

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const list=v=>Array.isArray(v)?v.map(clean).filter(Boolean):[];
const money=v=>{
  if(v===null||v===undefined||v==='') return null;
  const n=Number(String(v).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?Math.round(n*100)/100:null;
};

export function validatePhotoFile(file){
  if(!file) return {ok:false,error:'Selecione ou tire uma foto.'};
  if(!ACCEPTED_IMAGE_TYPES.has(String(file.type||''))) return {ok:false,error:'Use uma foto JPG, PNG ou WebP.'};
  const size=Number(file.size||0);
  if(size<5000) return {ok:false,error:'A foto parece vazia ou pequena demais.'};
  if(size>MAX_IMAGE_BYTES) return {ok:false,error:'A foto está muito grande. Use uma imagem de até 10 MB.'};
  return {ok:true};
}

export function validatePhotoFiles(files=[]){
  const arr=Array.from(files||[]);
  if(arr.length<1) return {ok:false,error:'Adicione pelo menos uma foto.'};
  if(arr.length>MAX_INPUT_PHOTOS) return {ok:false,error:'Use no máximo 3 fotos do mesmo produto.'};
  for(const f of arr){const v=validatePhotoFile(f);if(!v.ok)return v;}
  return {ok:true};
}

export function buildFiveCharacteristicName(analysis={}){
  return FIVE_NAME_FIELDS.map(k=>clean(analysis?.[k])).filter(Boolean).join(' ');
}

export function normalizeManualCatalogFields(input={}){
  return {
    ean:clean(input.ean).replace(/\D/g,'').slice(0,14),
    ncm:clean(input.ncm).replace(/\D/g,'').slice(0,8),
    preco_custo:money(input.preco_custo),
    preco_venda:money(input.preco_venda),
  };
}

export function buildWhatsAppUrl(text){
  return `https://wa.me/?text=${encodeURIComponent(String(text||''))}`;
}

export function buildShareText(analysis={}){
  return [analysis.nome_cadastro?`*${analysis.nome_cadastro}*`:'',analysis.descricao_vitrine||''].filter(Boolean).join('\n\n');
}

export function buildProductCardModel(analysis={}, image={}){
  return {
    name:String(analysis.nome_cadastro||'').trim(),
    description:String(analysis.descricao_vitrine||'').trim(),
    imageUrl:String(image.url||'').trim(),
    kind:String(image.kind||'').trim(),
    aspectRatio:'1 / 1',
  };
}

export function buildRunCardModel(run={},logoUrl=''){
  const analysis=run.analysis||{};
  const rawImages=run.images||{};
  const sourceArray=Array.isArray(rawImages)
    ? rawImages
    : Object.entries(rawImages).map(([kind,value])=>({kind,...(value||{})}));
  const byKind=new Map(sourceArray.map(item=>[String(item.kind||''),item]));
  const gallery=CARD_IMAGE_ORDER.map(kind=>{
    const item=byKind.get(kind)||{};
    const url=clean(item.url||item.image_url);
    return {
      kind,
      title:clean(item.title)||({hero:'Foto principal',lifestyle:'Em uso',detail:'Detalhe'}[kind]),
      url,
      downloadUrl:url,
      status:clean(item.status)||(url?'completed':'pending'),
      validation:item.validation||{},
    };
  });
  const available=gallery.find(x=>x.url);
  const conflicts=list(analysis.conflitos?.length?analysis.conflitos:run.conflicts);
  return {
    runId:clean(run.id||run.run_id),
    logoUrl:clean(logoUrl||run.logo_url),
    name:buildFiveCharacteristicName(analysis)||clean(analysis.nome_cadastro||run.nome_cadastro),
    storefrontDescription:clean(analysis.descricao_vitrine||run.descricao_vitrine),
    catalogDescription:clean(analysis.descricao_cadastro||run.descricao_cadastro),
    ean:clean(run.ean||analysis.ean_detectado),
    ncm:clean(run.ncm),
    precoCusto:run.preco_custo===null||run.preco_custo===undefined?null:Number(run.preco_custo),
    precoVenda:run.preco_venda===null||run.preco_venda===undefined?null:Number(run.preco_venda),
    attributes:{
      tipo_produto:clean(analysis.tipo_produto),
      devocao_tema:clean(analysis.devocao_tema),
      material_modelo:clean(analysis.material_modelo),
      cor_acabamento:clean(analysis.cor_acabamento),
      diferencial_tamanho:clean(analysis.diferencial_tamanho),
    },
    searchTerms:list(analysis.termos_busca),
    conflicts,
    observations:list(analysis.observacoes?.length?analysis.observacoes:run.observations),
    confidence:Number(analysis.confianca_geral||0),
    needsReview:Boolean(analysis.precisa_revisao),
    reviewReason:clean(analysis.motivo_revisao),
    gallery,
    activeKind:(byKind.get('hero')?.url||byKind.get('hero')?.image_url)?'hero':(available?.kind||'hero'),
    aspectRatio:'1 / 1',
  };
}
