export const SAVE_ENVIRONMENT='homologation';

export function buildProductChangeRequest(original, changes){
  return {
    environment:SAVE_ENVIRONMENT,
    mode:'draft_only',
    productId:String(original?.id||original?.firebaseKey||original?.codigo||''),
    before:original,
    after:{...original,...changes},
    createdAt:new Date().toISOString()
  };
}

export function canSendExternalWrite(request){
  return request?.environment==='production-enabled';
}
