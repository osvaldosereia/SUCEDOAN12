const $=id=>document.getElementById(id);
const cfg=window.DA_ADMIN_CONFIG||{};
const BASE=cfg.supabaseUrl, KEY=cfg.supabasePublishableKey, FN='creative-storyboard-projects';

let products=[],shots=[],variant=0,currentStyle=null;

const STYLES=[
  {name:'Pop magnético',motion:'entradas rápidas pelas bordas, snaps, pequenos saltos, giros mínimos e match cuts',music:'electro-pop percussivo moderno, seco, dançante e não clichê',visual:'fundos lisos coral, amarelo vivo e azul elétrico'},
  {name:'Dominó gráfico',motion:'movimentos em cadeia, empurrões visuais, deslocamentos secos e reorganizações rápidas',music:'breakbeat leve com micropercussão, baixo curto e pausas rítmicas',visual:'fundos lisos turquesa, magenta e amarelo'},
  {name:'Ímã visual',motion:'aproximações rápidas, travas no centro e trocas precisas por batida',music:'nu-disco recortado, groove limpo, baixo elástico e bateria seca',visual:'fundos lisos azul royal, laranja e creme'},
  {name:'Pop sincronizado',motion:'aparições marcadas pela batida, slides curtos, saltos e mudanças de escala',music:'glitch groove elegante com clicks musicais e batida dançante limpa',visual:'fundos lisos verde-limão, violeta e coral'},
  {name:'Esteira impossível',motion:'fluxo lateral rápido com paradas bruscas, snaps e entradas diagonais',music:'funk eletrônico minimal com swing marcado e graves curtos',visual:'fundos lisos vermelho pop, ciano e amarelo solar'},
  {name:'Portal de cores',motion:'formas geométricas abrindo passagem, mudanças de fundo e match cuts',music:'organic beat moderno com palmas secas, madeira e subgrave discreto',visual:'fundos lisos azul intenso, rosa quente e amarelo'}
];

const HOOKS=[
  'comece no primeiro frame com uma composição inesperada e movimento imediato',
  'abra com recortes entrando rapidamente de lados opostos',
  'faça três mudanças visuais muito rápidas antes do primeiro segundo',
  'abra com uma forma gráfica grande que se desloca e revela a chamada',
  'comece com uma composição já cheia e reorganize tudo rapidamente na batida',
  'abra com elementos gráficos saltando para dentro do quadro e travando em posição'
];

async function api(body){
  const r=await fetch(BASE+'/functions/v1/'+FN,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok===false)throw Error(d.error||d.detail||'Falha ao carregar produtos');
  return d;
}

function loadImage(p){
  return new Promise(resolve=>{
    const im=new Image();
    im.crossOrigin='anonymous';
    im.onload=()=>resolve({p,im});
    im.onerror=()=>resolve(null);
    im.src=p.image_url;
  });
}

function drawReference(group,index){
  const c=document.createElement('canvas');c.width=720;c.height=1280;
  const x=c.getContext('2d');
  x.fillStyle='#eeeeec';x.fillRect(0,0,c.width,c.height);
  const slots=[[28,45,318,560],[374,45,318,560],[28,675,318,560],[374,675,318,560]];
  group.forEach((o,i)=>{
    const [sx,sy,sw,sh]=slots[i],im=o.im;
    const r=Math.min((sw-16)/im.naturalWidth,(sh-16)/im.naturalHeight);
    const w=im.naturalWidth*r,h=im.naturalHeight*r;
    x.drawImage(im,sx+(sw-w)/2,sy+(sh-h)/2,w,h);
  });
  return c;
}

function selectStyle(){
  const s=variant++;
  currentStyle={
    ...STYLES[s%STYLES.length],
    hook:HOOKS[(s*2+1)%HOOKS.length]
  };
  $('styleBadge').textContent=currentStyle.name;
}

