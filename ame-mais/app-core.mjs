export const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const CARD_IMAGE_ORDER = Object.freeze(['hero','lifestyle','detail']);

export function validatePhotoFile(file){
  if(!file) return {ok:false,error:'Selecione ou tire uma foto.'};
  if(!ACCEPTED_IMAGE_TYPES.has(String(file.type||''))) return {ok:false,error:'Use uma foto JPG, PNG ou WebP.'};
  const size=Number(file.size||0);
  if(size<5000) return {ok:false,error:'A foto parece vazia ou pequena demais.'};
  if(size>MAX_IMAGE_BYTES) return {ok:false,error:'A foto está muito grande. Use uma imagem de até 10 MB.'};
  return {ok:true};
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

const clean=v=>String(v??'').trim();
const list=v=>Array.isArray(v)?v.map(clean).filter(Boolean):[];

export function buildRunCardModel(run={}){
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
    name:clean(analysis.nome_cadastro||run.nome_cadastro),
    storefrontDescription:clean(analysis.descricao_vitrine||run.descricao_vitrine),
    catalogDescription:clean(analysis.descricao_cadastro||run.descricao_cadastro),
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
