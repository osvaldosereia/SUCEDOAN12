const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();

export function firstMarketingName(value){
  return clean(value).split(' ')[0]||'Cliente';
}

export function resolveMarketingTemplateVariables(values,customerName=''){
  const source=values&&typeof values==='object'&&!Array.isArray(values)?values:{};
  const resolved={};
  for(const [index,value] of Object.entries(source)){
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      if(value.source!=='customer_first_name')throw new Error(`template_variable_invalid:${index}`);
      resolved[index]=clean(customerName)?firstMarketingName(customerName):(clean(value.fallback)||'Cliente');
      continue;
    }
    const text=clean(value);
    if(text)resolved[index]=text;
  }
  return resolved;
}
