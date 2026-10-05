import fs from 'node:fs';
const file='vitrine/admin/index.html';
let s=fs.readFileSync(file,'utf8');
function replaceOnce(before,after,label){
  const first=s.indexOf(before);
  if(first<0)throw new Error(label+'_anchor_missing');
  if(s.indexOf(before,first+before.length)>=0)throw new Error(label+'_anchor_not_unique');
  s=s.slice(0,first)+after+s.slice(first+before.length);
}
replaceOnce(
  '  async function quickConfirmOrder\n  async function quickConfirmOrder(id,btn)',
  '  async function quickConfirmOrder(id,btn)',
  'orphan_quickConfirmOrder'
);
replaceOnce(
  "if(!confirm('EMITIR NF-e do pedido #'+shortOrder(o.order_number||o.id)+' agora?\n\nA emissão será enviada ao Bling/SEFAZ.'))return;",
  "if(!confirm('EMITIR NF-e do pedido #'+shortOrder(o.order_number||o.id)+' agora?\\n\\nA emissão será enviada ao Bling/SEFAZ.'))return;",
  'fiscal_confirm_newline'
);
fs.writeFileSync(file,s);
console.log('Pedidos V4 browser syntax fixes applied');
