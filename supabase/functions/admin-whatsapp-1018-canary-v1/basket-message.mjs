const clean=(v,max=150)=>String(v??"").replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim().slice(0,max);
export function buildBasketContentsText({label,number,basket,items}){
 const size=clean(label,40);
 const amount=Number(basket?.display_price_cents),stock=Number(basket?.stock_quantity);
 if(!size||!Number.isInteger(number)||number<1||number>3)throw Error("basket_composition_mismatch");
 if(!Number.isSafeInteger(amount)||amount<=0||!Number.isFinite(stock)||stock<1||!Array.isArray(items)||!items.length||items.length>80)throw Error("basket_composition_unavailable");
 const lines=[];
 for(const item of items){
   const quantity=Number(item?.quantity),name=clean(item?.name,150);
   if(!Number.isInteger(quantity)||quantity<0||quantity>1000||!name)throw Error("basket_composition_invalid");
   if(quantity>0)lines.push(quantity+"x "+name);
 }
 if(!lines.length)throw Error("basket_composition_unavailable");
 const value=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(amount/100);
 const text=[
   "*Dona Antônia — Cesta "+size+"*",
   "*Combinação "+number+"*",
   "*Valor da cesta: "+value+"*",
   "",
   "*Produtos incluídos:*",
   ...lines.map((line,i)=>(i+1)+". "+line),
   "",
   "Você pode trocar marcas, retirar itens e mudar quantidades.",
   "Responda com a alteração desejada. O valor será recalculado antes da confirmação.",
   "",
   "_Teste interno 1018. Composição e disponibilidade sujeitas à confirmação._"
 ].join("\n");
 if(text.length>4096)throw Error("basket_composition_too_long");
 return text;
}
