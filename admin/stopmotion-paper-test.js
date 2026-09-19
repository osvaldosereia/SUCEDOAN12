const $=x=>document.getElementById(x),cfg=window.DA_ADMIN_CONFIG||{},BASE=cfg.supabaseUrl,KEY=cfg.supabasePublishableKey,FN='creative-storyboard-projects';
let products=[],shots=[],promptSerial=0,campaign=null;

async function api(b){
  let r=await fetch(BASE+'/functions/v1/'+FN,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(b)}),
      d=await r.json();
  if(!r.ok||d.ok===false)throw Error(d.error||'Falha');
  return d;
}
const load=p=>new Promise(ok=>{let i=new Image;i.crossOrigin='anonymous';i.onload=()=>ok({p,i});i.onerror=()=>ok(null);i.src=p.image_url});

function scene(g,n){
  let c=document.createElement('canvas');c.width=540;c.height=960;
  let x=c.getContext('2d');x.fillStyle='#eeeeec';x.fillRect(0,0,540,960);
  let b=[[25,45,240,415],[275,45,240,415],[25,500,240,415],[275,500,240,415]];
  g.forEach((o,k)=>{
    let [bx,by,bw,bh]=b[k],im=o.i,r=Math.min((bw-12)/im.naturalWidth,(bh-12)/im.naturalHeight),
        w=im.naturalWidth*r,h=im.naturalHeight*r;
    x.drawImage(im,bx+(bw-w)/2,by+(bh-h)/2,w,h);
  });
  return c;
}

const CONCEPTS=[
  ['Explosão de prateleira','entradas opostas, impactos secos e cascata de produtos'],
  ['Ímã visual','aproximações rápidas, travas no centro e trocas por batida'],
  ['Dominó pop','produtos empurrando visualmente a próxima composição'],
  ['Portal de cores','formas geométricas funcionando como passagens entre composições'],
  ['Chuva de produtos','quedas curtas, rebotes e reorganizações rápidas'],
  ['Batalha de lados','entradas laterais, confronto gráfico e match cuts'],
  ['Esteira impossível','fluxo lateral rápido com paradas bruscas de protagonistas'],
  ['Pop sincronizado','aparições e trocas precisas na pulsação da música']
];
const AUDIO_STYLES=[
  ['Percussão eletrônica quebrada','micropercussão seca, clicks musicais, subgrave curto e síncopes'],
  ['Nu-disco recortado','baixo elástico, bateria seca e pequenos stabs instrumentais'],
  ['Funk eletrônico minimal','baixo curto, bateria minimalista e swing marcado'],
  ['Electro-pop percussivo','bateria punchy, synth stabs curtos e viradas compactas'],
  ['Breakbeat colorido','breaks ágeis, percussão orgânica-eletrônica e pausas rítmicas'],
  ['House quirky','groove leve, baixo curto e detalhes instrumentais excêntricos'],
  ['Percussão latina futurista','percussão digital sincopada e graves controlados, sem clichê tropical'],
  ['Glitch groove','microcortes musicais, textura digital e batida dançante limpa'],
  ['Indie dance instrumental','baixo dançante, bateria seca e riffs muito curtos'],
  ['Organic beat moderno','palmas, madeira, snaps musicais e subgrave discreto']
];
const PALETTES=[
  'coral, amarelo ácido e azul elétrico sobre fundos lisos',
  'turquesa, magenta e amarelo vivo sobre fundos lisos',
  'azul royal, laranja intenso e creme sobre fundos lisos',
  'verde-limão, violeta e coral sobre fundos lisos',
  'vermelho pop, ciano e amarelo solar sobre fundos lisos'
];
const HOOKS=[
  'impacto instantâneo no primeiro frame com elemento central grande',
  'entrada brusca pelas laterais já no primeiro frame',
  'troca de fundo em três batidas antes do primeiro segundo',
  'zoom stop motion curto seguido de snap para a composição seguinte',
  'composição já cheia no primeiro frame e desmontagem rápida por batida'
];
const BRIDGES=[
  'um círculo sólido atravessando o quadro da direita para a esquerda',
  'uma faixa de papel colorido cruzando o quadro na horizontal',
  'um bloco de cor expandindo do centro até ocupar toda a tela',
  'uma diagonal gráfica varrendo o quadro',
  'uma sequência de três formas geométricas saltando para fora do quadro'
];

