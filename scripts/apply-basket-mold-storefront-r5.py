from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor_missing:{label}')
    if text.count(old) != 1:
        raise SystemExit(f'anchor_not_unique:{label}:{text.count(old)}')
    return text.replace(old, new, 1)


def patch_storefront(path: Path):
    s = path.read_text(encoding='utf-8')
    if 'R5_MOLD_STOREFRONT_V1' in s:
        return

    helper = r'''// R5_MOLD_STOREFRONT_V1
async function moldAvailableStockMap(productIds:string[]){
  const ids=[...new Set(productIds.filter(Boolean))];const out=new Map<string,number>();if(!ids.length)return out;
  const [sq,oq,lq]=await Promise.all([
    db.from("ops2_sellable_stock_v1").select("product_id,effective_sellable_stock,is_active").in("product_id",ids),
    db.from("vitrine_stock_reservations").select("product_id,quantity,status,expires_at").in("product_id",ids).in("status",["reserved","allocated"]),
    db.from("basket_lot_component_reservations").select("product_id,quantity_reserved,status").in("product_id",ids).in("status",["reserved","active"])
  ]);if(sq.error)throw sq.error;if(oq.error)throw oq.error;if(lq.error)throw lq.error;
  const reservedOrders=new Map<string,number>(),reservedLots=new Map<string,number>(),now=Date.now();
  for(const r of oq.data||[]){if(r.expires_at&&new Date(r.expires_at).getTime()<=now)continue;const id=String(r.product_id);reservedOrders.set(id,(reservedOrders.get(id)||0)+Number(r.quantity||0))}
  for(const r of lq.data||[]){const id=String(r.product_id);reservedLots.set(id,(reservedLots.get(id)||0)+Number(r.quantity_reserved||0))}
  for(const r of sq.data||[]){const id=String(r.product_id);out.set(id,Math.max(0,Number(r.effective_sellable_stock||0)-(reservedOrders.get(id)||0)-(reservedLots.get(id)||0)))}
  return out;
}
function moldEffectivePriceCents(p:any){const n=p?.is_offer===true&&p?.offer_price!=null&&Number(p.offer_price)>=0?Number(p.offer_price):Number(p?.price||0);return cents(n)}
async function moldProductsMap(ids:string[]){const clean=[...new Set(ids.filter(Boolean))],out=new Map<string,any>();if(!clean.length)return out;const q=await db.from("products").select("id,name,sku,gtin,image_url,packaging,price,offer_price,is_offer,is_active").in("id",clean);if(q.error)throw q.error;for(const p of q.data||[])out.set(String(p.id),p);return out}
async function moldHomeCards(){
  const mq=await db.from("basket_molds").select("id,basket_id,hidden_adjustment,public_composition_count");if(mq.error)throw mq.error;const molds=mq.data||[];if(!molds.length)return [];
  const basketIds=molds.map((m:any)=>String(m.basket_id)),moldIds=molds.map((m:any)=>String(m.id));
  const [bq,pq]=await Promise.all([
    db.from("basket_templates").select("id,name,image_url,is_active,category_id").in("id",basketIds),
    db.from("basket_mold_positions").select("id,mold_id").in("mold_id",moldIds)
  ]);if(bq.error)throw bq.error;if(pq.error)throw pq.error;
  const baskets=new Map((bq.data||[]).map((b:any)=>[String(b.id),b])),positionCounts=new Map<string,number>();for(const p of pq.data||[]){const id=String(p.mold_id);positionCounts.set(id,(positionCounts.get(id)||0)+1)}
  const categoryIds=[...new Set((bq.data||[]).map((b:any)=>b.category_id?String(b.category_id):"").filter(Boolean))],categoryMap=new Map<string,any>();if(categoryIds.length){const cq=await db.from("basket_categories").select("id,name,slug,sort_order,is_active").in("id",categoryIds);if(cq.error)throw cq.error;for(const c of cq.data||[])categoryMap.set(String(c.id),c)}
  const generated=await Promise.all(molds.map(async(m:any)=>{const q=await db.rpc("basket_mold_public_compositions_v2",{p_basket_id:m.basket_id});if(q.error)throw q.error;return {m,data:q.data||{}}}));
  const productIds:string[]=[];for(const g of generated)for(const c of g.data?.compositions||[])for(const i of c.items||[])if(i.product_id)productIds.push(String(i.product_id));const products=await moldProductsMap(productIds);
  const cards:any[]=[];
  for(const {m,data} of generated){const b=baskets.get(String(m.basket_id));if(!b||b.is_active!==true)continue;const cat=b.category_id?categoryMap.get(String(b.category_id)):null;if(cat&&cat.is_active===false)continue;const expected=positionCounts.get(String(m.id))||0;if(!expected)continue;
    for(const c of data.compositions||[]){const items=Array.isArray(c.items)?c.items:[];if(items.length!==expected)continue;let productTotal=0,capacity=30;const carousel:any[]=[];let valid=true;
      for(const i of items){const p=products.get(String(i.product_id));if(!p||p.is_active!==true){valid=false;break}const qty=Number(i.quantity||0),price=moldEffectivePriceCents(p);if(!(qty>0)){valid=false;break}productTotal+=Math.round(price*qty);capacity=Math.min(capacity,Math.max(0,Math.floor(Number(i.coverage_baskets||0))));carousel.push({position_id:i.position_id,label:i.label,product_id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,image_url:p.image_url||i.image_url||"",packaging:p.packaging||"",quantity:qty,stock_quantity:Number(i.available_stock||0),price_cents:price})}
      if(!valid||capacity<1)continue;const total=Math.max(0,productTotal+cents(data.hidden_adjustment||0)),n=Number(c.number||1),multi=Number(data.public_composition_count||1)>1;
      cards.push({id:String(b.id),card_key:String(b.id)+"@"+n,mold_mode:true,mold_id:String(m.id),composition_number:n,public_composition_count:Number(data.public_composition_count||1),name:multi?String(b.name)+" · Opção "+n:String(b.name),model_name:String(b.name),display_price_cents:total,hidden_adjustment_cents:cents(data.hidden_adjustment||0),image_url:b.image_url||"",stock_quantity:capacity,category_name:cat?.name||null,category_slug:cat?.slug||null,category_sort_order:Number(cat?.sort_order||0),carousel_items:carousel})
    }
  }
  cards.sort((a,b)=>a.category_sort_order-b.category_sort_order||a.model_name.localeCompare(b.model_name,'pt-BR')||a.composition_number-b.composition_number);return cards;
}
async function moldDetail(basketId:string,compositionNumber:number,selections:any[]|null=null){
  const [mq,bq,pq]=await Promise.all([
    db.from("basket_molds").select("id,basket_id,hidden_adjustment,public_composition_count").eq("basket_id",basketId).maybeSingle(),
    db.from("basket_templates").select("id,name,image_url,is_active").eq("id",basketId).maybeSingle(),
    db.rpc("basket_mold_public_compositions_v2",{p_basket_id:basketId})
  ]);if(mq.error)throw mq.error;if(bq.error)throw bq.error;if(pq.error)throw pq.error;const mold=mq.data,basket=bq.data;if(!mold||!basket||basket.is_active!==true)return null;if(compositionNumber<1||compositionNumber>Number(mold.public_composition_count||1))return null;
  const posq=await db.from("basket_mold_positions").select("id,label,quantity,sort_order").eq("mold_id",mold.id).order("sort_order");if(posq.error)throw posq.error;const positions=posq.data||[];if(!positions.length)return null;
  const positionIds=positions.map((p:any)=>String(p.id)),oq=await db.from("basket_mold_position_options").select("position_id,product_id,sort_order").in("position_id",positionIds).order("sort_order");if(oq.error)throw oq.error;const options=oq.data||[],productIds=options.map((o:any)=>String(o.product_id)),[products,available]=await Promise.all([moldProductsMap(productIds),moldAvailableStockMap(productIds)]);
  const generated=(pq.data?.compositions||[]).find((c:any)=>Number(c.number)===compositionNumber);if(!generated)return null;const defaultSelected=new Map((generated.items||[]).map((i:any)=>[String(i.position_id),String(i.product_id)])),requested=new Map<string,string>();if(Array.isArray(selections))for(const row of selections){const pid=uid(row?.position_id),product=uid(row?.product_id);if(pid&&product)requested.set(pid,product)}
  if(selections&&requested.size!==positions.length)throw new Error("basket_mold_component_invalid");let productTotal=0,capacity=30;const items:any[]=[];
  for(const pos of positions){const pid=String(pos.id),qty=Number(pos.quantity||0),alts=options.filter((o:any)=>String(o.position_id)===pid).map((o:any)=>{const p=products.get(String(o.product_id)),stock=available.get(String(o.product_id))||0;return p&&p.is_active===true&&stock>=qty?{product_id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,image_url:p.image_url||"",packaging:p.packaging||"",stock_quantity:stock,price_cents:moldEffectivePriceCents(p)}:null}).filter(Boolean) as any[];if(!alts.length)return null;const selectedId=requested.get(pid)||defaultSelected.get(pid)||"",selected=alts.find((a:any)=>String(a.product_id)===selectedId);if(!selected){if(selections)throw new Error("basket_mold_option_invalid");return null}productTotal+=Math.round(Number(selected.price_cents)*qty);capacity=Math.min(capacity,Math.floor(Number(selected.stock_quantity||0)/qty));items.push({position_id:pid,label:pos.label,product_id:selected.product_id,name:selected.name,sku:selected.sku,gtin:selected.gtin,image_url:selected.image_url,packaging:selected.packaging,stock_quantity:selected.stock_quantity,base_quantity:qty,quantity:qty,alternatives:alts})}
  if(capacity<1)return null;return {basket:{id:basket.id,name:basket.name,image_url:basket.image_url||"",mold_mode:true,mold_id:mold.id,composition_number:compositionNumber,public_composition_count:Number(mold.public_composition_count||1),hidden_adjustment_cents:cents(mold.hidden_adjustment||0),display_price_cents:Math.max(0,productTotal+cents(mold.hidden_adjustment||0)),stock_quantity:capacity},items};
}
async function moldQuote(payload:any){const id=uid(payload?.basket_id),n=Math.trunc(Number(payload?.composition_number||1));if(!id)return {error:"invalid_basket",status:400};try{const d=await moldDetail(id,n,Array.isArray(payload?.items)?payload.items:[]);if(!d)return {error:"basket_mold_unavailable",status:409};return {ok:true,total_cents:d.basket.display_price_cents,basket:d.basket,items:d.items}}catch(e:any){const code=txt(e?.message,100);return {error:["basket_mold_option_invalid","basket_mold_component_invalid"].includes(code)?code:"basket_mold_unavailable",status:409}}
}
'''
    s = replace_once(s, 'async function home(){', helper + '\nasync function home(){', 'storefront_helper')
    s = replace_once(s,
        'async function home(){\n  const [catalogQ,categoriesQ]=await Promise.all([',
        'async function home(){\n  const moldCards=await moldHomeCards(),moldBasketIds=new Set(moldCards.map((x:any)=>String(x.id)));\n  const [catalogQ,categoriesQ]=await Promise.all([',
        'home_start')
    s = replace_once(s,
        'const rows=(catalogQ.data||[]).filter((x:any)=>x.model_active===true&&x.category_active===true&&x.public_lot_id&&Number(x.public_available||0)>0);',
        'const rows=(catalogQ.data||[]).filter((x:any)=>x.model_active===true&&x.category_active===true&&x.public_lot_id&&Number(x.public_available||0)>0&&!moldBasketIds.has(String(x.commercial_id)));',
        'home_filter')
    s = replace_once(s,
        'baskets:await basketCarouselItems(baskets),categories:CATEGORIES,basket_categories:categoriesQ.data||[]};',
        'baskets:[...moldCards,...await basketCarouselItems(baskets)],categories:CATEGORIES,basket_categories:categoriesQ.data||[]};',
        'home_result')
    s = replace_once(s,
        'type StockAdjustment={kind:"product"|"basket";id:string;name:string;action:"removed"|"reduced";requested:number;available:number;reason:string};',
        'type StockAdjustment={kind:"product"|"basket"|"basket_mold";id:string;name:string;action:"removed"|"reduced";requested:number;available:number;reason:string};',
        'stock_union')
    s = replace_once(s,
        'const kind=raw?.type==="basket"?"basket":"product",id=uid(raw?.id),requested=Math.max(1,Math.min(30,Math.trunc(Number(raw?.qty||1))));',
        'const kind=raw?.type==="basket_mold"?"basket_mold":raw?.type==="basket"?"basket":"product",id=uid(raw?.id),requested=Math.max(1,Math.min(30,Math.trunc(Number(raw?.qty||1))));',
        'stock_kind')
    # Pass mold rows through here; checkout SQL performs the authoritative position/option/stock validation.
    s = replace_once(s,
        'if(!id){adjustedItems.push({kind,id:"",name:"Item",action:"removed",requested,available:0,reason:"id_invalido"});continue;}\n    if(kind==="product"){',
        'if(!id){adjustedItems.push({kind,id:"",name:"Item",action:"removed",requested,available:0,reason:"id_invalido"});continue;}\n    if(kind==="basket_mold"){adjusted.push({...raw,type:"basket_mold",id,qty:requested});continue;}\n    if(kind==="product"){',
        'stock_mold_passthrough')
    old_route = 'if(req.method==="GET"&&action==="basket"){const id=uid(u.searchParams.get("basket_id"));if(!id)return json(req,{ok:false,error:"invalid_basket"},400);const b=await basket(id);return b?json(req,{ok:true,...b},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_not_found"},404)}'
    new_route = 'if(req.method==="GET"&&action==="basket"){const raw=txt(u.searchParams.get("basket_id"),100),mm=raw.match(/^([0-9a-f-]{36})@([1-4])$/i);if(mm){const id=uid(mm[1]);if(!id)return json(req,{ok:false,error:"invalid_basket"},400);const b=await moldDetail(id,Number(mm[2]));return b?json(req,{ok:true,...b},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_mold_unavailable"},404)}const id=uid(raw);if(!id)return json(req,{ok:false,error:"invalid_basket"},400);const b=await basket(id);return b?json(req,{ok:true,...b},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_not_found"},404)}'
    s = replace_once(s, old_route, new_route, 'basket_route')
    quote_anchor = 'if(req.method==="POST"&&action==="basket_quote"){const p=await req.json();const r=await quote(p);return json(req,r,r?.status||200,{"Cache-Control":"no-store"})}'
    s = replace_once(s, quote_anchor, quote_anchor+'\n    if(req.method==="POST"&&action==="basket_mold_quote"){const p=await req.json();const r=await moldQuote(p);return json(req,r,r?.status||200,{"Cache-Control":"no-store"})}', 'mold_quote_route')
    path.write_text(s, encoding='utf-8')


