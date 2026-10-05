import fs from 'node:fs';
const file='vitrine/admin/index.html';
let s=fs.readFileSync(file,'utf8');
function replaceOnce(before,after,label){
  const i=s.indexOf(before);if(i<0)throw new Error('anchor_missing:'+label);
  if(s.indexOf(before,i+before.length)>=0)throw new Error('anchor_not_unique:'+label);
  s=s.slice(0,i)+after+s.slice(i+before.length);
}
const oldFiscal=`    const fiscal=o.status==='delivered'?'<div class="order-v3-section"><h3>Fiscal / NF-e</h3><div id="orderFiscalStatus">'+orderFiscalHtml(state.currentOrderFiscal,o)+'</div>'+fiscalCanaryActionHtml(state.currentOrderFiscal,o)+'<div class="print-actions">'+((state.currentOrderFiscal?.dispatch_gate?.authorized===true||state.currentOrderFiscal?.bling_invoice_id)?'<button class="secondary" id="printDanfe" type="button">Imprimir DANFE</button>':'')+'</div></div>':'';`;
const newFiscal=`    const fiscal=['ready','out_for_delivery','delivered'].includes(o.status)?'<div class="order-v3-section"><h3>Fiscal / NF-e</h3><div id="orderFiscalStatus">'+orderFiscalHtml(state.currentOrderFiscal,o)+'</div>'+fiscalCanaryActionHtml(state.currentOrderFiscal,o)+'<div class="print-actions">'+((state.currentOrderFiscal?.danfe_available||state.currentOrderFiscal?.authorized===true||state.currentOrderFiscal?.dispatch_gate?.authorized===true||state.currentOrderFiscal?.bling_invoice_id)?'<button class="secondary" id="printDanfe" type="button">Imprimir DANFE</button>':'')+'</div></div>':'';`;
replaceOnce(oldFiscal,newFiscal,'fiscal_panel_ready');
const oldDelivery=`+(milestones.separated&&!milestones.delivered&&!milestones.cancelled?'<button class="primary" id="deliverOrderV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>CONFIRMAR ENTREGA</button>':'')+`;
const newDelivery=`+(o.status==='out_for_delivery'&&!milestones.delivered&&!milestones.cancelled?'<button class="primary" id="deliverOrderV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>CONFIRMAR ENTREGA</button><button class="secondary" id="deliveryFailedV4" type="button">ENTREGA NÃO CONCLUÍDA</button>':'')+`;
replaceOnce(oldDelivery,newDelivery,'delivery_only_after_dispatch');
fs.writeFileSync(file,s);
console.log('Pedidos V4 opened-order detail fixed');