function makePrompt(){
  if(!currentStyle)selectStyle();
  const s=currentStyle;
  const idea=$('idea').value.trim();
  return `Crie UM ÚNICO vídeo publicitário vertical 9:16 de EXATAMENTE 10 segundos para Instagram Reels, usando Gemini Omni Flash 1.1.

Vou anexar como referências:
- QUATRO imagens contendo 16 produtos no total, 4 produtos em cada imagem;
- a LOGO oficial da Dona Antônia.

As quatro imagens de produtos servem SOMENTE para identificar visualmente os produtos. NÃO copie a composição das referências e NÃO transforme as duas imagens em slideshow.

REGRA ABSOLUTA — FIDELIDADE DOS PRODUTOS
Cada produto deve permanecer VISUALMENTE IDÊNTICO à referência durante todo o vídeo.
Preserve integralmente formato, silhueta, tampa, embalagem, proporções, cores, marca, logotipo do produto, rótulo, letras, números, textos, ilustrações, selos e todos os detalhes gráficos.
NÃO redesenhe, NÃO recrie, NÃO reescreva, NÃO traduza, NÃO corrija, NÃO complete, NÃO simplifique e NÃO estilize absolutamente NADA do produto.
NÃO faça morphing, deformação, fusão, substituição de embalagem ou reconstrução generativa do rótulo.
Se houver fundo cinza, branco ou colorido ao redor de um produto na referência, remova SOMENTE esse fundo. O fundo da fotografia NÃO pertence ao produto. Preserve o produto intacto.

REGRA ABSOLUTA — LOGO
Preserve a logo oficial EXATAMENTE como anexada.
NÃO redesenhe, NÃO recrie, NÃO troque tipografia, NÃO mude letras, acentos, cores, símbolo, proporção ou composição.
NÃO transforme a logo em 3D e NÃO gere uma versão parecida.
A LOGO DEVE APARECER SOMENTE NO CTA FINAL, entre 8s e 10s.
PROIBIDO usar a logo na abertura ou durante a parte dos produtos.

DIREÇÃO CRIATIVA DESTA VARIAÇÃO — ${s.name}
Movimento: ${s.motion}.
Visual: ${s.visual}.
Gancho: ${s.hook}.
Estética: stop motion publicitário moderno, divertido, artesanal premium, com recortes físicos e formas geométricas simples.
Sem pessoas, sem mãos e sem cenários realistas.

ÁUDIO — REGRA ABSOLUTA
Use SOMENTE TRILHA INSTRUMENTAL.
NÃO use locução, narração, diálogo, voz, canto, vocal chops, sussurros ou palavras faladas.
Direção musical: ${s.music}.
A trilha deve ser contínua durante os 10 segundos e os movimentos/cortes devem acompanhar a mesma pulsação do início ao fim.

ESTRUTURA OBRIGATÓRIA

0–2 SEGUNDOS — ABERTURA
A IA deve criar uma chamada curta, inteligente e muito chamativa relacionada à ideia de variedade / "aqui tem".
A chamada deve ser fácil de entender instantaneamente.
NÃO usar a logo.
Primeiro frame já forte. Sem fade-in, sem introdução lenta e sem excesso de texto.

2–8 SEGUNDOS — PRODUTOS
Mostrar os 16 produtos das referências em stop motion.
Distribuir os 8 produtos ao longo dos 6 segundos; não mostrar todos simultaneamente.
Variar produto individual, duplas, trios e pequenos grupos.
Produtos grandes, claros e reconhecíveis.
Movimentos curtos, secos e sincronizados à trilha.
NÃO modificar rótulo, embalagem ou formato em nenhum momento.

8–10 SEGUNDOS — CTA
SOMENTE aqui mostrar a logo oficial.
O CTA deve ser simples, limpo e imediatamente legível.
Mostrar exatamente:
"Entrega grátis em Cuiabá e VG"
"donaantonia.com.br"
"WhatsApp 98449-1018"

Não invente outro número, endereço, preço, desconto, promoção ou slogan.
Priorize a leitura da logo, do WhatsApp 98449-1018 e do site sem poluir a tela.

OBJETIVO
Entregar um Reel de 10 segundos com forte retenção desde o primeiro frame, produtos fiéis às referências e CTA final muito claro.

NÃO FAÇA
Não altere a logo.
Não use a logo antes do CTA.
Não altere produtos, rótulos ou formatos.
Não invente produtos.
Não faça slideshow simples.
Não use voz ou locução.
Não deixe o CTA confuso.
Não coloque informação demais na tela.

FORMATO FINAL
9:16, exatamente 10 segundos, alta legibilidade no celular, stop motion energético, visual limpo e acabamento comercial.${idea?'\n\nDIREÇÃO ADICIONAL DO CRIADOR:\n'+idea:''}`;
}

function renderPrompt(){
  $('prompt').textContent=makePrompt();
}

async function generate(){
  try{
    $('generate').disabled=true;$('download').disabled=true;
    $('status').textContent='Sorteando e carregando 16 produtos…';
    const d=await api({action:'random_products',limit:40});
    const candidates=(d.products||[]).filter(p=>p.image_url).slice(0,32);
    const loaded=(await Promise.all(candidates.map(loadImage))).filter(Boolean).slice(0,16);
    if(loaded.length<16)throw Error('Carregaram apenas '+loaded.length+' produtos. Tente novamente.');

    products=loaded.map(o=>o.p);
    shots=[
      drawReference(loaded.slice(0,4),0),
      drawReference(loaded.slice(4,8),1),
      drawReference(loaded.slice(8,12),2),
      drawReference(loaded.slice(12,16),3)
    ];

    $('grid').innerHTML='';
    shots.forEach((canvas,i)=>{
      const el=document.createElement('article');el.className='ref';
      el.append(canvas);
      const foot=document.createElement('footer');foot.textContent='Referência '+(i+1)+' · 4 produtos';
      el.append(foot);$('grid').append(el);
    });

    selectStyle();
    renderPrompt();
    $('download').disabled=false;
    $('status').textContent='Pronto: 16 produtos, 4 referências e 1 prompt.';
  }catch(e){
    $('status').textContent='Erro: '+e.message;
  }finally{
    $('generate').disabled=false;
  }
}

async function download(){
  if(shots.length!==4)return;
  $('download').disabled=true;
  $('status').textContent='Baixando as 4 imagens…';
  for(let i=0;i<4;i++){
    const blob=await new Promise(r=>shots[i].toBlob(r,'image/jpeg',.96));
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='dona-antonia-video-produtos-'+String(i+1).padStart(2,'0')+'.jpg';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2500);
    await new Promise(r=>setTimeout(r,250));
  }
  $('status').textContent='As 4 imagens foram enviadas para download.';
  $('download').disabled=false;
}

$('generate').onclick=generate;
$('download').onclick=download;
$('newPrompt').onclick=()=>{selectStyle();renderPrompt()};
$('idea').oninput=()=>renderPrompt();
$('copy').onclick=async()=>{
  await navigator.clipboard.writeText($('prompt').textContent);
  const b=$('copy'),old=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=old,1200);
};
generate();