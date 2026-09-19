const $=x=>document.getElementById(x),cfg=window.DA_ADMIN_CONFIG||{},BASE=cfg.supabaseUrl,KEY=cfg.supabasePublishableKey,FN='creative-storyboard-projects';
let products=[],shots=[],promptSerial=0;

async function api(b){
  const r=await fetch(BASE+'/functions/v1/'+FN,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(b)});
  const d=await r.json();
  if(!r.ok||d.ok===false)throw Error(d.error||'Falha ao buscar produtos');
  return d;
}

const load=p=>new Promise(ok=>{
  const i=new Image;
  i.crossOrigin='anonymous';
  i.onload=()=>ok({p,i});
  i.onerror=()=>ok(null);
  i.src=p.image_url;
});

function scene(g,n){
  const c=document.createElement('canvas'); c.width=540; c.height=960;
  const x=c.getContext('2d');
  x.fillStyle='#eeeeec'; x.fillRect(0,0,540,960);
  const b=[[25,45,240,415],[275,45,240,415],[25,500,240,415],[275,500,240,415]];
  g.forEach((o,k)=>{
    const [bx,by,bw,bh]=b[k], im=o.i;
    const r=Math.min((bw-12)/im.naturalWidth,(bh-12)/im.naturalHeight);
    const w=im.naturalWidth*r,h=im.naturalHeight*r;
    x.drawImage(im,bx+(bw-w)/2,by+(bh-h)/2,w,h);
  });
  return c;
}

const STYLES=[
  {name:'Pop magnético',motion:'entradas rápidas pelas bordas, pequenos saltos, snaps, giros mínimos e match cuts',music:'electro-pop percussivo moderno, seco, dançante e não clichê'},
  {name:'Dominó gráfico',motion:'movimentos em cadeia, deslocamentos secos, empurrões visuais e reorganizações rápidas',music:'breakbeat leve com micropercussão, baixo curto e pausas rítmicas'},
  {name:'Ímã visual',motion:'aproximações rápidas, travas no centro, trocas por batida e mudanças bruscas de composição',music:'nu-disco recortado, groove limpo, baixo elástico e bateria seca'},
  {name:'Pop sincronizado',motion:'aparições marcadas pela batida, saltos curtos, slides e alternância de escala',music:'glitch groove elegante, clicks musicais e batida dançante limpa'},
  {name:'Esteira impossível',motion:'fluxo lateral rápido com paradas bruscas, snaps e entradas diagonais',music:'funk eletrônico minimal, swing marcante e graves curtos'},
  {name:'Portal de cores',motion:'formas geométricas abrindo passagem, mudanças de fundo e recortes entrando por match cut',music:'organic beat moderno com palmas secas, madeira e subgrave discreto'}
];

const HOOKS=[
  'uma composição inesperada já no primeiro frame, com movimento imediato',
  'uma entrada brusca de recortes e formas no primeiro frame',
  'uma sequência de três mudanças visuais muito rápidas antes do primeiro segundo',
  'um grande elemento gráfico abrindo espaço instantaneamente para a mensagem',
  'uma montagem que começa cheia e se reorganiza de forma rápida e divertida'
];

