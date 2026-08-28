const BUILD='20260828-mug-thumbnails-v1';
const FIREBASE_PRODUCTS='https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const checked=new Set();
let observer=null;
const text=v=>String(v??'').trim();
const truthy=v=>v===true||v===1||['1','true','sim','yes'].includes(text(v).toLowerCase());
const isMug=raw=>truthy(raw?.modelo_caneca)||truthy(raw?.produto_sob_encomenda)||text(raw?.categoria).toLowerCase().includes('caneca');
const artUrl=raw=>{const p=raw?.arte_impressao;return [raw?.arte_horizontal,raw?.arte_personalizacao,p&&typeof p==='object'?p.url:p,raw?.art_url,raw?.arte_url].map(text).find(v=>/^https?:\/\//i.test(v))||'';};

function image(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

async function makeThumb(url){
 const art=await image(url);const c=document.createElement('canvas');c.width=520;c.height=520;const x=c.getContext('2d');
 const bg=x.createRadialGradient(230,150,20,260,260,360);bg.addColorStop(0,'#ffffff');bg.addColorStop(1,'#eceae4');x.fillStyle=bg;x.fillRect(0,0,520,520);
 x.save();x.filter='blur(13px)';x.globalAlpha=.22;x.fillStyle='#292b28';x.beginPath();x.ellipse(260,420,150,28,0,0,Math.PI*2);x.fill();x.restore();
 x.lineWidth=26;x.strokeStyle='#f6f6f3';x.beginPath();x.ellipse(390,270,72,92,0,0,Math.PI*2);x.stroke();x.lineWidth=5;x.strokeStyle='rgba(70,72,68,.12)';x.stroke();
 rounded(x,115,95,285,325,42);x.save();x.clip();x.fillStyle='#fafaf8';x.fillRect(100,80,320,360);
 const targetW=300,targetH=120,dy=190;const scale=Math.max(targetW/art.naturalWidth,targetH/art.naturalHeight);const sw=targetW/scale,sh=targetH/scale,sx=(art.naturalWidth-sw)/2,sy=(art.naturalHeight-sh)/2;x.drawImage(art,sx,sy,sw,sh,108,dy,targetW,targetH);
 const shade=x.createLinearGradient(108,0,408,0);shade.addColorStop(0,'rgba(28,30,28,.25)');shade.addColorStop(.18,'rgba(255,255,255,.12)');shade.addColorStop(.55,'rgba(255,255,255,0)');shade.addColorStop(.86,'rgba(255,255,255,.22)');shade.addColorStop(1,'rgba(30,32,30,.28)');x.fillStyle=shade;x.fillRect(108,92,300,332);x.restore();
 const gloss=x.createLinearGradient(0,100,0,420);gloss.addColorStop(0,'rgba(255,255,255,.9)');gloss.addColorStop(.12,'rgba(255,255,255,.05)');gloss.addColorStop(.9,'rgba(20,20,20,.04)');x.fillStyle=gloss;rounded(x,115,95,285,325,42);x.fill();
 x.lineWidth=5;x.strokeStyle='rgba(72,74,70,.12)';rounded(x,115,95,285,325,42);x.stroke();x.fillStyle='#fbfbf9';x.beginPath();x.ellipse(257,103,135,20,0,0,Math.PI*2);x.fill();x.lineWidth=4;x.strokeStyle='rgba(80,82,78,.12)';x.stroke();
 return c.toDataURL('image/webp',.86);
}

async function processCard(card){
 const id=text(card.dataset.productCard);if(!id||checked.has(id))return;const img=card.querySelector('.product-card-media img');if(!img)return;
 if(!img.complete){img.addEventListener('load',()=>processCard(card),{once:true});return;}
 const ratio=(img.naturalWidth||1)/(img.naturalHeight||1);if(ratio<1.65)return;checked.add(id);
 try{const r=await fetch(`${FIREBASE_PRODUCTS}/${encodeURIComponent(id)}.json`,{cache:'force-cache',headers:{Accept:'application/json'}});if(!r.ok)return;const raw=await r.json();if(!isMug(raw))return;const art=artUrl(raw);if(!art)return;img.src=await makeThumb(art);img.dataset.mugThumb=BUILD;img.style.objectFit='cover';}catch(err){console.debug('[Mug thumb] mantendo imagem original:',err?.message||err);}
}
function scan(){document.querySelectorAll('[data-product-card]').forEach(card=>{if(card.dataset.mugThumbObserved)return;card.dataset.mugThumbObserved='1';observer?.observe(card);});}
function init(){observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){observer.unobserve(e.target);processCard(e.target);}}),{rootMargin:'250px'});scan();window.addEventListener('da:route-rendered',()=>setTimeout(scan,0));window.addEventListener('da:catalog-ready',()=>setTimeout(scan,0));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
document.documentElement.dataset.mugThumbs=BUILD;
export{BUILD,makeThumb,scan};