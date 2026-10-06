const clean=(value,max=1024)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const objectLike=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const NAME_RE=/^[a-z0-9_]{1,512}$/;
const OFFICIAL_URL='https://www.donaantonia.com.br/';
const TRACKED_URL=`${OFFICIAL_URL}?mt={{1}}`;
const TRACKING_VERSION=1;

function formatOfStrategy(strategy){
  return String(strategy?.offer_format||'single').toLowerCase()==='carousel'?'carousel':'single';
}

function offersOfStrategy(strategy,offers){
  if(Array.isArray(offers))return offers;
  return Array.isArray(strategy?.offers)?strategy.offers:[];
}

function componentsOf(template){return Array.isArray(template?.components)?template.components:[]}
function hasStrategyProfile(template){return objectLike(template?.metadata?.strategy_profile)}
function templateProfile(template){return hasStrategyProfile(template)?template.metadata.strategy_profile:{}}
function inferredTemplateFormat(template){
  const profile=templateProfile(template);
  const explicit=String(profile.offer_format||'').toLowerCase();
  if(explicit==='single'||explicit==='carousel')return explicit;
  return componentsOf(template).some(component=>String(component?.type||'').toUpperCase()==='CAROUSEL')?'carousel':'single';
}
function canonicalSimpleStructure(template){
  const components=componentsOf(template);
  if(components.length!==1)return false;
  const body=components[0];
  if(String(body?.type||'').toUpperCase()!=='BODY')return false;
  const text=String(body?.text||'');
  const placeholders=[...text.matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1]));
  if(placeholders.length!==3||placeholders[0]!==1||placeholders[1]!==2||placeholders[2]!==3)return false;
  return text.replace(/\{\{1\}\}/g,'').replace(/\{\{2\}\}/g,'').replace(/\{\{3\}\}/g,'').trim()==='';
}

function hashText(value){
  let h=2166136261;
  for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return (h>>>0).toString(36);
}

export function buildStrategyTemplateProfile(strategy,offers){
  const format=formatOfStrategy(strategy);
  const rows=offersOfStrategy(strategy,offers);
  if(format==='single')return {version:1,tracking_version:TRACKING_VERSION,offer_format:'single',card_count:1,reusable:true,compatibility_key:'single:v1'};
  const stable=rows.map(row=>[
    clean(row?.commercial_id||row?.id,80),
    clean(row?.public_lot_id,80),
    clean(row?.public_name,160),
    Number(row?.sale_price_snapshot??row?.sale_price??0).toFixed(2),
  ].join('|')).join('||');
  return {version:1,tracking_version:TRACKING_VERSION,offer_format:'carousel',card_count:rows.length,reusable:true,compatibility_key:`carousel:${rows.length}:${hashText(stable)}:tracking${TRACKING_VERSION}`};
}

export function strategyTemplateName(strategy,offers){
  const profile=buildStrategyTemplateProfile(strategy,offers);
  const strategyId=clean(strategy?.id,80).replace(/[^a-zA-Z0-9]/g,'').toLowerCase().slice(0,12)||'draft';
  if(profile.offer_format==='single')return `da_strategy_single_${strategyId}_v1`;
  return `da_strategy_carousel_${profile.card_count}_${strategyId}_t${TRACKING_VERSION}_v1`;
}

