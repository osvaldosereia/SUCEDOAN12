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

/*
  Agora cada combo é formado por 2 produtos da MESMA subcategoria.
  O script não usa mais palavras-chave, categoria ou subsubcategoria.
  Ele lê os produtos do Firebase e monta automaticamente a lista de subcategorias elegíveis.
*/

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

function obterChaveProduto(produto) {
  return String(produto.codigo || produto.sku || produto.id || produto.firebaseKey || "").trim();
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

  return new Date(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    0,
    0
  ).getTime();
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

function produtoValido(produto) {
  return (
    produto &&
    !produto._deleted &&
    String(produto.situacao || "A").toUpperCase() !== "I" &&
    normalizarPreco(produto.preco) > 0 &&
    normalizarPreco(produto.estoque) > 0 &&
    obterNomeProdutoNormalizado(produto).length > 0
  );
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

function obterSubcategoriaProduto(produto) {
  return String(
    produto?.subcategoria ||
    produto?.subCategoria ||
    produto?.sub_category ||
    ""
  ).trim();
}

function obterSubcategoriasElegiveis(produtosValidos) {
  const mapa = new Map();

  for (const produto of produtosValidos) {
    const nomeSubcategoria = obterSubcategoriaProduto(produto);
    const idSubcategoria = normalizarTexto(nomeSubcategoria);
    const chaveProduto = obterChaveProduto(produto);

    if (!idSubcategoria || !chaveProduto) continue;

    if (!mapa.has(idSubcategoria)) {
      mapa.set(idSubcategoria, {
        id: idSubcategoria,
        nome: nomeSubcategoria.toUpperCase(),
        produtos: []
      });
    }

    mapa.get(idSubcategoria).produtos.push(produto);
  }

  return Array.from(mapa.values())
    .filter(subcategoria => subcategoria.produtos.length >= 2)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function escolherDoisProdutosDaSubcategoria(subcategoria, produtosUsados) {
  const candidatos = embaralhar(
    subcategoria.produtos.filter(produto => {
      const chave = obterChaveProduto(produto);
      return chave && !produtosUsados.has(chave);
    })
  );

  if (candidatos.length < 2) return null;

  return [candidatos[0], candidatos[1]];
}

function criarComboComProdutos(produto1, produto2, subcategoria, indice, cicloCombinacoes) {
  const desconto = DESCONTOS[Math.floor(Math.random() * DESCONTOS.length)];

  const preco1 = normalizarPreco(produto1.preco);
  const preco2 = normalizarPreco(produto2.preco);
  const soma = preco1 + preco2;
  const precoCombo = soma * (1 - desconto / 100);
  const economia = soma - precoCombo;

  const datas = obterDataCuiaba();

  const item1 = montarItemCombo(produto1, desconto);
  const item2 = montarItemCombo(produto2, desconto);

  const nomeSubcategoria = subcategoria?.nome || obterSubcategoriaProduto(produto1) || "Especial";

  return {
    id: `COMBO-${datas.ordem}-${indice}`,
    nome: `Combo ${nomeSubcategoria}`,
    ativo: true,
    motivo_desativacao: "",
    desconto_percentual: desconto,
    soma_produtos: Number(soma.toFixed(2)),
    preco_combo: Number(precoCombo.toFixed(2)),
    economia: Number(economia.toFixed(2)),
    validade_combo: formatarValidadeDias(DIAS_VALIDADE_COMBO),
    validade_dias: DIAS_VALIDADE_COMBO,
    combinacao_id: subcategoria.id,
    combinacao_nome: nomeSubcategoria,
    subcategoria_combo: nomeSubcategoria,
    regra_combo: "2 produtos da mesma subcategoria",
    ciclo_combinacoes: cicloCombinacoes || 1,
    url_imagem: item1.url_imagem || item2.url_imagem || "",
    itens: [item1, item2],
    criado_em: datas.iso_utc,
    criado_em_local: datas.local,
    criado_em_ordem: datas.ordem,
    last_update: datas.timestamp
  };
}

function carregarHistoricoCombinacoes(arquivo) {
  if (!fs.existsSync(arquivo)) {
    return {
      usadas: [],
      ciclo: 1,
      atualizado_em: null
    };
  }

  try {
    const conteudo = fs.readFileSync(arquivo, "utf8").trim();

    if (!conteudo) {
      return {
        usadas: [],
        ciclo: 1,
        atualizado_em: null
      };
    }

    const dados = JSON.parse(conteudo);

    return {
      usadas: Array.isArray(dados.usadas)
        ? dados.usadas.map(normalizarTexto).filter(Boolean)
        : [],
      ciclo: Number(dados.ciclo || 1),
      atualizado_em: dados.atualizado_em || null
    };
  } catch (erro) {
    console.log("Não foi possível ler o histórico de combinações. Um novo histórico será iniciado.");
    console.log("Erro:", erro.message);

    return {
      usadas: [],
      ciclo: 1,
      atualizado_em: null
    };
  }
}

function salvarHistoricoCombinacoes(arquivo, historico, subcategoriasElegiveis = []) {
  const permitidas = new Set(
    subcategoriasElegiveis.map(subcategoria =>
      normalizarTexto(subcategoria.id || subcategoria.nome)
    )
  );

  const usadasLimpas = Array.from(
    new Set(
      Array.isArray(historico.usadas)
        ? historico.usadas.map(normalizarTexto).filter(Boolean)
        : []
    )
  ).filter(id => permitidas.size === 0 || permitidas.has(id));

  const dados = {
    usadas: usadasLimpas,
    ciclo: Number(historico.ciclo || 1),
    total_combinacoes_unicas: permitidas.size,
    tipo_combinacao: "subcategoria",
    regra: "cada combo usa 2 produtos válidos da mesma subcategoria",
    atualizado_em: new Date().toISOString()
  };

  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), "utf8");
}

function obterCombinacoesDisponiveis(historico, produtosValidos = []) {
  const subcategoriasElegiveis = obterSubcategoriasElegiveis(produtosValidos);

  const permitidas = new Set(
    subcategoriasElegiveis.map(subcategoria =>
      normalizarTexto(subcategoria.id || subcategoria.nome)
    )
  );

  historico.usadas = Array.from(
    new Set(
      Array.isArray(historico.usadas)
        ? historico.usadas.map(normalizarTexto).filter(Boolean)
        : []
    )
  ).filter(id => permitidas.has(id));

  const usadasSet = new Set(historico.usadas);

  let disponiveis = subcategoriasElegiveis.filter(subcategoria =>
    !usadasSet.has(normalizarTexto(subcategoria.id || subcategoria.nome))
  );

  if (disponiveis.length === 0 && subcategoriasElegiveis.length > 0) {
    historico.usadas = [];
    historico.ciclo = Number(historico.ciclo || 1) + 1;
    disponiveis = subcategoriasElegiveis;

    console.log("Todas as subcategorias elegíveis já foram usadas. Iniciando novo ciclo:", historico.ciclo);
  }

  return disponiveis;
}

function marcarCombinacaoComoUsada(historico, combinacao) {
  const id = normalizarTexto(combinacao.id || combinacao.nome);

  if (!id) return;
  if (!Array.isArray(historico.usadas)) historico.usadas = [];

  if (!historico.usadas.includes(id)) {
    historico.usadas.push(id);
  }
}

function criarCombos(produtos, quantidade = 1, historicoCombinacoes = null) {
  const produtosValidos = produtos.filter(produtoValido);
  const combos = [];
  const produtosUsados = new Set();

  const historico = historicoCombinacoes || {
    usadas: [],
    ciclo: 1,
    atualizado_em: null
  };

  const subcategoriasMisturadas = embaralhar(
    obterCombinacoesDisponiveis(historico, produtosValidos)
  );

  for (const subcategoria of subcategoriasMisturadas) {
    if (combos.length >= quantidade) break;

    const produtosEscolhidos = escolherDoisProdutosDaSubcategoria(
      subcategoria,
      produtosUsados
    );

    if (!produtosEscolhidos) {
      console.log(`Subcategoria "${subcategoria.nome}" ignorada: não encontrou 2 produtos válidos com estoque e preço.`);
      continue;
    }

    const [produto1, produto2] = produtosEscolhidos;

    const chave1 = obterChaveProduto(produto1);
    const chave2 = obterChaveProduto(produto2);

    combos.push(
      criarComboComProdutos(
        produto1,
        produto2,
        subcategoria,
        combos.length + 1,
        historico.ciclo
      )
    );

    produtosUsados.add(chave1);
    produtosUsados.add(chave2);

    marcarCombinacaoComoUsada(historico, subcategoria);
  }

  return combos;
}

function carregarCombosExistentes(arquivo) {
  if (!fs.existsSync(arquivo)) return [];

  try {
    const conteudoAtual = fs.readFileSync(arquivo, "utf8").trim();

    if (!conteudoAtual) return [];

    const dadosAtuais = JSON.parse(conteudoAtual);

    return Array.isArray(dadosAtuais)
      ? dadosAtuais.filter(Boolean)
      : [];
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

function limitarCombosAtivos(combos, limite = MAX_COMBOS_ATIVOS) {
  if (!Number.isFinite(limite) || limite <= 0) return combos;

  return combos.slice(0, limite);
}

async function main() {
  const produtos = await carregarProdutos();

  const pasta = path.join(process.cwd(), "site");

  if (!fs.existsSync(pasta)) {
    fs.mkdirSync(pasta, { recursive: true });
  }

  const arquivo = path.join(pasta, "combo.json");
  const arquivoHistoricoCombinacoes = path.join(
    pasta,
    "combinacoes-combo-usadas.json"
  );

  const combosExistentes = carregarCombosExistentes(arquivo);
  const combosAindaValidos = combosExistentes.filter(comboAindaValido);
  const combosRemovidos = combosExistentes.length - combosAindaValidos.length;

  const historicoCombinacoes = carregarHistoricoCombinacoes(
    arquivoHistoricoCombinacoes
  );

  const produtosValidos = produtos.filter(produtoValido);
  const subcategoriasElegiveis = obterSubcategoriasElegiveis(produtosValidos);

  const combosNovos = criarCombos(
    produtos,
    QUANTIDADE_COMBOS_POR_EXECUCAO,
    historicoCombinacoes
  );

  const todosCombos = limitarCombosAtivos(
    ordenarCombosMaisRecentesPrimeiro(
      removerCombosDuplicados([
        ...combosNovos,
        ...combosAindaValidos
      ])
    ),
    MAX_COMBOS_ATIVOS
  );

  fs.writeFileSync(arquivo, JSON.stringify(todosCombos, null, 2), "utf8");

  salvarHistoricoCombinacoes(
    arquivoHistoricoCombinacoes,
    historicoCombinacoes,
    subcategoriasElegiveis
  );

  console.log(`Produtos carregados do Firebase: ${produtos.length}`);
  console.log(`Produtos válidos para combo: ${produtosValidos.length}`);
  console.log(`Total de subcategorias elegíveis para combo: ${subcategoriasElegiveis.length}`);
  console.log(`Combos existentes antes da limpeza: ${combosExistentes.length}`);
  console.log(`Combos ainda válidos mantidos: ${combosAindaValidos.length}`);
  console.log(`Combos vencidos, inválidos ou inativos apagados automaticamente: ${combosRemovidos}`);
  console.log(`Combos novos criados nesta execução: ${combosNovos.length}`);
  console.log(`Total salvo no combo.json: ${todosCombos.length}`);
  console.log(`Validade máxima de cada combo novo: ${DIAS_VALIDADE_COMBO} dias`);
  console.log(`Limite máximo de combos ativos no arquivo: ${MAX_COMBOS_ATIVOS}`);
  console.log(`Ciclo de combinações: ${historicoCombinacoes.ciclo}`);
  console.log(`Subcategorias já usadas neste ciclo: ${historicoCombinacoes.usadas.length}/${subcategoriasElegiveis.length}`);
  console.log("Histórico salvo em: site/combinacoes-combo-usadas.json");

  combosNovos.forEach((combo, index) => {
    console.log(`Combo novo ${index + 1}: ${combo.nome}`);
    console.log(`ID: ${combo.id}`);
    console.log(`Subcategoria usada: ${combo.subcategoria_combo || combo.combinacao_nome}`);
    console.log(`ID da subcategoria: ${combo.combinacao_id}`);
    console.log(`Validade: ${combo.validade_combo}`);
    console.log(`Produto 1: ${combo.itens[0]?.nome || ""}`);
    console.log(`Produto 2: ${combo.itens[1]?.nome || ""}`);
    console.log(`Preço combo: ${combo.preco_combo}`);
  });

  if (combosNovos.length === 0) {
    console.log("Nenhum combo novo criado.");
    console.log("Motivo provável: nenhuma subcategoria disponível encontrou 2 produtos válidos com estoque e preço.");
    console.log("O histórico de subcategorias não avança para subcategorias que não geraram combo.");
  }
}

main().catch(erro => {
  console.error(erro);
  process.exit(1);
});
