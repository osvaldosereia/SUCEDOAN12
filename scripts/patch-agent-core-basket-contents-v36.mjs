import fs from 'node:fs';

const files=[
  'supabase/functions/dona-antonia-agent-core-v1/index.ts',
  'supabase/functions/dona-antonia-agent-eval-v1/index.ts',
];

const kernelNeedle='Cestas têm preço comercial próprio. Nunca exponha preço individual dos componentes nem recalcule a cesta pela soma dos componentes.\n';
const kernelAddition='Perguntas sobre lista, preço comercial, tamanho, comparação ou composição de cestas mantêm intent basket; não use product_search ou product_detail para esse assunto. Para composição de uma cesta, use wa_get_basket_contents e não selecione nem inicie uma cesta apenas para consultar seus itens.\n';

function once(src,from,to,label){
  const count=src.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected exactly one match, got ${count}`);
  return src.replace(from,to);
}

for(const path of files){
  let src=fs.readFileSync(path,'utf8');
  if(!src.includes(kernelAddition)) src=once(src,kernelNeedle,kernelNeedle+kernelAddition,`${path} kernel`);

  if(!src.includes('const basketCommerce=["wa_list_baskets","wa_get_basket_contents",')){
    src=once(src,'const basketCommerce=["wa_list_baskets",','const basketCommerce=["wa_list_baskets","wa_get_basket_contents",',`${path} basketCommerce`);
  }

  if(!src.includes('basket_customization:[...basketState,"wa_get_basket_contents",')){
    src=once(src,'basket_customization:[...basketState,','basket_customization:[...basketState,"wa_get_basket_contents",',`${path} basketCustomization`);
  }

  if(path.includes('agent-core-v1')){
    const from='if(name==="wa_list_baskets")return await sb.rpc("get_whatsapp_simple_baskets_v1");if(name==="wa_get_policy")';
    const to='if(name==="wa_list_baskets")return await sb.rpc("get_whatsapp_simple_baskets_v1");if(name==="wa_get_basket_contents")return await sb.rpc("get_whatsapp_basket_contents_v1",{p_basket_query:clean(a.basket_query,120)});if(name==="wa_get_policy")';
    if(!src.includes('get_whatsapp_basket_contents_v1')) src=once(src,from,to,`${path} executor`);
  }else{
    const from='if(name==="wa_list_baskets")return await sb.rpc("get_whatsapp_simple_baskets_v1");if(name==="wa_get_policy")';
    const to='if(name==="wa_list_baskets")return await sb.rpc("get_whatsapp_simple_baskets_v1");if(name==="wa_get_basket_contents")return await sb.rpc("get_whatsapp_basket_contents_v1",{p_basket_query:clean(a.basket_query,120)});if(name==="wa_get_policy")';
    if(!src.includes('get_whatsapp_basket_contents_v1')) src=once(src,from,to,`${path} executor`);
  }

  fs.writeFileSync(path,src);
}

console.log('Patched Agent Core and Eval V36 basket contents support');