function newCampaign(){
  const s=promptSerial++;
  campaign={
    concept:CONCEPTS[s%CONCEPTS.length],
    audio:AUDIO_STYLES[(s*3+Math.floor(s/CONCEPTS.length))%AUDIO_STYLES.length],
    palette:PALETTES[(s*2+1)%PALETTES.length],
    hook:HOOKS[(s*3+2)%HOOKS.length],
    bridge:BRIDGES[(s*5+1)%BRIDGES.length],
    bpm:120
  };
}

function sharedDirection(){
  const c=campaign;
  return `IDENTIDADE ÚNICA DA CAMPANHA — OBRIGATÓRIA NOS 3 VÍDEOS
Conceito: ${c.concept[0]} — ${c.concept[1]}.
Paleta: ${c.palette}.
Gancho visual: ${c.hook}.
Ponte visual entre os clipes: ${c.bridge}.
Trilha: ${c.audio[0]} — ${c.audio[1]}.
Tempo musical FIXO: ${c.bpm} BPM, compasso 4/4.
Use a MESMA identidade instrumental, o MESMO groove, a MESMA bateria, o MESMO baixo, a MESMA textura e a MESMA pulsação nos três clipes. Não reinvente a trilha entre abertura, produtos e CTA. Deve parecer uma única peça de 20 segundos dividida em 3 arquivos.
ÁUDIO: SOMENTE TRILHA INSTRUMENTAL. PROIBIDO locução, narração, diálogo, voz, canto, vocal, sussurro, vocal chops ou palavras faladas. Não use efeitos sonoros separados da música.`;
}

function productFidelity(){
  return `REGRA ABSOLUTA — PRODUTOS
Cada produto deve permanecer VISUALMENTE IDÊNTICO à referência. Preserve integralmente formato, silhueta, tampa, embalagem, proporções, cores, marca, logotipo, rótulo, letras, números, textos, ilustrações, selos e todos os detalhes gráficos.
NÃO redesenhe, não recrie, não reescreva, não traduza, não corrija, não complete, não simplifique e não estilize absolutamente NADA do produto.
NÃO faça morphing, deformação, fusão, troca de embalagem ou reconstrução generativa do rótulo.
Se houver fundo cinza, branco ou colorido ao redor de um produto na imagem de referência, REMOVA SOMENTE ESSE FUNDO. O retângulo/fundo da fotografia NÃO faz parte do produto. Preserve os pixels visuais do produto e recorte apenas sua silhueta; nunca use remoção de fundo como desculpa para refazer ou alterar rótulo, formato ou embalagem.`;
}

function logoFidelity(){
  return `REGRA ABSOLUTA — LOGO
Use a logo anexada EXATAMENTE como ela é. NÃO redesenhe, não recrie, não troque tipografia, não altere letras, acentos, cores, símbolo, proporção ou composição. Não transforme em 3D e não gere uma versão parecida. Movimente a logo como uma peça física intacta.`;
}

