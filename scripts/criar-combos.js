const fs = require("fs");
const path = require("path");

const FIREBASE_URL = process.env.FIREBASE_URL;

if (!FIREBASE_URL) {
  throw new Error("FIREBASE_URL não configurado nos Secrets do GitHub.");
}

const QUANTIDADE_COMBOS_POR_EXECUCAO = 1;
const MAX_COMBOS_ATIVOS = 100;
const DIAS_VALIDADE_COMBO = 3;
const DESCONTOS = [10, 14, 18];

function c(id, nome, produto1, produto2) {
  return { id, nome, produto1, produto2 };
}

const COMBINACOES_COMBO = [
  c("desodorante-sabonete-liquido", "Combo Banho Perfumado", ["desodorante"], ["sabonete liquido", "sabonete líquido"]),
  c("nivea-sabonete", "Combo Nivea Cuidado", ["nivea"], ["sabonete"]),
  c("nivea-hidratante", "Combo Hidratação Nivea", ["nivea"], ["hidratante"]),
  c("monange-sabonete", "Combo Monange Banho", ["monange"], ["sabonete"]),
  c("palmolive-desodorante", "Combo Palmolive Diário", ["palmolive"], ["desodorante"]),
  c("dove-desodorante", "Combo Dove Cuidado", ["dove"], ["desodorante"]),
  c("sabonete-hidratante", "Combo Pele Macia", ["sabonete"], ["hidratante"]),
  c("sabonete-algodao", "Combo Cuidado Suave", ["sabonete"], ["algodao", "algodão"]),
  c("sabonete-facial", "Combo Rosto Limpo", ["sabonete"], ["facial", "gel de limpeza"]),
  c("hidratante-facial", "Combo Skincare Básico", ["hidratante"], ["facial"]),
  c("absorvente-sabonete", "Combo Cuidado Feminino", ["absorvente"], ["sabonete"]),
  c("absorvente-algodao", "Combo Proteção Feminina", ["absorvente"], ["algodao", "algodão"]),
  c("barbeador-desodorante", "Combo Cuidado Masculino", ["barbeador", "aparelho barbear"], ["desodorante"]),
  c("barbeador-sabonete", "Combo Barbear e Banho", ["barbeador", "aparelho barbear"], ["sabonete"]),
  c("creme-dental-escova", "Combo Higiene Bucal", ["creme dental", "pasta dental", "colgate"], ["escova de dente", "escova dental"]),
  c("colgate-fio-dental", "Combo Sorriso Protegido", ["colgate", "creme dental"], ["fio dental"]),
  c("fio-dental-escova", "Combo Boca Saudável", ["fio dental"], ["escova de dente", "escova dental"]),
  c("enxaguante-creme-dental", "Combo Hálito Fresco", ["enxaguante", "antisseptico bucal", "antisséptico bucal"], ["creme dental", "colgate"]),
  c("carmed-fini", "Combo Carmed Fini", ["carmed"], ["fini"]),
  c("protetor-labial-sabonete", "Combo Cuidado Essencial", ["protetor labial", "labial"], ["sabonete"]),
  c("talco-sabonete", "Combo Pós-Banho", ["talco"], ["sabonete"]),
  c("shampoo-condicionador", "Combo Cabelo Completo", ["shampoo"], ["condicionador"]),
  c("shampoo-creme-pentear", "Combo Cabelo Hidratado", ["shampoo"], ["creme para pentear", "creme pentear", "pentear"]),
  c("condicionador-creme-pentear", "Combo Finalização Capilar", ["condicionador"], ["creme para pentear", "creme pentear", "pentear"]),
  c("seda-condicionador", "Combo Seda Completo", ["seda", "shampoo seda"], ["condicionador seda", "creme seda"]),
  c("seda-creme-pentear", "Combo Seda Finalização", ["seda"], ["creme para pentear", "pentear"]),
  c("lola-condicionador", "Combo Lola Cabelos", ["lola", "shampoo lola"], ["condicionador lola", "creme lola"]),
  c("lola-tratamento", "Combo Lola Tratamento", ["lola"], ["tratamento", "mascara", "máscara", "creme"]),
  c("elseve-condicionador", "Combo Elseve Completo", ["elseve", "shampoo elseve"], ["condicionador elseve", "creme elseve"]),
  c("elseve-tratamento", "Combo Elseve Tratamento", ["elseve"], ["tratamento", "creme de tratamento", "mascara", "máscara"]),
  c("dove-cabelo", "Combo Dove Cabelos", ["dove", "shampoo dove"], ["condicionador dove", "kit shampoo"]),
  c("pantene-condicionador", "Combo Pantene Pro-V", ["pantene"], ["condicionador", "shampoo"]),
  c("skala-creme-pentear", "Combo Skala Finalização", ["skala"], ["creme para pentear", "pentear"]),
  c("skala-tratamento", "Combo Skala Tratamento", ["skala"], ["tratamento", "creme"]),
  c("novex-tratamento", "Combo Novex Profundo", ["novex"], ["tratamento", "creme"]),
  c("garnier-cabelo", "Combo Garnier Cuidado", ["garnier"], ["shampoo", "condicionador", "creme"]),
  c("tresemme-condicionador", "Combo Tresemmé Salão", ["tresemme", "tresseme", "tresemmé"], ["condicionador", "shampoo"]),
  c("niely-creme-pentear", "Combo Niely Finalização", ["niely"], ["creme para pentear", "pentear"]),
  c("kolene-creme-pentear", "Combo Kolene Cabelos", ["kolene"], ["creme para pentear", "pentear"]),
  c("escova-creme-pentear", "Combo Pentear Fácil", ["escova de cabelo", "escova cabelo"], ["creme para pentear", "pentear"]),
  c("tratamento-condicionador", "Combo Nutrição Capilar", ["tratamento", "mascara", "máscara"], ["condicionador"]),
  c("cachos-creme-pentear", "Combo Cachos Definidos", ["cachos", "cacheado"], ["creme para pentear", "pentear"]),
  c("liso-creme-pentear", "Combo Liso Perfeito", ["liso"], ["creme para pentear", "pentear"]),
  c("macarrao-tomate", "Combo Macarronada", ["macarrao", "macarrão"], ["molho de tomate", "tomate", "passata"]),
  c("macarrao-molho", "Combo Massa Prática", ["macarrao", "macarrão"], ["molho"]),
  c("macarrao-maionese", "Combo Massa Cremosa", ["macarrao", "macarrão"], ["maionese"]),
  c("tomate-tempero", "Combo Molho Temperado", ["molho de tomate", "tomate", "passata"], ["tempero"]),
  c("tomate-caldo", "Combo Sabor Caseiro", ["molho de tomate", "tomate"], ["caldo"]),
  c("maionese-catchup", "Combo Lanche Fácil", ["maionese"], ["catchup", "ketchup"]),
  c("catchup-mostarda", "Combo Hot Dog", ["catchup", "ketchup"], ["mostarda"]),
  c("maionese-mostarda", "Combo Molhos Especiais", ["maionese"], ["mostarda"]),
  c("heinz-catchup", "Combo Heinz Lanche", ["heinz"], ["catchup", "ketchup"]),
  c("heinz-mostarda", "Combo Heinz Hot Dog", ["heinz"], ["mostarda"]),
  c("hellmanns-catchup", "Combo Hellmanns Lanche", ["hellmanns", "hellmann's", "hellmann"], ["catchup", "ketchup"]),
  c("sardinha-tomate", "Combo Sardinha com Molho", ["sardinha"], ["molho de tomate", "tomate"]),
  c("atum-maionese", "Combo Patê Fácil", ["atum"], ["maionese"]),
  c("milho-maionese", "Combo Salada Cremosa", ["milho"], ["maionese"]),
  c("ervilha-maionese", "Combo Salada Especial", ["ervilha"], ["maionese"]),
  c("tempero-caldo", "Combo Tempero Completo", ["tempero"], ["caldo"]),
  c("sal-tempero", "Combo Cozinha Temperada", ["sal"], ["tempero"]),
  c("alho-tempero", "Combo Refogado Prático", ["alho"], ["tempero"]),
  c("cebola-tempero", "Combo Sabor do Dia", ["cebola"], ["tempero"]),
  c("batata-maionese", "Combo Batata Cremosa", ["batata"], ["maionese"]),
  c("batata-palha-catchup", "Combo Batata Crocante", ["batata palha", "batata"], ["catchup", "ketchup"]),
  c("pipoca-refrigerante", "Combo Sessão Cinema", ["pipoca"], ["refrigerante", "guarana", "guaraná", "coca"]),
  c("pipoca-chocolate", "Combo Cinema Doce", ["pipoca"], ["chocolate"]),
  c("amendoim-refrigerante", "Combo Petisco", ["amendoim", "amendoin"], ["refrigerante", "guarana", "guaraná"]),
  c("biscoito-suco", "Combo Lanche Infantil", ["biscoito", "bolacha"], ["suco", "refresco"]),
  c("bolacha-achocolatado", "Combo Lanche Doce", ["bolacha", "biscoito"], ["achocolatado"]),
  c("rosquinha-achocolatado", "Combo Rosquinha Doce", ["rosquinha"], ["achocolatado"]),
  c("cereal-achocolatado", "Combo Matinal Doce", ["cereal", "matinal"], ["achocolatado"]),
  c("suco-bolacha", "Combo Lanche Econômico", ["suco", "tang", "frisco"], ["bolacha", "biscoito"]),
  c("tang-bolacha", "Combo Refresco com Bolacha", ["tang", "frisco", "suco po", "suco pó"], ["bolacha", "biscoito"]),
  c("chocolate-oreo", "Combo Chocolate Oreo", ["chocolate"], ["oreo"]),
  c("lacta-oreo", "Combo Lacta Oreo", ["lacta"], ["oreo"]),
  c("garoto-bis", "Combo Garoto Bis", ["garoto"], ["bis"]),
  c("fini-chocolate", "Combo Doces Favoritos", ["fini"], ["chocolate"]),
  c("gelatina-creme", "Combo Sobremesa Fácil", ["gelatina"], ["creme"]),
  c("doce-bolacha", "Combo Doce da Tarde", ["doce"], ["bolacha", "biscoito"]),
  c("detergente-esponja", "Combo Louça Limpa", ["detergente", "lava louça", "lava louca"], ["esponja"]),
  c("detergente-pano", "Combo Cozinha Limpa", ["detergente", "lava louça", "lava louca"], ["pano"]),
  c("sabao-amaciante", "Combo Roupa Cheirosa", ["sabao", "sabão", "lava roupa"], ["amaciante"]),
  c("sabao-tira-manchas", "Combo Lavanderia", ["sabao", "sabão", "lava roupa"], ["tira manchas", "vanish"]),
  c("omo-amaciante", "Combo OMO Lavanderia", ["omo"], ["amaciante"]),
  c("brilhante-amaciante", "Combo Brilhante Roupas", ["brilhante"], ["amaciante"]),
  c("minuano-detergente-esponja", "Combo Minuano Louça", ["minuano"], ["esponja", "detergente"]),
  c("desinfetante-pano", "Combo Casa Limpa", ["desinfetante"], ["pano"]),
  c("veja-pano", "Combo Limpeza Pesada", ["veja", "limpador"], ["pano"]),
  c("alcool-pano", "Combo Higienização", ["alcool", "álcool"], ["pano"]),
  c("lixo-desinfetante", "Combo Área de Serviço", ["lixo", "saco de lixo"], ["desinfetante"]),
  c("vassoura-pano", "Combo Faxina Rápida", ["vassoura"], ["pano"]),
  c("rodo-pano", "Combo Piso Limpo", ["rodo"], ["pano"]),
  c("papel-higienico-sabonete", "Combo Banheiro Básico", ["papel higienico", "papel higiênico"], ["sabonete"]),
  c("multiuso-pano", "Combo Multiuso", ["multiuso", "limpador"], ["pano"]),
  c("cloro-pano", "Combo Limpeza Forte", ["cloro", "agua sanitaria", "água sanitária"], ["pano"]),
  c("copo-suco", "Combo Refresco", ["copo"], ["suco", "refresco"]),
  c("jarra-suco", "Combo Servir Bebidas", ["jarra"], ["suco", "refresco"]),
  c("garrafa-suco", "Combo Hidratação", ["garrafa"], ["suco", "refresco"]),
  c("prato-copo", "Combo Mesa Prática", ["prato"], ["copo"]),
  c("pote-plastico", "Combo Organização", ["pote"], ["plastico", "plástico"]),
];

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarPreco(valor) {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor).trim();
  if (!texto) return 0;

  texto = texto.replace(/[R$\s]/g, "").trim();
  if (!texto) return 0;

  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(texto)) return parseFloat(texto.replace(/\./g, "").replace(",", ".")) || 0;
  if (/^\d+,\d{1,2}$/.test(texto)) return parseFloat(texto.replace(",", ".")) || 0;
  if (/^\d+\.\d{1,2}$/.test(texto)) return parseFloat(texto) || 0;
  if (/^\d+$/.test(texto)) return parseFloat(texto) || 0;

  return parseFloat(texto.replace(",", ".")) || 0;
}

