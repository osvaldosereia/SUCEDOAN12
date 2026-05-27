const fs = require("fs");
const path = require("path");

const FIREBASE_URL = process.env.FIREBASE_URL;

if (!FIREBASE_URL) {
  throw new Error("FIREBASE_URL não configurado nos Secrets do GitHub.");
}

const PALAVRAS_COMBO = [
  "nivea", "palmolive", "lola", "tomate", "salado", "rosquinha",
  "monange", "colgate", "seda", "liane", "macarrão", "maionese",
  "catchup", "mostarda", "geléia", "pano", "sabão", "amaciante",
  "desinfetante", "veja", "omo", "brilhante", "novex", "garnier",
  "elseve", "dove"
];

const DESCONTOS = [20, 25, 30];

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarPreco(valor) {
  if (valor === null || valor === undefined) return 0;
  return parseFloat(String(valor).replace(",", ".")) || 0;
}

function obterUrlImagemProduto(produto) {
  if (!produto) return "";

  const imagem =
    produto.url_imagem ||
    produto.imagem ||
    produto.image ||
    produto.img ||
    produto.foto ||
    produto.url_foto ||
    produto.imageUrl ||
    produto.urlImagem ||
    produto.link_imagem ||
    produto.linkImagem ||
    produto.foto_url ||
    produto.fotoUrl ||
    "";

  if (imagem) {
    return String(imagem).trim();
  }

  const sku = String(
    produto.codigo ||
    produto.sku ||
    produto.id ||
    produto.firebaseKey ||
    ""
  ).trim();

  if (!sku) return "";

  // Caminho padrão usado pelo site quando o produto não tiver imagem salva no Firebase.
  return `../site/img/produtos/${sku}.webp`;
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
    return dados
      .filter(Boolean)
      .map((produto, index) => ({
        ...produto,
        firebaseKey: produto.firebaseKey || produto.id || produto.codigo || String(index),
        id: produto.id || produto.codigo || produto.firebaseKey || String(index)
      }));
  }

  return Object.entries(dados).map(([firebaseKey, produto]) => ({
    ...produto,
    firebaseKey,
    id: produto.id || produto.codigo || firebaseKey
  }));
}

function produtoValido(p) {
  return (
    p &&
    !p._deleted &&
    String(p.situacao || "A").toUpperCase() !== "I" &&
    normalizarPreco(p.preco) > 0 &&
    normalizarPreco(p.estoque) > 0 &&
    normalizarTexto(p.nome).length > 0
  );
}

function montarItemCombo(produto, desconto) {
  const preco = normalizarPreco(produto.preco);
  const precoComDesconto = preco * (1 - desconto / 100);
  const urlImagem = obterUrlImagemProduto(produto);

  return {
    sku: String(produto.codigo || produto.sku || produto.id || produto.firebaseKey || ""),
    firebaseKey: String(produto.firebaseKey || produto.codigo || produto.id || ""),
    nome: produto.nome || "",
    qtd: 1,

    // Campos de imagem individual do produto.
    // Mantive os dois nomes para facilitar no Make e no site.
    url_imagem: urlImagem,
    imagem: urlImagem,

    preco_unitario_original: Number(preco.toFixed(2)),
    preco_unitario_combo: Number(precoComDesconto.toFixed(2)),
    total_original: Number(preco.toFixed(2)),
    total_combo: Number(precoComDesconto.toFixed(2))
  };
}

function criarComboComProdutos(p1, p2, palavra, indice) {
  const desconto = DESCONTOS[Math.floor(Math.random() * DESCONTOS.length)];

  const preco1 = normalizarPreco(p1.preco);
  const preco2 = normalizarPreco(p2.preco);

  const soma = preco1 + preco2;
  const precoCombo = soma * (1 - desconto / 100);
  const economia = soma - precoCombo;
  const agora = new Date();

  const item1 = montarItemCombo(p1, desconto);
  const item2 = montarItemCombo(p2, desconto);

  return {
    id: "COMBO-" + Date.now() + "-" + indice,
    nome: "Combo " + palavra.toUpperCase() + " Especial",
    ativo: true,
    motivo_desativacao: "",
    desconto_percentual: desconto,
    soma_produtos: Number(soma.toFixed(2)),
    preco_combo: Number(precoCombo.toFixed(2)),
    economia: Number(economia.toFixed(2)),
    validade_combo: formatarValidade7Dias(),

    // Imagem principal para manter compatibilidade com o site antigo.
    // Agora ela usa a imagem do primeiro produto, ou do segundo se a primeira faltar.
    url_imagem: item1.url_imagem || item2.url_imagem || "",

    // Cada combo terá obrigatoriamente 2 produtos.
    // Cada produto agora leva sua própria imagem.
    itens: [
      item1,
      item2
    ],

    criado_em: agora.toISOString(),
    last_update: agora.getTime()
  };
}

function criarCombos(produtos) {
  const produtosValidos = produtos.filter(produtoValido);
  const palavrasMisturadas = embaralhar(PALAVRAS_COMBO);
  const combos = [];
  const produtosUsados = new Set();

  for (const palavra of palavrasMisturadas) {
    if (combos.length >= 5) break;

    const palavraNormalizada = normalizarTexto(palavra);

    const candidatos = embaralhar(
      produtosValidos.filter(p => {
        const chave = String(p.codigo || p.sku || p.id || p.firebaseKey || "");
        const nome = normalizarTexto(p.nome);

        return (
          chave &&
          !produtosUsados.has(chave) &&
          nome.includes(palavraNormalizada)
        );
      })
    );

    if (candidatos.length < 2) {
      console.log(`Palavra "${palavra}" ignorada: encontrou ${candidatos.length} produto(s).`);
      continue;
    }

    const p1 = candidatos[0];
    const p2 = candidatos[1];

    const chave1 = String(p1.codigo || p1.sku || p1.id || p1.firebaseKey || "");
    const chave2 = String(p2.codigo || p2.sku || p2.id || p2.firebaseKey || "");

    combos.push(criarComboComProdutos(p1, p2, palavra, combos.length + 1));

    produtosUsados.add(chave1);
    produtosUsados.add(chave2);
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

  console.log(`Produtos carregados do Firebase: ${produtos.length}`);
  console.log(`Combos criados: ${combos.length}`);

  combos.forEach((combo, index) => {
    console.log(`Combo ${index + 1}: ${combo.nome}`);
    console.log(`Produto 1: ${combo.itens[0]?.nome || ""}`);
    console.log(`Imagem 1: ${combo.itens[0]?.url_imagem || ""}`);
    console.log(`Produto 2: ${combo.itens[1]?.nome || ""}`);
    console.log(`Imagem 2: ${combo.itens[1]?.url_imagem || ""}`);
  });

  if (combos.length === 0) {
    console.log("Nenhum combo criado. Nenhuma palavra da lista encontrou pelo menos 2 produtos válidos com estoque e preço.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
