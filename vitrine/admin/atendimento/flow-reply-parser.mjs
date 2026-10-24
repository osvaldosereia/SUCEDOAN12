const cleanText=(value,max)=>typeof value==='string'
  ?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
  :'';

export function parseBasketFlowReply(message){
  if(message?.direction!=='inbound'||message?.message_type!=='interactive')return null;
  const metadata=message?.metadata;
  if(metadata?.source!=='meta')return null;
  const reply=metadata?.interactive?.nfm_reply;
  if(!reply||typeof reply!=='object'||Array.isArray(reply))return null;
  const raw=reply.response_json;
  if(typeof raw!=='string'||raw.length>12000)return null;
  let payload;
  try{payload=JSON.parse(raw)}catch{return null}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.resultado!=='solicitacao_para_atendimento')return null;
  const result={
    summary:cleanText(payload.resumo,1000),
    total:cleanText(payload.valor,120),
    items:cleanText(payload.itens,3000)
  };
  return result.summary||result.total||result.items?result:null;
}