function makePrompt(){
  const idea=$('idea').value.trim();
  const s=promptSerial++;
  const style=STYLES[s%STYLES.length];
  const hook=HOOKS[(s*2+1)%HOOKS.length];

  return `Crie UM ÚNICO vídeo publicitário vertical 9:16 de EXATAMENTE 10 segundos para Instagram Reels.

Vou anexar:
1. DUAS imagens de referência contendo 8 produtos no total, 4 produtos em cada imagem.
2. A LOGO oficial da Dona Antônia.

As duas imagens servem SOMENTE para identificar visualmente os produtos. NÃO copie o fundo nem a composição das imagens e NÃO transforme as duas referências em slideshow.

REGRA ABSOLUTA — PRODUTOS
Cada produto deve permanecer visualmente IDÊNTICO à referência.
Preserve integralmente: formato, silhueta, tampa, embalagem, proporções, cores, marca, logotipo do produto, rótulo, letras, números, textos, ilustrações, selos e todos os detalhes gráficos.
NÃO redesenhe, NÃO recrie, NÃO reescreva, NÃO traduza, NÃO corrija, NÃO complete, NÃO simplifique e NÃO estilize absolutamente NADA do produto.
NÃO faça morphing, deformação, fusão entre produtos, troca de embalagem ou reconstrução generativa do rótulo.
Se houver fundo cinza, branco ou colorido ao redor do produto na referência, remova SOMENTE esse fundo. O fundo da fotografia NÃO faz parte do produto. Preserve o produto intacto.

REGRA ABSOLUTA — LOGO
A logo oficial anexada deve permanecer EXATAMENTE como enviada.
NÃO redesenhe, NÃO recrie, NÃO troque tipografia, NÃO altere letras, cores, símbolo, proporção ou composição.
NÃO use a logo na abertura.
NÃO use a logo durante a parte dos produtos.
USE A LOGO SOMENTE NO CTA FINAL, entre 8 e 10 segundos.

ESTILO CRIATIVO DESTA VARIAÇÃO — ${style.name}
Movimento: ${style.motion}.
Gancho: ${hook}.
Visual: stop motion publicitário moderno, divertido, artesanal premium, com recortes físicos, fundos lisos intensos e formas geométricas simples.
Não use pessoas, mãos ou cenários realistas.

ÁUDIO
Use SOMENTE TRILHA INSTRUMENTAL.
NÃO use locução.
NÃO use narração.
NÃO use diálogo.
NÃO use voz.
NÃO use canto.
NÃO use palavras faladas.
Direção musical: ${style.music}.
A trilha deve correr CONTINUAMENTE durante os 10 segundos e os cortes/movimentos devem acompanhar a mesma pulsação do início ao fim.

ESTRUTURA OBRIGATÓRIA

0–2 SEGUNDOS — ABERTURA
A IA deve CRIAR a chamada inicial.
A chamada precisa ser curta, inteligente, clara e chamativa, comunicando rapidamente a ideia de variedade / "aqui tem".
Não usar a logo.
Não colocar texto demais.
O primeiro frame já deve chamar atenção; sem fade-in e sem introdução lenta.

2–8 SEGUNDOS — PRODUTOS
Mostrar os 8 produtos das duas referências em animação stop motion.
Distribuir os produtos ao longo desses 6 segundos; não mostrar todos simultaneamente.
Variar entre produto individual, duplas, trios e pequenos grupos.
Produtos grandes, reconhecíveis e legíveis.
Use movimentos curtos, secos e sincronizados à trilha.
NÃO modificar nenhum rótulo, embalagem ou formato.

8–10 SEGUNDOS — CTA
Apenas aqui use a LOGO oficial.
O CTA deve ser extremamente simples, claro e legível no celular.
Mostrar exatamente:
"Entrega grátis em Cuiabá e VG"
"donaantonia.com.br"
"WhatsApp 98449-1018"

Não invente número, endereço, preço, desconto, promoção ou slogan adicional.
Dê prioridade visual à logo e ao WhatsApp 98449-1018 sem poluir a tela.

OBJETIVO
Criar um Reel de 10 segundos com alta retenção, ritmo forte, clareza visual e aparência de stop motion profissional. A abertura deve chamar atenção, os produtos devem dominar o miolo e o CTA deve fechar de forma simples e memorável.

NÃO FAÇA
Não altere a logo.
Não use a logo antes do CTA.
Não altere produtos, rótulos ou formatos.
Não invente produtos.
Não use slideshow simples.
Não use voz ou locução.
Não deixe o CTA confuso.
Não coloque informação demais na tela.

FORMATO FINAL
9:16, exatamente 10 segundos, alta legibilidade no celular, stop motion energético, visual limpo e acabamento comercial.${idea?'\n\nDIREÇÃO ADICIONAL DO CRIADOR:\n'+idea:''}`;
}

async function generate(){
  try{
    $('status').textContent='Sorteando e carregando 8 produtos…';
    const d=await api({action:'random_products',limit:24});
    const candidates=(d.products||[]).filter(p=>p.image_url).slice(0,18);
    const loaded=(await Promise.all(candidates.map(load))).filter(Boolean).slice(0,8);
    if(loaded.length<8)throw Error('Carregaram apenas '+loaded.length+' produtos; tente novamente.');

    products=loaded.map(o=>o.p);
    shots=[];
    $('grid').innerHTML='';

    for(let n=0;n<2;n++){
      const c=scene(loaded.slice(n*4,n*4+4),n);
      shots.push(c);
      const wrap=document.createElement('div');
      wrap.style.margin='12px 0';
      c.style='width:100%;max-width:360px;aspect-ratio:9/16;object-fit:contain';
      wrap.append(c);
      const p=document.createElement('p');
      p.textContent='Imagem '+(n+1)+' · '+products.slice(n*4,n*4+4).map(v=>v.name).join(' · ');
      wrap.append(p);
      $('grid').append(wrap);
    }

    $('prompt').textContent=makePrompt();
    $('status').textContent='Pronto: 8 produtos em 2 imagens + 1 prompt de vídeo de 10 s.';
  }catch(e){
    $('status').textContent='Erro: '+e.message;
  }
}

async function download(){
  if(shots.length!==2)return;
  $('status').textContent='Baixando 2 imagens…';
  for(let i=0;i<2;i++){
    const blob=await new Promise(r=>shots[i].toBlob(r,'image/jpeg',.94));
    const u=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=u;
    a.download='gemini-stopmotion-produtos-'+String(i+1).padStart(2,'0')+'.jpg';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(u),2000);
    await new Promise(r=>setTimeout(r,220));
  }
  $('status').textContent='2 imagens enviadas para download.';
}

$('generate').onclick=generate;
$('download').onclick=download;
$('newPrompt').onclick=()=>{$('prompt').textContent=makePrompt()};
$('idea').oninput=()=>{$('prompt').textContent=makePrompt()};
$('copy').onclick=()=>navigator.clipboard.writeText($('prompt').textContent);
generate();