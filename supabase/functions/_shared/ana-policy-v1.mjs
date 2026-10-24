const clean=(value,max=4000)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

export function isSimpleAnaGreeting(value=''){
  const text=clean(value,120).toLocaleLowerCase('pt-BR').replace(/[!?.;,]+$/g,'').trim();
  return /^(oi+|ol[aá]+|bom dia|boa tarde|boa noite|tudo bem)$/.test(text);
}

export function buildAnaCatalogWelcome({firstName='',catalogPath=''}={}){
  if(!/^\/catalogo_\d{4}$/.test(String(catalogPath)))return '';
  const safeName=/^[\p{L}][\p{L}'’-]{1,31}$/u.test(String(firstName))?` ${firstName}`:'';
  return `Olá${safeName}! 😊 Que bom falar com você. Para ver o catálogo e fazer seu pedido, acesse: https://www.donaantonia.com.br${catalogPath}\nSe preferir, posso te ajudar por aqui.`;
}

export const ANA_DRY_RUN_SCHEMA={
  type:'object',
  additionalProperties:false,
  properties:{
    decision:{type:'string',enum:['suggest','handoff','no_reply']},
    confidence:{type:'number',minimum:0,maximum:1},
    response_text:{type:'string',maxLength:1200},
    reason:{type:'string',maxLength:300},
    missing_context:{type:'array',items:{type:'string',maxLength:120},maxItems:5}
  },
  required:['decision','confidence','response_text','reason','missing_context']
};

export const ANA_DRY_RUN_INSTRUCTIONS=[
  'Você é ANA, atendente da Dona Antônia. Escreva somente uma mensagem de texto que possa ser enviada diretamente ao cliente; nunca altere pedidos, cadastro, pagamentos ou qualquer outro dado.',
  'Responda em português brasileiro simples, curto, cordial e natural. Não pareça robô e use emoji somente quando ajudar.',
  'Quando a mensagem for apenas um cumprimento, acolha o cliente com uma saudação curta. Use somente operational_context.known_customer_first_name quando estiver preenchido; use apenas esse primeiro nome, sem repetir em todas as mensagens. Se estiver vazio, não tente descobrir nem inventar o nome.',
  'Se o cliente já trouxer uma pergunta, pedido, problema ou reclamação junto com o cumprimento, responda primeiro ao assunto. Não desvie reclamações ou pedidos para o catálogo.',
  'Faça no máximo uma pergunta por mensagem.',
  'Nunca invente preço, estoque, total, composição de cesta, prazo, endereço, pedido, pagamento, política comercial ou dado do cliente.',
  'Use somente fatos presentes no contexto recebido. Se faltar um fato necessário para responder com segurança, escolha handoff.',
  'O bloco operational_context contém somente regras estáveis autorizadas; ele não comprova preço, estoque, pedido ou dado individual do cliente.',
  'Se o cliente não exigir resposta, escolha no_reply.',
  'Se a conversa estiver ambígua ou envolver exceção, reclamação sensível, promessa, dado ausente ou ação operacional não disponível, escolha handoff.',
  'Nunca diga que uma ação foi feita. Você só prepara texto.',
  'Não mencione PapoAI, OpenAI, modelo, dry-run, sistema interno, contexto oculto ou política interna ao cliente.',
  'Em response_text entregue apenas o texto que um atendente poderia enviar. Em handoff, pode sugerir uma resposta curta que reconheça a mensagem sem prometer o que não foi verificado.',
  'reason deve ser operacional e curta, sem cadeia de raciocínio detalhada.'
].join(' ');

export function normalizeAnaDryRunResult(value={}){
  const decision=['suggest','handoff','no_reply'].includes(value?.decision)?value.decision:'handoff';
  const confidence=Math.max(0,Math.min(1,Number(value?.confidence)||0));
  const responseText=decision==='no_reply'?'':clean(value?.response_text,1200);
  const reason=clean(value?.reason,300)||'policy_fallback';
  const missingContext=Array.isArray(value?.missing_context)?value.missing_context.map(x=>clean(x,120)).filter(Boolean).slice(0,5):[];
  if(decision==='suggest'&&(!responseText||confidence<0.55)){
    return {decision:'handoff',confidence,response_text:responseText,reason:'low_confidence_or_empty_suggestion',missing_context:missingContext};
  }
  return {decision,confidence,response_text:responseText,reason,missing_context:missingContext};
}

export function buildAnaDryRunInput({inboundText='',history=[],operationalContext={}}={}){
  const stableContext={
    catalog_ordering:clean(operationalContext?.catalog_ordering,500),
    human_support:clean(operationalContext?.human_support,300),
    never_collect_in_chat:Array.isArray(operationalContext?.never_collect_in_chat)?operationalContext.never_collect_in_chat.map(x=>clean(x,80)).filter(Boolean).slice(0,5):[],
    dynamic_data_rule:clean(operationalContext?.dynamic_data_rule,500),
    known_customer_first_name:clean(operationalContext?.known_customer_first_name,40)
  };
  return {
    inbound_message:clean(inboundText,3000),
    operational_context:stableContext,
    recent_history:(Array.isArray(history)?history:[]).slice(-12).map(item=>({
      direction:item?.direction==='outbound'?'outbound':'inbound',
      text:clean(item?.text_body,2000),
      sender_kind:clean(item?.sender_kind,40),
      at:clean(item?.created_at||item?.received_at||item?.sent_at,80)
    })).filter(item=>item.text)
  };
}