function obterNomeProdutoNormalizado(produto) {
  return normalizarTexto(produto.nome || produto.descricao || produto.descrição || produto["Descrição"] || produto.titulo || "");
}

function escaparRegex(valor) {
  return String(valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textoContemChave(textoNormalizado, chave) {
  const chaveNormalizada = normalizarTexto(chave);
  if (!chaveNormalizada) return false;

  if (chaveNormalizada.includes(" ")) return textoNormalizado.includes(chaveNormalizada);

  const regex = new RegExp(`(^|[^a-z0-9])${escaparRegex(chaveNormalizada)}([^a-z0-9]|$)`, "i");
  return regex.test(textoNormalizado);
}

function produtoCorrespondeAsChaves(produto, chaves) {
  const nome = obterNomeProdutoNormalizado(produto);
  return chaves.some(chave => textoContemChave(nome, chave));
}

function obterChaveProduto(produto) {
  return String(produto.codigo || produto.sku || produto.id || produto.firebaseKey || "").trim();
}

function obterUrlImagemProduto(produto) {
  if (!produto) return "";

  const imagem = produto.url_imagem || produto.imagem || produto.image || produto.img || produto.foto || produto.url_foto || produto.imageUrl || produto.urlImagem || produto.link_imagem || produto.linkImagem || produto.foto_url || produto.fotoUrl || "";
  if (imagem) return String(imagem).trim();

  const sku = obterChaveProduto(produto);
  if (!sku) return "";

  return `../site/img/produtos/${sku}.webp`;
}

function embaralhar(lista) {
  return [...lista].sort(() => Math.random() - 0.5);
}

function pad2(valor) {
  return String(valor).padStart(2, "0");
}

function obterDataCuiaba(dataBase = new Date()) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(dataBase);

  const mapa = {};
  for (const parte of partes) {
    if (parte.type !== "literal") mapa[parte.type] = parte.value;
  }

  return {
    iso_utc: dataBase.toISOString(),
    local: `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:${mapa.minute}:${mapa.second}-04:00`,
    ordem: `${mapa.year}${mapa.month}${mapa.day}${mapa.hour}${mapa.minute}${mapa.second}`,
    timestamp: dataBase.getTime()
  };
}

function formatarValidadeDias(dias = DIAS_VALIDADE_COMBO) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  data.setHours(23, 59, 0, 0);

  const ano = data.getFullYear();
  const mes = pad2(data.getMonth() + 1);
  const dia = pad2(data.getDate());

  return `${ano}-${mes}-${dia}T23:59`;
}

