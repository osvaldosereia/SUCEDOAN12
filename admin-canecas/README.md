# Admin Canecas V2

Admin operacional da Dona Antônia / CanecaFácil para catálogo, Loja Integrada, pedidos, criações, impressão e IA.

## Arquitetura atual

A regra operacional é simples:

- **Firebase** = estado, filas e vínculo dos produtos;
- **GitHub Actions** = motor operacional padrão;
- **Make** = OpenAI/personalização + contingência explícita;
- **Loja Integrada** = catálogo e checkout nativos.

O Admin deve deixar visível por qual canal cada comando será executado.

## Loja Integrada — caminho normal

O fluxo normal não depende do Make:

`Admin → Firebase → GitHub Actions → Loja Integrada`

Fila principal:

`canecas/integracoes/loja_integrada/fila`

Worker:

`.github/workflows/sincronizar-canecafacil-loja-integrada.yml`

Responsabilidades GitHub:

- criar produto;
- localizar produto existente por SKU antes de criar;
- atualizar produto;
- preço;
- estoque;
- SEO;
- alias/URL amigável;
- categoria;
- galeria;
- persistência dos IDs da Loja Integrada;
- retries;
- classificação de erros;
- auditoria.

Os comandos do Make para create/update continuam disponíveis apenas como **reserva/contingência** e exigem confirmação no Admin.

## Categorias

As categorias são administradas na própria Loja Integrada.

O GitHub consulta a API e grava:

`canecas/integracoes/loja_integrada/catalog_refs`

O Admin lê esse catálogo no Firebase. O hardening não chama mais `loja_integrada_catalog_refs` no Make.

A sincronização automática de categorias roda junto do workflow principal a cada 5 minutos.

A categoria é identificada prioritariamente por ID/resource URI para sobreviver a renomeações.

## Mídia da Loja Integrada

Galeria oficial:

1. Mockup 1;
2. Mockup 2;
3. arte horizontal convertida para canvas quadrado da loja.

A arte mestre permanece horizontal e intacta.

Derivada para a Loja Integrada:

- 1200×1200;
- WebP;
- fundo branco;
- `fit: contain`;
- sem corte e sem distorção.

Fila:

`canecas/integracoes/loja_integrada/midia_fila`

Fluxo:

`Admin → Firebase midia_fila → GitHub Actions → Sharp → canecas-media → Firebase → Loja Integrada`

Uma caneca recém-finalizada entra automaticamente nessa fila após a confirmação de arte + mockup 1 + mockup 2. Não é necessário o antigo dispatch Make → GitHub.

## Make

O cenário Make deve ser tratado como **IA + contingência**.

Funções que permanecem no Make nesta fase:

- geração/edição da arte com OpenAI;
- mockup 1 com OpenAI;
- mockup 2 com OpenAI;
- análise visual/cadastro com OpenAI;
- personalização pública com OpenAI;
- handoffs diretamente ligados ao binário gerado;
- Resend temporariamente, até o secret e o canário GitHub estarem validados.

O botão de teste do webhook usa apenas `healthcheck`. Ele não chama OpenAI nem Loja Integrada.

Mapa detalhado do cenário enxuto:

`docs/CANECASFACIL-MAKE-SLIM-V16.md`

## Interface de publicação

Na aba Canecas:

- **Publicar selecionadas · GitHub** = padrão;
- **Publicar todas ativas · GitHub** = padrão;
- **Reenviar erros · GitHub** = padrão;
- **Salvar + publicar · GitHub** = padrão individual;
- comandos marcados **MAKE** = reserva/contingência.

O Admin pede confirmação antes de executar uma atualização pela rota Make.

## Dados e cache

`mug-store-v2.js` é a fonte compartilhada de canecas para o Admin.

O Admin evita leituras amplas desnecessárias e invalida cache depois das gravações relevantes.

IDs de imagem da Loja Integrada são cache-first: se já estiverem no Firebase, o Admin não consulta o Make. A consulta antiga existe apenas dentro do caminho de contingência.

## Personalização pública

A personalização usa o produto original da Loja Integrada; não cria produto temporário para cada arte.

O carrinho e o checkout continuam nativos da Loja Integrada.

A arte personalizada é vinculada ao pedido por identificador próprio e segue para a fila de impressão depois da confirmação do pedido/pagamento conforme o fluxo operacional.

## Pedidos e produção

- pedidos de canecas: `canecas/pedidos`;
- criações: `canecas/personalizadas`;
- fila de impressão: `canecas/print_jobs`;
- o Caneca Print permanece como interface de produção/impressão.

## Testes automáticos

Workflow principal:

`.github/workflows/test-admin-canecas-v2.yml`

Ele valida, entre outros pontos:

- sintaxe dos módulos ativos;
- máquina de estados da fila de mídia sem escritas externas;
- substitutos GitHub do Make;
- readiness real da Loja Integrada em modo somente leitura;
- auditoria shadow Firebase × Loja Integrada;
- catálogo GitHub sem chamada Make;
- enfileiramento automático de mídia depois da finalização;
- healthcheck Make sem IA;
- personalização e carrinho nativo;
- smoke Firebase + imagem real.

## Segurança

Nenhum PAT, API key ou token da Loja Integrada deve ser gravado em arquivos públicos.

Blueprints antigos do Make continham uma credencial GitHub literal. O V16 SLIM foi sanitizado e usa placeholder para `GITHUB_TOKEN`. Se a credencial antiga ainda estiver ativa, deve ser revogada/rotacionada.

Secrets de GitHub Actions devem permanecer em GitHub Secrets. Conexões OpenAI permanecem configuradas no Make enquanto o Make for o motor de IA.
