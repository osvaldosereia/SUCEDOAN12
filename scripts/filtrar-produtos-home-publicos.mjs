import { readFile, writeFile } from 'node:fs/promises';

const path = process.env.PRODUCTS_HOME_PATH || 'site/produtos-home.json';
const versionPath = process.env.CATALOG_VERSION_PATH || 'catalog-version.json';
const text = value => String(value ?? '').trim();
const number = value => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const bool = value => value === true || value === 1 || ['1', 'true', 'sim', 'yes'].includes(text(value).toLowerCase());

function active(product) {
  const situation = text(product?.situacao ?? product?.status ?? 'A').toUpperCase();
  return !['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'E', 'EXCLUIDO', 'EXCLUÍDO'].includes(situation)
    && product?.ativo !== false && product?.visivel !== false;
}

function publicMugModel(product) {
  const category = text(product?.categoria ?? product?.category).toLowerCase();
  return bool(product?.modelo_publico)
    && (bool(product?.modelo_caneca) || category.includes('caneca'));
}

function available(product) {
  const priceOk = number(product?.preco ?? product?.price ?? product?.valor) > 0;
  if (!priceOk) return false;
  if (publicMugModel(product)) return true;
  return active(product) && number(product?.estoque) > 0;
}

const raw = JSON.parse(await readFile(path, 'utf8'));
const source = Array.isArray(raw) ? Object.fromEntries(raw.map((value, index) => [String(index), value])) : raw;
if (!source || typeof source !== 'object') throw new Error(`${path} não contém um catálogo válido.`);
const filtered = Object.fromEntries(Object.entries(source).filter(([, product]) => product && typeof product === 'object' && available(product)));
const count = Object.keys(filtered).length;
await writeFile(path, `${JSON.stringify(filtered)}\n`, 'utf8');

try {
  const version = JSON.parse(await readFile(versionPath, 'utf8'));
  const updated = {
    ...version,
    version: `catalog-${Date.now()}`,
    updatedAt: new Date().toISOString(),
    productCount: count,
    source: 'automatic-offers-filtered',
    instructions: 'Ofertas processadas; produtos comuns exigem estoque, enquanto modelos públicos de caneca permanecem disponíveis sob encomenda.'
  };
  await writeFile(versionPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
} catch (error) {
  console.warn(`Não foi possível atualizar ${versionPath}: ${error.message}`);
}

console.log(`${path}: ${Object.keys(source).length} registros recebidos; ${count} produtos públicos disponíveis.`);