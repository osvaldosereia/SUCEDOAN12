import {
  parseDeterministicIntent,
  formatBasketCatalog,
  formatBasketDetail,
  formatCartState,
  formatProductResults,
  chooseExactProduct,
  normalizePt
} from "./papoai-commerce-brain-v1.mjs";

const clean=(v,max=2000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

function response({text='',mediaUrl=null,sessionKey,correlationId,handoff=false,reason=null}){
  const message=text?{text:clean(text,8000)}:null;
  if(message&&mediaUrl) message.media_url=clean(mediaUrl,1800);
  const out={message,handoff:Boolean(handoff),session_id:sessionKey,correlation_id:correlationId};
  if(reason) out.reason=reason;
  return out;
}

function finalText(data){
  return arr(data?.output)
    .filter(x=>x?.type==='message')
    .flatMap(x=>arr(x.content))
    .filter(x=>x?.type==='output_text')
    .map(x=>String(x.text||''))
    .join('').trim();
}

async function openAiKey(sb){
  let key=Deno.env.get('OPENAI_API_KEY')||'';
  if(!key){
    const {data}=await sb.rpc('get_conversation_worker_provider_secret_v1');
    if(typeof data==='string') key=data;
  }
  return key;
}

const PLAN_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    intent:{type:'string',enum:[
      'greeting','list_baskets','basket_contents','choose_basket','cart_summary',
      'remove_item','add_or_increase','replace_item','offers','product_search','handoff','unknown'
    ]},
    basket_query:{type:'string'},
    product_query:{type:'string'},
    source_query:{type:'string'},
    target_query:{type:'string'},
    quantity:{type:'integer',minimum:0,maximum:6},
    confidence:{type:'number',minimum:0,maximum:1}
  },
  required:['intent','basket_query','product_query','source_query','target_query','quantity','confidence']
};

async function aiPlan(sb,normalized,baskets,cart,config){
  if(config?.ai_enabled!==true) return null;
  const key=await openAiKey(sb);
  if(!key) return null;
  const maxHistory=Math.max(4,Math.min(12,Number(config?.max_history_messages||8)));
  const recent=arr(normalized.history).slice(-maxHistory).map(x=>({role:x.role,text:clean(x.content,420)}));
  const payload={
    message:clean(normalized.messageText,1200),
    basket_names:arr(baskets).map(x=>clean(x.name,100)),
    active_basket:cart?.basket?.name||null,
    cart_items:arr(cart?.items).map(x=>({name:clean(x.name,120),source:x.source,quantity:Number(x.quantity||0)})).slice(0,40),
    recent_history:recent
  };
  const model=clean(Deno.env.get('PAPOAI_COMMERCE_MODEL')||Deno.env.get('OPENAI_CONVERSATION_MODEL')||'gpt-5.6-luna',80);
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,store:false,max_output_tokens:180,reasoning:{effort:'low'},
        instructions:[
          'Você apenas interpreta uma mensagem comercial da Dona Antônia.',
          'Escolha uma intenção do schema e extraia nomes/quantidade.',
          'Não calcule preço, não invente produto, estoque, cesta, cliente ou ação.',
          'Se houver dúvida real, use unknown. Se pedir humano, handoff.',
          'Troca deve separar source_query e target_query.',
          'Retirada usa product_query. Adição/aumento usa product_query e quantity.'
        ].join(' '),
        input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(payload)}]}],
        text:{verbosity:'low',format:{type:'json_schema',name:'papoai_commerce_plan',strict:true,schema:PLAN_SCHEMA}}
      }),
      signal:AbortSignal.timeout(8000)
    });
    if(!r.ok) return null;
    const data=await r.json().catch(()=>({}));
    const parsed=JSON.parse(finalText(data)||'{}');
    if(Number(parsed.confidence||0)<.62) return null;
    return parsed;
  }catch{return null}
}

