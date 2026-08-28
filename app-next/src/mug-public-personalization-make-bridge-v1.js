const BUILD='20260828-mug-public-make-art-bridge-v1';
const FIREBASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const INSTALL_KEY=Symbol.for('da.mug.public.make.art.bridge.v1');
const text=v=>String(v??'').trim();
const isHttp=v=>/^https?:\/\//i.test(text(v));

function parseJson(value,fallback=null){try{return typeof value==='string'?JSON.parse(value):value}catch{return fallback}}
function imageSourceFromProduct(product={}){const print=product.arte_impressao;return [product.arte_horizontal,product.arte_personalizacao,print&&typeof print==='object'?print.url:print,product.thumbnail,product.preview_esquerda,product.url_imagem,product.imagem_url,product.imagem].map(text).find(Boolean)||'';}
function absoluteUrl(value){const raw=text(value);if(!raw)return'';if(/^data:image\//i.test(raw)||isHttp(raw))return raw;try{return new URL(raw.replace(/^\/+/,''),`${location.origin}/`).href}catch{return raw}}
function loadImage(source){return new Promise((resolve,reject)=>{const img=new Image();const url=absoluteUrl(source);if(isHttp(url)&&!url.startsWith(location.origin))img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível preparar uma referência visual da personalização.'));img.src=url;});}
function drawContain(ctx,img,x,y,w,h){const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight),dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}

async function loadBaseProduct(nativeFetch,modelId){if(!modelId)return null;try{const response=await nativeFetch(`${FIREBASE}/produtos/${encodeURIComponent(modelId)}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)return null;return response.json();}catch{return null}}

async function referenceBoard(nativeFetch,inner){
 const product=await loadBaseProduct(nativeFetch,text(inner.model_id));
 const baseSource=absoluteUrl(imageSourceFromProduct(product||{}));
 const imageEntries=parseJson(inner.images_json,[])||[];
 const customerSources=(Array.isArray(imageEntries)?imageEntries:[]).map(item=>absoluteUrl(item?.image_base64||item?.image||item?.url)).filter(Boolean).slice(0,3);
 const sources=[baseSource,...customerSources].filter(Boolean);
 if(!sources.length&&inner.image_base64)sources.push(absoluteUrl(inner.image_base64));
 if(!sources.length)throw new Error('O modelo não possui arte-base e nenhuma foto foi enviada para personalização.');
 const loaded=[];for(const source of sources){try{loaded.push(await loadImage(source))}catch(error){console.warn('[Mug Make bridge] referência ignorada:',error?.message||error)}}
 if(!loaded.length)throw new Error('Não foi possível abrir as referências da personalização.');
 const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1000;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#171a17';ctx.font='700 28px system-ui,sans-serif';ctx.fillText('MODELO BASE — preservar estilo e composição',36,42);
 const base=baseSource&&loaded[0]?loaded[0]:null;
 if(base){drawContain(ctx,base,30,65,1740,590);ctx.strokeStyle='#d8dcd4';ctx.lineWidth=3;ctx.strokeRect(30,65,1740,590);}
 const customer=base?loaded.slice(1):loaded;const y=base?700:80,h=base?260:850;if(customer.length){ctx.fillStyle='#171a17';ctx.font='700 24px system-ui,sans-serif';ctx.fillText('REFERÊNCIAS DO CLIENTE — usar somente quando solicitado',36,y-18);const gap=18,w=(1740-gap*(customer.length-1))/customer.length;customer.forEach((img,index)=>{const x=30+index*(w+gap);ctx.fillStyle='#f5f6f2';ctx.fillRect(x,y,w,h);drawContain(ctx,img,x+8,y+8,w-16,h-16);ctx.strokeStyle='#d8dcd4';ctx.strokeRect(x,y,w,h);});}
 return canvas.toDataURL('image/webp',.94);
}

function fieldSummary(inner){const fields=parseJson(inner.fields_json,{})||{};if(Array.isArray(fields))return fields.map(item=>`${text(item?.label||item?.id)}: ${text(item?.value)}`).filter(line=>!line.endsWith(': ')).join('\n');return Object.entries(fields).map(([key,value])=>`${key}: ${text(value)}`).filter(line=>!line.endsWith(': ')).join('\n');}
function artPrompt(inner){const fields=fieldSummary(inner)||'Sem texto adicional informado.';return `Crie a ARTE FINAL PLANA E HORIZONTAL para uma caneca personalizada a partir do quadro de referências enviado.\n\nO quadro pode conter a ARTE DO MODELO BASE na parte superior e referências/fotos do cliente abaixo. Preserve a identidade visual, estilo, distribuição, clima e lógica do MODELO BASE. Use as fotos do cliente somente nos locais em que a personalização pedir foto. Não transforme a referência em mockup.\n\nPERSONALIZAÇÃO DO CLIENTE:\n${fields}\n\nREGRAS OBRIGATÓRIAS:\n- saída somente como arte plana horizontal para sublimação;\n- composição final pensada para 2400 × 960 px (aprox. 24 × 9,5 cm);\n- não desenhe caneca, alça, mãos, mesa, embalagem ou cenário;\n- não inclua os títulos/legendas do quadro de referência;\n- preserve exatamente nomes, frases, datas e demais textos fornecidos pelo cliente;\n- se um campo estiver vazio, não invente conteúdo;\n- mantenha elementos importantes afastados das extremidades;\n- produza uma arte comercial limpa, coerente e pronta para impressão.`;}

function install(){
 if(window[INSTALL_KEY])return window[INSTALL_KEY];
 const nativeFetch=window.fetch.bind(window);
 const wrapped=async(input,init={})=>{
  try{
   if(init&&typeof init.body==='string'){
    const outer=parseJson(init.body,null),inner=parseJson(outer?.payload,null);
    if(inner?.action==='personalize_mug_model'){
      const board=await referenceBoard(nativeFetch,inner);
      const prompt=artPrompt(inner);
      const converted={...inner,action:'generate_mug_art',image_base64:board,prompt_art:prompt,instruction:fieldSummary(inner),origin:`${text(inner.origin)||'site_publico'}:${BUILD}`,personalization_action:'personalize_mug_model'};
      const nextInit={...init,body:JSON.stringify({...outer,payload:JSON.stringify(converted)})};
      console.info('[Canecas públicas] personalize_mug_model → generate_mug_art art-only');
      return nativeFetch(input,nextInit);
    }
   }
  }catch(error){console.error('[Canecas públicas] falha ao preparar referência art-only:',error);throw error;}
  return nativeFetch(input,init);
 };
 wrapped.__daMugPublicMakeArtBridge=BUILD;
 window.fetch=wrapped;
 window[INSTALL_KEY]={BUILD,nativeFetch,wrapped};
 document.documentElement.dataset.mugPublicMakeBridge=BUILD;
 return window[INSTALL_KEY];
}

install();
export{BUILD,install,referenceBoard,artPrompt};