function makePrompt(){
  if(!campaign)newCampaign();
  let idea=$('idea').value.trim();
  return `Crie o VÍDEO PRINCIPAL de uma campanha para Instagram Reels, vertical 9:16, com EXATAMENTE 10 segundos, usando as 10 imagens anexadas como INGREDIENTS/REFERÊNCIAS dos produtos.

As imagens anexadas servem SOMENTE para identificar os produtos. NÃO copie seus fundos nem sua composição e NÃO transforme as 10 imagens em slideshow.

${sharedDirection()}

${productFidelity()}

DIREÇÃO STOP MOTION
Faça um stop motion publicitário moderno, energético e muito competitivo para retenção em Reels. Os produtos devem parecer recortes fotográficos físicos animados quadro a quadro. Use movimentos curtos e claros: snap, pequenos saltos, deslizes, giros mínimos, entradas e saídas rápidas e match cuts. Os produtos são protagonistas, grandes e reconhecíveis. Varie entre 1 produto, duplas, trios e pequenos grupos; nunca coloque os 40 simultaneamente.

RITMO MUSICAL DESTE CLIPE
Este é o trecho intermediário da peça de 20 segundos: equivale aos compassos 3 a 7 da mesma trilha a 120 BPM. São 20 batidas em 10 segundos. Faça as principais mudanças visuais coincidirem com as batidas e síncopes. Comece já no groove, sem nova introdução musical, e termine preparando a ponte visual ${campaign.bridge} para o CTA.

ESTRUTURA
0–1s: impacto imediato e continuidade da abertura.
1–3s: aceleração e primeira surpresa visual.
3–8,5s: sequência variada, rápida e legível.
8,5–10s: clímax visual e preparação clara para o CTA.

NÃO FAÇA
Sem locução ou voz. Sem slideshow. Sem pessoas ou mãos. Sem cenários realistas. Sem preço, promoção, slogan ou texto inventado. Sem deformar produtos. Sem alterar rótulos ou formatos.

FORMATO FINAL
9:16, exatamente 10 segundos, alta legibilidade no celular, acabamento comercial, stop motion artesanal premium e forte retenção.${idea?'\n\nDIREÇÃO ADICIONAL DO CRIADOR:\n'+idea:''}`;
}

function openingPrompt(){
  if(!campaign)newCampaign();
  return `Crie a ABERTURA da campanha Dona Antônia para Instagram Reels, vertical 9:16, com EXATAMENTE 4 segundos. Vou anexar a LOGO oficial como Ingredient.

${sharedDirection()}

${logoFidelity()}

OBJETIVO — MÁXIMA CLAREZA
A abertura deve ser simples, rápida e impossível de confundir. Comunique APENAS duas ideias:
1. "Aqui tem!"
2. "Delivery em Cuiabá e VG"

Não acrescente outras frases, preços, promoções ou informações. Texto grande, correto e legível no celular.

ANIMAÇÃO
Use stop motion com recortes de papel, formas geométricas simples e a logo intacta como peça física. Primeiro frame já impactante: ${campaign.hook}. A logo pode saltar, deslizar ou entrar por snap cut, mas jamais ser redesenhada.

RITMO MUSICAL DESTE CLIPE
Este é o início da peça de 20 segundos: compassos 1 e 2 da MESMA trilha a 120 BPM. São exatamente 8 batidas em 4 segundos. Comece com música já no primeiro frame. No final do 4º segundo, use ${campaign.bridge} como ponte visual para o vídeo dos produtos, sem encerrar a sensação musical.

ESTRUTURA
0–1s: gancho visual + "Aqui tem!"
1–3s: revelar "Delivery em Cuiabá e VG" com clareza.
3–4s: logo forte + ponte para o vídeo principal.

NÃO FAÇA
Sem locução, voz ou narração. Sem excesso de elementos. Sem texto pequeno. Sem cenas realistas. Sem alterar a logo. A abertura deve ser divertida, porém MUITO clara.

FORMATO FINAL
9:16, exatamente 4 segundos, mesma estética, paleta, trilha e pulsação do vídeo principal.`;
}

