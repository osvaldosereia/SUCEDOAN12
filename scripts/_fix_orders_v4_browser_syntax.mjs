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
replaceOnce(
  "  async function openDanfeForOrder\n  async function openDanfeForOrder(id,orderNumber=''){",
  "  async function openDanfeForOrder(id,orderNumber=''){",
  'orphan_openDanfeForOrder'
);
const orphan=/^\s*async function\s+([A-Za-z_$][\w$]*)\s*$\n\s*async function\s+\1\s*\(/m.exec(s);
if(orphan)throw new Error('remaining_orphan_async_signature:'+orphan[1]);
fs.writeFileSync(file,s);
console.log('Pedidos V4 browser syntax fixes applied');
