const CARD_TYPES=Object.freeze(['economica','mini','pequena','media','grande']);
const CARD_LABELS=Object.freeze(['Cesta Econômica','Cesta Mini','Cesta Pequena','Cesta Média','Cesta Grande']);
const MEDIA_HOSTS=new Set(['www.donaantonia.com.br','donaantonia.com.br']);
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max=160)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const normalizedType=value=>clean(value,30).toUpperCase();
const fail=code=>{throw new Error(code)};

function safeMediaUrl(value,basketType){
  let url;
  try{url=new URL(String(value??''))}catch{fail('carousel_image_url_invalid')}
  if(url.protocol!=='https:'||!MEDIA_HOSTS.has(url.hostname.toLowerCase())||url.username||url.password||url.search||url.hash||!url.pathname.endsWith(`/${basketType}.jpg`))fail('carousel_image_url_invalid');
  return url.toString();
}

function safeCarouselDestination(value){
  let url;
  try{url=new URL(String(value??''))}catch{fail('post_sale_static_url_button_required')}
  if(url.protocol!=='https:'||url.hostname.toLowerCase()!=='www.donaantonia.com.br'||url.username||url.password||url.pathname!=='/'||url.hash||url.searchParams.size!==1||url.searchParams.get('campanha')!=='{{1}}'||url.search!=='?campanha={{1}}')fail('post_sale_carousel_url_invalid');
  return url;
}

export function buildPostSaleCarouselComponents(templateComponents,carouselAssets){
  const components=Array.isArray(templateComponents)?templateComponents:[];
  const body=components.find(component=>normalizedType(component?.type)==='BODY');
  const bodyText=String(body?.text??'');
  if(!/responda\s+SAIR/i.test(bodyText))fail('post_sale_optout_copy_required');
  if(/\{\{\s*\d+\s*\}\}/.test(bodyText))fail('post_sale_body_variables_not_supported');
  const carousel=components.find(component=>normalizedType(component?.type)==='CAROUSEL');
  const cards=Array.isArray(carousel?.cards)?carousel.cards:[];
  const assets=Array.isArray(carouselAssets)?carouselAssets:[];
  if(cards.length!==CARD_TYPES.length||assets.length!==CARD_TYPES.length)fail('carousel_assets_invalid');

  const outputCards=CARD_TYPES.map((basketType,index)=>{
    const asset=assets[index];
    if(Number(asset?.card_index)!==index||clean(asset?.basket_type,32).toLowerCase()!==basketType)fail('carousel_assets_invalid');
    const imageUrl=safeMediaUrl(asset?.image_url,basketType);
    const cardComponents=Array.isArray(cards[index]?.components)?cards[index].components:[];
    const header=cardComponents.find(component=>normalizedType(component?.type)==='HEADER');
    const cardBody=cardComponents.find(component=>normalizedType(component?.type)==='BODY');
    const buttons=cardComponents.find(component=>normalizedType(component?.type)==='BUTTONS');
    if(cardComponents.length!==3||normalizedType(header?.format)!=='IMAGE'||clean(cardBody?.text,160)!==CARD_LABELS[index])fail('carousel_template_card_invalid');
    const rows=Array.isArray(buttons?.buttons)?buttons.buttons:[];
    const urlButtons=rows.filter(button=>normalizedType(button?.type)==='URL');
    if(rows.length!==1||urlButtons.length!==1||clean(urlButtons[0]?.text,25)!=='Ver cestas'||clean(urlButtons[0]?.url,200)!=='https://www.donaantonia.com.br/?campanha={{1}}')fail('post_sale_static_url_button_required');
    safeCarouselDestination(urlButtons[0].url);
    return {card_index:index,components:[
      {type:'header',parameters:[{type:'image',image:{link:imageUrl}}]},
      {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:`d20_${basketType}`}]},
    ]};
  });
  return [{type:'carousel',cards:outputCards}];
}

function safeLimit(value){
  const number=Number(value??10);
  return Number.isInteger(number)&&number>0?Math.min(number,25):10;
}

async function finish(db,id,status,providerMessageId=null,error=null){
  try{
    const result=await db.rpc('marketing_post_sale_finish_dispatch_v1',{
      p_dispatch_id:id,p_status:status,p_provider_message_id:providerMessageId,p_error:error,
    });
    return !result?.error&&result?.data?.ok===true;
  }catch{return false}
}

function errorCode(error){
  return clean(error?.code||error?.message||error,160)||'meta_send_failed';
}

export async function runPostSaleWorkerBatch({db,sendTemplate,limit=10,accessToken='',graphVersion=''}={}){
  if(!db||typeof db.rpc!=='function'||typeof sendTemplate!=='function')throw new Error('post_sale_worker_dependencies_missing');
  const claim=await db.rpc('marketing_post_sale_claim_due_v1',{p_limit:safeLimit(limit)});
  if(claim?.error||claim?.data?.ok!==true)throw new Error('post_sale_claim_failed');
  const items=Array.isArray(claim.data.items)?claim.data.items:[];
  const results=[];

  for(const row of items){
    const id=String(row?.id??'');
    if(!UUID_RE.test(id)){results.push({status:'invalid'});continue}
    let validation;
    try{validation=await db.rpc('marketing_post_sale_validate_dispatch_v1',{p_dispatch_id:id})}
    catch{validation={error:true}}
    if(validation?.error){
      const recorded=await finish(db,id,'failed',null,'dispatch_validation_unavailable');
      results.push({id,status:recorded?'failed':'uncertain',error:'dispatch_validation_unavailable'});
      continue;
    }
    if(validation?.data?.ok!==true||!validation?.data?.item){
      results.push({id,status:'suppressed',error:'dispatch_not_eligible'});
      continue;
    }

    const item=validation.data.item;
    let components;
    try{
      if(item.template_name!=='carrossel_cestas_basicas_5_tipos_d20'||item.language_code!=='pt_BR')fail('post_sale_template_mismatch');
      if(!/^\d{5,30}$/.test(String(item.phone_number_id??''))||!/^\+55\d{10,11}$/.test(String(item.to_phone_e164??'')))fail('post_sale_destination_invalid');
      components=buildPostSaleCarouselComponents(item.template_components,item.carousel_assets);
    }
    catch(error){
      const code=errorCode(error);
      const recorded=await finish(db,id,'failed',null,code);
      results.push({id,status:recorded?'failed':'uncertain',error:code});
      continue;
    }

    try{
      const sent=await sendTemplate({
        accessToken,
        phoneNumberId:String(item.phone_number_id??''),
        toE164:String(item.to_phone_e164??''),
        templateName:String(item.template_name??''),
        languageCode:String(item.language_code||'pt_BR'),
        components,
        graphVersion,
        timeoutMs:15000,
      });
      const providerMessageId=clean(sent?.providerMessageId,160);
      if(!providerMessageId){
        const recorded=await finish(db,id,'uncertain',null,'meta_message_id_missing');
        results.push({id,status:'uncertain',error:recorded?'meta_message_id_missing':'dispatch_ledger_update_failed'});
        continue;
      }
      const recorded=await finish(db,id,'accepted',providerMessageId,null);
      results.push({id,status:recorded?'accepted':'uncertain',error:recorded?undefined:'dispatch_ledger_update_failed_after_send'});
    }catch(error){
      const code=errorCode(error);
      const status=error?.uncertain===true?'uncertain':'failed';
      const recorded=await finish(db,id,status,null,code);
      results.push({id,status:recorded?status:'uncertain',error:recorded?code:'dispatch_ledger_update_failed'});
    }
  }
  return results;
}
