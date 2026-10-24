// Pure, side-effect-free helpers shared by the Admin lab and Node CI.
// Neither exports to Meta nor sends messages. All catalog IDs remain provisional
// until Commerce Manager has imported the generated product feed.
export const SIZE_ORDER=['economica','mini','pequena','media','grande'];
export const SIZE_LABELS={economica:'Econômica',mini:'Mini',pequena:'Pequena',media:'Média',grande:'Grande'};
const SITE_URL='https://donaantonia.com.br/';
const REAL_ID=/^[a-z0-9-]{8,80}$/i;
const clean=s=>String(s??'').replace(/[\r\n\t\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
const brl=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100);
const allowedImage=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return ''}};
export const skuForBasket=(size,n)=>'DA-CESTA-'+String(size).toUpperCase()+'-'+String(n).padStart(2,'0');
const pack=detail=>detail?.data||detail;
export function collectBasketVariants(models,variants) {
  const rows=[],issues=[];
  for(const size of SIZE_ORDER){
    const model=models.find(m=>m.size_key===size);
    if(!model||!REAL_ID.test(String(model.id))){issues.push('Modelo '+SIZE_LABELS[size]+' não encontrado.');continue;}
    for(let n=1;n<=3;n++){
      const data=pack(variants.get(model.id+'@'+n));
      const basket=data?.basket,items=data?.items||[];
      const cents=Number(basket?.display_price_cents);
      if(!Number.isSafeInteger(cents)||cents<0||!Array.isArray(items)||!items.length){
        issues.push('Combinação '+n+' da cesta '+SIZE_LABELS[size]+' sem preço/composição válida.');
        continue;
      }
      if(items.some(item=>!REAL_ID.test(String(item.product_id||''))||!clean(item.name))){
        issues.push('Produtos incompletos na cesta '+SIZE_LABELS[size]+' combinação '+n+'.');continue;
      }
      const image=allowedImage(basket?.image_url||model.image_url);
      if(!image)issues.push('Cesta '+SIZE_LABELS[size]+' combinação '+n+' sem imagem HTTPS para publicação.');
      rows.push({size,name:SIZE_LABELS[size],number:n,modelId:model.id,
        id:skuForBasket(size,n),groupId:'DA-CESTA-'+size.toUpperCase(),
        priceCents:cents,stock:Math.max(0,Math.floor(Number(basket?.stock_quantity)||0)),
        image,items:items.map(x=>({quantity:Number(x.quantity??x.base_quantity??0),name:clean(x.name),productId:String(x.product_id)}))
      });
    }
  }
  return {rows,issues,ready:rows.length===15&&issues.length===0};
}
const safeCell=input=>{
  let value=clean(input);
  // Prevent spreadsheet formula interpretation if imported into CSV-capable desktop apps.
  if(/^[=+\-@]/.test(value))value="'"+value;
  return '"'+value.replace(/"/g,'""')+'"';
};
export function buildMetaCatalogCsv(snapshot,{link=SITE_URL}={}){
  if(!snapshot?.ready||snapshot.rows.length!==15)throw new Error('catalog_feed_incomplete');
  const site=new URL(link);
  if(site.protocol!=='https:'||site.username||site.password)throw new Error('invalid_catalog_link');
  const header=['id','title','description','availability','condition','price','link','image_link','brand','item_group_id'];
  const entries=snapshot.rows.map(row=>{
    const description=row.items.filter(x=>x.quantity>0).map(x=>x.quantity+'× '+x.name).join('; ').slice(0,4900);
    const record=[row.id,'Cesta '+row.name+' - Combinação '+row.number,description,
      row.stock>0?'in stock':'out of stock','new',(row.priceCents/100).toFixed(2)+' BRL',site.href,row.image,'Dona Antônia',row.groupId];
    return record.map(safeCell).join(',');
  });
  return '\uFEFF'+header.join(',')+'\r\n'+entries.join('\r\n')+'\r\n';
}
export function buildSizeListMessage(snapshot){
  const grouped=SIZE_ORDER.map(size=>{
    const rows=snapshot.rows.filter(x=>x.size===size);
    const prices=rows.map(x=>x.priceCents);
    const min=prices.length?Math.min(...prices):null;
    const max=prices.length?Math.max(...prices):null;
    const priceText=min===null?'Valores indisponíveis':(min===max?brl(min):'de '+brl(min)+' a '+brl(max));
    return {id:'da:whatsapp:size:'+size,title:'Cesta '+SIZE_LABELS[size],description:'3 combinações · '+priceText};
  });
  return {
    messaging_product:'whatsapp',
    type:'interactive',
    interactive:{type:'list',header:{type:'text',text:'Cestas Dona Antônia'},
      body:{text:'Qual tamanho de cesta você deseja? Veja as combinações e escolha as marcas antes de confirmar.'},
      footer:{text:'Atendimento em Cuiabá e Várzea Grande'},
      action:{button:'Escolher cesta',sections:[{title:'Tamanhos de cestas',rows:grouped}]}}
  };
}
export function buildCombinationsListMessage(snapshot,size){
  if(!SIZE_ORDER.includes(size))throw new Error('invalid_size');
  const rows=snapshot.rows.filter(x=>x.size===size);
  if(rows.length!==3)throw new Error('combinations_missing');
  return {
    messaging_product:'whatsapp',
    type:'interactive',
    interactive:{type:'list',header:{type:'text',text:'Cesta '+SIZE_LABELS[size]},
      body:{text:'Escolha uma combinação para ver todos os produtos. Você poderá trocar marcas e alterar quantidades antes da confirmação.'},
      footer:{text:'Preços sujeitos à conferência'},
      action:{button:'Ver combinações',sections:[{title:'Opções de marcas',rows:rows.map(row=>({
        id:'da:whatsapp:basket:'+size+':'+row.number,
        title:'Combinação '+row.number,
        description:brl(row.priceCents)+' · '+(row.stock>0?'disponível':'confirmar estoque')
      }))}]}}
  };
}
export function buildMetaProductListPreview(snapshot,catalogId='ID_DO_CATALOGO_META'){
  if(snapshot.rows.length!==15)throw new Error('catalog_variants_missing');
  if(!clean(catalogId))throw new Error('catalog_id_missing');
  return {
    messaging_product:'whatsapp',
    type:'interactive',
    interactive:{type:'product_list',header:{type:'text',text:'15 opções de cestas'},
      body:{text:'Escolha o tamanho e a combinação de marcas. Consulte a composição e peça alterações na conversa.'},
      footer:{text:'Preços sujeitos à confirmação'},
      action:{catalog_id:catalogId,sections:SIZE_ORDER.map(size=>({
        title:'Cesta '+SIZE_LABELS[size],
        product_items:snapshot.rows.filter(x=>x.size===size).map(row=>({product_retailer_id:row.id}))
      }))}}
  };
}
export function validatePreviewPayload(payload){
  const inter=payload?.interactive;
  if(payload?.type!=='interactive'||!inter)return false;
  if(inter.type==='list'){
    const sections=inter.action?.sections||[];
    const rows=sections.flatMap(s=>s.rows||[]);
    return sections.length>=1&&sections.length<=10&&rows.length<=10&&rows.every(x=>x.title&&x.title.length<=24&&x.description?.length<=72&&x.id.length<=200)&&inter.action?.button?.length<=20;
  }
  if(inter.type==='product_list'){
    const sections=inter.action?.sections||[];
    const rows=sections.flatMap(x=>x.product_items||[]);
    return sections.length>=1&&sections.length<=10&&rows.length>=1&&rows.length<=30&&rows.every(x=>x.product_retailer_id)&&sections.every(x=>x.title.length<=24);
  }
  return false;
}
