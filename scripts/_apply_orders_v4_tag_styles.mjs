import fs from 'node:fs';
const file='vitrine/admin/index.html';
let s=fs.readFileSync(file,'utf8');
const before='.order-v3-tag.neutral{background:#f0f2f1;color:#59625c}.order-v3-tag.cancelled{background:#fff0f0;color:#9d2235}';
const after='.order-v3-tag.neutral{background:#f0f2f1;color:#59625c}.order-v3-tag.ok{background:#eaf6ee;color:#145b38}.order-v3-tag.warn{background:#fff6d8;color:#795900}.order-v3-tag.danger{background:#fff0f0;color:#9d2235}.order-v3-tag.cancelled{background:#fff0f0;color:#9d2235}';
const i=s.indexOf(before);if(i<0)throw new Error('tag_style_anchor_missing');if(s.indexOf(before,i+before.length)>=0)throw new Error('tag_style_anchor_not_unique');
s=s.slice(0,i)+after+s.slice(i+before.length);
fs.writeFileSync(file,s);
console.log('Pedidos V4 fiscal tag styles applied');
