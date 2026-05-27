const fs = require("fs");
const path = require("path");

const FIREBASE_URL = process.env.FIREBASE_URL;

if (!FIREBASE_URL) {
  throw new Error("FIREBASE_URL não configurado nos Secrets do GitHub.");
}

function normalizarPreco(valor) {
  if (valor === null || valor === undefined) return 0;
  return parseFloat(String(valor).replace(",", ".")) || 0;
}

function slugify(texto) {
  return String(texto || "combo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function carregarProdutos() {
  const url = FIREBASE_URL.replace(/\/$/, "") + "/produtos.json";
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Erro ao ler Firebase: HTTP " + res.status);
  }

  const dados = await res.json();

  if (!dados) return [];

  if (Array.isArray(dados)) {
    return dados.filter(Boolean);
  }

  return Object.entries(dados).map(([firebaseKey, produto]) => ({
    ...produto,
    firebaseKey,
    id: produto.id || firebaseKey
  }));
}

function criarCombos(produtos) {
  const produtosValidos = produtos
    .filter(p => !p._deleted)
    .filter(p => String(p.situacao || "A").toUpperCase() !== "I")
    .filter(p => normalizarPreco(p.preco) > 0)
    .filter(p => normalizarPreco(p.estoque) > 0);

  const porCategoria = {};

  produtosValidos.forEach(p => {
    const categoria = p.categoria || "Outros";
    if (!porCategoria[categoria]) porCategoria[categoria] = [];
    porCategoria[categoria].push(p);
  });

  const combos = [];

  Object.entries(porCategoria).forEach(([categoria, lista]) => {
    const candidatos = lista
      .sort((a, b) => normalizarPreco(b.estoque) - normalizarPreco(a.estoque))
      .slice(0, 4);

    if (candidatos.length < 2) return;

    const soma = candidatos.reduce((acc, p) => acc + normalizarPreco(p.preco), 0);
    const desconto = 10;
    const precoCombo = soma * (1 - desconto / 100);
    const economia = soma - precoCombo;

    const nome = "Combo " + categoria;

    combos.push({
      id: "combo-auto-" + slugify(categoria),
      nome,
      ativo: true,
      origem: "github_actions",
      categoria,
      desconto_percentual: desconto,
      soma_produtos: Number(soma.toFixed(2)),
      preco_combo: Number(precoCombo.toFixed(2)),
      economia: Number(economia.toFixed(2)),
      validade_combo: "",
      url_imagem: "",
      itens: candidatos.map(p => {
        const preco = normalizarPreco(p.preco);
        const precoComboUnit = preco * (1 - desconto / 100);

        return {
          sku: p.codigo || p.id || p.firebaseKey || "",
          firebaseKey: p.firebaseKey || "",
          nome: p.nome || "",
          qtd: 1,
          preco_unitario_original: Number(preco.toFixed(2)),
          preco_unitario_combo: Number(precoComboUnit.toFixed(2)),
          total_original: Number(preco.toFixed(2)),
          total_combo: Number(precoComboUnit.toFixed(2))
        };
      }),
      criado_em: new Date().toISOString(),
      last_update: Date.now()
    });
  });

  return combos.slice(0, 20);
}

async function main() {
  const produtos = await carregarProdutos();
  const combos = criarCombos(produtos);

  const pasta = path.join(process.cwd(), "site");
  if (!fs.existsSync(pasta)) {
    fs.mkdirSync(pasta, { recursive: true });
  }

  const arquivo = path.join(pasta, "combo.json");
  fs.writeFileSync(arquivo, JSON.stringify(combos, null, 2), "utf8");

  console.log(`Combos criados: ${combos.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