function obterTimestampValidade(combo) {
  if (!combo || !combo.validade_combo) return 0;

  const texto = String(combo.validade_combo);
  const data = new Date(texto);
  if (!Number.isNaN(data.getTime())) return data.getTime();

  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return 0;

  const [, ano, mes, dia, hora, minuto] = match;
  return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), 0, 0).getTime();
}

async function carregarProdutos() {
  const url = FIREBASE_URL.replace(/\/$/, "") + "/produtos.json";
  const res = await fetch(url);

  if (!res.ok) throw new Error("Erro ao ler Firebase: HTTP " + res.status);

  const dados = await res.json();
  if (!dados) return [];

  if (Array.isArray(dados)) {
    return dados.filter(Boolean).map((produto, index) => ({
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
  return p && !p._deleted && String(p.situacao || "A").toUpperCase() !== "I" && normalizarPreco(p.preco) > 0 && normalizarPreco(p.estoque) > 0 && obterNomeProdutoNormalizado(p).length > 0;
}

function montarItemCombo(produto, desconto) {
  const preco = normalizarPreco(produto.preco);
  const precoComDesconto = preco * (1 - desconto / 100);
  const urlImagem = obterUrlImagemProduto(produto);

  return {
    sku: String(produto.codigo || produto.sku || produto.id || produto.firebaseKey || ""),
    firebaseKey: String(produto.firebaseKey || produto.codigo || produto.id || ""),
    nome: produto.nome || produto.descricao || produto.descrição || "",
    qtd: 1,
    url_imagem: urlImagem,
    imagem: urlImagem,
    preco_unitario_original: Number(preco.toFixed(2)),
    preco_unitario_combo: Number(precoComDesconto.toFixed(2)),
    total_original: Number(preco.toFixed(2)),
    total_combo: Number(precoComDesconto.toFixed(2))
  };
}

function escolherProdutoPorChaves(produtosValidos, chaves, produtosUsados) {
  const candidatos = embaralhar(produtosValidos.filter(produto => {
    const chave = obterChaveProduto(produto);
    return chave && !produtosUsados.has(chave) && produtoCorrespondeAsChaves(produto, chaves);
  }));

  return candidatos[0] || null;
}

function criarComboComProdutos(p1, p2, combinacao, indice, cicloCombinacoes) {
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
    nome: combinacao.nome || "Combo Especial",
    ativo: true,
    motivo_desativacao: "",
    desconto_percentual: desconto,
    soma_produtos: Number(soma.toFixed(2)),
    preco_combo: Number(precoCombo.toFixed(2)),
    economia: Number(economia.toFixed(2)),
    validade_combo: formatarValidadeDias(DIAS_VALIDADE_COMBO),
    validade_dias: DIAS_VALIDADE_COMBO,
    combinacao_id: combinacao.id,
    combinacao_nome: combinacao.nome,
    palavra_produto_1: combinacao.produto1,
    palavra_produto_2: combinacao.produto2,
    ciclo_combinacoes: cicloCombinacoes || 1,
    url_imagem: item1.url_imagem || item2.url_imagem || "",
    itens: [item1, item2],
    criado_em: datas.iso_utc,
    criado_em_local: datas.local,
    criado_em_ordem: datas.ordem,
    last_update: datas.timestamp
  };
}

function obterCombinacoesUnicas() {
  const vistas = new Set();
  const resultado = [];

  for (const combinacao of COMBINACOES_COMBO) {
    const id = normalizarTexto(combinacao.id || combinacao.nome);
    if (!id || vistas.has(id)) continue;
    vistas.add(id);
    resultado.push(combinacao);
  }

  return resultado;
}

function carregarHistoricoCombinacoes(arquivo) {
  if (!fs.existsSync(arquivo)) return { usadas: [], ciclo: 1, atualizado_em: null };

  try {
    const conteudo = fs.readFileSync(arquivo, "utf8").trim();
    if (!conteudo) return { usadas: [], ciclo: 1, atualizado_em: null };
    const dados = JSON.parse(conteudo);

    return {
      usadas: Array.isArray(dados.usadas) ? dados.usadas.map(normalizarTexto).filter(Boolean) : [],
      ciclo: Number(dados.ciclo || 1),
      atualizado_em: dados.atualizado_em || null
    };
  } catch (erro) {
    console.log("Não foi possível ler o histórico de combinações. Um novo histórico será iniciado.");
    console.log("Erro:", erro.message);
    return { usadas: [], ciclo: 1, atualizado_em: null };
  }
}

function salvarHistoricoCombinacoes(arquivo, historico) {
  const permitidas = new Set(obterCombinacoesUnicas().map(c => normalizarTexto(c.id || c.nome)));
  const usadasLimpas = Array.from(new Set(Array.isArray(historico.usadas) ? historico.usadas.map(normalizarTexto).filter(Boolean) : [])).filter(id => permitidas.has(id));

  const dados = {
    usadas: usadasLimpas,
    ciclo: Number(historico.ciclo || 1),
    total_combinacoes_unicas: permitidas.size,
    atualizado_em: new Date().toISOString()
  };

  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), "utf8");
}

function obterCombinacoesDisponiveis(historico) {
  const combinacoesUnicas = obterCombinacoesUnicas();
  const permitidas = new Set(combinacoesUnicas.map(c => normalizarTexto(c.id || c.nome)));

  historico.usadas = Array.from(new Set(Array.isArray(historico.usadas) ? historico.usadas.map(normalizarTexto).filter(Boolean) : [])).filter(id => permitidas.has(id));

  const usadasSet = new Set(historico.usadas);
  let disponiveis = combinacoesUnicas.filter(combinacao => !usadasSet.has(normalizarTexto(combinacao.id || combinacao.nome)));

  if (disponiveis.length === 0) {
    historico.usadas = [];
    historico.ciclo = Number(historico.ciclo || 1) + 1;
    disponiveis = combinacoesUnicas;
    console.log("Todas as combinações já foram usadas. Iniciando novo ciclo:", historico.ciclo);
  }

  return disponiveis;
}

function marcarCombinacaoComoUsada(historico, combinacao) {
  const id = normalizarTexto(combinacao.id || combinacao.nome);
  if (!id) return;
  if (!Array.isArray(historico.usadas)) historico.usadas = [];
  if (!historico.usadas.includes(id)) historico.usadas.push(id);
}

function criarCombos(produtos, quantidade = 1, historicoCombinacoes = null) {
  const produtosValidos = produtos.filter(produtoValido);
  const combos = [];
  const produtosUsados = new Set();
  const historico = historicoCombinacoes || { usadas: [], ciclo: 1, atualizado_em: null };
  const combinacoesMisturadas = embaralhar(obterCombinacoesDisponiveis(historico));

  for (const combinacao of combinacoesMisturadas) {
    if (combos.length >= quantidade) break;

    const p1 = escolherProdutoPorChaves(produtosValidos, combinacao.produto1, produtosUsados);
    if (!p1) {
      console.log(`Combinação "${combinacao.nome}" ignorada: não encontrou produto 1 com chaves: ${combinacao.produto1.join(", ")}`);
      continue;
    }

    const chave1 = obterChaveProduto(p1);
    const p2 = escolherProdutoPorChaves(produtosValidos, combinacao.produto2, new Set([...produtosUsados, chave1]));
    if (!p2) {
      console.log(`Combinação "${combinacao.nome}" ignorada: encontrou produto 1, mas não encontrou produto 2 com chaves: ${combinacao.produto2.join(", ")}`);
      continue;
    }

    const chave2 = obterChaveProduto(p2);
    combos.push(criarComboComProdutos(p1, p2, combinacao, combos.length + 1, historico.ciclo));
    produtosUsados.add(chave1);
    produtosUsados.add(chave2);
    marcarCombinacaoComoUsada(historico, combinacao);
  }

  return combos;
}

function carregarCombosExistentes(arquivo) {
  if (!fs.existsSync(arquivo)) return [];

  try {
    const conteudoAtual = fs.readFileSync(arquivo, "utf8").trim();
    if (!conteudoAtual) return [];
    const dadosAtuais = JSON.parse(conteudoAtual);
    return Array.isArray(dadosAtuais) ? dadosAtuais.filter(Boolean) : [];
  } catch (erro) {
    console.log("Não foi possível ler o combo.json atual. Um novo arquivo será criado.");
    console.log("Erro:", erro.message);
    return [];
  }
}

function comboAindaValido(combo) {
  if (!combo) return false;
  if (combo.ativo === false) return false;
  const timestampValidade = obterTimestampValidade(combo);
  if (!timestampValidade) return false;
  return timestampValidade >= Date.now();
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
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(combo);
  }

  return resultado;
}