def patch_carousel(path: Path):
    s=path.read_text(encoding='utf-8')
    if 'R5_MOLD_CARD_KEY_V1' in s:return
    s=replace_once(s,
        "const name=basketName(b.name),region='basket-products-'+b.id;",
        "const name=basketName(b.name),key=String(b.card_key||b.id),region='basket-products-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');/* R5_MOLD_CARD_KEY_V1 */",
        'carousel_key')
    s=replace_once(s,'data-basket="'+"'+esc(b.id)+'"+'"','data-basket="'+"'+esc(key)+'"+'"','carousel_data')
    path.write_text(s,encoding='utf-8')


def patch_html(path: Path):
    s=path.read_text(encoding='utf-8')
    if 'R5_MOLD_CART_V1' in s:return
    s=replace_once(s,
      "const stockSensitive=['offers','products','product','basket','basket_quote','submit_order'].includes(action);",
      "const stockSensitive=['offers','products','product','basket','basket_quote','basket_mold_quote','submit_order'].includes(action);",
      'html_stock_sensitive')
    s=replace_once(s,
      "if(item.type!=='basket')return;for(const comp of item.components||[]){",
      "if(item.type==='basket_mold'){for(const comp of item.components||[])if(comp.product_id===productId)total+=Number(comp.quantity||0)*Number(item.qty||0);return}if(item.type!=='basket')return;for(const comp of item.components||[]){",
      'html_demand')
    s=replace_once(s,
      "function maxBasketQty(item,itemIndex){if(item?.split_mode){",
      "function maxBasketQty(item,itemIndex){if(item?.type==='basket_mold'){let max=30;for(const comp of item.components||[]){const remaining=remainingStock(comp.product_id,itemIndex,comp.stock_quantity);if(remaining!==null)max=Math.min(max,Math.floor((remaining+1e-9)/Math.max(.001,Number(comp.quantity||1))))}return Math.max(0,max)}if(item?.split_mode){",
      'html_max_mold')

    mold_ui = r'''    // R5_MOLD_CART_V1
    function moldItemOptions(item){return (item.alternatives||[]).map(a=>'<option value="'+esc(a.product_id)+'" '+(a.product_id===item.product_id?'selected':'')+'>'+esc(a.name)+'</option>').join('')}
    function paintMoldBasketSheet(){const d=state.basketDraft;if(!d)return;const b=d.basket;sheetTitle.textContent=basketName(b.name);sheetBody.innerHTML='<div class="basket-hero basket-hero-compact"><img src="'+esc(safeImage(b.image_url))+'" alt=""><div><h3>'+esc(basketName(b.name))+'</h3><small>Escolha entre as variações disponíveis. As quantidades do molde permanecem fixas.</small></div></div><div class="basket-edit-list">'+d.items.map((x,i)=>'<div class="checkout-item-row"><button type="button" class="checkout-thumb" data-product-detail="'+esc(x.product_id)+'" data-detail-return="basket"><img src="'+esc(safeImage(x.image_url))+'" alt=""></button><div class="checkout-copy"><strong class="checkout-name">'+formatQty(x.quantity)+'× '+esc(x.label||x.name)+'</strong><select data-mold-option="'+i+'" style="width:100%;margin-top:5px;min-height:38px;border:1px solid #d7dfd9;border-radius:8px;background:#fff;padding:0 7px">'+moldItemOptions(x)+'</select></div><span class="checkout-meta">fixo</span></div>').join('')+'</div>';sheetAction.innerHTML='<div class="basket-action-bar"><div class="basket-action-price"><small>Valor da cesta</small><strong id="basketActionTotal">'+money(d.total_cents)+'</strong></div><button class="primary basket-add-btn" type="button" id="addBasket">Adicionar cesta</button></div>';sheetBody.querySelectorAll('[data-mold-option]').forEach(sel=>sel.onchange=()=>changeMoldOption(Number(sel.dataset.moldOption),sel.value));attachProductDetailHandlers(sheetBody);$('#addBasket').onclick=addBasketDraft}
    async function changeMoldOption(index,productId){const d=state.basketDraft,item=d?.items?.[index];if(!d||!item)return;const alt=(item.alternatives||[]).find(a=>a.product_id===productId);if(!alt)return;Object.assign(item,{product_id:alt.product_id,name:alt.name,sku:alt.sku,gtin:alt.gtin,image_url:alt.image_url||'',packaging:alt.packaging||'',stock_quantity:stockNumber(alt.stock_quantity)});await quoteMoldBasket();paintMoldBasketSheet()}
    async function quoteMoldBasket(){const d=state.basketDraft;if(!d?.basket?.mold_mode)return;const actionTotal=$('#basketActionTotal');if(actionTotal)actionTotal.textContent='Calculando…';try{const data=await api('basket_mold_quote',{},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({basket_id:d.basket.id,composition_number:d.basket.composition_number,items:d.items.map(x=>({position_id:x.position_id,product_id:x.product_id}))})});d.total_cents=Number(data.total_cents||0);d.basket={...d.basket,...(data.basket||{})};d.items=(data.items||d.items).map(x=>({...x,base_quantity:Number(x.base_quantity??x.quantity??0),quantity:Number(x.quantity??0)}));if($('#basketActionTotal'))$('#basketActionTotal').textContent=money(d.total_cents)}catch(e){toast(e?.message==='basket_mold_option_invalid'?'Essa variação não está disponível nesta cesta.':'O estoque dessa variação mudou. Escolha outra opção.')}}
    function addMoldBasketDraft(){const d=state.basketDraft;if(!d?.basket?.mold_mode)return;const item={type:'basket_mold',id:d.basket.id,name:basketName(d.basket.name),image_url:d.basket.image_url||'',unit_cents:Number(d.total_cents||0),qty:1,composition_number:Number(d.basket.composition_number||1),mold_id:d.basket.mold_id||'',hidden_adjustment_cents:Number(d.basket.hidden_adjustment_cents||0),basket_stock_quantity:Number(d.basket.stock_quantity||0),components:d.items.map(x=>({position_id:x.position_id,label:x.label||'',product_id:x.product_id,name:x.name,image_url:x.image_url||'',packaging:x.packaging||'',stock_quantity:stockNumber(x.stock_quantity),base_quantity:Number(x.base_quantity||x.quantity||0),quantity:Number(x.quantity||0)}))};state.cart.push(item);saveCart();closeSheet();toast('Cesta adicionada')}
'''
    s=replace_once(s,'    function paintBasketSheet(){const d=state.basketDraft;if(!d)return;',mold_ui+"    function paintBasketSheet(){const d=state.basketDraft;if(!d)return;if(d.basket?.mold_mode){paintMoldBasketSheet();return}",'html_mold_ui')
    s=replace_once(s,'    function addBasketDraft(){const d=state.basketDraft;if(!d)return;',"    function addBasketDraft(){const d=state.basketDraft;if(!d)return;if(d.basket?.mold_mode){addMoldBasketDraft();return}",'html_add_mold')
    s=replace_once(s,
      "const comp=item.type==='basket'&&item.components?.length?",
      "const comp=['basket','basket_mold'].includes(item.type)&&item.components?.length?",
      'html_cart_comp')
    s=replace_once(s,
      "<small>'+(item.type==='basket'?'Cesta básica':'Produto')+'</small>",
      "<small>'+(['basket','basket_mold'].includes(item.type)?'Cesta básica':'Produto')+'</small>",
      'html_cart_label')
    checkout_mold = r'''    function checkoutMoldBlock(item,itemIndex){const components=(item.components||[]).map(c=>'<div class="checkout-item-row"><button type="button" class="checkout-thumb" data-product-detail="'+esc(c.product_id)+'" data-detail-return="checkout"><img src="'+esc(safeImage(c.image_url))+'" alt=""></button><div class="checkout-copy"><button type="button" class="checkout-name" data-product-detail="'+esc(c.product_id)+'" data-detail-return="checkout">'+esc(c.name)+'</button><span class="checkout-meta">'+formatQty(c.quantity)+'× '+esc(c.label||'Item da cesta')+'</span></div><strong>'+formatQty(c.quantity)+'</strong></div>').join('');return '<div class="checkout-basket"><div class="checkout-basket-head"><img src="'+esc(safeImage(item.image_url))+'" alt=""><div><strong>'+esc(item.name)+'</strong><span class="checkout-meta">Variação escolhida · '+money(Number(item.unit_cents||0)*Number(item.qty||1))+'</span></div>'+checkoutQtyControl(itemIndex,item.qty)+'</div><div class="checkout-basket-items">'+components+'</div></div>'}
'''
    s=replace_once(s,'    function checkoutBasketBlock(item,itemIndex){',checkout_mold+'    function checkoutBasketBlock(item,itemIndex){if(item.type===\'basket_mold\')return checkoutMoldBlock(item,itemIndex);','html_checkout_mold')
    s=replace_once(s,
      "rows=state.cart.map((item,i)=>item.type==='basket'?checkoutBasketBlock(item,i):checkoutProductRow(item,i)).join('')",
      "rows=state.cart.map((item,i)=>['basket','basket_mold'].includes(item.type)?checkoutBasketBlock(item,i):checkoutProductRow(item,i)).join('')",
      'html_checkout_rows')
    old_payload="items:state.cart.map(item=>({type:item.type,id:item.id,qty:Number(item.qty||1),lot_id:item.type==='basket'?(item.lot_id||null):null,split_mode:item.type==='basket'&&item.split_mode===true,food_lot_id:item.type==='basket'?(item.food_lot_id||null):null,hygiene_lot_id:item.type==='basket'?(item.hygiene_lot_id||null):null,components:item.type==='basket'?(item.components||[]):[]}))"
    new_payload="items:state.cart.map(item=>({type:item.type,id:item.id,qty:Number(item.qty||1),composition_number:item.type==='basket_mold'?Number(item.composition_number||1):null,lot_id:item.type==='basket'?(item.lot_id||null):null,split_mode:item.type==='basket'&&item.split_mode===true,food_lot_id:item.type==='basket'?(item.food_lot_id||null):null,hygiene_lot_id:item.type==='basket'?(item.hygiene_lot_id||null):null,components:['basket','basket_mold'].includes(item.type)?(item.components||[]):[]}))"
    s=replace_once(s,old_payload,new_payload,'html_submit_payload')
    s=replace_once(s,
      "'basket_component_not_in_selected_kit'].includes(e.message)",
      "'basket_component_not_in_selected_kit','basket_mold_unavailable','basket_mold_not_configured','basket_mold_component_invalid','basket_mold_option_invalid','basket_mold_composition_invalid'].includes(e.message)",
      'html_stock_errors')
    path.write_text(s,encoding='utf-8')


patch_storefront(Path('supabase/functions/storefront-v2/index.ts'))
patch_carousel(Path('vitrine/basket-carousel.js'))
patch_html(Path('index.html'))
patch_html(Path('vitrine/index.html'))
print('R5 storefront transformation applied')
