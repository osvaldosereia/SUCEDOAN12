import fs from 'node:fs';

const corePath='supabase/functions/dona-antonia-agent-core-v1/index.ts';
const evalPath='supabase/functions/dona-antonia-agent-eval-v1/index.ts';

function replaceOnce(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1) throw new Error(`${label}: expected 1 match, got ${n}`);
  return src.replace(from,to);
}

const kernelNeedle='sales_state.awaiting tem precedência sobre inferência de etapas anteriores. Se awaiting=basket_final_confirmation e o cliente confirmar explicitamente o pedido, mantenha intent checkout e use wa_finalize_basket_order; não volte a perguntar pagamento, endereço ou cadastro. Se o cliente negar ou pedir alteração, não finalize.\n';
const kernelAdd='Se order.commercial_commitment_exists=true e a mensagem tratar de alteração, problema, cancelamento, endereço, pagamento ou itens de um pedido já confirmado, trate como post_sale e use wa_handoff_human. Nunca reutilize Flow, carrinho ou checkout para modificar silenciosamente um pedido confirmado; até existir ferramenta transacional específica de pós-venda, a equipe humana assume essa mudança.\n';

const helper=`function isConfirmedOrderPostSaleContext(packet:any){
  const p=obj(packet),order=obj(p.order),msg=obj(p.message);
  if(!Boolean(order.commercial_commitment_exists||order.confirmed))return false;
  const text=clean(msg.text,1600).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  const orderRef=/(^| )(pedido|encomenda|compra|confirmad[oa]?|finalizad[oa]?|fechad[oa]?)( |$)/.test(text);
  if(!orderRef)return false;
  return /(^| )(alterar|mudar|trocar|corrigir|cancelar|cancelamento|endereco|pagamento|produto|item|devolver|devolucao|reembolso|atrasad[oa]?|atraso|faltando|faltou|errado|errada|avariado|avariada|quebrado|quebrada|nao chegou|nao recebi)( |$)/.test(text);
}
`;

// Core
{
  let src=fs.readFileSync(corePath,'utf8');
  if(!src.includes(kernelAdd)) src=replaceOnce(src,kernelNeedle,kernelNeedle+kernelAdd,'core kernel order rule');

  const declOld='const p=obj(packet),msg=obj(p.message),conv=obj(p.conversation),state=obj(p.sales_state),customer=obj(p.customer),cart=obj(p.cart),pendingAddress=obj(state.pending_delivery_address);';
  const declNew='const p=obj(packet),msg=obj(p.message),conv=obj(p.conversation),state=obj(p.sales_state),customer=obj(p.customer),cart=obj(p.cart),order=obj(p.order),pendingAddress=obj(state.pending_delivery_address);';
  if(!src.includes('order=obj(p.order)')) src=replaceOnce(src,declOld,declNew,'core minimize order decl');

  const returnOld='cart,history:arr(p.history).slice(-3).map(historyItem),customer_memory:safeMemory(p.customer_memory),intelligence:p.intelligence??{},rules:p.rules??{},truth_sources:arr(p.truth_sources).slice(0,6)};';
  const returnNew='cart,order:{exists:Boolean(order.exists),status:clean(order.status,40),confirmed:Boolean(order.confirmed),delivered:Boolean(order.delivered),cancelled:Boolean(order.cancelled),returned:Boolean(order.returned),commercial_commitment_exists:Boolean(order.commercial_commitment_exists)},history:arr(p.history).slice(-3).map(historyItem),customer_memory:safeMemory(p.customer_memory),intelligence:p.intelligence??{},rules:p.rules??{},truth_sources:arr(p.truth_sources).slice(0,6)};';
  if(!src.includes('commercial_commitment_exists:Boolean(order.commercial_commitment_exists)')) src=replaceOnce(src,returnOld,returnNew,'core minimize order output');

  if(!src.includes('function isConfirmedOrderPostSaleContext')) src=replaceOnce(src,'function allowedForTopic(topic:string,allNames:string[]){',helper+'function allowedForTopic(topic:string,allNames:string[]){','core post-sale helper');

  const topicOld='const toolset=arr(packet.toolset),allNames=toolset.map((t:any)=>clean(t.name,64)).filter(Boolean);if(!toolset.length)throw new Error("toolset_empty");const plannerPacket=minimizePacket(packet),packetJson=JSON.stringify(plannerPacket),topic=clean(packet.topic||plannerPacket.topic||"general",60),base=baseline(job.result);';
  const topicNew='const toolset=arr(packet.toolset),allNames=toolset.map((t:any)=>clean(t.name,64)).filter(Boolean);if(!toolset.length)throw new Error("toolset_empty");const plannerPacket=minimizePacket(packet),postSaleContext=isConfirmedOrderPostSaleContext(plannerPacket),topic=postSaleContext?"post_sale":clean(packet.topic||plannerPacket.topic||"general",60);plannerPacket.topic=topic;const packetJson=JSON.stringify(plannerPacket),base=baseline(job.result);';
  if(!src.includes('postSaleContext=isConfirmedOrderPostSaleContext(plannerPacket)')) src=replaceOnce(src,topicOld,topicNew,'core effective post-sale topic');

  fs.writeFileSync(corePath,src);
}

