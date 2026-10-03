import fs from 'node:fs';

const path='checkout-resilience.js';
let s=fs.readFileSync(path,'utf8');

const css=[
"      .da-checkout-cart-summary{margin:0 0 14px;border:1px solid #dbe5de;border-radius:15px;background:#fff;overflow:hidden}\n",
"      .da-checkout-cart-summary>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;padding:11px 13px}\n",
"      .da-checkout-cart-summary>summary::-webkit-details-marker{display:none}\n",
"      .da-checkout-cart-summary>summary strong{display:block;font-size:16px}.da-checkout-cart-summary>summary small{display:block;color:#66716a;font-size:12px;margin-top:2px}\n",
"      .da-checkout-cart-summary>summary b{font-size:18px;white-space:nowrap}.da-checkout-cart-summary[open]>summary{border-bottom:1px solid #e7ebe8;background:#f8faf8}\n"
].join('');
if(!s.includes(css))throw new Error('collapsible summary CSS not found');
s=s.replace(css,'');

const fn=`  function collapseOrderSummary(body){\n    const list=body?.querySelector('.checkout-list');if(!list||list.closest('.da-checkout-cart-summary'))return;const details=document.createElement('details');details.className='da-checkout-cart-summary';\n    const summary=document.createElement('summary'),total=byId('checkoutTotal')?.textContent||'';summary.innerHTML='<span><strong>Seu pedido</strong><small>Ver ou alterar produtos</small></span><b>'+escapeHtml(total)+'</b>';list.parentNode.insertBefore(details,list);details.appendChild(summary);details.appendChild(list);\n  }\n`;
if(!s.includes(fn))throw new Error('collapseOrderSummary function not found');
s=s.replace(fn,'');

const oldLine="    const body=byId('sheetBody');if(!body||!byId('sendWhats')||body.querySelector('[data-da-checkout-organized=\"1\"]'))return;injectCheckoutStyles();const marker=document.createElement('span');marker.dataset.daCheckoutOrganized='1';marker.hidden=true;body.prepend(marker);collapseOrderSummary(body);";
const newLine="    const body=byId('sheetBody');if(!body||!byId('sendWhats')||body.querySelector('[data-da-checkout-organized=\"1\"]'))return;injectCheckoutStyles();const marker=document.createElement('span');marker.dataset.daCheckoutOrganized='1';marker.hidden=true;body.prepend(marker);";
if(!s.includes(oldLine))throw new Error('organizer collapse call not found');
s=s.replace(oldLine,newLine);

fs.writeFileSync(path,s);
console.log('checkout products visible patch applied');
