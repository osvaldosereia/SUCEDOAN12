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
  "elseve", "dove", "lixo", "pentear", "bolacha", "facial", "labial",
  "condicionador", "niely", "pantene", "phebo", "paixão", "veja", "copo",
  "plástico", "caldo", "tempero", "maionese", "amendoin", "chocolate", "lacta",
  "nestle", "detergente", "lava roupa", "escova", "cabelo", "unha", "skala",
  "kolene", "pasta", "minuano", "impala", "risque", "rancheiro", "skiny", "frisco", 
  "tang", "passata", "heinz", "doce", "fini", "madeira", "tresemme", "bocal", 
  "refil", "liquido", "cereal", "matinal"
];

const DESCONTOS = [15, 20, 25];

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

  return `../site/img/produtos/${sku}.webp`;
}

function embaralhar(lista) {
  return [...lista].sort(() => Math.random() - 0.5);
}

function pad2(valor) {
  return String(valor).padStart(2, "0");
}

function obterDataCuiaba() {
  const agora = new Date();

  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(agora);

  const mapa = {};
  for (const parte of partes) {
    if (parte.type !== "literal") {
      mapa[parte.type] = parte.value;
    }
  }

  const ano = mapa.year;
  const mes = mapa.month;
  const dia = mapa.day;
  const hora = mapa.hour;
  const minuto = mapa.minute;
  const segundo = mapa.second;

  return {
    iso_utc: agora.toISOString(),
    local: `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}-04:00`,
    ordem: `${ano}${mes}${dia}${hora}${minuto}${segundo}`,
    timestamp: agora.getTime()
  };
}

function formatarValidade7Dias() {
  const data = new Date();
  data.setDate(data.getDate() + 7);
  data.setHours(23, 59, 0, 0);

  const ano = data.getFullYear();
  const mes = pad2(data.getMonth() + 1);
  const dia = pad2(data.getDate());

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

  const datas = obterDataCuiaba();

  const item1 = montarItemCombo(p1, desconto);
  const item2 = montarItemCombo(p2, desconto);

  return {
    id: `COMBO-${datas.ordem}-${indice}`,
    nome: "Combo " + palavra.toUpperCase() + " Especial",
    ativo: true,
    motivo_desativacao: "",
    desconto_percentual: desconto,
    soma_produtos: Number(soma.toFixed(2)),
    preco_combo: Number(precoCombo.toFixed(2)),
    economia: Number(economia.toFixed(2)),
    validade_combo: formatarValidade7Dias(),

    url_imagem: item1.url_imagem || item2.url_imagem || "",

    itens: [
      item1,
      item2
    ],

    criado_em: datas.iso_utc,
    criado_em_local: datas.local,
    criado_em_ordem: datas.ordem,
    last_update: datas.timestamp
  };
}

function criarCombos(produtos, quantidade = 1) {
  const produtosValidos = produtos.filter(produtoValido);
  const palavrasMisturadas = embaralhar(PALAVRAS_COMBO);
  const combos = [];
  const produtosUsados = new Set();

  for (const palavra of palavrasMisturadas) {
    if (combos.length >= quantidade) break;

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

function carregarCombosExistentes(arquivo) {
  if (!fs.existsSync(arquivo)) {
    return [];
  }

  try {
    const conteudoAtual = fs.readFileSync(arquivo, "utf8").trim();

    if (!conteudoAtual) {
      return [];
    }

    const dadosAtuais = JSON.parse(conteudoAtual);

    if (Array.isArray(dadosAtuais)) {
      return dadosAtuais.filter(Boolean);
    }

    return [];
  } catch (erro) {
    console.log("Não foi possível ler o combo.json atual. Um novo arquivo será criado.");
    console.log("Erro:", erro.message);
    return [];
  }
}

function comboAindaValido(combo) {
  if (!combo) return false;

  if (combo.ativo === false) return false;

  if (!combo.validade_combo) return true;

  const validade = new Date(combo.validade_combo);

  if (Number.isNaN(validade.getTime())) {
    return true;
  }

  const agora = new Date();

  return validade >= agora;
}

function removerCombosDuplicados(combos) {
  const vistos = new Set();
  const resultado = [];

  for (const combo of combos) {
    const chave = String(combo.id || "").trim();

    if (!chave) {
      resultado.push(combo);
      continue;
    }

    if (vistos.has(chave)) {
      continue;
    }

    vistos.add(chave);
    resultado.push(combo);
  }

  return resultado;
}

function obterValorOrdenacaoCombo(combo) {
  if (!combo) return "0";

  if (combo.criado_em_ordem) {
    return String(combo.criado_em_ordem);
  }

  if (combo.last_update) {
    return String(combo.last_update);
  }

  if (combo.criado_em) {
    const data = new Date(combo.criado_em);
    if (!Number.isNaN(data.getTime())) {
      return String(data.getTime());
    }
  }

  return "0";
}

function ordenarCombosMaisRecentesPrimeiro(combos) {
  return [...combos].sort((a, b) => {
    const valorA = obterValorOrdenacaoCombo(a);
    const valorB = obterValorOrdenacaoCombo(b);

    if (valorA < valorB) return 1;
    if (valorA > valorB) return -1;
    return 0;
  });
}

async function main() {
  const produtos = await carregarProdutos();

  const pasta = path.join(process.cwd(), "site");

  if (!fs.existsSync(pasta)) {
    fs.mkdirSync(pasta, { recursive: true });
  }

  const arquivo = path.join(pasta, "combo.json");

  const combosExistentes = carregarCombosExistentes(arquivo);

  const combosAindaValidos = combosExistentes.filter(comboAindaValido);

  // Cria apenas 1 combo novo por execução.
  // O GitHub Actions pode rodar várias vezes ao dia.
  // Cada combo novo agora recebe criado_em_ordem para o Make identificar o mais recente.
  const combosNovos = criarCombos(produtos, 1);

  const todosCombos = ordenarCombosMaisRecentesPrimeiro(
    removerCombosDuplicados([
      ...combosNovos,
      ...combosAindaValidos
    ])
  );

  fs.writeFileSync(arquivo, JSON.stringify(todosCombos, null, 2), "utf8");

  console.log(`Produtos carregados do Firebase: ${produtos.length}`);
  console.log(`Combos existentes antes da limpeza: ${combosExistentes.length}`);
  console.log(`Combos ainda válidos mantidos: ${combosAindaValidos.length}`);
  console.log(`Combos vencidos ou inativos removidos: ${combosExistentes.length - combosAindaValidos.length}`);
  console.log(`Combos novos criados nesta execução: ${combosNovos.length}`);
  console.log(`Total salvo no combo.json: ${todosCombos.length}`);

  combosNovos.forEach((combo, index) => {
    console.log(`Combo novo ${index + 1}: ${combo.nome}`);
    console.log(`ID: ${combo.id}`);
    console.log(`Criado em UTC: ${combo.criado_em}`);
    console.log(`Criado em Cuiabá: ${combo.criado_em_local}`);
    console.log(`Ordem Make: ${combo.criado_em_ordem}`);
    console.log(`Produto 1: ${combo.itens[0]?.nome || ""}`);
    console.log(`Imagem 1: ${combo.itens[0]?.url_imagem || ""}`);
    console.log(`Produto 2: ${combo.itens[1]?.nome || ""}`);
    console.log(`Imagem 2: ${combo.itens[1]?.url_imagem || ""}`);
  });

  if (combosNovos.length === 0) {
    console.log("Nenhum combo novo criado. Nenhuma palavra da lista encontrou pelo menos 2 produtos válidos com estoque e preço.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
