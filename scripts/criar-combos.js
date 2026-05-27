function criarCombos(produtos) {
  const categoriaBloqueada = "mercearia basica";

  const produtosValidos = produtos
    .filter(p => !p._deleted)
    .filter(p => String(p.situacao || "A").toUpperCase() !== "I")
    .filter(p => normalizarPreco(p.preco) > 0)
    .filter(p => normalizarPreco(p.estoque) > 0)
    .filter(p => {
      const categoria = String(p.categoria || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

      return categoria !== categoriaBloqueada;
    });

  const porCategoria = {};

  produtosValidos.forEach(p => {
    const categoria = String(p.categoria || "").trim();
    if (!categoria) return;

    if (!porCategoria[categoria]) {
      porCategoria[categoria] = [];
    }

    porCategoria[categoria].push(p);
  });

  const categoriasMisturadas = embaralhar(Object.keys(porCategoria));
  const combos = [];

  for (const categoria of categoriasMisturadas) {
    if (combos.length >= 5) break;

    const lista = embaralhar(porCategoria[categoria]);

    if (lista.length < 2) continue;

    const p1 = lista[0];
    const p2 = lista[1];

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
  }

  return combos;
}
