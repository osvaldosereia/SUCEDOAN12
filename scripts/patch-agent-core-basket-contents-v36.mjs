import fs from 'node:fs';

const files=[
  'supabase/functions/dona-antonia-agent-core-v1/index.ts',
  'supabase/functions/dona-antonia-agent-eval-v1/index.ts',
];

const kernelNeedle='Cestas têm preço comercial próprio. Nunca exponha preço individual dos componentes nem recalcule a cesta pela soma dos componentes.\n';
const kernelAddition='Perguntas sobre lista, preço comercial, tamanho, comparação ou composição de cestas mantêm intent basket; não use product_search ou product_detail para esse assunto. Para composição de uma cesta, use wa_get_basket_contents e não selecione nem inicie uma cesta apenas para consultar seus itens.\n';
const behaviorNeedle='Para checkout de produtos avulsos, use wa_start_order_checkout; para cesta selecionada, use wa_start_basket_checkout. Em shadow ambas as ações permanecem simuladas.\n';
const behaviorAddition='Quando o cliente disser que quer finalizar, fechar ou prosseguir e já houver carrinho, não peça uma autorização redundante para iniciar o checkout: consulte o estado necessário e use a ferramenta de checkout correta. A confirmação final do pedido continua sendo uma etapa separada e explícita.\nSe o cliente quiser trocar, retirar, aumentar ou personalizar itens de uma cesta, conduza a alteração pela jornada/Flow governado; não transforme o chat em formulário de substituições quando o Flow estiver disponível.\nPedidos de mudança de endereço durante carrinho ou checkout devem usar wa_request_address_flow quando a intenção estiver clara, mesmo que o cliente use palavras diferentes de "mudar endereço"; o backend continua validando elegibilidade.\nSe a decisão for needs_human=true ou next_action=handoff, chame wa_handoff_human no mesmo turno, salvo se a evidência indicar handoff já aberto. Nunca diga que encaminhou sem acionar a ferramenta governada.\n';

function once(src,from,to,label){const count=src.split(from).length-1;if(count!==1)throw new Error(`${label}: expected exactly one match, got ${count}`);return src.replace(from,to);}

for(const path of files){
  let src=fs.readFileSync(path,'utf8');
  if(!src.includes(kernelAddition)) src=once(src,kernelNeedle,kernelNeedle+kernelAddition,`${path} kernel`);
  if(!src.includes(behaviorAddition)) src=once(src,behaviorNeedle,behaviorNeedle+behaviorAddition,`${path} behavior`);
  if(!src.includes('const basketCommerce=["wa_list_baskets","wa_get_basket_contents",')) src=once(src,'const basketCommerce=["wa_list_baskets",','const basketCommerce=["wa_list_baskets","wa_get_basket_contents",',`${path} basketCommerce`);
  if(!src.includes('basket_customization:[...basketState,"wa_get_basket_contents",')) src=once(src,'basket_customization:[...basketState,','basket_customization:[...basketState,"wa_get_basket_contents",',`${path} basketCustomization`);

  const productDesired='product_search:["wa_search_products","wa_get_product","wa_get_cart","wa_get_basket_contents","wa_add_product","wa_set_quantity","wa_create_search_showcase","wa_create_basket_replacement","wa_open_basket_storefront","wa_add_more_products","wa_start_order_checkout",...core]';
  if(!src.includes(productDesired)){
    const productCurrent='product_search:["wa_search_products","wa_get_product","wa_get_cart","wa_add_product","wa_set_quantity","wa_create_search_showcase","wa_create_basket_replacement","wa_open_basket_storefront","wa_add_more_products","wa_start_order_checkout",...core]';
    const productLegacy='product_search:["wa_search_products","wa_get_product","wa_get_cart","wa_add_product","wa_set_quantity","wa_create_search_showcase",...core]';
    if(src.includes(productCurrent)) src=once(src,productCurrent,productDesired,`${path} productBasketRecovery`);
    else src=once(src,productLegacy,productDesired,`${path} productSearchRecovery`);
  }

  const generalDesired='general:["wa_get_policy","wa_search_products","wa_list_baskets","wa_get_basket_contents","wa_get_cart","wa_get_basket_state","wa_get_checkout_contact","wa_request_address_flow","wa_handoff_human"]';
  if(!src.includes(generalDesired)){
    const generalCurrent='general:["wa_get_policy","wa_search_products","wa_list_baskets","wa_get_cart","wa_get_basket_state","wa_get_checkout_contact","wa_request_address_flow","wa_handoff_human"]';
    const generalLegacy='general:["wa_get_policy","wa_search_products","wa_list_baskets","wa_get_cart","wa_handoff_human"]';
    if(src.includes(generalCurrent)) src=once(src,generalCurrent,generalDesired,`${path} generalBasketRecovery`);
    else src=once(src,generalLegacy,generalDesired,`${path} generalSemanticRecovery`);
  }

  const execFrom='if(name==="wa_list_baskets")return await sb.rpc("get_whatsapp_simple_baskets_v1");if(name==="wa_get_policy")';
  const execTo='if(name==="wa_list_baskets")return await sb.rpc("get_whatsapp_simple_baskets_v1");if(name==="wa_get_basket_contents")return await sb.rpc("get_whatsapp_basket_contents_v1",{p_basket_query:clean(a.basket_query,120)});if(name==="wa_get_policy")';
  if(!src.includes('get_whatsapp_basket_contents_v1')) src=once(src,execFrom,execTo,`${path} executor`);
  fs.writeFileSync(path,src);
}

console.log('Patched Agent Core and Eval V41 basket/tool recovery support');
