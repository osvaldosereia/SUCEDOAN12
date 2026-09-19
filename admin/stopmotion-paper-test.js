const $=x=>document.getElementById(x),cfg=window.DA_ADMIN_CONFIG||{},BASE=cfg.supabaseUrl,KEY=cfg.supabasePublishableKey,FN='creative-storyboard-projects';let products=[],shots=[];
async function api(b){let r=await fetch(BASE+'/functions/v1/'+FN,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(b)}),d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||'Falha');return d}
const load=p=>new Promise(ok=>{let i=new Image;i.crossOrigin='anonymous';i.onload=()=>ok({p,i});i.onerror=()=>ok(null);i.src=p.image_url});
function scene(g,n){let c=document.createElement('canvas');c.width=540;c.height=960;let x=c.getContext('2d');x.fillStyle='#eeeeec';x.fillRect(0,0,540,960);let b=[[25,45,240,415],[275,45,240,415],[25,500,240,415],[275,500,240,415]];g.forEach((o,k)=>{let [bx,by,bw,bh]=b[k],im=o.i,r=Math.min((bw-12)/im.naturalWidth,(bh-12)/im.naturalHeight),w=im.naturalWidth*r,h=im.naturalHeight*r;x.drawImage(im,bx+(bw-w)/2,by+(bh-h)/2,w,h)});return c}
let promptSerial=0;
const CONCEPTS=[
['Explosão de prateleira','Comece no primeiro frame com uma explosão gráfica de cor e 2–3 produtos entrando de direções opostas, como se tivessem sido lançados para o centro. Depois acelere em cascata com entradas secas, giros curtos, saltos e trocas surpreendentes.'],
['Ímã visual','Abra com um único produto enorme avançando rapidamente para a câmera e travando no centro; imediatamente outros produtos surgem em batidas visuais sucessivas. Use zooms stop motion, snap cuts e composições que mudam antes de o olhar se acomodar.'],
['Dominó pop','Comece com produtos entrando em sequência como um dominó visual, cada entrada empurrando a próxima composição. Transforme a sequência em uma coreografia rápida de grupos, fileiras, círculos e diagonais.'],
['Portal de cores','Abra com uma mudança abrupta entre três fundos intensos enquanto produtos aparecem em posições diferentes a cada batida. Faça os produtos atravessarem círculos e formas gráficas como portais, sem jamais alterar a fotografia do produto.'],
['Chuva de produtos','Comece com produtos caindo rapidamente de cima e parando com impacto no quadro. Em seguida use rebotes, deslocamentos laterais, agrupamentos e dispersões em ritmo crescente.'],
['Batalha de lados','Abra com dois produtos entrando violentamente pelas laterais e parando frente a frente. Novos produtos substituem os anteriores em match cuts rápidos, criando uma disputa gráfica divertida e energética.'],
['Esteira impossível','Comece com produtos atravessando o quadro em uma esteira visual muito rápida; alguns param abruptamente, crescem e viram protagonistas antes de sair e dar lugar aos próximos.'],
['Pop sincronizado','Abra com flashes de fundos sólidos e produtos surgindo exatamente nas batidas imaginárias. Construa uma sequência de pops, pequenos saltos, rotações mínimas e mudanças de escala com sensação musical.']
];
const AUDIO_STYLES=[
['Percussão eletrônica quebrada','batida seca e sincopada, micropercussões, cliques, estalos e graves curtos; sem melodia publicitária óbvia'],
['Nu-disco recortado','groove disco moderno, baixo elástico, palmas secas e pequenos cortes rítmicos; alegre sem soar jingle'],
['Funk eletrônico minimal','groove de baixo e bateria minimalista, swing marcante, pausas e retomadas para sincronizar os produtos'],
['Electro-pop percussivo','sintetizadores curtos, bateria punchy, stabs e viradas inesperadas; sem refrão vocal genérico'],
['Breakbeat colorido','breaks ágeis, percussão orgânica misturada a eletrônica e pequenas quebras de silêncio antes dos impactos'],
['House quirky','house leve e excêntrico, groove rápido, sons pequenos e inesperados e baixo curto; evitar clima de balada genérica'],
['Percussão latina futurista','ritmo latino abstrato com percussões digitais, graves controlados e acentos rápidos; sem clichês tropicais'],
['Glitch groove','microcortes, clicks, pops, textura digital e batida dançante; usar glitches como pontuação, não como ruído constante'],
['Indie dance instrumental','baixo dançante, bateria seca e pequenos riffs instrumentais com personalidade; sensação contemporânea e espontânea'],
['Organic beat moderno','palmas, madeira, snaps e percussões táteis combinadas a subgrave discreto; sensação física de stop motion']
];
function makePrompt(){let idea=$('idea').value.trim(),serial=promptSerial++,c=CONCEPTS[serial%CONCEPTS.length],a=AUDIO_STYLES[(serial*3+Math.floor(serial/CONCEPTS.length))%AUDIO_STYLES.length];return `Crie um vídeo publicitário vertical 9:16 de EXATAMENTE 10 segundos para Instagram Reels usando os produtos presentes nas imagens de referência anexadas. As imagens servem SOMENTE para identificar os produtos.

REGRA ABSOLUTA — FIDELIDADE DO PRODUTO
O produto deve permanecer VISUALMENTE IDÊNTICO à fotografia de referência durante toda a animação. NÃO altere, reescreva, recrie, corrija, traduza, complete ou estilize absolutamente NADA do rótulo ou da embalagem. Preserve pixel visualmente: nome da marca, logotipo, textos, letras, números, cores, ilustrações, selos, códigos, formato, tampa e proporções. Não invente texto. Não substitua caracteres. Não faça morphing. Não misture dois produtos. Se algum detalhe do rótulo não puder ser preservado, mantenha a fotografia original do produto em vez de tentar reconstruí-lo.

CONCEITO CRIATIVO DESTA GERAÇÃO — ${c[0]}
${c[1]}

OBJETIVO DE ATENÇÃO
O feed de Reels é extremamente competitivo. O primeiro frame já deve causar impacto e o primeiro segundo precisa funcionar como gancho visual, sem introdução lenta, fade-in, tela vazia ou espera. Faça alguma mudança visual relevante aproximadamente a cada 0,3–0,7 segundo. Crie surpresa, contraste, ritmo e curiosidade para evitar que a pessoa deslize para o próximo Reel.

LINGUAGEM STOP MOTION
Use as fotografias intactas dos produtos como recortes físicos animados quadro a quadro. Pode mover, girar levemente, aumentar, diminuir, saltar, deslizar, empurrar, entrar e sair do quadro, mas NUNCA redesenhar ou deformar o produto. Combine snap transitions, match cuts, mudanças bruscas de composição, pequenas imperfeições artesanais e movimentos secos.

DIREÇÃO DE ARTE
Fundos lisos, intensos e contrastantes, alternando com ritmo. Formas geométricas e elementos gráficos simples podem reagir ao movimento, mas nunca cobrir informações importantes do produto. Sem pessoas, mãos ou cenários realistas. Produtos grandes e reconhecíveis. Varie produto solo, duplas, trios e grupos pequenos; não coloque os 40 simultaneamente.

ESTRUTURA
0–1s: gancho extremamente chamativo baseado no conceito desta geração.
1–3s: aceleração e primeira surpresa visual.
3–8,5s: sequência imprevisível, com composições e movimentos variados e nenhuma sensação de slideshow.
8,5–10s: clímax visual e final que possa conectar naturalmente ao começo para estimular replay.

NÃO FAÇA
Não altere rótulos. Não gere novas versões das embalagens. Não use morphing ou deformação. Não invente preço, promoção, slogan, legenda ou narração. Não transforme as 10 referências em dez slides. Não deixe cenas longas ou estáticas.

FORMATO
Exatamente 10 segundos, 9:16, alta legibilidade no celular, ritmo de Reels, acabamento publicitário profissional e stop motion energético. Use as referências em qualquer ordem que produza o melhor vídeo.${idea?'\n\nDIREÇÃO ADICIONAL DO CRIADOR:\n'+idea:''}`}

