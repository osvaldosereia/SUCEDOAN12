const FIREBASE_PRODUCTS_URL='https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const BUILD='20260828-product-media-2mockups-shorts-v1';
const MAX_SITE_IMAGES=3;
let activeRequest=0;

const text=value=>String(value??'').trim();
const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const isHttp=value=>/^https?:\/\//i.test(text(value));
function localAsset(value){const raw=text(value);if(!raw)return'';let match=raw.match(/^https?:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/([^/]+)\/(.+)$/i);if(match){const branch=decodeURIComponent(String(match[1]||'')),path=String(match[2]||'').replace(/^\/+/,'');return branch==='main'&&path?`/${path}`:raw}match=raw.match(/^https?:\/\/github\.com\/osvaldosereia\/SUCEDOAN12\/(?:raw|blob)\/([^/]+)\/(.+)$/i);if(match){const branch=decodeURIComponent(String(match[1]||'')),path=String(match[2]||'').replace(/^\/+/,'');return branch==='main'&&path?`/${path}`:raw}return raw}
function unique(values){return [...new Set(values.map(localAsset).filter(Boolean))]}
function mugArt(raw={}){const print=raw.arte_impressao;return localAsset(raw.arte_horizontal||raw.arte_personalizacao||(print&&typeof print==='object'?print.url:print)||raw.art_url||raw.arte_url)}
function isMug(raw={}){const cat=text(raw.categoria).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /caneca/.test(cat)||Boolean(mugArt(raw))}
function productImages(raw={}){
  if(isMug(raw)){
    const direct=unique([raw.mockup_1,raw.mockup_2]);
    const legacy=unique([...(Array.isArray(raw.imagens_site)?raw.imagens_site:[]),...(Array.isArray(raw.imagens)?raw.imagens:[]),raw.url_imagem,raw.imagem_url,raw.imagem]).filter(url=>url!==mugArt(raw));
    return unique([...direct,...legacy]).slice(0,2);
  }
  const preferred=Array.isArray(raw.imagens_site)&&raw.imagens_site.length?raw.imagens_site:Array.isArray(raw.imagens)&&raw.imagens.length?raw.imagens:[raw.url_imagem,raw.imagem_url,raw.imagem];
  return unique(preferred).slice(0,MAX_SITE_IMAGES);
}
function youtubeInfo(value){
  const raw=text(value);if(!raw)return null;
  try{const url=new URL(raw);const host=url.hostname.replace(/^www\./,'').toLowerCase();let id='',short=false;
    if(host==='youtu.be')id=url.pathname.split('/').filter(Boolean)[0]||'';
    if(host==='youtube.com'||host.endsWith('.youtube.com')){id=url.searchParams.get('v')||'';const parts=url.pathname.split('/').filter(Boolean);const marker=parts.findIndex(part=>['embed','shorts','live'].includes(part));if(marker>=0){id=id||parts[marker+1]||'';short=parts[marker]==='shorts'}}
    if(!/^[A-Za-z0-9_-]{11}$/.test(id))return null;return{id,short,raw};
  }catch{return null}
}
function routeReference(){const match=location.hash.match(/^#\/produto\/([^/?#]+)/i);return match?.[1]?decodeURIComponent(match[1]):''}

function bindGallery(images,{mug=false}={}){
  const media=document.querySelector('.product-detail-media'),main=document.getElementById('product-main-image');
  if(!media||!main||!images.length)return;
  main.src=images[0];main.dataset.fallback=images.slice(1).join('|');main.alt=mug?'Caneca personalizada — primeira vista':main.alt||'Foto do produto';
  media.querySelector('.image-thumbs')?.remove();
  if(images.length<=1)return;
  const thumbs=document.createElement('div');thumbs.className='image-thumbs product-media-thumbs';thumbs.setAttribute('aria-label',mug?'Duas vistas da caneca':'Fotos do produto');
  thumbs.innerHTML=images.map((image,index)=>`<button type="button" class="product-media-thumb${index===0?' active':''}" data-product-media-src="${escapeHtml(image)}" aria-label="${mug?`Ver mockup ${index+1}`:`Ver foto ${index+1}`}"><img loading="lazy" decoding="async" src="${escapeHtml(image)}" alt="${mug?`Mockup ${index+1} da caneca`:`Foto ${index+1} do produto`}"><span>${mug?`Vista ${index+1}`:`Foto ${index+1}`}</span></button>`).join('');
  media.appendChild(thumbs);
  thumbs.addEventListener('click',event=>{const button=event.target.closest('[data-product-media-src]');if(!button)return;main.src=button.dataset.productMediaSrc;thumbs.querySelectorAll('.product-media-thumb').forEach(item=>item.classList.toggle('active',item===button))});
}

function videoCard(info){
  const ratio=info.short?'short':'wide';
  const label=info.short?'Vídeo real da caneca':'Vídeo do produto';
  const sub=info.short?'Veja a caneca de verdade no nosso Short':'Veja o produto em mais detalhes';
  const poster=`https://i.ytimg.com/vi/${encodeURIComponent(info.id)}/hqdefault.jpg`;
  return `<section class="product-real-video" data-product-video-card data-video-ratio="${ratio}"><div class="product-extra-heading"><strong>${label}</strong><span>${sub}</span></div><button class="product-video-poster" type="button" data-play-youtube="${escapeHtml(info.id)}" data-youtube-short="${info.short?'1':'0'}" aria-label="Reproduzir ${escapeHtml(label)}"><img loading="lazy" decoding="async" src="${poster}" alt="Capa do vídeo ${escapeHtml(label)}"><span class="product-video-play" aria-hidden="true">▶</span><span class="product-video-cta">Assistir</span></button></section>`;
}
function bindExtras(raw){
  document.querySelector('[data-product-extra-media]')?.remove();
  const detail=document.querySelector('.product-detail');if(!detail)return;
  const art=mugArt(raw),video=youtubeInfo(raw.video_youtube||raw.video_url||raw.youtube||raw.youtube_url),mug=isMug(raw);
  if(!art&&!video)return;
  const section=document.createElement('section');section.className='product-extra-media';section.dataset.productExtraMedia='1';
  const blocks=[];
  if(mug&&isHttp(art))blocks.push(`<section class="product-print-art"><div class="product-extra-heading"><strong>Arte da caneca</strong><span>Esta é a arte usada na impressão</span></div><button type="button" class="product-art-open" data-open-product-art="${escapeHtml(art)}" aria-label="Ampliar arte da caneca"><img loading="lazy" decoding="async" src="${escapeHtml(art)}" alt="Arte horizontal que será impressa na caneca"><span>Toque para ampliar</span></button></section>`);
  if(video)blocks.push(videoCard(video));
  section.innerHTML=blocks.join('');
  detail.insertAdjacentElement('afterend',section);
  section.addEventListener('click',event=>{
    const artButton=event.target.closest('[data-open-product-art]');if(artButton){window.open(artButton.dataset.openProductArt,'_blank','noopener');return}
    const play=event.target.closest('[data-play-youtube]');if(!play)return;
    const id=play.dataset.playYoutube,short=play.dataset.youtubeShort==='1',host=play.parentElement;
    const iframe=document.createElement('iframe');iframe.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0`;iframe.title=short?'YouTube Short da caneca':'Vídeo do produto no YouTube';iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.className='product-youtube-iframe';host.replaceChild(iframe,play);
  });
}
async function enhanceCurrentProduct(){
  const reference=routeReference();if(!reference)return;const request=++activeRequest;
  try{const response=await fetch(`${FIREBASE_PRODUCTS_URL}/${encodeURIComponent(reference)}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)return;const raw=await response.json();if(!raw||request!==activeRequest||reference!==routeReference())return;const mug=isMug(raw);bindGallery(productImages(raw),{mug});bindExtras(raw);document.documentElement.dataset.productMediaBuild=BUILD}catch(error){console.warn('Mídia complementar do produto não pôde ser carregada:',error)}
}
function injectStyle(){if(document.getElementById('productMediaStyleV2'))return;const style=document.createElement('style');style.id='productMediaStyleV2';style.textContent=`
.product-media-thumbs{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.product-media-thumb{min-height:56px;border:1px solid #e3e4df;background:#fff;border-radius:13px;padding:5px;cursor:pointer;overflow:hidden;position:relative}.product-media-thumb.active{border-color:#20231f;box-shadow:0 0 0 1px #20231f}.product-media-thumb img{display:block;width:100%;aspect-ratio:1;object-fit:contain;border-radius:9px;background:#f8f8f6}.product-media-thumb span{display:block;padding:5px 3px 2px;font-size:10px;font-weight:800;color:#62665f}
.product-extra-media{display:grid;gap:18px;margin:18px 0 26px}.product-print-art,.product-real-video{padding:14px;background:#fff;border:1px solid #e7e8e3;border-radius:18px}.product-extra-heading{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px}.product-extra-heading strong{font-size:17px}.product-extra-heading span{font-size:11px;color:#777;text-align:right}
.product-art-open{display:block;width:100%;border:0;background:#f4f5f1;border-radius:14px;padding:8px;cursor:zoom-in}.product-art-open img{display:block;width:100%;aspect-ratio:2.5/1;object-fit:contain;border-radius:10px}.product-art-open>span{display:block;margin-top:6px;font-size:10px;font-weight:750;color:#6c716a}
.product-real-video[data-video-ratio="short"]{display:grid;justify-items:center}.product-real-video[data-video-ratio="short"] .product-extra-heading{width:min(100%,390px)}.product-video-poster,.product-youtube-iframe{display:block;border:0;border-radius:16px;background:#111;overflow:hidden}.product-video-poster{position:relative;padding:0;cursor:pointer;width:100%}.product-real-video[data-video-ratio="short"] .product-video-poster,.product-real-video[data-video-ratio="short"] .product-youtube-iframe{width:min(100%,390px);aspect-ratio:9/16}.product-real-video[data-video-ratio="wide"] .product-video-poster,.product-real-video[data-video-ratio="wide"] .product-youtube-iframe{width:100%;aspect-ratio:16/9}.product-video-poster img{display:block;width:100%;height:100%;object-fit:cover;opacity:.9}.product-video-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.94);color:#111;display:grid;place-items:center;font-size:25px;padding-left:4px;box-shadow:0 8px 26px rgba(0,0,0,.22)}.product-video-cta{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);padding:7px 12px;border-radius:999px;background:rgba(0,0,0,.68);color:#fff;font-size:11px;font-weight:850}.product-youtube-iframe{border:0}
@media(max-width:700px){.product-extra-media{gap:14px;margin:14px 0 22px}.product-print-art,.product-real-video{padding:11px;border-radius:15px}.product-extra-heading{display:block}.product-extra-heading strong,.product-extra-heading span{display:block}.product-extra-heading span{margin-top:2px;text-align:left}.product-media-thumbs{gap:6px}.product-media-thumb{border-radius:10px}.product-video-play{width:58px;height:58px}.product-real-video[data-video-ratio="short"] .product-video-poster,.product-real-video[data-video-ratio="short"] .product-youtube-iframe{width:min(88vw,360px)}}`;document.head.appendChild(style)}

injectStyle();
window.addEventListener('da:route-rendered',enhanceCurrentProduct);
window.addEventListener('hashchange',()=>setTimeout(enhanceCurrentProduct,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhanceCurrentProduct,{once:true});else enhanceCurrentProduct();

export { BUILD, localAsset, productImages, mugArt, youtubeInfo, enhanceCurrentProduct };
