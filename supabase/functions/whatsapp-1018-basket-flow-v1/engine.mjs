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
export async function flowExchange(payload,deps){
 const action=String(payload?.action||'');
 if(action==='ping')return {data:{status:'active'}};
 if(action==='INIT'){
  const shell=await deps.shell();
  const active=(shell?.baskets||[]).filter(x=>SIZE_KEYS.includes(x.size_key)&&isId(x.id)).map(x=>({id:x.size_key,title:SIZE_LABELS[x.size_key],description:'Ver três combinações e valores'}));
  if(active.length!==5)throw Error('five_sizes_unavailable');
  return {screen:'TAMANHO',data:{tamanhos:active}};
 }
 if(action!=='data_exchange')throw Error('unsupported_flow_action');
 const form=payload?.data||{},stage=String(form.etapa||'');
 if(stage==='tamanho'&&payload.screen==='TAMANHO'){
  const size=text(form.tamanho,20),shell=await deps.shell(),model=chooseModel(shell,size);
  const results=await Promise.allSettled([1,2,3].map(n=>deps.basket(model.id,n)));
  const details=results.map(x=>x.status==='fulfilled'?x.value:null);
  return {screen:'COMBINACAO',data:{tamanho:size,opcoes:pricesResponse(shell,details),resumoMarcas:combinationBrandsResponse(details,model.id)}};
 }
 if(stage==='combinacao'&&payload.screen==='COMBINACAO'){
  const size=text(form.tamanho,20),n=assertChoice(form.combinacao),shell=await deps.shell(),model=chooseModel(shell,size);
  const detail=assertBasket(await deps.basket(model.id,n),model.id,n);
  if(detail.items.some(x=>x.quantity>10))throw Error('initial_quantity_above_control_range');
  const state={size,number:n,basketId:model.id,issuedAt:Date.now(),items:detail.items};
  return await catalogResponse(await refreshQuote(state,deps),deps,0);
 }
 if(stage==='pagina_itens'&&payload.screen===ITEM_SCREENS[0]){
  const state=await deps.verifyState(String(form.estado||''));
  if(state.items.length<=PAGE_SIZE||String(form.pagina)!=='2')throw Error('invalid_catalog_page');
  return await catalogResponse(state,deps,1);
 }
 if(stage==='revisar'&&ITEM_SCREENS.includes(payload.screen)){
  const state=await deps.verifyState(String(form.estado||''));
  if(!ITEM_SCREENS.includes(payload.screen))throw Error('invalid_catalog_page');
  return await summaryResponse(state,deps);
 }
 if(stage==='editar_item'&&ITEM_SCREENS.includes(payload.screen)){
  const state=await deps.verifyState(String(form.estado||'')),positionId=String(form.position_id||'');
  const index=state.items.findIndex(x=>x.position_id===positionId),expected=expectedListScreen(index);
  if(index<0||payload.screen!==expected||String(form.return_screen||'')!==expected||String(form.pagina||'')!==String(expected===ITEM_SCREENS[0]?1:2))throw Error('flow_page_mismatch');
  return await detailResponse(state,deps,positionId,expected);
 }
 if(stage==='salvar_item'&&payload.screen===ITEM_EDIT_SCREEN){
  const state=await deps.verifyState(String(form.estado||''));
  const positionId=String(form.position_id||''),productId=String(form.produto||''),index=state.items.findIndex(x=>x.position_id===positionId);
  if(index<0||positionId!==state.editingPositionId)throw Error('flow_item_mismatch');
  const returnScreen=expectedListScreen(index);
  if(state.returnScreen!==returnScreen||String(form.return_screen||'')!==returnScreen)throw Error('flow_page_mismatch');
  let quantity;
  try{quantity=parseQty(form.quantidade)}catch{return await detailResponse(state,deps,positionId,returnScreen,'Informe uma quantidade de 0 a 10.',form.quantidade,productId||state.items[index].product_id)}
  if(!isId(productId))return await detailResponse(state,deps,positionId,returnScreen,'Escolha uma marca ou produto válido.',quantity,state.items[index].product_id);
  const selected=state.items[index],options=await deps.options(state.basketId,state.number,[{
   position_id:positionId,selected_product_id:selected.product_id,quantity:1
  }]);
  const alternatives=(options?.positions||[]).find(x=>String(x.position_id)===positionId)?.alternatives||[];
  const choice=alternatives.find(x=>String(x.product_id)===productId);
  if(!choice&&!(quantity===0&&productId===selected.product_id))return await detailResponse(state,deps,positionId,returnScreen,'Essa opção não está disponível. Escolha outra marca.',quantity,selected.product_id);
  const stock=Number(choice?.stock_quantity??selected.stock_quantity??0);
  if(quantity>stock)return await detailResponse(state,deps,positionId,returnScreen,`Só há ${stock} unidade(s) disponíveis. Reduza a quantidade ou escolha outra marca.`,quantity,productId);
  const price=Number(choice?.price_cents??selected.price_cents);
  if(!Number.isSafeInteger(price)||price<0)throw Error('basket_item_price_invalid');
  const changed={...state,items:state.items.map((x,i)=>i===index?{
   ...x,product_id:productId,name:text(choice?.name||selected.name,140),
   brand:text(choice?.brand||selected.brand,48),packaging:text(choice?.packaging||selected.packaging,80),
   image_url:imageUrl(choice?.image_url||selected.image_url),price_cents:price,stock_quantity:stock,quantity
  }:x)};
  const quoted=await refreshQuote(changed,deps);
  return await catalogResponse(quoted,deps,index<PAGE_SIZE?0:1);
 }
 throw Error('invalid_flow_transition');
}
