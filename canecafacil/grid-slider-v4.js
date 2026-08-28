// CanecaFácil grid slider v4 — no arrows on product cards; dots + swipe only.
const BUILD='20260828-canecafacil-grid-slider-v4';

function goTo(slider,index){
  const slides=[...slider.querySelectorAll('.cf-card-slide')];
  const dots=[...slider.querySelectorAll('.cf-dots i')];
  if(slides.length<2)return;
  const next=Math.max(0,Math.min(slides.length-1,index));
  slider.dataset.index=String(next);
  slides.forEach((slide,i)=>slide.classList.toggle('active',i===next));
  dots.forEach((dot,i)=>dot.classList.toggle('active',i===next));
  const live=slider.querySelector('.sr-only');
  if(live)live.textContent=`Imagem ${next+1} de ${slides.length}`;
}

function bind(slider){
  if(!slider||slider.dataset.cfSimpleDots==='1')return;
  slider.dataset.cfSimpleDots='1';
  const dots=[...slider.querySelectorAll('.cf-dots i')];
  dots.forEach((dot,index)=>{
    dot.setAttribute('role','button');
    dot.setAttribute('tabindex','0');
    dot.setAttribute('aria-label',`Ver imagem ${index+1}`);
    dot.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      goTo(slider,index);
    });
    dot.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();
        event.stopPropagation();
        goTo(slider,index);
      }
    });
  });
}

function apply(){document.querySelectorAll('.product-media .cf-card-slider').forEach(bind)}
new MutationObserver(()=>queueMicrotask(apply)).observe(document.documentElement,{subtree:true,childList:true});
apply();
document.documentElement.dataset.cfGridSlider=BUILD;