// Synthetic evaluator
{
  let src=fs.readFileSync(evalPath,'utf8');
  if(!src.includes(kernelAdd)) src=replaceOnce(src,kernelNeedle,kernelNeedle+kernelAdd,'eval kernel order rule');
  if(!src.includes('function isConfirmedOrderPostSaleContext')) src=replaceOnce(src,'function allowedForTopic(topic:string,allNames:string[]){',helper+'function allowedForTopic(topic:string,allNames:string[]){','eval post-sale helper');

  const fixtureOld='function fixturePacket(item:any,topic:string){const f=obj(item.fixture),customer=obj(f.customer),sales=obj(f.sales_state),cart=obj(f.cart);return {topic,message:{type:clean(item.message_type,32)||"text",text:clean(item.message_text,1600),interactive_id:clean(item.interactive_id,180)},conversation:{mode:"ai",stage:clean(item.stage,80),fast_checkout:Boolean(f.fast_checkout),upsell_declined:Boolean(f.upsell_declined)},customer:{registered:Boolean(customer.registered),has_known_address:Boolean(customer.has_known_address)},sales_state:{awaiting:clean(item.awaiting||sales.awaiting,80),last_action:clean(sales.last_action,80),has_pending_delivery_address:Boolean(sales.has_pending_delivery_address)},cart:cart&&Object.keys(cart).length?cart:{exists:false,items:[]},history:';
  const fixtureNew='function fixturePacket(item:any,topic:string){const f=obj(item.fixture),customer=obj(f.customer),sales=obj(f.sales_state),cart=obj(f.cart),order=obj(f.order);return {topic,message:{type:clean(item.message_type,32)||"text",text:clean(item.message_text,1600),interactive_id:clean(item.interactive_id,180)},conversation:{mode:"ai",stage:clean(item.stage,80),fast_checkout:Boolean(f.fast_checkout),upsell_declined:Boolean(f.upsell_declined)},customer:{registered:Boolean(customer.registered),has_known_address:Boolean(customer.has_known_address)},sales_state:{awaiting:clean(item.awaiting||sales.awaiting,80),last_action:clean(sales.last_action,80),has_pending_delivery_address:Boolean(sales.has_pending_delivery_address)},cart:cart&&Object.keys(cart).length?cart:{exists:false,items:[]},order:{exists:Boolean(order.exists),status:clean(order.status,40),confirmed:Boolean(order.confirmed||order.status==="confirmed"),delivered:Boolean(order.delivered),cancelled:Boolean(order.cancelled),returned:Boolean(order.returned),commercial_commitment_exists:Boolean(order.commercial_commitment_exists||order.status==="confirmed")},history:';
  if(!src.includes('const f=obj(item.fixture),customer=obj(f.customer),sales=obj(f.sales_state),cart=obj(f.cart),order=obj(f.order);')) src=replaceOnce(src,fixtureOld,fixtureNew,'eval fixture order');

  src=src.replace('resolve_whatsapp_agent_core_topic_v4",{p_message:', 'resolve_whatsapp_agent_core_topic_v5",{p_message:');

  const loopOld='if(topicErr)throw new Error("topic_resolution_failed");const topic=clean(topicData||"general",60),packet=fixturePacket(item,topic),packetJson=JSON.stringify(packet),allowedNames=allowedForTopic(topic,allNames),allowedSet=new Set(allowedNames),tools=';
  const loopNew='if(topicErr)throw new Error("topic_resolution_failed");const resolvedTopic=clean(topicData||"general",60),packet=fixturePacket(item,resolvedTopic),postSaleContext=isConfirmedOrderPostSaleContext(packet),topic=postSaleContext?"post_sale":resolvedTopic;packet.topic=topic;const packetJson=JSON.stringify(packet),allowedNames=allowedForTopic(topic,allNames),allowedSet=new Set(allowedNames),tools=';
  if(!src.includes('postSaleContext=isConfirmedOrderPostSaleContext(packet)')) src=replaceOnce(src,loopOld,loopNew,'eval effective post-sale topic');

  fs.writeFileSync(evalPath,src);
}

console.log('Patched Agent Core and evaluator V46: compact order context, post-sale guard, topic v5');