export function findReusableTemplate(strategy,templates=[]){
  const accountId=clean(strategy?.whatsapp_account_id,80);
  const desired=buildStrategyTemplateProfile(strategy);
  const candidates=(Array.isArray(templates)?templates:[]).filter(template=>{
    if(clean(template?.whatsapp_account_id,80)!==accountId)return false;
    if(String(template?.category||'').toUpperCase()!=='MARKETING')return false;
    if(String(template?.status||'').toUpperCase()!=='APPROVED')return false;
    if(template?.metadata?.meta_missing===true)return false;
    if(String(template?.language||'pt_BR')!=='pt_BR')return false;
    if(inferredTemplateFormat(template)!==desired.offer_format)return false;

    const profiled=hasStrategyProfile(template);
    const profile=templateProfile(template);
    if(profile.reusable===false)return false;

    if(desired.offer_format==='single'){
      if(!canonicalSimpleStructure(template))return false;
      if(profiled){
        if(Number(profile.version||0)!==1)return false;
        if(String(profile.offer_format||'').toLowerCase()!=='single')return false;
        if(profile.compatibility_key&&profile.compatibility_key!==desired.compatibility_key)return false;
      }
      return true;
    }

    if(!profiled)return false;
    if(Number(profile.version||0)!==1||Number(profile.tracking_version||0)!==TRACKING_VERSION||profile.reusable!==true)return false;
    if(String(profile.offer_format||'').toLowerCase()!=='carousel')return false;
    if(Number(profile.card_count||0)!==Number(desired.card_count||0))return false;
    if(!profile.compatibility_key||profile.compatibility_key!==desired.compatibility_key)return false;
    return componentsOf(template).some(component=>String(component?.type||'').toUpperCase()==='CAROUSEL');
  });
  candidates.sort((a,b)=>{
    const ap=templateProfile(a),bp=templateProfile(b);
    const exactA=ap.compatibility_key===desired.compatibility_key?1:0;
    const exactB=bp.compatibility_key===desired.compatibility_key?1:0;
    if(exactA!==exactB)return exactB-exactA;
    const explicitA=hasStrategyProfile(a)?1:0,explicitB=hasStrategyProfile(b)?1:0;
    if(explicitA!==explicitB)return explicitB-explicitA;
    return String(b?.updated_at||'').localeCompare(String(a?.updated_at||''));
  });
  return candidates[0]||null;
}

function money(value){
  const amount=Number(value||0);
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number.isFinite(amount)?amount:0);
}

function safeName(value){
  const name=clean(value,512).toLowerCase();
  if(!NAME_RE.test(name))throw new Error('strategy_template_name_invalid');
  return name;
}

export function buildStrategyTemplateDraft(strategy,offers=[],options={}){
  const rows=offersOfStrategy(strategy,offers);
  const format=formatOfStrategy(strategy);
  const name=safeName(options?.name||strategyTemplateName(strategy,rows));
  const copy=objectLike(strategy?.copy_snapshot)?strategy.copy_snapshot:{};
  if(format==='single'){
    const offer=rows[0]||{};
    const headline=clean(copy.headline||offer.public_name||'Cestas e Kits Dona Antônia',180)||'Cestas e Kits Dona Antônia';
    const body=clean(copy.body||`${offer.public_name||'Oferta da semana'} por ${money(offer.sale_price_snapshot??offer.sale_price)}.`,800)||'Confira nossa oferta da semana.';
    return {
      name,
      language:'pt_BR',
      category:'MARKETING',
      components:[{
        type:'BODY',
        text:'{{1}}\n\n{{2}}\n\n{{3}}',
        example:{body_text:[[headline,body,OFFICIAL_URL]]},
      }],
    };
  }
  if(rows.length<2||rows.length>10)throw new Error('strategy_carousel_card_count_invalid');
  const handles=Array.isArray(options?.mediaHandles)?options.mediaHandles:[];
  if(handles.length<rows.length||handles.some(handle=>!clean(handle,4096)))throw new Error('strategy_carousel_media_handles_required');
  const bodyText=clean(copy.body||copy.headline||'Escolha a Cesta ou Kit que combina melhor com sua casa.',1024)||'Confira nossas opções.';
  return {
    name,
    language:'pt_BR',
    category:'MARKETING',
    components:[
      {type:'BODY',text:bodyText},
      {type:'CAROUSEL',cards:rows.map((row,index)=>({components:[
        {type:'HEADER',format:'IMAGE',example:{header_handle:[clean(handles[index],4096)]}},
        {type:'BODY',text:clean(`${row.public_name||'Cesta ou Kit'} · ${money(row.sale_price_snapshot??row.sale_price)}`,160)},
        {type:'BUTTONS',buttons:[{type:'URL',text:'Ver opção',url:TRACKED_URL,example:[`oferta-${index+1}`]}]},
      ]}))},
    ],
  };
}