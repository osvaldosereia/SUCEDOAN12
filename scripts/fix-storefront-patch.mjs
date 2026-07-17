import fs from 'node:fs/promises';
const file='scripts/patch-storefront-banners-cache.mjs';
let source=await fs.readFile(file,'utf8');
source=source.replace(/\n  \/\/ Página inicial: sem banners\.[\s\S]*?\n  };\n\n  renderCategory=/, '\n  renderCategory=');
await fs.writeFile(file,source,'utf8');
console.log('Patch ajustado para preservar o renderHome interno já otimizado.');
