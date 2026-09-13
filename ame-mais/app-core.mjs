export const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
