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

function embaralhar(lista) {
  return [...lista].sort(() => Math.random() - 0.5);
}

function formatarValidade7Dias() {
  const data = new Date();
  data.setDate(data.getDate() + 7);
  data.setHours(23, 59, 0, 0);

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}T23:59`;
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

  const produtosMisturados = embaralhar(produtosValidos);
  const combos = [];
  const usados = new Set();

  for (let i = 0; i < produtosMisturados.length; i++) {
    if (combos.length >= 5) break;

    const p1 = produtosMisturados[i];
    const chave1 = String(p1.codigo || p1.id || p1.firebaseKey || "");

    if (!chave1 || usados.has(chave1)) continue;

    const candidatos = produtosMisturados.filter(p2 => {
      const chave2 = String(p2.codigo || p2.id || p2.firebaseKey || "");
      return (
        chave2 &&
        chave2 !== chave1 &&
        !usados.has(chave2) &&
        normalizarPreco(p2.preco) > 0
      );
    });

    if (candidatos.length === 0) continue;

    const p2 = candidatos[0];
    const chave2 = String(p2.codigo || p2.id || p2.firebaseKey || "");

    const desconto = [20, 25, 30][Math.floor(Math.random() * 3)];

    const preco1 = normalizarPreco(p1.preco);
    const preco2 = normalizarPreco(p2.preco);

    const soma = preco1 + preco2;
    const precoCombo = soma * (1 - desconto / 100);
    const economia = soma - precoCombo;

    const agora = new Date();

    combos.push({
      id: "COMBO-" + Date.now() + "-" + (combos.length + 1),
      nome: "Combo " + (p1.nome || "Produto 1") + " + " + (p2.nome || "Produto 2"),
      ativo: true,
      motivo_desativacao: "",
      desconto_percentual: desconto,
      soma_produtos: Number(soma.toFixed(2)),
      preco_combo: Number(precoCombo.toFixed(2)),
      economia: Number(economia.toFixed(2)),
      validade_combo: formatarValidade7Dias(),
      url_imagem: p1.url_imagem || p2.url_imagem || "",
      itens: [p1, p2].map(produto => {
        const preco = normalizarPreco(produto.preco);
        const precoComDesconto = preco * (1 - desconto / 100);

        return {
          sku: String(produto.codigo || produto.id || produto.firebaseKey || ""),
          firebaseKey: String(produto.firebaseKey || produto.codigo || produto.id || ""),
          nome: produto.nome || "",
          qtd: 1,
          preco_unitario_original: Number(preco.toFixed(2)),
          preco_unitario_combo: Number(precoComDesconto.toFixed(2)),
          total_original: Number(preco.toFixed(2)),
          total_combo: Number(precoComDesconto.toFixed(2))
        };
      }),
      criado_em: agora.toISOString(),
      last_update: agora.getTime()
    });

    usados.add(chave1);
    usados.add(chave2);
  }

  return combos;
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
