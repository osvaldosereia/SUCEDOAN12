(()=>{'use strict';
const $=id=>document.getElementById(id),cfg=window.DA_ADMIN_CONFIG||{},URL=cfg.supabaseUrl,KEY=cfg.supabasePublishableKey,FN='creative-storyboard-projects';
const canvas=$('stage'),ctx=canvas.getContext('2d'),palette=['#FF3158','#FF7A00','#FFD400','#00D47E','#00A8FF','#7657FF','#E23DFF','#00D6D6','#FF4FB3','#A8E600'];
let products=[],images=[],playing=false,audio=null,start=0,raf=0,lastProd=-1,lastBg=-1;
async function invoke(body){const r=await fetch(URL+'/functions/v1/'+FN,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw Error(d.detail||d.error||'Falha ao carregar produtos');return d}
const shuffle=a=>a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
async function load(){
 $('load').disabled=true;$('play').disabled=true;$('status').textContent='Sorteando produtos com foto…';
 try{const d=await invoke({action:'random_products',limit:Math.max(40,+$('count').value*2)});const all=(d.products||[]).filter(p=>p.image_url);
 products=shuffle(all).slice(0,+$('count').value);if(products.length<5)throw Error('Poucos produtos com imagem disponíveis.');
 $('picked').innerHTML=products.map(p=>'<img src="'+p.image_url.replace(/"/g,'&quot;')+'" title="'+String(p.name||'').replace(/"/g,'&quot;')+'">').join('');
 images=await Promise.all(products.map(p=>new Promise(res=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>res(im);im.onerror=()=>res(null);im.src=p.image_url})));
 const good=images.map((im,i)=>im?i:-1).filter(i=>i>=0);products=good.map(i=>products[i]);images=good.map(i=>images[i]);
 $('status').textContent=products.length+' produtos prontos. Toque em Assistir 10 s.';$('play').disabled=!products.length;drawPoster();
 }catch(e){$('status').textContent='Não foi possível carregar: '+e.message}finally{$('load').disabled=false}}
function paperPath(w,h,seed){const j=8,s=seed*13;ctx.beginPath();ctx.moveTo(-w/2+Math.sin(s)*j,-h/2);ctx.lineTo(w/2,-h/2+Math.cos(s)*j);ctx.lineTo(w/2+Math.sin(s+2)*j,h/2);ctx.lineTo(-w/2,h/2+Math.cos(s+4)*j);ctx.closePath()}
function drawProduct(i,t){const im=images[i];if(!im)return;const maxW=390,maxH=620,ratio=Math.min(maxW/im.width,maxH/im.height),iw=im.width*ratio,ih=im.height*ratio,pad=20,w=iw+pad*2,h=ih+pad*2,angle=((i%7)-3)*Math.PI/180;
 ctx.save();ctx.translate(270,485);ctx.rotate(angle);ctx.shadowColor='#0008';ctx.shadowBlur=0;ctx.shadowOffsetX=10;ctx.shadowOffsetY=14;ctx.fillStyle='#fff';paperPath(w,h,i);ctx.fill();ctx.shadowColor='transparent';ctx.drawImage(im,-iw/2,-ih/2,iw,ih);ctx.restore();
 ctx.fillStyle='#111';ctx.font='900 24px system-ui';ctx.textAlign='center';ctx.fillText('DONA ANTÔNIA',270,875);ctx.font='700 16px system-ui';ctx.fillText(String(products[i]?.name||'').slice(0,42).toUpperCase(),270,906)}
function frame(ms){const elapsed=ms-start;if(elapsed>=10000){playing=false;cancelAnimationFrame(raf);$('play').disabled=false;$('play').textContent='↻ Assistir novamente';$('status').textContent='Prévia concluída.';return}
 const bgI=Math.floor(elapsed/+$('bgSpeed').value)%palette.length,prodI=Math.floor(elapsed/+$('prodSpeed').value)%products.length;
 ctx.fillStyle=palette[bgI];ctx.fillRect(0,0,540,960);drawProduct(prodI,elapsed);
 if(prodI!==lastProd){tick(true);lastProd=prodI}if(bgI!==lastBg){tick(false);lastBg=bgI}raf=requestAnimationFrame(frame)}
function initAudio(){audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume()}
function tone(freq,dur,vol,type='sine'){if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}
function tick(product){if(product&&$('sfx').checked)tone(160+Math.random()*90,.045,.08,'square');if(!product&&$('music').value==='click')tone(520,.025,.018,'triangle')}
let beatTimer=0;function musicLoop(){clearInterval(beatTimer);if($('music').value!=='pop')return;let n=0;beatTimer=setInterval(()=>{if(!playing){clearInterval(beatTimer);return}tone(n++%4===0?92:138,.07,.035,'sine')},250)}
function play(){if(playing||!products.length)return;initAudio();playing=true;lastProd=lastBg=-1;start=performance.now();$('play').disabled=true;$('play').textContent='Reproduzindo…';$('status').textContent='Stop motion em execução.';musicLoop();raf=requestAnimationFrame(frame)}
function drawPoster(){ctx.fillStyle=palette[0];ctx.fillRect(0,0,540,960);drawProduct(0,0)}
for(const [id,out] of [['bgSpeed','bgOut'],['prodSpeed','prodOut']])$(id).oninput=()=>$(out).textContent=(+$(id).value/1000).toFixed(2).replace('.',',')+' s';
$('load').onclick=load;$('play').onclick=play;$('count').onchange=load;drawPoster();load();
})();