const BUILD='20260828-mug-active-template-bridge-v1';
const nativeFetch=window.fetch.bind(window);
const INACTIVE=new Set(['I','INATIVO','INACTIVE','0','FALSE','EXCLUIDO','EXCLUÍDO']);

const text=value=>String(value??'').trim();
const truthy=value=>value===true||value===1||['1','true','sim','yes'].includes(text(value).toLowerCase());

function isFirebaseProductGet(input,init={}){
  const method=text(init?.method||'GET').toUpperCase();
  if(method!=='GET')return false;
  const url=text(typeof input==='string'?input:input?.url);
  if(!url)return false;
  try{
    const parsed=new URL(url,location.href);
    return parsed.hostname==='cedar-chemist-310801-default-rtdb.firebaseio.com'&&/^\/produtos\/[^/]+\.json$/i.test(parsed.pathname);
  }catch{return false;}
}

function isActiveMug(product={}){
  const category=text(product.categoria||product.category).toLowerCase();
  const mug=truthy(product.modelo_caneca)||truthy(product.produto_sob_encomenda)||category.includes('caneca');
  const status=text(product.situacao??product.status??'A').toUpperCase();
  return mug&&!INACTIVE.has(status);
}

function defaultFields(product={}){
  const name=text(product.nome_destaque||product.personalizacao_cliente?.nome_destaque||'');
  const phrase=text(product.frase||product.modelo_frase||product.personalizacao_cliente?.frase||product.configuracao_arte?.frase_cliente||'');
  return [
    {
      id:'foto_principal',tipo:'foto',label:'Envie sua foto',obrigatorio:true,publico:true,
      ajuda:'Escolha uma foto nítida e bem iluminada.',ordem:0
    },
    {
      id:'nome',tipo:'texto',label:'Nome na caneca',obrigatorio:false,publico:true,
      placeholder:'Digite o nome',valor_padrao:name,ordem:1
    },
    {
      id:'frase',tipo:'texto_longo',label:'Frase',obrigatorio:false,publico:true,
      placeholder:'Digite a frase',valor_padrao:phrase,ordem:2
    }
  ];
}

function publicProduct(product){
  if(!product||typeof product!=='object'||!isActiveMug(product))return product;
  const existing=product.personalizacao_config_publica&&typeof product.personalizacao_config_publica==='object'
    ? product.personalizacao_config_publica
    : {};
  if(existing.ativo===false)return product;
  const campos=Array.isArray(existing.campos)&&existing.campos.length?existing.campos:defaultFields(product);
  return {
    ...product,
    modelo_caneca:true,
    modelo_publico:true,
    personalizacao_publica:true,
    personalizacao_config_publica:{...existing,ativo:true,campos}
  };
}

window.fetch=async function(input,init){
  const response=await nativeFetch(input,init);
  if(!isFirebaseProductGet(input,init)||!response.ok)return response;
  try{
    const clone=response.clone();
    const data=await clone.json();
    const normalized=publicProduct(data);
    if(normalized===data)return response;
    const headers=new Headers(response.headers);
    headers.set('Content-Type','application/json; charset=utf-8');
    return new Response(JSON.stringify(normalized),{
      status:response.status,
      statusText:response.statusText,
      headers
    });
  }catch{return response;}
};

document.documentElement.dataset.mugActiveTemplateBridge=BUILD;
console.info(`Canecas públicas · ${BUILD}`);

export{BUILD,isActiveMug,defaultFields,publicProduct};
