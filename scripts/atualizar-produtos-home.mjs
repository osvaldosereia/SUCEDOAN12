import { readFile, writeFile } from "node:fs/promises";

const PRODUCTS_PATH = process.env.PRODUCTS_PATH || "site/produtos.json";
const PRODUCTS_HOME_PATH = process.env.PRODUCTS_HOME_PATH || "site/produtos-home.json";

const text = value => String(value ?? "").trim();
const number = value => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => Math.round(Math.max(0, number(value)) * 100) / 100;

function isActive(product) {
  const situation = text(product?.situacao ?? product?.status ?? "A").toUpperCase();
  return !["I", "INATIVO", "INACTIVE", "0", "FALSE", "EXCLUIDO"].includes(situation);
}

function normalizeProducts(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map((product, index) => {
      const key = text(product?.firebaseKey || product?.id || product?.codigo || product?.sku || index);
      return [key, product || {}];
    }));
  }
  return raw && typeof raw === "object" ? raw : {};
}

function compactProduct(key, product = {}) {
  const compact = {
    codigo: text(product.codigo || product.sku || product.id || key),
    nome: text(product.nome || product.name || product.titulo),
    categoria: text(product.categoria),
    subcategoria: text(product.subcategoria),
    subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca),
    embalagem: text(product.embalagem),
    preco: money(product.preco ?? product.price ?? product.valor),
    preco_oferta: money(product.preco_oferta ?? product.precoOferta),
    estoque: Math.max(0, Math.floor(number(product.estoque))),
    situacao: isActive(product) ? "A" : "I",
    url_imagem: text(product.url_imagem || product.imagem_url || product.imagem || product.image || product.img || product.foto || product.foto_url || product.imagem_path),
    descricao_curta: text(product.descricao_curta || product.descricao).slice(0, 180),
    validade: text(product.validade || product.data_validade),
    validade_oferta: text(product.validade_oferta || product.validadeOferta),
    gtin: text(product.gtin || product.ean)
  };

  return Object.fromEntries(
    Object.entries(compact).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

async function main() {
  const source = await readFile(PRODUCTS_PATH, "utf8");
  if (!source.trim()) {
    console.log(`${PRODUCTS_PATH} está vazio; nenhum catálogo compacto foi alterado.`);
    return;
  }

  const products = normalizeProducts(JSON.parse(source));
  const compact = Object.fromEntries(
    Object.entries(products).map(([key, product]) => [key, compactProduct(key, product)])
  );

  await writeFile(PRODUCTS_HOME_PATH, `${JSON.stringify(compact, null, 2)}\n`, "utf8");
  console.log(`${PRODUCTS_HOME_PATH} atualizado com ${Object.keys(compact).length} produtos.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
