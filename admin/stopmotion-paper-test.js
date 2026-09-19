const $=x=>document.getElementById(x),cfg=window.DA_ADMIN_CONFIG||{},BASE=cfg.supabaseUrl,KEY=cfg.supabasePublishableKey,FN='creative-storyboard-projects';let products=[],shots=[];
async function api(b){let r=await fetch(BASE+'/functions/v1/'+FN,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(b)}),d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||'Falha');return d}
const load=p=>new Promise(ok=>{let i=new Image;i.crossOrigin='anonymous';i.onload=()=>ok({p,i});i.onerror=()=>ok(null);i.src=p.image_url});
function scene(g,n){let c=document.createElement('canvas');c.width=540;c.height=960;let x=c.getContext('2d');x.fillStyle='#eeeeec';x.fillRect(0,0,540,960);let b=[[25,45,240,415],[275,45,240,415],[25,500,240,415],[275,500,240,415]];g.forEach((o,k)=>{let [bx,by,bw,bh]=b[k],im=o.i,r=Math.min((bw-12)/im.naturalWidth,(bh-12)/im.naturalHeight),w=im.naturalWidth*r,h=im.naturalHeight*r;x.drawImage(im,bx+(bw-w)/2,by+(bh-h)/2,w,h)});return c}
function makePrompt(){let idea=$('idea').value.trim();return `Crie um vídeo publicitário vertical 9:16 de EXATAMENTE 10 segundos para Instagram Reels usando os produtos presentes nas 10 imagens de referência anexadas. As imagens são apenas referências visuais dos produtos: não copie o fundo nem a composição delas.

OBJETIVO CRIATIVO
Produza um stop motion publicitário moderno, energético, divertido e visualmente viciante, pensado para prender a atenção imediatamente e manter ritmo forte até o final. O resultado deve parecer uma produção profissional feita com fotografias reais dos produtos recortadas e animadas quadro a quadro.

FIDELIDADE AOS PRODUTOS
Use somente os produtos presentes nas referências. Preserve com máxima fidelidade embalagem, formato, marca, logotipo, rótulo, cores e proporções. Não invente produtos, não substitua embalagens, não altere textos dos rótulos e não transforme um produto em outro. Evite deformações, morphing, derretimento ou fusão entre objetos.

DIREÇÃO DE ARTE
Os produtos são os protagonistas e devem aparecer grandes e claramente reconhecíveis. Use fundos lisos de cores fortes e variadas, com linguagem gráfica contemporânea. Você pode usar formas geométricas simples, linhas, círculos, estrelas, pequenos elementos gráficos e mudanças de cor para reforçar movimento, sem competir com os produtos. Não use cenários realistas, pessoas ou mãos.

MOVIMENTO STOP MOTION
Anime os produtos como objetos físicos fotografados quadro a quadro: entradas rápidas pelas bordas, pequenos saltos, deslocamentos secos, giros curtos, aproximações, afastamentos, trocas de posição, empurrões, snap transitions e match cuts. Prefira movimentos curtos e intencionais. A pequena imperfeição característica do stop motion é desejável, mas o acabamento geral deve ser limpo e comercial.

RITMO
0–1 s: gancho visual muito forte.
1–3 s: acelere as entradas e trocas de produtos.
3–8,5 s: mantenha variedade constante de composição, movimento e cores, criando pequenas surpresas visuais.
8,5–10 s: fechamento forte e memorável, preferencialmente terminando de forma que permita um loop natural de volta ao primeiro segundo.

EDIÇÃO
Faça cortes e mudanças visuais frequentes, sincronizáveis com uma trilha rítmica. Evite cenas paradas longas. Distribua os produtos ao longo dos 10 segundos; não tente manter todos simultaneamente na tela. Varie entre produto individual, duplas, trios e pequenos grupos para manter legibilidade. As referências podem ser usadas em qualquer ordem criativa.

RESTRIÇÕES
Não acrescente preços, promoções, slogans, legendas ou textos que não estejam nas próprias embalagens. Não crie narração. Não invente marcas ou elementos que pareçam parte das embalagens. Não transforme as imagens de referência em simples slideshow. O objetivo é criar uma animação stop motion nova usando os produtos como matéria-prima visual.

FORMATO FINAL
9:16 vertical, exatamente 10 segundos, enquadramento seguro para Reels, alta legibilidade em tela de celular, estética publicitária contemporânea, divertida e dinâmica.${idea?'\n\nDIREÇÃO ADICIONAL DO CRIADOR:\n'+idea:''}`}
async function generate(){try{$('status').textContent='Sorteando e carregando 40 produtos…';let d=await api({action:'random_products',limit:70}),a=(await Promise.all((d.products||[]).filter(p=>p.image_url).slice(0,55).map(load))).filter(Boolean).slice(0,40);if(a.length<40)throw Error('Carregaram apenas '+a.length+' produtos; tente novamente.');products=a.map(o=>o.p);shots=[];$('grid').innerHTML='';for(let n=0;n<10;n++){let c=scene(a.slice(n*4,n*4+4),n);shots.push(c);let wrap=document.createElement('div');wrap.style.margin='12px 0';wrap.append(c);c.style='width:100%;max-width:360px;aspect-ratio:9/16;object-fit:contain';let p=document.createElement('p');p.textContent=String(n+1).padStart(2,'0')+' · '+products.slice(n*4,n*4+4).map(v=>v.name).join(' · ');wrap.append(p);$('grid').append(wrap)}$('prompt').textContent=makePrompt();$('status').textContent='Pronto: 40 produtos em 10 imagens.'}catch(e){$('status').textContent='Erro: '+e.message}}
async function download(){if(shots.length!==10)return;for(let i=0;i<10;i++){let blob=await new Promise(r=>shots[i].toBlob(r,'image/jpeg',.94)),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='gemini-stopmotion-'+String(i+1).padStart(2,'0')+'.jpg';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);await new Promise(r=>setTimeout(r,220))}}
$('generate').onclick=generate;$('download').onclick=download;$('newPrompt').onclick=()=>$('prompt').textContent=makePrompt();$('idea').oninput=()=>$('prompt').textContent=makePrompt();$('copy').onclick=()=>navigator.clipboard.writeText($('prompt').textContent);generate();