# CanecaFácil — Loja Integrada + Bling + Admin Canecas

## Regra de negócio

- **Caneca Fácil** é a marca/nome comercial da operação de canecas.
- A operação fiscal é da **Dona Antônia**, usando o mesmo CNPJ e o Bling já utilizado pela empresa.
- O Admin Canecas é o cadastro mestre criativo/comercial das canecas.
- A Loja Integrada é o e-commerce: catálogo, carrinho, checkout, pagamento, cliente, pedido e status comercial.
- O Bling é o ERP/fiscal: cliente fiscal, pedido fiscal, NF-e e demais rotinas fiscais.
- O Caneca Print recebe apenas artes aprovadas vinculadas ao pedido.

## Produtos e SKUs

Os modelos/estampas podem ter SKUs próprios na Loja Integrada e no Firebase. Não é obrigatório criar um produto fiscal no Bling para cada estampa.

**Não habilitar importação automática padrão de pedidos Loja Integrada → Bling enquanto estiver sendo usada a estratégia de um único produto fiscal no Bling.** A integração oficial reconhece os itens do pedido pelo mesmo SKU entre loja e Bling.

Fluxo recomendado:

1. Pedido é criado e pago na Loja Integrada.
2. Webhook de alteração de pedido informa o status ao Make.
3. Make consulta o pedido completo na API da Loja Integrada.
4. Make guarda os itens originais (SKU/modelo, quantidade, personalização/CF-ID) para produção.
5. Make soma a quantidade de canecas e cria no Bling o pedido fiscal usando o **SKU fiscal genérico configurado para caneca**.
6. O valor fiscal do pedido deve preservar o valor efetivamente vendido, conforme a configuração tributária/contábil definida no Bling.
7. O ID do pedido Loja Integrada, pedido Bling e IDs de personalização ficam vinculados no Firebase.
8. Após pagamento confirmado, os itens de produção são enviados ao Caneca Print.

O SKU fiscal genérico do Bling deve ser configurável; nunca deve ser inventado ou hardcoded sem confirmação do cadastro real no Bling.

## Cadastro Loja Integrada — automatizável por API

O Admin/Make deve preencher e manter, quando suportado pela API:

- ativo/inativo;
- nome;
- SKU;
- descrição HTML;
- destaque;
- condição (novo/usado);
- NCM;
- GTIN, somente quando houver GTIN real e válido;
- MPN;
- marca `Caneca Fácil`;
- categoria da loja;
- peso embalado;
- altura, largura e profundidade;
- preço de custo, venda e promocional;
- preço sob consulta;
- estoque, gerenciamento e prazos de disponibilidade;
- imagens/mockups;
- vídeo do YouTube;
- SEO title, keywords e description;
- alias/URL amigável, preservando a URL anterior com redirect 301 quando alterada.

## Campos atualmente manuais na Loja Integrada

A Loja Integrada informa que `Classificação de mercado` e `Especificações recomendadas` estão disponíveis apenas pela interface e não pela API/planilha. O Admin guarda uma ficha/checklist para facilitar a conferência, mas não deve afirmar que estes campos foram sincronizados.

Na operação atual, também não dependemos dos campos fiscais de interface da Loja Integrada para emissão da NF-e, pois a emissão fiscal é feita pelo Bling. Os dados fiscais definitivos precisam estar corretos no produto fiscal e na configuração tributária do Bling.

## Marca x fabricante

- Marca comercial: **Caneca Fácil**.
- Fabricante: informar somente o fabricante real da caneca, quando conhecido.
- Como a operação compra e revende produto nacional, não presumir `Caneca Fácil` como fabricante.

## NCM — regra de segurança

Não decidir NCM somente pelo nome comercial “caneca de cerâmica”. Confirmar o material real e, preferencialmente, repetir a classificação da NF de compra/fornecedor:

- artigo avulso para mesa/cozinha **de porcelana**: referência `69111090`;
- artigo para mesa/cozinha **de cerâmica, exceto porcelana**: referência `69120000`.

O Admin pode sugerir o código a partir do material, mas a classificação fiscal definitiva deve ser confirmada com a documentação do fornecedor/contabilidade.

## Personalização

Produtos marcados como personalizáveis recebem link para `/loja-integrada/personalizar/?model={firebaseKey}`. A criação gera um `CF-ID`, mantém versões da arte no Firebase e a versão aprovada será usada pelo Caneca Print.

Próxima etapa crítica: fazer o `CF-ID` acompanhar o item/pedido da Loja Integrada de forma verificável, para que o pedido pago gere a fila de impressão sem associação manual.
