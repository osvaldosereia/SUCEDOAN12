import type {BasketLineSummary, BasketSummary} from './model';

/** O valor unitário de cada componente da cesta NÃO é parte do contrato do checkout. */
export interface BasketCheckoutItem {
  typeId:string;
  sku:string;
  name:string;
  quantity:number;
}
export interface ExtraCheckoutItem extends BasketCheckoutItem{
  priceCents:number;
  lineTotalCents:number;
}
export interface CheckoutView {
  basketItems:readonly BasketCheckoutItem[];
  extraItems:readonly ExtraCheckoutItem[];
  basketSubtotalCents:number;
  extrasSubtotalCents:number;
  totalCents:number;
  itemCount:number;
}
export function buildCheckoutView(basket:BasketSummary,extras:readonly BasketLineSummary[]):CheckoutView{
  const basketItems=basket.lines.filter(line=>line.quantity>0&&line.selected)
    .map(line=>({
      typeId:line.typeId,sku:line.selected!.sku,name:line.selected!.name,quantity:line.quantity
    }));
  const extraItems=extras.filter(line=>line.quantity>0&&line.selected)
    .map(line=>({
      typeId:line.typeId,sku:line.selected!.sku,name:line.selected!.name,quantity:line.quantity,
      priceCents:line.selected!.priceCents,lineTotalCents:line.totalCents
    }));
  const extrasSubtotalCents=extraItems.reduce((sum,line)=>sum+line.lineTotalCents,0);
  return {
    basketItems,extraItems,basketSubtotalCents:basket.totalCents,extrasSubtotalCents,
    totalCents:basket.totalCents+extrasSubtotalCents,
    itemCount:[...basketItems,...extraItems].reduce((sum,line)=>sum+line.quantity,0)
  };
}