async function resolveAccount(sb,normalized){
  if(normalized.channelPhoneE164){
    const {data,error}=await sb.from('whatsapp_accounts')
      .select('id,phone_e164,display_name')
      .eq('is_active',true)
      .eq('phone_e164',normalized.channelPhoneE164)
      .maybeSingle();
    if(!error&&data?.id) return data;
  }
  const {data,error}=await sb.from('whatsapp_accounts')
    .select('id,phone_e164,display_name')
    .eq('is_active',true)
    .order('updated_at',{ascending:false})
    .limit(2);
  if(error) throw new Error('whatsapp_account_lookup_failed');
  if(arr(data).length===1) return data[0];
  throw new Error('whatsapp_account_ambiguous');
}

async function searchProducts(sb,query,limit){
  const {data,error}=await sb.rpc('search_whatsapp_sellable_products_v1',{
    p_query:clean(query,120),p_limit:Math.max(1,Math.min(10,Number(limit||6)))
  });
  if(error) throw new Error('product_search_failed');
  const ranked=arr(data);
  if(!ranked.length) return [];
  const ids=ranked.map(x=>x.id);
  const {data:details,error:detailError}=await sb.from('products')
    .select('id,sku,gtin,name,brand,category,customer_category,packaging,price,offer_price,is_offer,is_upsell,stock,image_url')
    .in('id',ids);
  if(detailError) throw new Error('product_detail_failed');
  const byId=new Map(arr(details).map(x=>[String(x.id),x]));
  return ids.map(id=>byId.get(String(id))).filter(Boolean);
}

async function offerProducts(sb,limit){
  const {data,error}=await sb.from('products')
    .select('id,sku,gtin,name,brand,category,customer_category,packaging,price,offer_price,is_offer,is_upsell,stock,image_url,sort_order')
    .eq('physically_verified',true)
    .eq('is_active',true)
    .eq('is_whatsapp_active',true)
    .eq('is_offer',true)
    .gt('stock',0)
    .not('offer_price','is',null)
    .order('sort_order',{ascending:true})
    .limit(Math.max(1,Math.min(12,Number(limit||6))));
  if(error) throw new Error('offers_lookup_failed');
  return arr(data).filter(p=>Number(p.offer_price||0)>0&&Number(p.offer_price)<=Number(p.price||0));
}

function cartMatch(query,cart,sourceFilter=null){
  const items=arr(cart?.items).filter(x=>!sourceFilter||sourceFilter.includes(x.source));
  return chooseExactProduct(query,items);
}

async function persistTurn(sb,payload){
  const {error}=await sb.from('papoai_commerce_turns').insert(payload);
  if(!error) return true;
  return false;
}