function obterValorOrdenacaoCombo(combo) {
  if (!combo) return "0";
  if (combo.criado_em_ordem) return String(combo.criado_em_ordem);
  if (combo.last_update) return String(combo.last_update);

  if (combo.criado_em) {
    const data = new Date(combo.criado_em);
    if (!Number.isNaN(data.getTime())) return String(data.getTime());
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

function limitarCombosAtivos(combos, limite = MAX_COMBOS_ATIVOS) {
  if (!Number.isFinite(limite) || limite <= 0) return combos;
  return combos.slice(0, limite);
}

async function main() {
  const produtos = await carregarProdutos();

  const pasta = path.join(process.cwd(), "site");
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });

  const arquivo = path.join(pasta, "combo.json");
  const arquivoHistoricoCombinacoes = path.join(pasta, "combinacoes-combo-usadas.json");

  const combosExistentes = carregarCombosExistentes(arquivo);
  const combosAindaValidos = combosExistentes.filter(comboAindaValido);
  const combosRemovidos = combosExistentes.length - combosAindaValidos.length;

  const historicoCombinacoes = carregarHistoricoCombinacoes(arquivoHistoricoCombinacoes);
  const combosNovos = criarCombos(produtos, QUANTIDADE_COMBOS_POR_EXECUCAO, historicoCombinacoes);

  const todosCombos = limitarCombosAtivos(
    ordenarCombosMaisRecentesPrimeiro(
      removerCombosDuplicados([...combosNovos, ...combosAindaValidos])
    ),
    MAX_COMBOS_ATIVOS
  );

  fs.writeFileSync(arquivo, JSON.stringify(todosCombos, null, 2), "utf8");
  salvarHistoricoCombinacoes(arquivoHistoricoCombinacoes, historicoCombinacoes);

  console.log(`Produtos carregados do Firebase: ${produtos.length}`);
  console.log(`Produtos válidos para combo: ${produtos.filter(produtoValido).length}`);
  console.log(`Total de combinações cadastradas: ${obterCombinacoesUnicas().length}`);
  console.log(`Combos existentes antes da limpeza: ${combosExistentes.length}`);
  console.log(`Combos ainda válidos mantidos: ${combosAindaValidos.length}`);
  console.log(`Combos vencidos, inválidos ou inativos apagados automaticamente: ${combosRemovidos}`);
  console.log(`Combos novos criados nesta execução: ${combosNovos.length}`);
  console.log(`Total salvo no combo.json: ${todosCombos.length}`);
  console.log(`Validade máxima de cada combo novo: ${DIAS_VALIDADE_COMBO} dias`);
  console.log(`Limite máximo de combos ativos no arquivo: ${MAX_COMBOS_ATIVOS}`);
  console.log(`Ciclo de combinações: ${historicoCombinacoes.ciclo}`);
  console.log(`Combinações já usadas neste ciclo: ${historicoCombinacoes.usadas.length}/${obterCombinacoesUnicas().length}`);
  console.log("Histórico salvo em: site/combinacoes-combo-usadas.json");

  combosNovos.forEach((combo, index) => {
    console.log(`Combo novo ${index + 1}: ${combo.nome}`);
    console.log(`ID: ${combo.id}`);
    console.log(`Combinação usada: ${combo.combinacao_nome}`);
    console.log(`ID da combinação: ${combo.combinacao_id}`);
    console.log(`Validade: ${combo.validade_combo}`);
    console.log(`Produto 1: ${combo.itens[0]?.nome || ""}`);
    console.log(`Produto 2: ${combo.itens[1]?.nome || ""}`);
    console.log(`Preço combo: ${combo.preco_combo}`);
  });

  if (combosNovos.length === 0) {
    console.log("Nenhum combo novo criado.");
    console.log("Motivo provável: nenhuma combinação disponível encontrou os 2 produtos necessários com estoque e preço.");
    console.log("O histórico de combinações não avança para combinações que não geraram combo.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
