import fs from 'node:fs';

const html = fs.readFileSync('vitrine/admin/index.html', 'utf8');

const required = [
  '<div class="toolbar product-toolbar">\n      <input id="productSearch"',
  '.product-toolbar{flex-wrap:wrap}',
  '.product-toolbar #productSearch{flex:1 1 260px;min-width:240px}',
  '@media(max-width:780px){.product-toolbar #productSearch{min-width:0}}',
  '.toolbar select{min-width:170px}',
  'placeholder="Buscar produto, EAN ou código..."',
];

for (const token of required) {
  if (!html.includes(token)) {
    throw new Error(`Contrato de layout ausente: ${token}`);
  }
}

console.log('OK: busca de Produtos possui largura útil e toolbar pode quebrar linha sem alterar os filtros globais.');