export async function runPapoAiCommerceTurn({
  sb,normalized,adapter,correlationId,providerEventKey,startedAt
}){
  const {data:config,error:configError}=await sb.rpc('get_papoai_commerce_brain_config_v1');
  if(configError||!config||config.enabled!==true) return null;

  const {data:prior}=await sb.from('papoai_commerce_turns')
    .select('response_body')
    .eq('adapter_id',adapter.id)
    .eq('provider_event_key',providerEventKey)
    .maybeSingle();
  if(prior?.response_body) return {body:prior.response_body,replayed:true};

  const waAccount=await resolveAccount(sb,normalized);
  const occurredAt=normalized.providerSentAt||new Date().toISOString();
  const {data:ingested,error:ingestError}=await sb.rpc('ingest_channel_adapter_event_v1',{
    p_provider_key:'papoai',
    p_channel:'whatsapp',
    p_channel_account_id:adapter.channel_account_id,
    p_whatsapp_account_id:waAccount.id,
    p_external_user_id:normalized.phoneE164,
    p_external_contact_id:null,
    p_phone:normalized.phoneE164,
    p_display_name:normalized.displayName,
    p_external_message_id:normalized.externalMessageId,
    p_external_event_id:normalized.externalEventId,
    p_direction:'inbound',
    p_message_type:normalized.messageType||'text',
    p_body_text:normalized.messageText,
    p_media_refs:[],
    p_tags:[],
    p_provider_context:{...normalized.providerContext,agent_external:true,commerce_brain:true,session_key:normalized.sessionKey},
    p_referral:{provider_adapter:'papoai',commerce_brain:true},
    p_occurred_at:occurredAt
  });
  if(ingestError||!ingested?.conversation_id) throw new Error('commerce_ingest_failed');

  const conversationId=ingested.conversation_id;
  const [catalogResult,cartResult,customerResult]=await Promise.all([
    sb.rpc('get_papoai_commerce_basket_catalog_v1'),
    sb.rpc('get_papoai_commerce_cart_state_v1',{p_conversation_id:conversationId}),
    sb.rpc('get_papoai_commerce_customer_context_v1',{p_conversation_id:conversationId})
  ]);
  if(catalogResult.error||cartResult.error||customerResult.error) throw new Error('commerce_context_failed');
  const baskets=arr(catalogResult.data);
  let cart=cartResult.data||{has_cart:false};
  const customer=customerResult.data||{known:false};

  let plan=parseDeterministicIntent(normalized.messageText,baskets,Boolean(cart?.has_cart));
  let plannerSource='deterministic',aiUsed=false;
  if(plan.intent==='unknown'){
    const ai=await aiPlan(sb,normalized,baskets,cart,config);
    if(ai){plan=ai;plannerSource='openai_classifier';aiUsed=true}
  }

  const tools=[];
  let body;
  const tool=(name,summary={})=>tools.push({name,...summary});

  if(plan.intent==='greeting'){
    const first=customer?.known&&customer?.name ? `Oi, ${clean(customer.name,80)}! 😊` : 'Oi! 😊';
    body=response({
      text:`${first} Sou a Dona Antônia. Posso te mostrar as cestas, procurar produtos, ver ofertas ou ajudar a montar seu pedido.`,
      sessionKey:normalized.sessionKey,correlationId
    });
  }else if(plan.intent==='list_baskets'){
    tool('get_basket_catalog',{count:baskets.length});
    body=response({text:formatBasketCatalog(baskets),sessionKey:normalized.sessionKey,correlationId});
  }else if(plan.intent==='basket_contents'){
    const query=clean(plan.basketQuery||plan.basket_query||cart?.basket?.name,120);
    const {data:detail,error}=await sb.rpc('get_papoai_commerce_basket_detail_v1',{p_basket_query:query});
    if(error) throw new Error('basket_detail_failed');
    tool('get_basket_detail',{found:Boolean(detail?.found),item_count:Number(detail?.item_count||0)});
    body=response({text:formatBasketDetail(detail),sessionKey:normalized.sessionKey,correlationId});
  }else if(plan.intent==='choose_basket'){
    const query=clean(plan.basketQuery||plan.basket_query,120);
    if(config.write_enabled!==true){
      const {data:detail}=await sb.rpc('get_papoai_commerce_basket_detail_v1',{p_basket_query:query});
      body=response({text:detail?.found?`${detail.basket.display_name} custa ${Number(detail.basket.commercial_price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. A seleção ainda está em homologação.`:'Não encontrei essa cesta.',sessionKey:normalized.sessionKey,correlationId});
    }else{
      const {data,error}=await sb.rpc('start_papoai_commerce_basket_v1',{p_conversation_id:conversationId,p_basket_query:query});
      if(error) throw new Error('basket_start_failed');
      cart=data?.cart||cart;
      tool('start_basket',{basket:cart?.basket?.name||query});
      body=response({text:`Pronto 😊 Separei a *${clean(cart?.basket?.display_name||cart?.basket?.name,100)}*.\nTotal: *${Number(cart?.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}*\n\nVocê pode trocar, retirar ou aumentar itens antes de fechar.`,sessionKey:normalized.sessionKey,correlationId});
    }
  }else if(plan.intent==='cart_summary'){
    tool('get_cart',{has_cart:Boolean(cart?.has_cart)});
    body=response({text:formatCartState(cart),sessionKey:normalized.sessionKey,correlationId});
  }else if(plan.intent==='offers'){
    const products=await offerProducts(sb,config.max_product_results);
    tool('get_offers',{count:products.length});
    const rendered=formatProductResults(products,{offers:true});
    body=response({text:rendered.text,mediaUrl:rendered.media_url,sessionKey:normalized.sessionKey,correlationId});
  }else if(plan.intent==='product_search'){
    const query=clean(plan.productQuery||plan.product_query,120);
    const products=await searchProducts(sb,query,config.max_product_results);
    const exact=chooseExactProduct(query,products);
    tool('search_products',{count:products.length,exact:Boolean(exact)});
    const rendered=formatProductResults(exact?[exact]:products,{spotlight:Boolean(exact)});
    body=response({text:rendered.text,mediaUrl:rendered.media_url,sessionKey:normalized.sessionKey,correlationId});
  }else if(plan.intent==='remove_item'){
    if(config.write_enabled!==true) body=response({text:'As alterações do carrinho ainda estão em homologação.',sessionKey:normalized.sessionKey,correlationId});
    else{
      const query=clean(plan.productQuery||plan.product_query,120);
      const match=cartMatch(query,cart,['basket','addon']);
      if(!match) body=response({text:'Qual produto você quer retirar? Me diga o nome como aparece na cesta.',sessionKey:normalized.sessionKey,correlationId});
      else{
        const rpc=match.source==='addon'?'set_papoai_commerce_addon_quantity_v1':'set_papoai_commerce_basket_quantity_v1';
        const args=match.source==='addon'
          ? {p_conversation_id:conversationId,p_product_id:match.product_id,p_quantity:0}
          : {p_conversation_id:conversationId,p_product_id:match.product_id,p_quantity:0};
        const {data,error}=await sb.rpc(rpc,args);
        if(error) throw new Error('remove_item_failed');
        cart=data; tool(rpc,{product:match.name});
        body=response({text:`Retirei *${clean(match.name,140)}*.\nTotal agora: *${Number(cart.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}*.`,sessionKey:normalized.sessionKey,correlationId});
      }
    }
  }else if(plan.intent==='add_or_increase'){
    if(config.write_enabled!==true) body=response({text:'As alterações do carrinho ainda estão em homologação.',sessionKey:normalized.sessionKey,correlationId});
    else{
      const query=clean(plan.productQuery||plan.product_query,120);
      const qty=Math.max(1,Math.min(6,Number(plan.quantity||1)));
      const existing=cartMatch(query,cart,['basket','addon']);
      if(existing){
        const next=Number(existing.quantity||0)+qty;
        const rpc=existing.source==='addon'?'set_papoai_commerce_addon_quantity_v1':'set_papoai_commerce_basket_quantity_v1';
        const {data,error}=await sb.rpc(rpc,{p_conversation_id:conversationId,p_product_id:existing.product_id,p_quantity:next});
        if(error) throw new Error('increase_item_failed');
        cart=data;tool(rpc,{product:existing.name,quantity:next});
        body=response({text:`Pronto. Agora são ${next}× *${clean(existing.name,140)}*.\nTotal: *${Number(cart.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}*.`,sessionKey:normalized.sessionKey,correlationId});
      }else{
        const products=await searchProducts(sb,query,config.max_product_results);
        const exact=chooseExactProduct(query,products);
        if(!exact){
          const rendered=formatProductResults(products);
          body=response({text:`${rendered.text}\n\nQual deles você quer adicionar?`,sessionKey:normalized.sessionKey,correlationId});
        }else{
          const {data,error}=await sb.rpc('set_papoai_commerce_addon_quantity_v1',{p_conversation_id:conversationId,p_product_id:exact.id,p_quantity:qty});
          if(error) throw new Error('addon_failed');
          cart=data;tool('set_addon',{product:exact.name,quantity:qty});
          body=response({text:`Adicionei ${qty}× *${clean(exact.name,140)}*.\nTotal agora: *${Number(cart.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}*.`,mediaUrl:exact.image_url,sessionKey:normalized.sessionKey,correlationId});
        }
      }
    }
  }else if(plan.intent==='replace_item'){
    if(config.write_enabled!==true) body=response({text:'As trocas ainda estão em homologação.',sessionKey:normalized.sessionKey,correlationId});
    else{
      const sourceQuery=clean(plan.sourceQuery||plan.source_query,120);
      const targetQuery=clean(plan.targetQuery||plan.target_query,120);
      const source=cartMatch(sourceQuery,cart,['basket']);
      if(!source) body=response({text:'Não consegui identificar qual item da cesta você quer trocar. Me diga o nome dele.',sessionKey:normalized.sessionKey,correlationId});
      else{
        const products=await searchProducts(sb,targetQuery,config.max_product_results);
        const target=chooseExactProduct(targetQuery,products);
        if(!target){
          const rendered=formatProductResults(products);
          body=response({text:`${rendered.text}\n\nQual deles entra no lugar de ${clean(source.name,120)}?`,sessionKey:normalized.sessionKey,correlationId});
        }else{
          const {data,error}=await sb.rpc('replace_papoai_commerce_basket_item_v1',{
            p_conversation_id:conversationId,p_source_product_id:source.product_id,p_replacement_product_id:target.id
          });
          if(error) throw new Error('replacement_failed');
          cart=data;tool('replace_item',{from:source.name,to:target.name});
          body=response({text:`Troquei *${clean(source.name,120)}* por *${clean(target.name,120)}*.\nTotal agora: *${Number(cart.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}*.`,mediaUrl:target.image_url,sessionKey:normalized.sessionKey,correlationId});
        }
      }
    }
  }else if(plan.intent==='handoff'){
    body=response({text:'Claro. Vou deixar o atendimento com uma pessoa da nossa equipe e manter o contexto desta conversa.',sessionKey:normalized.sessionKey,correlationId,handoff:true,reason:'customer_requested_human'});
  }else{
    body=response({text:'Posso te ajudar com as cestas, produtos, ofertas ou com a montagem do seu pedido. O que você quer ver?',sessionKey:normalized.sessionKey,correlationId});
  }

  const turn={
    correlation_id:correlationId,
    adapter_id:adapter.id,
    conversation_id:conversationId,
    customer_id:ingested?.customer_id||null,
    provider_session_key:normalized.sessionKey,
    provider_event_key:providerEventKey,
    external_message_id:normalized.externalMessageId,
    external_event_id:normalized.externalEventId,
    intent:clean(plan.intent,60)||'unknown',
    action_kind:['choose_basket','remove_item','add_or_increase','replace_item'].includes(plan.intent)?'write':'read',
    response_kind:body?.handoff?'handoff':body?.message?.media_url?'media':'text',
    tool_calls:tools,
    result_summary:{
      text_length:Number(body?.message?.text?.length||0),
      media:Boolean(body?.message?.media_url),
      handoff:Boolean(body?.handoff),
      cart_total:cart?.has_cart?Number(cart.total||0):null
    },
    duration_ms:Date.now()-startedAt,
    response_body:body,
    ai_used:aiUsed,
    planner_source:plannerSource
  };
  const inserted=await persistTurn(sb,turn);
  if(!inserted){
    const {data:raced}=await sb.from('papoai_commerce_turns')
      .select('response_body')
      .eq('adapter_id',adapter.id).eq('provider_event_key',providerEventKey).maybeSingle();
    if(raced?.response_body) return {body:raced.response_body,replayed:true};
  }
  return {body,replayed:false};
}
