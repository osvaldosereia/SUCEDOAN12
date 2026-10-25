// DRAFT-only state machine. It reads current basket data and returns a quote; it does
// not create orders or send WhatsApp messages.
export const SIZE_KEYS=['mini','economica','pequena','media','grande'];
export const SIZE_LABELS={mini:'Mini',economica:'Econômica',pequena:'Pequena',media:'Média',grande:'Grande'};
export const PAGE_SIZE=14;
export const MAX_ITEMS=30;
export const ITEM_SCREENS=['ITENS_UM','ITENS_DOIS'];
export const ITEM_EDIT_SCREEN='ITEM_EDIT';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(v,max=120)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c)/100);
const isId=v=>UUID.test(String(v||''));
const imageData=(value)=>{
 const s=String(value??'');
 return s.length>0&&s.length<=40000&&/^[A-Za-z0-9+/]+={0,2}$/.test(s)?s:'';
};
const imageUrl=value=>{
 const s=text(value,800);
 return /^https:\/\//i.test(s)?s:'';
};
const selectItems=list=>list.map(x=>({position_id:x.position_id,product_id:x.product_id,quantity:Number(x.quantity)}));

export function assertBasket(detail,expectedId,expectedNumber){
 const b=detail?.basket,items=detail?.items;
 if(!detail?.ok||!b||b.id!==expectedId||Number(b.composition_number)!==expectedNumber||!Array.isArray(items)||!items.length||items.length>MAX_ITEMS)throw Error('basket_invalid_or_too_large');
 const price=Number(b.display_price_cents),stock=Number(b.stock_quantity);
 if(!Number.isSafeInteger(price)||price<0||!Number.isFinite(stock)||stock<1)throw Error('basket_unavailable');
 for(const item of items){
  const itemPrice=Number(item.price_cents??0);
  if(!isId(item.position_id)||!isId(item.product_id)||!Number.isInteger(Number(item.quantity))||Number(item.quantity)<0||!text(item.name)||!Number.isSafeInteger(itemPrice)||itemPrice<0)throw Error('basket_item_invalid');
 }
 return {basket:b,items:items.map(x=>({
  position_id:String(x.position_id),product_id:String(x.product_id),quantity:Number(x.quantity),
  name:text(x.name,140),brand:text(x.brand,48),packaging:text(x.packaging,80),
  image_url:imageUrl(x.image_url),price_cents:Number(x.price_cents??0),stock_quantity:Math.max(0,Number(x.stock_quantity||0))
 }))};
}
function chooseModel(shell,size){
 if(!SIZE_KEYS.includes(size))throw Error('invalid_size');
 const b=(shell?.baskets||[]).find(x=>x.size_key===size&&isId(x.id));
 if(!b)throw Error('basket_size_not_found');
 return b;
}
function assertChoice(num){const n=Number(num);if(!Number.isInteger(n)||n<1||n>3)throw Error('invalid_composition');return n;}
export function parseQty(input){
 const val=String(input??'');
 if(!/^(10|[0-9])$/.test(val))throw Error('invalid_quantity');
 return Number(val);
}
export function pricesResponse(shell,details){
 const rows=[];
 for(let n=1;n<=3;n++){
  const b=details[n-1]?.basket,available=details[n-1]?.ok===true&&Number(b?.stock_quantity)>0&&Number.isSafeInteger(Number(b?.display_price_cents));
  rows.push({id:String(n),title:'Combinação '+n,description:available?money(Number(b.display_price_cents)):'Indisponível',enabled:available});
 }
 if(!rows.some(x=>x.enabled))throw Error('no_available_combinations');
 return rows;
}
function combinationBrandsResponse(details,basketId){
 return details.map((detail,index)=>{
  const n=index+1;
  try{
   const {items}=assertBasket(detail,basketId,n),brands=[...new Set(items.map(item=>item.brand).filter(Boolean))];
   if(!brands.length)return `Combinação ${n}: marcas não cadastradas`;
   const shown=[];
   for(const brand of brands){
    const candidate=`Combinação ${n}: ${[...shown,brand].join(', ')}`;
    if(candidate.length>240){shown.push(`${brands.length-shown.length} outras`);break;}
    shown.push(brand);
   }
   return `Combinação ${n}: ${shown.join(', ')}`;
  }catch{return `Combinação ${n}: indisponível`;}
 }).join('\n');
}
function expectedListScreen(index){return index<PAGE_SIZE?ITEM_SCREENS[0]:ITEM_SCREENS[1];}
function quoteItems(result,state){
 const amount=Number(result?.total_cents),priced=result?.items;
 if(result?.ok!==true||!Number.isSafeInteger(amount)||amount<0||!Array.isArray(priced)||priced.length!==state.items.length||Number(result?.basket?.stock_quantity)<1)throw Error('basket_quote_unavailable');
 const byPosition=new Map(priced.map(row=>[String(row.position_id),row]));
 const items=state.items.map(item=>{
  const row=byPosition.get(item.position_id);
  if(!row||String(row.product_id)!==item.product_id)throw Error('basket_quote_mismatch');
  const price=Number(row.price_cents??item.price_cents),stock=Number(row.stock_quantity??item.stock_quantity);
  if(!Number.isSafeInteger(price)||price<0||!Number.isFinite(stock)||stock<0)throw Error('basket_quote_invalid');
  return {...item,name:text(row.name||item.name,140),brand:text(row.brand||item.brand,48),packaging:text(row.packaging||item.packaging,80),image_url:imageUrl(row.image_url||item.image_url),price_cents:price,stock_quantity:stock,quantity:item.quantity};
 });
 return {...state,totalCents:amount,items,quotedAt:Date.now()};
}
async function refreshQuote(state,deps){
 const result=await deps.quote(state.basketId,state.number,selectItems(state.items));
 return quoteItems(result,state);
}
async function getImage(deps,url){
 if(!url||typeof deps.image!=='function')return '';
 try{return imageData(await deps.image(url));}catch{return '';}
}
function itemLine(item){
 const qty=Number(item.quantity),name=text(item.name,64),brand=text(item.brand,28);
 const normalizedName=name.toLocaleLowerCase('pt-BR'),normalizedBrand=brand.toLocaleLowerCase('pt-BR');
 let identity=brand&&!normalizedName.includes(normalizedBrand)?`${name} · ${brand}`:name;
 if(identity.length>70)identity=identity.slice(0,69).trimEnd()+'…';
 return `${qty}x ${identity}`;
}
function summaryItems(state){
 const included=state.items.filter(x=>Number(x.quantity)>0);
 const lines=included.map(itemLine);
 const itemTotal=included.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.price_cents),0);
 const adjustment=Number(state.totalCents)-itemTotal;
 if(adjustment!==0)lines.push(`Ajuste da cesta: ${money(adjustment)}`);
 const output=lines.join('\n')||'Nenhum produto incluído';
 if(output.length>2500)throw Error('basket_summary_too_long');
 return output;
}
async function summaryResponse(state,deps){
 const priced=await refreshQuote(state,deps);
 return {screen:'RESUMO',data:{
  resumo:`Cesta ${SIZE_LABELS[priced.size]} · Combinação ${priced.number}`,
  valor:money(priced.totalCents),
  itens:summaryItems(priced),
  estado:await deps.signState(priced)
 }};
}
function actionRow(id,title,description,metadata,token,etapa,pagina=''){
 return {
  id,
  'main-content':{title,description,metadata},
  'on-click-action':{name:'data_exchange',payload:{etapa,estado:token,position_id:'',return_screen:'',pagina}}
 };
}
async function catalogResponse(state,deps,pageIndex=0){
 const screen=ITEM_SCREENS[pageIndex],start=pageIndex*PAGE_SIZE,portion=state.items.slice(start,start+PAGE_SIZE);
 if(!screen||!portion.length)throw Error('invalid_catalog_page');
 const token=await deps.signState(state);
 const rows=await Promise.all(portion.map(async(item,index)=>{
  const image=await getImage(deps,item.image_url);
  const title=text(item.name,30)||'Produto cadastrado';
  const description=text(item.brand?('Marca '+item.brand):item.packaging,20)||'Produto da cesta';
  const metadata=Number(item.quantity)===0?'Retirado':`${item.quantity} un. · ${money(item.price_cents)} cada · ${money(Number(item.quantity)*Number(item.price_cents))}`;
  const row={
   id:item.position_id,
   'main-content':{title,description,metadata:text(metadata,80)},
   'on-click-action':{name:'data_exchange',payload:{
    etapa:'editar_item',estado:token,position_id:item.position_id,return_screen:screen,pagina:String(pageIndex+1)
   }}
  };
  if(image)row.start={image, 'alt-text':text(item.name,100)||'Foto do produto'};
  return row;
 }));
 if(pageIndex===0&&state.items.length>PAGE_SIZE)rows.push(actionRow('__mais_itens','Ver mais produtos','Continuar cesta',`Itens ${PAGE_SIZE+1} a ${state.items.length}`,token,'pagina_itens','2'));
 rows.push(actionRow('__revisar','Revisar cesta','Conferir produtos',`Total: ${money(state.totalCents)}`,token,'revisar',''));
 return {screen,data:{
  estado:token,
  lista_titulo:`Cesta ${SIZE_LABELS[state.size]} · Combinação ${state.number}`,
  lista_descricao:`${state.items.length} produtos · Total atualizado ${money(state.totalCents)}`,
  itens_lista:rows
 }};
}
async function detailResponse(state,deps,positionId,returnScreen,notice='',quantityValue=null,productValue=null){
 const index=state.items.findIndex(x=>x.position_id===positionId);
 if(index<0)throw Error('basket_position_not_found');
 const expected=expectedListScreen(index);
 if(returnScreen!==expected)throw Error('basket_return_screen_invalid');
 const item=state.items[index],res=await deps.options(state.basketId,state.number,[{
  position_id:item.position_id,selected_product_id:item.product_id,quantity:1
 }]);
 const raw=(res?.positions||[]).find(x=>String(x.position_id)===item.position_id)?.alternatives||[];
 const unique=new Map();
 for(const x of raw){
  if(!isId(x.product_id)||Number(x.stock_quantity)<1)continue;
  const price=Number(x.price_cents);
  if(!Number.isSafeInteger(price)||price<0)continue;
  unique.set(String(x.product_id),{
   id:String(x.product_id),name:text(x.name,140),brand:text(x.brand,48),packaging:text(x.packaging,80),
   image_url:imageUrl(x.image_url),price_cents:price,stock_quantity:Number(x.stock_quantity)
  });
 }
 if(Number(item.quantity)===0&&!unique.has(item.product_id)){
  unique.set(item.product_id,{id:item.product_id,name:item.name,brand:item.brand,packaging:item.packaging,image_url:item.image_url,price_cents:item.price_cents,stock_quantity:item.stock_quantity});
 }
 if(!unique.size)throw Error('basket_brand_unavailable');
 let alternatives=await Promise.all([...unique.values()].slice(0,10).map(async choice=>{
  const image=await getImage(deps,choice.image_url);
  const row={
   id:choice.id,title:text(choice.name,30)||'Produto cadastrado',
   description:text([choice.brand,choice.packaging,money(choice.price_cents),`Estoque ${choice.stock_quantity}`].filter(Boolean).join(' · '),300),
   enabled:choice.stock_quantity>0
  };
  if(image){row.image=image;row['alt-text']=text(choice.name,100)||'Foto do produto';}
  return row;
 }));
 const selected=productValue||item.product_id;
 if(!unique.has(selected)&&Number(item.quantity)>0)throw Error('basket_selected_brand_unavailable');
 if(!alternatives.some(x=>x.id===selected)){
  const current=unique.get(selected);
  if(current){
   const row={id:current.id,title:text(current.name,30),description:text([current.brand,current.packaging,money(current.price_cents),`Estoque ${current.stock_quantity}`].filter(Boolean).join(' · '),300),enabled:current.stock_quantity>0};
   const image=await getImage(deps,current.image_url);if(image){row.image=image;row['alt-text']=text(current.name,100)||'Foto do produto';}
   alternatives=[row,...alternatives].slice(0,10);
  }
 }
 const choice=unique.get(selected)||item;
 const quantity=quantityValue==null?String(Math.min(10,Number(item.quantity))):String(quantityValue);
 const selectedImage=await getImage(deps,choice.image_url);
 const editState={...state,editingPositionId:positionId,returnScreen:expected};
 return {screen:ITEM_EDIT_SCREEN,data:{
  estado:await deps.signState(editState),position_id:positionId,return_screen:expected,
  titulo:`Produto ${index+1} de ${state.items.length}`,nome:text(choice.name,300),
  imagem:selectedImage,tem_imagem:Boolean(selectedImage),
  produto:selected,quantidade:quantity,alternativas:alternatives,
  preco:money(choice.price_cents),estoque:String(choice.stock_quantity),
  preco_estoque:`Preço atual ${money(choice.price_cents)} cada · Estoque ${choice.stock_quantity} un.`,
  aviso:text(notice,180),tem_aviso:Boolean(notice)
 }};
}
const TYPE_SCREEN='TIPO_PRODUTO';
const OPTION_SCREEN='OPCAO_EDIT';
const OPTION_PAGE_SIZE=12;
function assertFlowConfiguration(config,basketId,compositionNumber){
 const basket=config?.basket,positions=config?.positions,types=config?.product_types;
 if(config?.ok!==true||!basket||String(basket.id)!==String(basketId)||Number(basket.composition_number)!==compositionNumber||!Array.isArray(positions)||!positions.length||positions.length>MAX_ITEMS||!Array.isArray(types))throw Error('basket_flow_configuration_invalid');
 for(const position of positions){
  if(!isId(position.position_id)||!Number.isInteger(Number(position.base_quantity))||Number(position.base_quantity)<0||!position.base||!isId(position.base.product_id)||!Number.isSafeInteger(Number(position.base.price_cents)))throw Error('basket_flow_position_invalid');
  if(position.editable&&(!isId(position.type_id)||!Array.isArray(position.options)||!position.options.length))throw Error('basket_flow_position_invalid');
 }
 return config;
}
function flowGroups(config){
 const byId=new Map((config.product_types||[]).map(type=>[String(type.id),type])),grouped=new Map();
 for(const position of config.positions||[]){
  if(position.editable!==true)continue;
  const type=byId.get(String(position.type_id));if(!type||type.flow_enabled!==true)continue;
  const group=grouped.get(String(type.id))||{type,positions:[]};group.positions.push(position);grouped.set(String(type.id),group);
 }
 return [...grouped.values()].sort((a,b)=>Number(a.type.flow_sort_order||0)-Number(b.type.flow_sort_order||0)||String(a.type.name).localeCompare(String(b.type.name),'pt-BR'));
}
function selectionsForPosition(state,positionId){
 return (state.selections||[]).find(x=>String(x.position_id)===String(positionId))?.selections||[];
}
function quantityFor(state,positionId,productId){
 const row=selectionsForPosition(state,positionId).find(x=>String(x.product_id)===String(productId));
 return Math.max(0,Number(row?.quantity||0));
}
async function quoteFlowState(state,deps){
 const result=await deps.flowQuote(state.basketId,state.number,state.selections||[]);
 if(result?.ok!==true||!Number.isSafeInteger(Number(result.total_cents))||!Array.isArray(result.items))throw Error(result?.error||'basket_flow_quote_unavailable');
 return result;
}
function flowActionRow(id,title,description,metadata,token,etapa,fields={}){
 return {
  id,
  'main-content':{title,description,metadata},
  'on-click-action':{name:'data_exchange',payload:{etapa,estado:token,...fields}}
 };
}
function flowSummaryItems(quote){
 const lines=[];let used=0;
 for(const item of quote.items||[]){
  const qty=Number(item.quantity||0);if(qty<=0)continue;
  const name=text(item.name,44),brand=text(item.brand,22),identity=brand&&!name.toLocaleLowerCase('pt-BR').includes(brand.toLocaleLowerCase('pt-BR'))?name+' · '+brand:name;
  const line=qty+'x '+identity+' — '+money(Number(item.price_cents||0))+' cada ('+money(qty*Number(item.price_cents||0))+')';
  if(used+line.length+1>2200)break;
  lines.push(line);used+=line.length+1;
 }
 const itemTotal=(quote.items||[]).reduce((sum,item)=>sum+Number(item.quantity||0)*Number(item.price_cents||0),0);
 const adjustment=Number(quote.total_cents)-itemTotal;
 if(adjustment!==0&&used+50<2450)lines.push('Ajuste da cesta: '+money(adjustment));
 const included=(quote.items||[]).filter(x=>Number(x.quantity)>0).length;
 if(lines.length<included)lines.push('E mais '+(included-lines.length)+' item(ns) da cesta.');
 return lines.join('\n')||'Nenhum produto selecionado';
}
async function summaryFlowResponse(state,deps){
 const quote=await quoteFlowState(state,deps);
 const summary='Cesta '+SIZE_LABELS[state.size]+' · combinação inicial '+state.number;
 return {screen:'RESUMO',data:{resumo:summary,valor:money(quote.total_cents),itens:flowSummaryItems(quote),estado:await deps.signState(state)}};
}
async function typeStepResponse(state,deps,notice=''){
 const config=assertFlowConfiguration(await deps.configuration(state.basketId,state.number),state.basketId,state.number);
 const groups=flowGroups(config);
 if(!groups.length)return await summaryFlowResponse(state,deps);
 const stepIndex=Math.max(0,Math.min(Number(state.stepIndex||0),groups.length-1)),group=groups[stepIndex];
 const allRows=[];
 for(const position of group.positions){
  const options=(position.options||[]).filter(option=>isId(option.product_id)&&Number(option.stock_quantity)>0&&Number.isSafeInteger(Number(option.price_cents)));
  for(const option of options)allRows.push({position,option,quantity:quantityFor(state,position.position_id,option.product_id)});
 }
 const pageCount=Math.max(1,Math.ceil(allRows.length/OPTION_PAGE_SIZE));
 const pageIndex=Math.max(0,Math.min(Number(state.optionPage||0),pageCount-1)),portion=allRows.slice(pageIndex*OPTION_PAGE_SIZE,(pageIndex+1)*OPTION_PAGE_SIZE);
 const token=await deps.signState({...state,stepIndex,optionPage:pageIndex});
 const rows=await Promise.all(portion.map(async(row,index)=>{
  const {position,option,quantity}=row,image=await getImage(deps,option.image_url);
  const description=[position.label,option.brand,option.packaging].filter(Boolean).join(' · ');
  const metadata=quantity>0?quantity+' un. · '+money(option.price_cents)+' cada · '+money(quantity*Number(option.price_cents)):'Não selecionado · '+money(option.price_cents)+' cada';
  const item={
   id:'o'+String(pageIndex*OPTION_PAGE_SIZE+index+1),
   'main-content':{title:text(option.name,30),description:text(description,60)||'Produto disponível',metadata:text(metadata,80)},
   'on-click-action':{name:'data_exchange',payload:{etapa:'editar_opcao',estado:token,position_id:position.position_id,product_id:option.product_id}}
  };
  if(image)item.start={image,'alt-text':text(option.name,100)||'Foto do produto'};
  return item;
 }));
 const quote=await quoteFlowState(state,deps);
 const actions=[];
 if(pageIndex>0)actions.push(flowActionRow('__opcoes_anteriores','Opções anteriores','Voltar na lista',String(pageIndex*OPTION_PAGE_SIZE)+' anteriores',token,'pagina_opcoes',{pagina:String(pageIndex-1)}));
 if(pageIndex<pageCount-1)actions.push(flowActionRow('__mais_opcoes','Ver mais opções','Continuar neste produto',String(allRows.length-(pageIndex+1)*OPTION_PAGE_SIZE)+' opções restantes',token,'pagina_opcoes',{pagina:String(pageIndex+1)}));
 if(stepIndex>0)actions.push(flowActionRow('__tipo_anterior','Produto anterior','Voltar à etapa anterior',groups[stepIndex-1].type.name,token,'navegar_tipo',{indice:String(stepIndex-1)}));
 if(stepIndex<groups.length-1)actions.push(flowActionRow('__tipo_proximo','Próximo produto','Continuar a cesta',groups[stepIndex+1].type.name,token,'navegar_tipo',{indice:String(stepIndex+1)}));
 else actions.push(flowActionRow('__revisar','Revisar cesta','Conferir produtos e valores','Total: '+money(quote.total_cents),token,'revisar'));
 if(rows.length+actions.length>20)throw Error('basket_flow_list_limit');
 return {screen:TYPE_SCREEN,data:{
  estado:token,
  tipo_nome:text(group.type.name,80),
  etapa_texto:'Etapa '+(stepIndex+1)+' de '+groups.length+' · '+(group.type.selection_mode==='multiple'?'Você pode escolher mais de uma opção e definir cada quantidade.':'Escolha uma opção por posição.'),
  lista_titulo:'Escolha '+text(group.type.name,80),
  lista_descricao:allRows.length+' opção(ões) disponíveis · Total atualizado '+money(quote.total_cents)+(pageCount>1?' · Página '+(pageIndex+1)+' de '+pageCount:''),
  aviso:text(notice,180),tem_aviso:Boolean(notice),
  itens_lista:[...rows,...actions]
 }};
}
async function optionEditResponse(state,deps,positionId,productId,notice='',quantityValue=null){
 const config=assertFlowConfiguration(await deps.configuration(state.basketId,state.number),state.basketId,state.number);
 const position=config.positions.find(x=>String(x.position_id)===String(positionId));
 if(!position||position.editable!==true||!String(position.type_id))throw Error('basket_flow_position_not_editable');
 const option=(position.options||[]).find(x=>String(x.product_id)===String(productId));
 if(!option)throw Error('basket_flow_option_unavailable');
 const image=await getImage(deps,option.image_url),quantity=quantityValue==null?String(quantityFor(state,positionId,productId)):String(quantityValue);
 const editState={...state,editingPositionId:String(positionId),editingProductId:String(productId)};
 return {screen:OPTION_SCREEN,data:{
  estado:await deps.signState(editState),position_id:String(positionId),product_id:String(productId),
  titulo:text(position.type_name,120),nome:text(option.name,300),imagem:image,tem_imagem:Boolean(image),
  quantidade:quantity,preco:money(option.price_cents),preco_estoque:money(option.price_cents)+' cada · Estoque '+option.stock_quantity+' un.',
  estoque:String(option.stock_quantity),max_quantidade:String(Math.min(Number(position.max_quantity||10),Number(option.stock_quantity))),
  aviso:text(notice,180),tem_aviso:Boolean(notice)
 }};
}
async function setOptionQuantity(state,deps,positionId,productId,quantity){
 const config=assertFlowConfiguration(await deps.configuration(state.basketId,state.number),state.basketId,state.number);
 const position=config.positions.find(x=>String(x.position_id)===String(positionId));
 if(!position||position.editable!==true)throw Error('basket_flow_position_not_editable');
 const type=config.product_types.find(x=>String(x.id)===String(position.type_id));
 const option=(position.options||[]).find(x=>String(x.product_id)===String(productId));
 if(!option||quantity>Math.min(Number(position.max_quantity||10),Number(option.stock_quantity)))throw Error('basket_flow_option_unavailable');
 const existing=selectionsForPosition(state,positionId).filter(x=>String(x.product_id)!==String(productId));
 const next=quantity>0?[...existing,{product_id:String(productId),quantity}]:existing;
 if(type?.selection_mode==='single'&&quantity>0){
  const otherSelected=next.filter(x=>Number(x.quantity)>0);
  if(otherSelected.length)state.selections=(state.selections||[]).filter(x=>String(x.position_id)!==String(positionId));
  else state.selections=(state.selections||[]).filter(x=>String(x.position_id)!==String(positionId));
  state.selections=[...(state.selections||[]),{position_id:String(positionId),selections:[{product_id:String(productId),quantity}]}];
 }else{
  state.selections=(state.selections||[]).filter(x=>String(x.position_id)!==String(positionId));
  state.selections=[...(state.selections||[]),{position_id:String(positionId),selections:next}];
 }
 delete state.editingPositionId;delete state.editingProductId;
 return state;
}
export async function flowExchange(payload,deps){
 const action=String(payload?.action||'');
 if(action==='ping')return {data:{status:'active'}};
 if(action==='INIT'){
  const shell=await deps.shell();
  const sizes=(shell?.baskets||[]).filter(x=>SIZE_KEYS.includes(x.size_key)&&isId(x.id)&&Number.isSafeInteger(Number(x.starting_price_cents))&&Number(x.starting_composition_number)>0).map(x=>({
   id:x.size_key,title:SIZE_LABELS[x.size_key],
   description:'A partir de '+money(x.starting_price_cents)+' · combinação '+Number(x.starting_composition_number)
  }));
  if(!sizes.length)throw Error('no_flow_sizes_available');
  return {screen:'TAMANHO',data:{tamanhos:sizes}};
 }
 if(action!=='data_exchange')throw Error('unsupported_flow_action');
 const form=payload?.data||{},stage=String(form.etapa||'');
 if(stage==='tamanho'&&payload.screen==='TAMANHO'){
  const size=text(form.tamanho,20),shell=await deps.shell(),model=chooseModel(shell,size),number=assertChoice(model.starting_composition_number);
  const config=assertFlowConfiguration(await deps.configuration(model.id,number),model.id,number);
  const selections=config.positions.filter(x=>x.editable===true).map(x=>({position_id:x.position_id,selections:[{product_id:x.base.product_id,quantity:x.base_quantity}]}));
  const state={size,number,basketId:model.id,issuedAt:Date.now(),stepIndex:0,optionPage:0,selections};
  await quoteFlowState(state,deps);
  return await typeStepResponse(state,deps);
 }
 if(stage==='editar_opcao'&&payload.screen===TYPE_SCREEN){
  const state=await deps.verifyState(String(form.estado||'')),positionId=String(form.position_id||''),productId=String(form.product_id||'');
  return await optionEditResponse(state,deps,positionId,productId);
 }
 if(stage==='salvar_opcao'&&payload.screen===OPTION_SCREEN){
  const state=await deps.verifyState(String(form.estado||'')),positionId=String(form.position_id||''),productId=String(form.product_id||'');
  if(positionId!==String(state.editingPositionId)||productId!==String(state.editingProductId))throw Error('basket_flow_edit_mismatch');
  let quantity;try{quantity=parseQty(form.quantidade)}catch{return await optionEditResponse(state,deps,positionId,productId,'Informe uma quantidade de 0 a 10.',form.quantidade)}
  try{
   const changed=await setOptionQuantity(state,deps,positionId,productId,quantity);
   await quoteFlowState(changed,deps);
   return await typeStepResponse(changed,deps);
  }catch(error){return await optionEditResponse(state,deps,positionId,productId,'Estoque ou opção atualizados. Revise a quantidade.',quantity)}
 }
 if(stage==='pagina_opcoes'&&payload.screen===TYPE_SCREEN){
  const state=await deps.verifyState(String(form.estado||'')),page=Number(form.pagina);
  if(!Number.isInteger(page)||page<0)throw Error('invalid_option_page');
  return await typeStepResponse({...state,optionPage:page},deps);
 }
 if(stage==='navegar_tipo'&&payload.screen===TYPE_SCREEN){
  const state=await deps.verifyState(String(form.estado||'')),index=Number(form.indice);
  if(!Number.isInteger(index)||index<0)throw Error('invalid_type_step');
  return await typeStepResponse({...state,stepIndex:index,optionPage:0},deps);
 }
 if(stage==='revisar'&&payload.screen===TYPE_SCREEN){
  const state=await deps.verifyState(String(form.estado||''));
  return await summaryFlowResponse(state,deps);
 }
 throw Error('invalid_flow_transition');
}

