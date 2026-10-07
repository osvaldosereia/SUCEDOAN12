const normalize=value=>String(value??'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR')
  .replace(/\s+/g,' ')
  .trim();

export function parseKnowledgeKeywords(value=''){
  return [...new Set(String(value??'').split(/\r?\n|,/).map(item=>item.trim()).filter(Boolean))].slice(0,12);
}

export function knowledgeCategories(items=[]){
  return [...new Set((Array.isArray(items)?items:[]).map(item=>String(item?.category||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

export function knowledgeSearchBlob(item={}){
  return normalize([
    item?.title,
    item?.category,
    item?.content,
    ...(Array.isArray(item?.keywords)?item.keywords:[])
  ].filter(Boolean).join(' '));
}

export function knowledgeMatches(item={},filters={}){
  const query=normalize(filters.query);
  const category=String(filters.category||'all');
  const status=String(filters.status||'all');
  if(category!=='all'&&String(item?.category||'')!==category)return false;
  if(status!=='all'&&String(item?.status||'draft')!==status)return false;
  return !query||knowledgeSearchBlob(item).includes(query);
}
