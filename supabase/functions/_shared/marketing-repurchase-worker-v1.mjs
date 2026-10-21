const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const D28_TEMPLATE_RE=/^recompradonaantonia28dias(?:0975|1018)v1$/;
const clean=(value,max=160)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const fail=code=>{throw new Error(code)};

function safeLimit(value){
  const number=Number(value??10);
  return Number.isInteger(number)&&number>0?Math.min(number,25):10;
}

export function templateVariables(templateComponents,customerName,basketName,categories,templateName){
  if(!D28_TEMPLATE_RE.test(String(templateName??'')))fail('repurchase_template_mismatch');
  const rows=Array.isArray(templateComponents)?templateComponents:[];
  const header=rows.find(row=>String(row?.type??'').toUpperCase()==='HEADER');
  if(header&&/\{\{\s*\d+\s*\}\}/.test(String(header?.text??'')))fail('template_header_variables_not_supported');
  const body=rows.find(row=>String(row?.type??'').toUpperCase()==='BODY');
  if(!body)fail('template_body_required');
  const matches=[...String(body.text??'').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(match=>Number(match[1]));
  const indexes=[...new Set(matches)].sort((a,b)=>a-b);
  if(indexes.length===0)return [];
  if(indexes.length>2||indexes.some((number,index)=>number!==index+1))fail('template_variables_not_supported');
  const categoryList=Array.isArray(categories)?categories.map(value=>clean(value,32)).filter(Boolean).slice(0,3).join(', '):'';
  const secondaryValue=clean(basketName,60)||categoryList||'cesta básica';
  const firstName=clean(customerName,80).split(/\s+/)[0]||'cliente';
  const values=[firstName,secondaryValue];
  return [{type:'body',parameters:indexes.map(index=>({type:'text',text:values[index-1]}))}];
}

async function finish(db,id,status,providerMessageId=null,error=null){
  try{
    const result=await db.rpc('marketing_repurchase_finish_dispatch_v1',{
      p_dispatch_id:id,p_status:status,p_provider_message_id:providerMessageId,p_error:error,
    });
    return !result?.error&&result?.data?.ok===true;
  }catch{return false}
}

function errorCode(error){
  return clean(error?.code||error?.message||error,160)||'meta_send_failed';
}

async function processDispatch({db,row,sendTemplate,accessToken,graphVersion}){
  const id=String(row?.id??'');
  if(!UUID_RE.test(id))return {status:'invalid'};

  let validation;
  try{validation=await db.rpc('marketing_repurchase_validate_dispatch_v1',{p_dispatch_id:id})}
  catch{validation={error:true}}
  if(validation?.error){
    const recorded=await finish(db,id,'failed',null,'dispatch_validation_unavailable');
    return {id,status:recorded?'failed':'uncertain',error:'dispatch_validation_unavailable'};
  }
  if(validation?.data?.ok!==true||!validation?.data?.item)return {id,status:'suppressed',error:'dispatch_not_eligible'};

  const item=validation.data.item;
  let components;
  try{
    const templateName=String(item.template_name??'');
    if(!D28_TEMPLATE_RE.test(templateName)||String(row?.template_name??'')!==templateName)fail('repurchase_template_mismatch');
    if(item.language_code!=='pt_BR')fail('repurchase_language_mismatch');
    if(!/^\d{5,30}$/.test(String(item.phone_number_id??''))||!/^\+55\d{10,11}$/.test(String(item.to_phone_e164??'')))fail('repurchase_destination_invalid');
    components=templateVariables(item.template_components,item.customer_name,item.basket_name,item.product_categories,templateName);
  }catch(error){
    const code=errorCode(error);
    const recorded=await finish(db,id,'failed',null,code);
    return {id,status:recorded?'failed':'uncertain',error:recorded?code:'dispatch_ledger_update_failed'};
  }

  try{
    const sent=await sendTemplate({
      accessToken,
      phoneNumberId:String(item.phone_number_id),
      toE164:String(item.to_phone_e164),
      templateName:String(item.template_name),
      languageCode:'pt_BR',
      components,
      graphVersion,
      timeoutMs:15000,
    });
    const providerMessageId=clean(sent?.providerMessageId,160);
    if(!providerMessageId){
      const recorded=await finish(db,id,'uncertain',null,'meta_message_id_missing');
      return {id,status:'uncertain',error:recorded?'meta_message_id_missing':'dispatch_ledger_update_failed'};
    }
    const recorded=await finish(db,id,'accepted',providerMessageId,null);
    return {id,status:recorded?'accepted':'uncertain',error:recorded?undefined:'dispatch_ledger_update_failed_after_send'};
  }catch(error){
    const code=errorCode(error);
    const status=error?.uncertain===true?'uncertain':'failed';
    const recorded=await finish(db,id,status,null,code);
    return {id,status:recorded?status:'uncertain',error:recorded?code:'dispatch_ledger_update_failed'};
  }
}

export async function runRepurchaseWorkerBatch({db,sendTemplate,limit=10,accessToken='',graphVersion=''}={}){
  if(!db||typeof db.rpc!=='function'||typeof sendTemplate!=='function')throw new Error('repurchase_worker_dependencies_missing');
  const claimed=await db.rpc('marketing_repurchase_claim_due_v1',{p_limit:safeLimit(limit)});
  if(claimed?.error||claimed?.data?.ok!==true)throw new Error('repurchase_claim_failed');
  const rows=Array.isArray(claimed.data.items)?claimed.data.items:[];
  const results=[];
  for(const row of rows){
    try{results.push(await processDispatch({db,row,sendTemplate,accessToken,graphVersion}))}
    catch(error){results.push({id:clean(row?.id,64),status:'error',error:errorCode(error)})}
  }
  return results;
}
