const fs = require("fs");
const path = require("path");

const FIREBASE_PRODUTOS_URL = "https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos.json";

const SITE_URL = "https://donaantonia.com.br";
const NOME_LOJA = "Super Cestas Básicas Dona Antônia";
const DESCRICAO_LOJA = "Supermercado online, cestas básicas, ofertas e entrega em Cuiabá e Várzea Grande.";

const ARQUIVO_SAIDA = path.join(__dirname, "..", "merchant.xml");

function limparTexto(valor) {
    return String(valor || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarTituloProduto(valor) {
    const texto = limparTexto(valor);

    if (!texto) return "";

    const siglasPermitidas = new Set([
        "kg", "g", "mg", "ml", "l", "un", "und", "pct", "pc", "cx", "fd", "pet",
        "vip", "zero", "plus", "mm", "cm", "mt", "m", "br", "rj", "sp", "mt"
    ]);

    const palavrasMinusculas = new Set([
        "de", "da", "do", "das", "dos", "e", "com", "sem", "para", "por", "em", "no", "na", "nos", "nas"
    ]);

    const marcasSiglas = new Set([
        "omo", "ype", "ypê", "uht", "pet", "vip", "toddy", "nescau", "sadia", "seara", "tio", "tia"
    ]);

    return texto
        .toLowerCase()
        .split(" ")
        .map((palavra, index) => {
            if (!palavra) return palavra;

            const prefixo = palavra.match(/^[^\wÀ-ÿ]+/)?.[0] || "";
            const sufixo = palavra.match(/[^\wÀ-ÿ]+$/)?.[0] || "";
            const miolo = palavra.replace(/^[^\wÀ-ÿ]+/, "").replace(/[^\wÀ-ÿ]+$/, "");

            if (!miolo) return palavra;

            const mioloLimpo = miolo.toLowerCase();

            if (/^\d/.test(mioloLimpo)) {
                return prefixo + mioloLimpo + sufixo;
            }

            if (siglasPermitidas.has(mioloLimpo)) {
                return prefixo + mioloLimpo + sufixo;
            }

            if (index > 0 && palavrasMinusculas.has(mioloLimpo)) {
                return prefixo + mioloLimpo + sufixo;
            }

            if (marcasSiglas.has(mioloLimpo)) {
                return prefixo + mioloLimpo.charAt(0).toUpperCase() + mioloLimpo.slice(1) + sufixo;
            }

            return prefixo + mioloLimpo.charAt(0).toUpperCase() + mioloLimpo.slice(1) + sufixo;
        })
        .join(" ")
        .replace(/\bKg\b/g, "kg")
        .replace(/\bMl\b/g, "ml")
        .replace(/\bUn\b/g, "un")
        .replace(/\bUnd\b/g, "und")
        .replace(/\bPct\b/g, "pct")
        .replace(/\bCx\b/g, "cx")
        .replace(/\bFd\b/g, "fd")
        .replace(/\s+/g, " ")
        .trim();
}

function xmlEscape(valor) {
    return String(valor || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function apenasNumeros(valor) {
    return String(valor || "").replace(/\D/g, "");
}

function normalizarPreco(valor) {
    if (valor === null || valor === undefined || valor === "") return 0;

    if (typeof valor === "number") return valor;

    const texto = String(valor)
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
}

function dataOfertaValida(valor) {
    if (!valor) return false;

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
        const partes = String(valor).split("/");
        if (partes.length === 3) {
            const [dia, mes, ano] = partes.map(Number);
            const dataBr = new Date(ano, mes - 1, dia, 23, 59, 59);
            return dataBr.getTime() >= Date.now();
        }

        return false;
    }

    return data.getTime() >= Date.now();
}

function obterPrecoFinal(produto) {
    const precoNormal = normalizarPreco(
        produto.preco ??
        produto.price ??
        produto.valor ??
        produto.preco_venda
    );

    const precoOferta = normalizarPreco(
        produto.preco_oferta ??
        produto.sale_price ??
        produto.precoPromocional
    );

    const validadeOferta =
        produto.validade_oferta ||
        produto.fim_oferta ||
        produto.validadeOferta;

    if (precoOferta > 0 && precoOferta < precoNormal && dataOfertaValida(validadeOferta)) {
        return {
            preco: precoOferta,
            precoOriginal: precoNormal,
            temOferta: true,
            validadeOferta
        };
    }

    return {
        preco: precoNormal,
        precoOriginal: precoNormal,
        temOferta: false,
        validadeOferta: ""
    };
}

function gerarSlug(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "")
        .replace(/--+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function obterIdProduto(chaveFirebase, produto) {
    return String(
        produto.codigo ||
        produto.sku ||
        produto.id ||
        produto.firebaseKey ||
        chaveFirebase
    ).trim();
}

function obterNomeProduto(produto) {
    return normalizarTituloProduto(
        produto.nome ||
        produto.name ||
        produto.titulo ||
        produto.title ||
        "Produto"
    );
}

function obterDescricaoProduto(produto, nome) {
    const descricao = limparTexto(
        produto.descricao ||
        produto.description ||
        produto.detalhes ||
        produto.observacao ||
        ""
    );

    if (descricao && descricao.length >= 20) {
        return descricao.slice(0, 5000);
    }

    const marca = limparTexto(produto.marca || produto.brand || "");
    const embalagem = limparTexto(produto.embalagem || produto.volume || "");
    const categoria = limparTexto(produto.categoria || "");

    return limparTexto(
        `${nome}${embalagem ? " " + embalagem : ""}${marca ? " da marca " + marca : ""}. Produto disponível na ${NOME_LOJA} com atendimento em Cuiabá e Várzea Grande. ${categoria ? "Categoria: " + categoria + "." : ""}`
    ).slice(0, 5000);
}

function obterMarca(produto) {
    return limparTexto(
        produto.marca ||
        produto.brand ||
        "Dona Antônia"
    ).slice(0, 70);
}

function obterImagem(produto, idProduto) {
    let imagem = String(
        produto.url_imagem ||
        produto.imagem ||
        produto.image ||
        produto.img ||
        produto.foto ||
        produto.foto_url ||
        produto.urlImagem ||
        produto.imagem_url ||
        ""
    )
        .trim()
        .replace(/\u0009/g, "")
        .replace(/\u00A0/g, "")
        .replace(/\s+/g, "");

    if (!imagem) {
        imagem = `site/img/produtos/${idProduto}.webp`;
    }

    imagem = imagem
        .replace(/^(\.\.\/)+/g, "")
        .replace(/^\.\/+/g, "")
        .replace(/^\/+/g, "");

    let urlFinal;

    if (imagem.startsWith("http://") || imagem.startsWith("https://")) {
        urlFinal = imagem;
    } else {
        urlFinal = `${SITE_URL}/${imagem}`;
    }

    try {
        const url = new URL(urlFinal);

        url.protocol = "https:";

        url.pathname = url.pathname
            .split("/")
            .map(parte => {
                try {
                    return encodeURIComponent(decodeURIComponent(parte));
                } catch (e) {
                    return encodeURIComponent(parte);
                }
            })
            .join("/");

        url.searchParams.set("v", "merchant-2026-06-01");

        return url.toString();
    } catch (e) {
        return `${SITE_URL}/site/img/logoantonia5.png?v=merchant-2026-06-01`;
    }
}

function obterLinkProduto(produto, idProduto, nome) {
    const slug = gerarSlug(produto.slug || nome || idProduto);
    const rota = `${encodeURIComponent(idProduto)}-${slug}`;

    return `${SITE_URL}/#/produto/${rota}`;
}

function produtoAtivo(produto) {
    const situacao = String(produto.situacao || produto.status || "A").toUpperCase().trim();

    if (["I", "INATIVO", "INACTIVE", "D", "DESATIVADO"].includes(situacao)) {
        return false;
    }

    const nome = obterNomeProduto(produto);
    if (!nome || nome.toLowerCase() === "produto") return false;

    const { preco } = obterPrecoFinal(produto);
    if (!preco || preco <= 0) return false;

    const categoria = String(produto.categoria || "").toLowerCase();

    if (
        produto.isComboDiscount ||
        String(produto.id || "").startsWith("fee_") ||
        String(produto.codigo || "").startsWith("fee_") ||
        categoria.includes("taxa") ||
        categoria.includes("frete")
    ) {
        return false;
    }

    return true;
}

function obterDisponibilidade(produto) {
    const estoque = Number(
        produto.estoque ??
        produto.stock ??
        produto.quantidade ??
        produto.qtd ??
        0
    );

    return estoque > 0 ? "in_stock" : "out_of_stock";
}

function gerarItem(chaveFirebase, produto) {
    const idProduto = obterIdProduto(chaveFirebase, produto);
    const nome = obterNomeProduto(produto);
    const descricao = obterDescricaoProduto(produto, nome);
    const marca = obterMarca(produto);
    const imagem = obterImagem(produto, idProduto);
    const link = obterLinkProduto(produto, idProduto, nome);
    const gtin = apenasNumeros(produto.gtin || produto.ean || produto.codigo_barras || produto.barcode || "");
    const disponibilidade = obterDisponibilidade(produto);
    const categoria = limparTexto(produto.categoria || "");
    const subcategoria = limparTexto(produto.subcategoria || "");
    const embalagem = limparTexto(produto.embalagem || produto.volume || "");

    const { preco, precoOriginal, temOferta, validadeOferta } = obterPrecoFinal(produto);

    let xml = "";

    xml += "    <item>\n";
    xml += `      <g:id>${xmlEscape(idProduto)}</g:id>\n`;
    xml += `      <g:title>${xmlEscape(nome.slice(0, 150))}</g:title>\n`;
    xml += `      <g:description>${xmlEscape(descricao)}</g:description>\n`;
    xml += `      <g:link>${xmlEscape(link)}</g:link>\n`;
    xml += `      <g:image_link>${xmlEscape(imagem)}</g:image_link>\n`;
    xml += `      <g:availability>${disponibilidade}</g:availability>\n`;
    xml += `      <g:price>${preco.toFixed(2)} BRL</g:price>\n`;

    if (temOferta && precoOriginal > preco) {
        xml += `      <g:sale_price>${preco.toFixed(2)} BRL</g:sale_price>\n`;

        if (validadeOferta) {
            const dataFim = new Date(validadeOferta);
            if (!Number.isNaN(dataFim.getTime())) {
                const inicio = new Date();
                const fim = dataFim.toISOString();
                xml += `      <g:sale_price_effective_date>${inicio.toISOString()}/${fim}</g:sale_price_effective_date>\n`;
            }
        }
    }

    xml += `      <g:condition>new</g:condition>\n`;
    xml += `      <g:brand>${xmlEscape(marca)}</g:brand>\n`;

    if (gtin.length >= 8 && gtin.length <= 14) {
        xml += `      <g:gtin>${gtin}</g:gtin>\n`;
    } else {
        xml += `      <g:identifier_exists>no</g:identifier_exists>\n`;
    }

    if (categoria || subcategoria) {
        xml += `      <g:product_type>${xmlEscape([categoria, subcategoria].filter(Boolean).join(" > "))}</g:product_type>\n`;
    }

    if (embalagem) {
        xml += `      <g:unit_pricing_measure>${xmlEscape(embalagem)}</g:unit_pricing_measure>\n`;
    }

    xml += "      <g:shipping>\n";
    xml += "        <g:country>BR</g:country>\n";
    xml += "        <g:service>Entrega local</g:service>\n";
    xml += "        <g:price>0.00 BRL</g:price>\n";
    xml += "      </g:shipping>\n";

    xml += "    </item>\n";

    return xml;
}

function normalizarListaProdutos(dados) {
    if (!dados) return [];

    if (Array.isArray(dados)) {
        return dados
            .map((produto, index) => [String(index), produto])
            .filter(([, produto]) => produto && typeof produto === "object");
    }

    return Object.entries(dados)
        .filter(([, produto]) => produto && typeof produto === "object");
}

async function main() {
    console.log("Buscando produtos no Firebase...");

    const resposta = await fetch(FIREBASE_PRODUTOS_URL, {
        headers: {
            "Accept": "application/json"
        }
    });

    if (!resposta.ok) {
        throw new Error(`Erro ao buscar produtos no Firebase: HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    const produtos = normalizarListaProdutos(dados);

    console.log(`Produtos encontrados no Firebase: ${produtos.length}`);

    const itens = produtos
        .filter(([, produto]) => produtoAtivo(produto))
        .map(([chaveFirebase, produto]) => gerarItem(chaveFirebase, produto))
        .join("");

    const totalProdutos = (itens.match(/<item>/g) || []).length;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${xmlEscape(NOME_LOJA)}</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>${xmlEscape(DESCRICAO_LOJA)}</description>
${itens}  </channel>
</rss>
`;

    fs.writeFileSync(ARQUIVO_SAIDA, xml, "utf8");

    console.log(`merchant.xml gerado com sucesso.`);
    console.log(`Produtos enviados ao feed: ${totalProdutos}`);
    console.log(`Arquivo: ${ARQUIVO_SAIDA}`);
}

main().catch((erro) => {
    console.error("Erro ao gerar merchant.xml:");
    console.error(erro);
    process.exit(1);
});
