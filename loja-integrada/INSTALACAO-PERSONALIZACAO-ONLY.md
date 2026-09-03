# CanecaFácil — somente personalização no tema padrão da Loja Integrada

## Decisão atual
A Loja Integrada permanece com o tema padrão, sem reconstrução visual da home, categorias, produto, carrinho ou checkout.

O código próprio passa a cuidar somente do fluxo de canecas personalizadas:

1. exibir/reaproveitar o personalizador na página do produto;
2. gerar e salvar uma criação com CF-ID;
3. permitir aprovar a arte e escolher a quantidade;
4. vincular a criação ao produto original da Loja Integrada;
5. adicionar o produto original ao carrinho nativo;
6. identificar a personalização no carrinho antes do checkout;
7. concluir o checkout nativo da Loja Integrada;
8. sincronizar o pedido final com o CF-ID no Firebase/Admin Canecas;
9. liberar impressão somente depois do pagamento;
10. oferecer a tela **Minhas Canecas** para reabrir e reutilizar criações anteriores.

## Único código a instalar no painel
Fonte:

`loja-integrada/CODIGO-PERSONALIZACAO-ONLY-LOJA-INTEGRADA.txt`

No painel da Loja Integrada:

- Tipo: **JavaScript**
- Posição: **Rodapé**
- Página: **Todas as páginas exceto checkout**
- Conteúdo: copiar exatamente o arquivo acima, sem adicionar `<script>`.

Esse pequeno loader chama:

`loja-integrada/canecafacil-personalizacao-only-v1.js`

## O que NÃO instalar neste modo
Para preservar o tema padrão, não usar os runtimes de reconstrução visual anteriores:

- `canecafacil-site-runtime-v1.js`
- `canecafacil-core-v1.css`
- `canecafacil-storefront-v1.js`
- `canecafacil-storefront-v1.css`
- `canecafacil-product-v1.js`
- `CODIGO-BASE-UX-REMOTO.txt`
- `CODIGO-CSS-CRITICO-V1.txt`
- blocos antigos SOCIAL FEED, PRODUTO SOCIAL, BASE HEADER, CARRINHO, FOOTER, RELATED e FULL BANNER.

Eles pertencem ao projeto visual anterior e não são necessários para a personalização.

## Página do produto
O runtime não muda o layout do tema.

Se a descrição do produto já contém o iframe `.cf-personalizer-box`, ele é reaproveitado e não é duplicado. Se o iframe estiver ausente, o módulo de produção resolve o produto pelo SKU/Firebase e injeta o personalizador somente quando o cadastro permitir personalização.

O resize por `postMessage` deixa o iframe acompanhar a altura real do formulário, evitando barra de rolagem interna e botão cortado.

### Personalização obrigatória
Quando o produto possui:

- `personalizacao.ativa === true`; e
- `personalizacao.obrigatoria === true`;

o botão nativo de compra não pode ignorar a personalização. O runtime mantém o botão com o visual nativo da Loja Integrada, altera apenas o texto para **Personalize para comprar** e, ao clicar, leva o cliente ao personalizador.

Produtos sem personalização obrigatória continuam usando o botão Comprar normalmente.

## Aprovação e carrinho
O botão `APROVAR E COMPRAR` do personalizador usa `personalizar/native-cart-v2.js`.

Ao aprovar:

- recupera a criação `CF-...`;
- recupera o modelo original;
- grava a arte aprovada e a quantidade;
- cria/atualiza `canecas/encomendas_pendentes/{CF-ID}`;
- envia o cliente de volta para `canecafacil.com.br` com os parâmetros de handoff;
- o `personalized-order-bridge-v2.js` adiciona o **produto original da Loja Integrada** usando a sessão nativa;
- o carrinho mostra a identificação `PERSONALIZADA · CF-ID · × quantidade` e a imagem/atalho da arte quando disponível.

Não são criados produtos temporários.

## Checkout
O checkout permanece 100% nativo da Loja Integrada. Não dependemos de JavaScript customizado dentro do checkout.

O vínculo da personalização é preparado antes do checkout e persistido no Firebase. Depois que o pedido é criado, o workflow `.github/workflows/sincronizar-pedidos-personalizados-li.yml` revisa os pedidos recentes e relaciona o pedido nativo ao CF-ID.

O workflow está configurado para rodar a cada 5 minutos e também pode ser executado manualmente.

O sincronizador:

- grava o pedido em `canecas/pedidos`;
- marca o item como `personalizada: true`;
- preserva CF-ID, arte aprovada e quantidade;
- atualiza a criação com o ID do pedido;
- mantém o estado de pagamento;
- só cria/libera a fila de impressão quando o pagamento estiver aprovado.

## Minhas Canecas
O recurso comercial existente continua sendo usado internamente, mas neste modo a interface aparece como **Minhas Canecas**.

Cada criação feita no aparelho é mantida por 30 dias e pode ser reaberta pelo CF-ID.

A tela oferece:

- imagem da criação;
- CF-ID;
- status;
- data;
- quantidade;
- **VER ARTE**;
- **USAR DE NOVO** para criações disponíveis;
- **ACOMPANHAR** quando já houver pedido;
- compartilhamento por WhatsApp;
- exclusão segura.

Criações já ligadas a pedido não são apagadas remotamente pelo botão de exclusão; apenas deixam a lista local daquele aparelho.

### Reutilização
`USAR DE NOVO` reabre a mesma criação usando `?creation=CF-ID`. O cliente pode visualizar a arte pronta e comprar novamente sem perder a referência da criação.

Também é possível recuperar uma criação por link com `?cf_arte=CF-ID`.

## Persistência atual
`Minhas Canecas` é uma lista do aparelho/navegador, com referência aos registros reais no Firebase. O armazenamento local dura 30 dias.

Sincronização da lista entre dispositivos exigiria uma camada de autenticação própria vinculando de forma segura o login da Loja Integrada ao Firebase; isso não faz parte desta instalação mínima e não deve ser improvisado com consulta pública por e-mail.

## Checklist de homologação

1. Abrir um produto personalizável no desktop e no celular.
2. Confirmar que o tema continua visualmente igual ao padrão da Loja Integrada.
3. Confirmar que o formulário não tem barra de rolagem interna desnecessária.
4. Em produto obrigatório, clicar no Comprar nativo e confirmar que a página leva ao personalizador.
5. Preencher e gerar uma arte.
6. Confirmar o CF-ID e a prévia.
7. Escolher quantidade maior que 1 em um teste.
8. Clicar em `APROVAR E COMPRAR`.
9. Confirmar que o carrinho abre com o produto original e a identificação da personalização.
10. Seguir até o checkout nativo.
11. Criar um pedido de teste.
12. Confirmar após a sincronização que o pedido no Firebase/Admin contém o CF-ID correto.
13. Confirmar que a criação aparece em `Minhas Canecas`.
14. Reabrir a criação e testar `USAR DE NOVO`.
15. Confirmar que nenhuma fila de impressão é liberada antes do pagamento.
