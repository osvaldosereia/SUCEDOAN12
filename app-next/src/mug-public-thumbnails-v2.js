const BUILD='20260828-mug-thumbnails-v3-cylindrical';
const FIREBASE_PRODUCTS='https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const checked=new Set();
const rawCache=new Map();
let observer=null;
const text=v=>String(v??'').trim();
const truthy=v=>v===true||v===1||['1','true','sim','yes'].includes(text(v).toLowerCase());
const isUrl=v=>/^https?:\/\//i.test(text(v));
const isMug=raw=>truthy(raw?.modelo_caneca)||truthy(raw?.produto_sob_encomenda)||text(raw?.categoria).toLowerCase().includes('caneca');
const artUrl=raw=>{const p=raw?.arte_impressao;return [raw?.arte_horizontal,raw?.arte_personalizacao,p&&typeof p==='object'?p.url:p,raw?.art_url,raw?.arte_url].map(text).find(isUrl)||'';};
const thumbUrl=raw=>[raw?.thumbnail,raw?.mug_thumbnail,raw?.thumb,raw?.miniatura].map(text).find(isUrl)||'';

function image(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function mugBodyPath(ctx){ctx.beginPath();ctx.moveTo(132,105);ctx.bezierCurveTo(174,91,347,91,389,105);ctx.lineTo(378,381);ctx.bezierCurveTo(374,420,338,438,260,440);ctx.bezierCurveTo(181,438,146,420,142,381);ctx.closePath();}
function handlePath(ctx){ctx.beginPath();ctx.moveTo(374,154);ctx.bezierCurveTo(448,143,474,188,472,258);ctx.bezierCurveTo(470,333,433,368,375,352);ctx.lineWidth=34;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#fafaf7';ctx.stroke();ctx.lineWidth=5;ctx.strokeStyle='rgba(70,72,68,.13)';ctx.stroke();}
async function fetchRaw(id){if(rawCache.has(id))return rawCache.get(id);const p=fetch(`${FIREBASE_PRODUCTS}/${encodeURIComponent(id)}.json`,{cache:'force-cache',headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():null).catch(()=>null);rawCache.set(id,p);return p;}

function drawCylindricalArt(ctx,art){
  const targetTop=187,targetHeight=142,cx=260,halfW=127;
  const visibleSourceRatio=.44;
  const sourceWidth=art.naturalWidth*visibleSourceRatio;
  const sourceX=(art.naturalWidth-sourceWidth)/2;
  const sourceY=0;
  const sourceHeight=art.naturalHeight;
  const strips=72;
  const maxTheta=1.12;
  ctx.save();
  mugBodyPath(ctx);
  ctx.clip();
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  for(let i=0;i<strips;i++){
    const t0=i/strips;
    const t1=(i+1)/strips;
    const theta0=-maxTheta+(maxTheta*2*t0);
    const theta1=-maxTheta+(maxTheta*2*t1);
    const x0=cx+halfW*(Math.sin(theta0)/Math.sin(maxTheta));
    const x1=cx+halfW*(Math.sin(theta1)/Math.sin(maxTheta));
    const sx=sourceX+sourceWidth*t0;
    const sw=Math.max(1,sourceWidth/strips+1);
    ctx.drawImage(art,sx,sourceY,sw,sourceHeight,x0,targetTop,Math.max(1.4,x1-x0+1),targetHeight);
  }
  const shade=ctx.createLinearGradient(cx-halfW,0,cx+halfW,0);
  shade.addColorStop(0,'rgba(18,20,18,.33)');
  shade.addColorStop(.12,'rgba(255,255,255,.03)');
  shade.addColorStop(.34,'rgba(255,255,255,.11)');
  shade.addColorStop(.52,'rgba(255,255,255,0)');
  shade.addColorStop(.78,'rgba(255,255,255,.13)');
  shade.addColorStop(1,'rgba(20,22,20,.31)');
  ctx.fillStyle=shade;
  ctx.fillRect(cx-halfW-4,targetTop-1,halfW*2+8,targetHeight+2);
  ctx.restore();
}

async function makeThumb(url){
  const art=await image(url);
  const c=document.createElement('canvas');
  c.width=520;c.height=520;
  const x=c.getContext('2d');
  x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';

  const bg=x.createRadialGradient(235,132,20,260,260,370);
  bg.addColorStop(0,'#ffffff');
  bg.addColorStop(.58,'#f7f5f0');
  bg.addColorStop(1,'#e9e5dc');
  x.fillStyle=bg;x.fillRect(0,0,520,520);

  x.save();
  x.filter='blur(15px)';x.globalAlpha=.23;x.fillStyle='#292b28';
  x.beginPath();x.ellipse(270,444,151,28,0,0,Math.PI*2);x.fill();x.restore();

  handlePath(x);

  x.save();
  x.shadowColor='rgba(31,34,30,.14)';x.shadowBlur=16;x.shadowOffsetY=8;
  mugBodyPath(x);x.fillStyle='#fbfbf8';x.fill();x.restore();

  drawCylindricalArt(x,art);

  x.save();
  mugBodyPath(x);x.clip();
  const gloss=x.createLinearGradient(130,108,390,420);
  gloss.addColorStop(0,'rgba(255,255,255,.78)');
  gloss.addColorStop(.16,'rgba(255,255,255,.12)');
  gloss.addColorStop(.46,'rgba(255,255,255,0)');
  gloss.addColorStop(.88,'rgba(20,22,20,.05)');
  x.fillStyle=gloss;x.fillRect(125,94,275,350);
  x.restore();

  x.lineWidth=4;x.strokeStyle='rgba(72,74,70,.13)';mugBodyPath(x);x.stroke();

  const rim=x.createLinearGradient(0,92,0,126);
  rim.addColorStop(0,'#ffffff');rim.addColorStop(1,'#efeee9');
  x.fillStyle=rim;x.beginPath();x.ellipse(260,105,129,22,0,0,Math.PI*2);x.fill();
  x.lineWidth=4;x.strokeStyle='rgba(74,76,72,.12)';x.stroke();
  x.fillStyle='#e8e7e2';x.beginPath();x.ellipse(260,105,108,13,0,0,Math.PI*2);x.fill();
  const inner=x.createLinearGradient(0,92,0,116);inner.addColorStop(0,'#d7d6d1');inner.addColorStop(1,'#f5f4ef');x.fillStyle=inner;x.beginPath();x.ellipse(260,106,101,10,0,0,Math.PI*2);x.fill();

  const foot=x.createLinearGradient(0,421,0,448);foot.addColorStop(0,'rgba(255,255,255,.02)');foot.addColorStop(1,'rgba(80,82,78,.12)');x.fillStyle=foot;x.beginPath();x.ellipse(260,429,103,12,0,0,Math.PI*2);x.fill();

  return c.toDataURL('image/webp',.88);
}

async function processCard(card){const id=text(card.dataset.productCard);if(!id||checked.has(id))return;const img=card.querySelector('.product-card-media img');if(!img)return;checked.add(id);try{const raw=await fetchRaw(id);if(!raw||!isMug(raw))return;const persisted=thumbUrl(raw);if(persisted){img.src=persisted;img.dataset.mugThumb=BUILD;img.style.objectFit='cover';return;}const art=artUrl(raw);if(!art)return;img.src=await makeThumb(art);img.dataset.mugThumb=BUILD;img.style.objectFit='cover';}catch(err){checked.delete(id);console.debug('[Mug thumb] mantendo imagem original:',err?.message||err);}}
function scan(){document.querySelectorAll('[data-product-card]').forEach(card=>{if(card.dataset.mugThumbObserved)return;card.dataset.mugThumbObserved='1';observer?.observe(card);});}
function init(){observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){observer.unobserve(e.target);processCard(e.target);}}),{rootMargin:'220px'});scan();window.addEventListener('da:route-rendered',()=>setTimeout(scan,0));window.addEventListener('da:catalog-ready',()=>setTimeout(scan,0));window.addEventListener('da:catalog-refreshed',()=>setTimeout(scan,0));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();document.documentElement.dataset.mugThumbs=BUILD;
export{BUILD,makeThumb,scan,thumbUrl};
