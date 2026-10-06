import { readFileSync, writeFileSync } from 'node:fs';

const targets = ['index.html', 'vitrine/index.html'];

const oldCss = `.basket-edit-list{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff}.basket-edit-list .checkout-item-row{min-height:70px}.basket-edit-list .checkout-thumb{background:#f7f9f7}.basket-edit-list .checkout-name{font-size:12.5px}.basket-action-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}`;
const newCss = `.basket-edit-list{display:grid;gap:10px;border:0;border-radius:0;overflow:visible;background:transparent}.basket-edit-list .checkout-item-row{min-height:82px;border:1px solid var(--line);border-radius:14px;padding:11px 12px;background:#fff}.basket-edit-list .checkout-thumb{background:#f7f9f7}.basket-edit-list .checkout-name{font-size:12.5px}.basket-item-card{grid-template-columns:52px minmax(0,1fr) auto!important;align-items:center}.basket-item-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.basket-item-remove{min-height:38px;border:1px solid #ead9dc;border-radius:10px;background:#fff7f8;color:#992536;padding:8px 10px;font-size:11px;font-weight:850;white-space:nowrap}.basket-item-remove:active{background:#fbecef}.basket-action-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}`;

const oldRow = `return '<div class="checkout-item-row"><button type="button" class="checkout-thumb" data-product-detail="'+esc(x.product_id)+'" data-detail-return="basket" aria-label="Ver '+esc(x.name)+'"><img src="'+esc(safeImage(x.image_url))+'" alt=""></button><div class="checkout-copy"><button type="button" class="checkout-name" data-product-detail="'+esc(x.product_id)+'" data-detail-return="basket">'+esc(x.name)+'</button><span class="checkout-meta">'+esc(x.packaging||'Item da cesta')+'</span></div><div class="checkout-qty"><button type="button" data-b-dec="'+i+'" aria-label="Diminuir">−</button><b id="bq'+i+'">'+formatQty(x.quantity)+'</b><button type="button" data-b-inc="'+i+'" aria-label="Aumentar" '+(Number(x.quantity)>=max?'disabled':'')+'>+</button></div></div>'`;
const newRow = `return '<div class="checkout-item-row basket-item-card"><button type="button" class="checkout-thumb" data-product-detail="'+esc(x.product_id)+'" data-detail-return="basket" aria-label="Ver '+esc(x.name)+'"><img src="'+esc(safeImage(x.image_url))+'" alt=""></button><div class="checkout-copy"><button type="button" class="checkout-name" data-product-detail="'+esc(x.product_id)+'" data-detail-return="basket">'+esc(x.name)+'</button><span class="checkout-meta">'+esc(x.packaging||'Item da cesta')+'</span></div><div class="basket-item-actions"><div class="checkout-qty"><button type="button" data-b-dec="'+i+'" aria-label="Diminuir quantidade de '+esc(x.name)+'">−</button><b id="bq'+i+'">'+formatQty(x.quantity)+'</b><button type="button" data-b-inc="'+i+'" aria-label="Aumentar quantidade de '+esc(x.name)+'" '+(Number(x.quantity)>=max?'disabled':'')+'>+</button></div><button type="button" class="basket-item-remove" data-b-remove="'+i+'" aria-label="Remover produto da cesta: '+esc(x.name)+'">Remover</button></div></div>'`;

const oldBind = `sheetBody.querySelectorAll('[data-b-dec]').forEach(btn=>btn.onclick=()=>changeBasketQty(Number(btn.dataset.bDec),-1));sheetBody.querySelectorAll('[data-b-inc]').forEach(btn=>btn.onclick=()=>changeBasketQty(Number(btn.dataset.bInc),1));attachProductDetailHandlers(sheetBody);$('#addBasket').onclick=addBasketDraft}`;
const newBind = `sheetBody.querySelectorAll('[data-b-dec]').forEach(btn=>btn.onclick=()=>changeBasketQty(Number(btn.dataset.bDec),-1));sheetBody.querySelectorAll('[data-b-inc]').forEach(btn=>btn.onclick=()=>changeBasketQty(Number(btn.dataset.bInc),1));sheetBody.querySelectorAll('[data-b-remove]').forEach(btn=>btn.onclick=()=>removeBasketItem(Number(btn.dataset.bRemove)));attachProductDetailHandlers(sheetBody);$('#addBasket').onclick=addBasketDraft}`;

const oldFn = `function formatQty(n){return Number.isInteger(Number(n))?String(Number(n)):String(Number(n).toFixed(3)).replace(/\\.?0+$/,'')}`;
const newFn = `function removeBasketItem(index){const d=state.basketDraft;if(!d||!d.items[index])return;const item=d.items[index];if(Number(item.quantity||0)<=0)return;item.quantity=0;clearTimeout(d.quoteTimer);paintBasketSheet();d.quoteTimer=setTimeout(quoteBasket,100)}\n    function formatQty(n){return Number.isInteger(Number(n))?String(Number(n)):String(Number(n).toFixed(3)).replace(/\\.?0+$/,'')}`;

for (const file of targets) {
  let html = readFileSync(file, 'utf8');
  for (const [from, to, label] of [[oldCss,newCss,'css'],[oldRow,newRow,'row'],[oldBind,newBind,'binding'],[oldFn,newFn,'remove fn']]) {
    if (!html.includes(from)) throw new Error(`${file}: missing ${label} anchor`);
    html = html.replace(from, to);
  }
  writeFileSync(file, html);
  console.log(`patched ${file}`);
}
