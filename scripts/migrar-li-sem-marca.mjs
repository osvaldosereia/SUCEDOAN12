import fs from 'node:fs';

const path='scripts/sincronizar-loja-integrada.mjs';
let s=fs.readFileSync(path,'utf8');

const old1=`    const brands = await listAll('/marca');
    const categories = await listAll('/categoria');
    cachedRefs = { brands, categories };
    const brandMap = {};
    const categoryMap = {};
    for (const item of brands) if (item?.nome && item?.resource_uri) brandMap[item.nome] = item.resource_uri;
    for (const item of categories) if (item?.nome && item?.resource_uri) categoryMap[item.nome] = item.resource_uri;
    await fbPut(REFS, { marcas: brandMap, categorias: categoryMap, atualizado_em: now(), via: 'github_actions' });
`;
const new1=`    const categories = await listAll('/categoria');
    cachedRefs = { categories };
    const categoryMap = {};
    for (const item of categories) if (item?.nome && item?.resource_uri) categoryMap[item.nome] = item.resource_uri;
    await fbPut(REFS, { marcas: {}, categorias: categoryMap, atualizado_em: now(), via: 'github_actions' });
`;
if(!s.includes(old1)) throw new Error('Bloco de catálogo esperado não encontrado');
s=s.replace(old1,new1);

const old2=`  const brand = cachedRefs.brands.find(item => norm(item?.nome) === norm(DEFAULTS.brandName));
  const category = cachedRefs.categories.find(item => norm(item?.nome) === norm(cName));
  if (!brand?.resource_uri) throw new Error(\`Marca \\\"\${DEFAULTS.brandName}\\\" não encontrada na Loja Integrada.\`);
  if (!category?.resource_uri) throw new Error(\`Categoria \\\"\${cName}\\\" não encontrada na Loja Integrada.\`);
  return { brandUri: brand.resource_uri, categoryUri: category.resource_uri, brandName: DEFAULTS.brandName, categoryName: cName };
`;
const new2=`  const category = cachedRefs.categories.find(item => norm(item?.nome) === norm(cName));
  if (!category?.resource_uri) throw new Error(\`Categoria \\\"\${cName}\\\" não encontrada na Loja Integrada.\`);
  return { brandUri: '', categoryUri: category.resource_uri, brandName: '', categoryName: cName };
`;
if(!s.includes(old2)) {
  const fallbackOld=`  const brand = cachedRefs.brands.find(item => norm(item?.nome) === norm(DEFAULTS.brandName));
  const category = cachedRefs.categories.find(item => norm(item?.nome) === norm(cName));
  if (!brand?.resource_uri) throw new Error(\`Marca "\${DEFAULTS.brandName}" não encontrada na Loja Integrada.\`);
  if (!category?.resource_uri) throw new Error(\`Categoria "\${cName}" não encontrada na Loja Integrada.\`);
  return { brandUri: brand.resource_uri, categoryUri: category.resource_uri, brandName: DEFAULTS.brandName, categoryName: cName };
`;
  if(!s.includes(fallbackOld)) throw new Error('Bloco de resolução de marca esperado não encontrado');
  s=s.replace(fallbackOld,new2);
} else s=s.replace(old2,new2);

const brandLine='    marca: refs.brandUri,\n';
if(!s.includes(brandLine)) throw new Error('Campo marca esperado não encontrado');
s=s.replace(brandLine,'');

s=s.replace("  brandName: 'Caneca Fácil',\n",'');
s=s.replace(/marca \.\*não encontrada\|categoria \.\*não encontrada/,'categoria .*não encontrada');

fs.writeFileSync(path,s);
console.log('Worker Loja Integrada migrado para operação sem marcas.');
