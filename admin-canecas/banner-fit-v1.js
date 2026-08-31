const BUILD='20260830-banner-fit-v1';

const FIT={
  full:{
    desktop:{ai_size:'1376x480',fit_mode:'resize-no-crop',safe_zone:'Use todo o quadro. Todos os elementos importantes devem permanecer com margem interna de cerca de 5%.'},
    mobile:{ai_size:'736x896',fit_mode:'resize-no-crop',safe_zone:'Use todo o quadro vertical. Todos os elementos importantes devem permanecer com margem interna de cerca de 5%.'}
  },
  mini:{
    desktop:{ai_size:'1152x640',fit_mode:'resize-no-crop',safe_zone:'Use todo o quadro. A proporção gerada corresponde à proporção final; não coloque elementos importantes colados às bordas.'},
    mobile:{ai_size:'1152x640',fit_mode:'resize-no-crop',safe_zone:'Use todo o quadro. A proporção gerada corresponde à proporção final; não coloque elementos importantes colados às bordas.'}
  },
  vitrine:{
    desktop:{ai_size:'1536x512',fit_mode:'central-safe-crop',safe_zone:'A saída final é mais larga que o limite do modelo. Mantenha TODO texto, CTA, rostos e canecas importantes dentro da faixa horizontal central equivalente a aproximadamente 72% da altura do quadro gerado. Fundo e elementos decorativos podem sangrar acima e abaixo.'},
    mobile:{ai_size:'1536x512',fit_mode:'central-safe-crop',safe_zone:'A saída final é mais larga que o limite do modelo. Mantenha TODO texto, CTA, rostos e canecas importantes dentro da faixa horizontal central equivalente a aproximadamente 71% da altura do quadro gerado. Fundo e elementos decorativos podem sangrar acima e abaixo.'}
  },
  tarja:{
    desktop:{ai_size:'1536x512',fit_mode:'central-safe-crop',safe_zone:'ATENÇÃO: esta é uma tarja extremamente horizontal. Concentre TODO texto, CTA, ícones e elementos essenciais numa faixa horizontal muito estreita no centro, equivalente a aproximadamente 16% da altura do quadro gerado. Use fundo contínuo acima e abaixo para sangria. Evite personagem grande e excesso de produtos.'},
    mobile:{ai_size:'1536x512',fit_mode:'central-safe-crop',safe_zone:'ATENÇÃO: esta é uma tarja extremamente horizontal. Concentre TODO texto, CTA, ícones e elementos essenciais numa faixa horizontal muito estreita no centro, equivalente a aproximadamente 19% da altura do quadro gerado. Use fundo contínuo acima e abaixo para sangria. Evite personagem grande e excesso de produtos.'}
  }
};

function patchBannerRequestBody(body){
  try{
    const data=typeof body==='string'?JSON.parse(body):body;
    if(!data||data.action!=='generate_final_banner_from_reference_mugs')return body;
    const type=String(data.banner?.type||'full');
    const cfg=FIT[type]||FIT.full;
    data.banner=data.banner||{};
    for(const kind of ['desktop','mobile']){
      data.banner[kind]=data.banner[kind]||{};
      data.banner[kind].ai_size=cfg[kind].ai_size;
      data.banner[kind].fit_mode=cfg[kind].fit_mode;
      data.banner[kind].safe_zone=cfg[kind].safe_zone;
    }
    data.fit_build=BUILD;
    return JSON.stringify(data);
  }catch{return body}
}

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init={}){
  if(init?.body){
    const patched=patchBannerRequestBody(init.body);
    if(patched!==init.body)init={...init,body:patched};
  }
  return nativeFetch(input,init);
};

const nativeDrawImage=CanvasRenderingContext2D.prototype.drawImage;
const NO_CROP_TARGETS=new Set(['1270x444','722x888','720x400']);
CanvasRenderingContext2D.prototype.drawImage=function(...args){
  try{
    const c=this.canvas,key=`${c.width}x${c.height}`;
    if(NO_CROP_TARGETS.has(key)&&args.length===5){
      const [img,x,y,w,h]=args;
      const looksLikeCover=Number(x)<0||Number(y)<0||Number(w)>c.width+1||Number(h)>c.height+1;
      if(looksLikeCover&&img?.width&&img?.height){
        return nativeDrawImage.call(this,img,0,0,c.width,c.height);
      }
    }
  }catch{}
  return nativeDrawImage.apply(this,args);
};

document.documentElement.dataset.bannerFit=BUILD;