function currentStyle(){let s=Math.max(0,promptSerial-1),c=CONCEPTS[s%CONCEPTS.length],a=AUDIO_STYLES[(s*3+Math.floor(s/CONCEPTS.length))%AUDIO_STYLES.length];return{c,a}}
function openingPrompt(){let {c,a}=currentStyle();return `Crie a ABERTURA de uma campanha em vídeo vertical 9:16, EXATAMENTE 10 segundos, para Dona Antônia. Vou anexar a LOGO oficial: preserve-a exatamente, sem redesenhar, deformar, trocar tipografia, cor ou símbolo.

A abertura precisa combinar visual e musicalmente com o vídeo principal dos produtos. Linguagem: stop motion artesanal premium, recortes impressos, papel, formas geométricas, movimentos secos, pequenos saltos, snap cuts e cores intensas. Conceito visual desta campanha: ${c[0]}. Direção musical: ${a[0]} — ${a[1]}.

GANCHO: comece no PRIMEIRO FRAME com uma ação visual forte, sem fade ou introdução lenta. Em poucos segundos deixe imediatamente claro, de forma divertida e simples: AQUI TEM PRODUTOS PARA O DIA A DIA + SOMOS DELIVERY EM CUIABÁ E VÁRZEA GRANDE (VG).

Use a logo como elemento físico de recorte stop motion: ela pode entrar, saltar, deslizar ou ser revelada por papéis/formas, mas nunca alterar sua identidade. Pode usar pequenas ilustrações gráficas de sacolas, caixa de entrega, mapa/pin e movimento de trajeto, sem aparência infantil. Texto na tela deve ser mínimo, grande, correto e legível. Sugestão de mensagem: "Aqui tem!" e "Delivery em Cuiabá e VG". Não invente promoções ou preços.

Ritmo: mudança visual a cada 0,3–0,7s, sincronizada à trilha e SFX táteis discretos. 0–2s gancho; 2–7s comunicar variedade + delivery; 7–10s logo forte e transição visual que combine com a entrada do vídeo principal. Sem pessoas, sem cenas realistas e sem estética de comercial genérico. Resultado moderno, alegre, surpreendente e altamente legível no celular.`}
function ctaPrompt(){let {c,a}=currentStyle();return `Crie o ENCERRAMENTO/CTA de uma campanha em vídeo vertical 9:16, EXATAMENTE 10 segundos, para Dona Antônia. Vou anexar a LOGO oficial e um PRINT REAL DO APP. Preserve ambos com máxima fidelidade. NÃO redesenhe a logo. NÃO invente, altere ou reescreva elementos da interface do print do app; use o print real como peça visual.

O CTA deve parecer continuação direta do vídeo principal: stop motion artesanal premium, recortes impressos, papel, cores intensas, formas geométricas e movimentos secos. Conceito visual desta campanha: ${c[0]}. Direção musical: ${a[0]} — ${a[1]}. Mantenha a mesma personalidade, ritmo e linguagem gráfica.

OBJETIVO: transformar atenção em pedido. Mostre de maneira muito clara e divertida que a Dona Antônia faz ENTREGA GRÁTIS EM CUIABÁ E VÁRZEA GRANDE (VG), que o cliente pode comprar pelo app/site e pelo WhatsApp.

INFORMAÇÕES OBRIGATÓRIAS NA TELA:
"Dona Antônia"
"Entrega grátis em Cuiabá e VG"
"donaantonia.com.br"
"WhatsApp"

IMPORTANTE: não invente número de WhatsApp se ele não estiver presente nas referências fornecidas. Se houver número oficial anexado/visível, preserve-o exatamente; caso contrário, mostre somente a palavra "WhatsApp". O endereço donaantonia.com.br deve aparecer EXATAMENTE assim, sem alterar letras.

ANIMAÇÃO: comece já em movimento. Faça o print do app entrar como um recorte físico, telefone/cartão de papel ou painel stop motion, SEM modificar sua interface. A logo pode aparecer em interação com formas, pin de entrega e elementos de percurso. Faça "Entrega grátis em Cuiabá e VG" ganhar destaque visual forte. Termine com logo + site + WhatsApp extremamente legíveis e tempo suficiente para leitura.

Ritmo: 0–2s conexão imediata com o vídeo anterior; 2–6s app/compra e delivery; 6–10s CTA forte. Sincronize movimentos com a trilha e use SFX táteis discretos. Nada de estética corporate, mockup 3D genérico, pessoas ou excesso de texto. Deve ser divertido, memorável, comercial e coerente com a abertura e o vídeo de produtos.`}
function refreshCompanions(){$('openingPrompt').textContent=openingPrompt();$('ctaPrompt').textContent=ctaPrompt()}
async function generate(){try{$('status').textContent='Sorteando e carregando 40 produtos…';let d=await api({action:'random_products',limit:70}),a=(await Promise.all((d.products||[]).filter(p=>p.image_url).slice(0,55).map(load))).filter(Boolean).slice(0,40);if(a.length<40)throw Error('Carregaram apenas '+a.length+' produtos; tente novamente.');products=a.map(o=>o.p);shots=[];$('grid').innerHTML='';for(let n=0;n<10;n++){let c=scene(a.slice(n*4,n*4+4),n);shots.push(c);let wrap=document.createElement('div');wrap.style.margin='12px 0';wrap.append(c);c.style='width:100%;max-width:360px;aspect-ratio:9/16;object-fit:contain';let p=document.createElement('p');p.textContent=String(n+1).padStart(2,'0')+' · '+products.slice(n*4,n*4+4).map(v=>v.name).join(' · ');wrap.append(p);$('grid').append(wrap)}$('prompt').textContent=makePrompt();refreshCompanions();$('status').textContent='Pronto: pacote + 3 prompts combinando entre si.'}catch(e){$('status').textContent='Erro: '+e.message}}
async function download(){if(shots.length!==10)return;for(let i=0;i<10;i++){let blob=await new Promise(r=>shots[i].toBlob(r,'image/jpeg',.94)),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='gemini-stopmotion-'+String(i+1).padStart(2,'0')+'.jpg';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);await new Promise(r=>setTimeout(r,220))}}
$('generate').onclick=generate;$('download').onclick=download;$('newPrompt').onclick=()=>{$('prompt').textContent=makePrompt();refreshCompanions()};$('idea').oninput=()=>$('prompt').textContent=makePrompt();$('copy').onclick=()=>navigator.clipboard.writeText($('prompt').textContent);$('copyOpening').onclick=()=>navigator.clipboard.writeText($('openingPrompt').textContent);$('copyCta').onclick=()=>navigator.clipboard.writeText($('ctaPrompt').textContent);generate();