function ctaPrompt(){
  if(!campaign)newCampaign();
  return `Crie o ENCERRAMENTO / CTA da campanha Dona Antônia para Instagram Reels, vertical 9:16, com EXATAMENTE 6 segundos. Vou anexar a LOGO oficial e um PRINT REAL DO APP como Ingredients.

${sharedDirection()}

${logoFidelity()}

REGRA ABSOLUTA — PRINT DO APP
Use o print anexado como referência fiel. NÃO recrie, redesenhe ou invente outra interface. Não altere textos, ícones ou estrutura essencial do print. Trate-o como uma peça visual física intacta dentro do stop motion.

OBJETIVO — CTA MUITO CLARO
O CTA NÃO pode ser confuso. Mostre somente estas informações, escritas EXATAMENTE:
"Entrega grátis em Cuiabá e VG"
"donaantonia.com.br"
"WhatsApp 98449-1018"

A logo também deve aparecer. Não invente outras ofertas, preços, slogans, números ou endereços.

HIERARQUIA
Primeiro destaque "Entrega grátis em Cuiabá e VG".
Depois mostre o print do app de forma reconhecível.
Finalize com logo + "donaantonia.com.br" + "WhatsApp 98449-1018" grandes e fáceis de ler. Não coloque todas as informações competindo ao mesmo tempo.

RITMO MUSICAL DESTE CLIPE
Este é o fechamento da mesma peça de 20 segundos: compassos 8 a 10 da MESMA trilha a 120 BPM. São exatamente 12 batidas em 6 segundos. Comece pegando diretamente a ponte visual ${campaign.bridge} deixada pelo vídeo principal. Não reinicie a música, não troque bateria, não mude o groove e não introduza nova melodia.

ESTRUTURA
0–2s: continuidade imediata + "Entrega grátis em Cuiabá e VG".
2–4s: print do app com movimento stop motion simples e claro.
4–6s: logo + donaantonia.com.br + WhatsApp 98449-1018, com tempo real de leitura.

NÃO FAÇA
Sem locução, voz ou narração. Sem texto excessivo. Sem mockup 3D genérico. Sem pessoas. Sem cenas realistas. Sem alterar logo ou app. Sem encerrar com tela poluída.

FORMATO FINAL
9:16, exatamente 6 segundos, mesmo conceito visual, mesma paleta, mesma trilha a 120 BPM e mesma linguagem do restante da campanha.`;
}

function renderCampaign(){
  $('prompt').textContent=makePrompt();
  $('openingPrompt').textContent=openingPrompt();
  $('ctaPrompt').textContent=ctaPrompt();
  const c=campaign;
  const meta=$('campaignMeta');
  if(meta)meta.textContent=`${c.concept[0]} · ${c.audio[0]} · 120 BPM · 4/4 · sequência 4s + 10s + 6s`;
}

async function generate(){
  try{
    $('status').textContent='Sorteando e carregando 40 produtos…';
    let d=await api({action:'random_products',limit:70}),
        a=(await Promise.all((d.products||[]).filter(p=>p.image_url).slice(0,55).map(load))).filter(Boolean).slice(0,40);
    if(a.length<40)throw Error('Carregaram apenas '+a.length+' produtos; tente novamente.');
    products=a.map(o=>o.p);shots=[];$('grid').innerHTML='';
    for(let n=0;n<10;n++){
      let c=scene(a.slice(n*4,n*4+4),n);shots.push(c);
      let wrap=document.createElement('div');wrap.style.margin='12px 0';wrap.append(c);
      c.style='width:100%;max-width:360px;aspect-ratio:9/16;object-fit:contain';
      let p=document.createElement('p');p.textContent=String(n+1).padStart(2,'0')+' · '+products.slice(n*4,n*4+4).map(v=>v.name).join(' · ');
      wrap.append(p);$('grid').append(wrap);
    }
    newCampaign();renderCampaign();
    $('status').textContent='Pronto: 40 produtos + sequência coordenada 4s / 10s / 6s.';
  }catch(e){$('status').textContent='Erro: '+e.message}
}

async function download(){
  if(shots.length!==10)return;
  for(let i=0;i<10;i++){
    let blob=await new Promise(r=>shots[i].toBlob(r,'image/jpeg',.94)),u=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=u;a.download='gemini-stopmotion-'+String(i+1).padStart(2,'0')+'.jpg';a.click();
    setTimeout(()=>URL.revokeObjectURL(u),2000);await new Promise(r=>setTimeout(r,220));
  }
}

$('generate').onclick=generate;
$('download').onclick=download;
$('newPrompt').onclick=()=>{newCampaign();renderCampaign()};
$('idea').oninput=()=>renderCampaign();
$('copy').onclick=()=>navigator.clipboard.writeText($('prompt').textContent);
$('copyOpening').onclick=()=>navigator.clipboard.writeText($('openingPrompt').textContent);
$('copyCta').onclick=()=>navigator.clipboard.writeText($('ctaPrompt').textContent);
generate();