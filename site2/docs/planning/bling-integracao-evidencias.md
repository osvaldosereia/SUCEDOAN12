# Bling: integração existente, contrato e decisões de implementação

**Atualizado:** 27/10/2026
**Supabase canônico:** Dona Antônia, `ssbesxgaijknwsjbsbcz`
**Estado:** pesquisa e inspeção somente leitura; sem escrita no Bling ou no Supabase.

## Objetivo

Fixar o caminho de integração do Admin com o Bling antes de continuar a implementação. Este documento separa evidência remota atual, referência histórica, regras comerciais já decididas e pontos que só podem ser fechados em homologação. A implementação deve seguir o gateway existente e não criar um segundo conjunto de OAuth, filas ou sincronizadores.

## Evidência no projeto canônico

- O Supabase `ssbesxgaijknwsjbsbcz` está confirmado como o único banco do Admin. V2 e projetos auxiliares não são destinos desta implementação.
- A Edge Function `admin-products-live-v1` está ativa no projeto canônico, versão 189. O Admin local já a usa para lista/detalhe de pedidos, separação, estado fiscal, emissão e despacho por ações específicas (`order_separation_assign`, `order_separation_item_set`, `order_separation_complete`, `order_fiscal_status`, `order_fiscal_issue_v4`, `order_dispatch_start_v4`, `order_delivery_complete_v3`, `order_delivery_finalize_v4`). O browser envia a sessão Supabase do usuário e a chave publishable; não recebe `service_role` nem chama o Bling diretamente.
- O código remoto do gateway contém sincronização de pedido confirmado com Bling, consulta server-side da configuração/credenciais, fluxo via Bling Hub e tratamento de recuperação/atenção. Há uma regra de aprovação Bling antes da passagem para separação. A sincronização e suas transições devem ser entendidas pelo contrato remoto antes de qualquer alteração local.
- A ação de despacho local envia chave idempotente `dispatch-v4:<orderId>`. A UI exige autorização fiscal explícita antes do despacho. Conclusão de separação pode acionar atividade fiscal em segundo plano; a guarda local exige `issue_enabled=false` antes da etapa final de emissão.
- O Vault do projeto original tem nomes de segredos relacionados a OAuth e Hub do Bling. Foram consultados somente os nomes, nunca os valores. Não copiar tokens, client secret ou refresh token para `.env`, documentação, browser ou logs.
- Os importadores de histórico `bling-history-import-v1`, `bling-history-status-discovery-v1`, `bling-history-contact-enrichment-v1` e `bling-history-customer-backfill-v1` aparecem ativos no inventário, mas seus handlers são wrappers aposentados que respondem HTTP 410. Não usá-los como integração operacional.
- A origem histórica `osvaldosereia/SUCEDOAN12` serve para entender decisões e contratos antigos; não copiar código. Ela confirma padrões antigos de fila, retry e rotação de refresh token, mas não substitui o gateway v189 atual nem comprova a saúde do Hub atual.

## Contrato oficial do Bling que afeta o projeto

- Usar a base atual `https://api.bling.com.br/Api/v3`. A URL antiga `https://bling.com.br/Api/v3` foi descontinuada em 30/04/2026.
- OAuth usa Authorization Code e refresh token. A documentação atual exige `enable-jwt: 1` na obtenção/renovação de token e nas chamadas autenticadas; manter `Authorization: Bearer ...`. Código novo não deve repetir os caminhos OAuth antigos do histórico sem confirmar o gateway atual.
- O limite publicado é de 3 requisições por segundo e 120.000 por dia por conta; endpoints OAuth têm limite próprio. Para fila concorrente, o padrão de projeto permanece conservador: limitador único por conta a 2 req/s, respeito a `Retry-After` em HTTP 429 e backoff limitado. Não disparar retries paralelos de pedidos ou nota.
- A API expõe `GET/POST /pedidos/vendas`, leitura de um pedido, consulta de módulos/situações/transições e mudança de situação. Situações são configuradas por conta: consultar IDs/transições no ambiente conectado, nunca fixar um ID global.
- O OpenAPI vigente consultado em 27/10/2026 exige no pedido base `contato`, `data`, `dataPrevista` e `dataSaida`; no objeto de venda exige `itens` e `parcelas`. Para cada parcela lista `dataVencimento`, `valor` e `formaPagamento.id`; para a venda de item, associa produto por `produto.id` e registra quantidade/valor/descrição.
- Há inconsistências explícitas no schema gerado: `VendasItemDTO.required` lista `id` e `valorLista`, embora `id` seja descrito como ignorado no `POST` e `valorLista` não apareça entre as propriedades daquele objeto; `VendasParcelaDTO.required` lista `id`, embora também seja descrito como ignorado no `POST`. Portanto, não montar payload real apenas seguindo `required`: primeiro comparar o contrato do Hub e validar a requisição no ambiente de homologação do Bling. A documentação oficial também descreve `PUT` como substituição integral; qualquer edição exige recuperar e preservar campos antes de reenviar.
- O fluxo de NF-e tem operações distintas: gerar a partir do pedido, consultar a nota, enviar à Sefaz e verificar o estado de autorização. “Gerada”, “enviada” e “autorizada” são estados diferentes; a expedição exige confirmação inequívoca de autorização, conforme a guarda existente.
- Webhooks do Bling devem validar a assinatura `X-Bling-Signature-256` com HMAC conforme a documentação oficial. Callback não autenticado não altera pedido nem nota.
- O schema atual de criação de venda requer contato, datas, itens e parcelas. Antes de emitir qualquer pedido real, fechar o payload exato de item, produto e parcela consultando o OpenAPI atual e o comportamento do gateway/Hub. O valor numérico da situação ou a presença de `numeroLoja` não é mecanismo suficiente de idempotência.

## Regras comerciais já definidas

1. `public.orders` permanece como registro operacional canônico do Admin; não abrir uma segunda fila local para pedidos.
2. Cada pedido confirmado no Admin produz no máximo uma venda Bling, associada por um identificador externo estável e guardas de idempotência/reconciliação.
3. Um pedido criado pelo Flow e uma compra posterior pelo Catálogo Meta são pedidos separados, mesmo na mesma conversa e sem limite de tempo entre eles. Cada carrinho do Catálogo também é separado. Não juntar carrinhos por telefone, sessão ou proximidade temporal.
4. O pedido do Flow mantém os itens e as quantidades confirmados; preço total e ajustes internos são snapshot de servidor. O resumo enviado ao cliente mostra produtos, quantidades e total, sem preço unitário de cada produto.
5. O acréscimo oculto da cesta entra uma única vez no total interno. Não criar linha virtual duplicada de estoque. Antes da fase fiscal, contador/negócio deve aprovar como distribuir o valor entre linhas, desconto ou despesas no Bling e confirmar efeitos tributários; não inventar rateio no código.
6. Seguir a ordem de negócio e as operações específicas já existentes no gateway. A mudança de Produção para Expedição usa evento único/idempotente; em timeout, primeiro reconciliar estado no Bling/gateway e só então permitir nova tentativa.
7. NF-e permanece a última etapa de programação, conforme decisão do proprietário. Até esse marco, conservar as travas local e remota contra emissão manual/automática. A regra de autorização antes do despacho continua em vigor para a operação real.

## Fluxo de implementação decidido

1. **Pedido confirmado:** garantir um único pedido canônico, snapshot de cliente/endereço/pagamento/itens e reserva pelo caminho oficial; evento repetido retorna o mesmo resultado e não reserva novamente.
2. **Separação/produção:** usar as ações específicas do gateway para atribuição e conferência de itens. Tratar aprovação de estoque/Bling pendente como estado de recuperação, sem simular sucesso.
3. **Conclusão de produção:** manter emissão desabilitada no runtime até a fase fiscal final. Só concluir separação quando a leitura de configuração comprovar o gate exigido; erro ou estado desconhecido bloqueia.
4. **Expedição:** enfileirar uma única solicitação com chave estável, consultar/reconciliar o estado externo antes de repetir e só declarar sucesso quando a resposta canônica confirmar a movimentação.
5. **Entrega:** concluir por ação canônica e mostrar ao operador o resultado confirmado ou a necessidade de recuperação. Não repetir chamada externa automaticamente após resultado incerto.
6. **Fase fiscal final:** em homologação, confirmar correspondência contato/produto/pedido, payload de venda, situação dinâmica, parcelas e idempotência; depois testar geração, envio e autorização da NF-e separadamente. Só então avaliar habilitação operacional, mantendo confirmação humana e guardas existentes.

## Recuperação operacional após separação — contrato v189 confirmado

- `POST action=order_fiscal_recover_bling_v1` é uma operação de escrita protegida: pertence a `WRITE_ACTIONS`; o gateway bloqueia `viewer` e exige usuário autenticado. Não chamar por leitura exploratória.
- O handler exige pedido `ready`, separação concluída com `stock_applied=true`, lista de itens não vazia e sem item `pending`, além do cutover Bling ativo. Ele garante o vínculo e as situações operacionais `approved_separation` e `verified`, reconciliando o estado fiscal existente ao final.
- O handler não chama diretamente `fiscal_dispatch_canary_human_execute`, mas termina chamando `fiscal_dispatch_reconcile`. O efeito indireto desse subcomando no Hub não foi confirmado; por isso, a UI exige leitura válida com `issue_enabled=false`, e o flag continua desligado até homologar o subcomando isoladamente.
- O Admin local agora tem adapter, Server Action e confirmação para essa ação, mas o controle fica invisível e a Action recusa chamadas enquanto `ADMIN_BLING_ORDER_RECOVERY_ENABLED` não for explicitamente `true`. O exemplo de ambiente fixa `false`. A Server Action exige pedido pronto e todos os itens separados; o gateway repete suas próprias guardas.
- Nenhuma chamada de recuperação, escrita remota, deploy ou emissão fiscal foi executada. A checagem estática não substitui homologação.

## Mapeamentos que o código precisa preservar

| Origem Admin | Bling | Regra |
|---|---|---|
| Produto | ID de produto Bling e SKU estável | Não equiparar SKU, GTIN, `product_retailer_id` Meta e ID Bling; manter mapeamento explícito. |
| Cliente | Contato Bling | Localizar por vínculo estável/documentos normalizados com cuidado; não criar contato duplicado por variação de telefone. |
| Pedido | Pedido de venda Bling | Guardar ID externo e referência Admin; reconciliar antes de repetir. `numeroLoja` é referência útil, não idempotência sozinha. |
| Itens da cesta | Linhas fiscais/comerciais | Manter snapshot e quantidade; definir rateio/kit somente após aprovação fiscal/contábil. |
| Pagamento | Parcelas/condição | Mapear modalidade, datas e valores no contrato efetivo do gateway e conta Bling; não presumir que “forma de pagamento” do WhatsApp basta para criar parcela. |
| Etapa Admin | Situação Bling | Obter mapa dinâmico de situações/transições por conta e persistir o vínculo utilizado. |

## Gates pendentes antes de liberar escrita

- Fazer leitura autenticada de prontidão do gateway/Hub Bling e confirmar OAuth válido sem expor credenciais. Inventário de função ativa ou timestamp de sincronização não prova conexão atual.
- Ler o contrato completo do handler v189 para cada ação que a tela invoca, incluindo authorization/roles, allowlist, parâmetros, códigos de erro, mutações colaterais, retries, idempotência e efeitos fiscais indiretos.
- Confirmar se o pedido de venda é criado no aceite ou em etapa posterior, qual evento inicia sincronização e como o Bling Hub devolve a aprovação de separação. Não duplicar uma venda entre aceite e despacho.
- Consultar OpenAPI vigente para os schemas aninhados de contato, produto/itens, parcelas, descontos e despesas; homologar com produto/cliente sintético e conferir total no painel Bling.
- Tratar como gate formal as divergências do OpenAPI nas propriedades `id`/`valorLista` de itens e `id` de parcelas: comparar com contrato real do Hub e obter resposta válida do endpoint de homologação antes de fixar DTO local.
- Mapear cada forma de pagamento aceita no Flow para o `id` ativo de `formaPagamento` da conta Bling e para a parcela/valor/data requeridos. Se faltar mapeamento, bloquear a criação da venda no Bling e manter recuperação operacional; não inferir método financeiro a partir de texto livre.
- Definir o mapeamento de identidade e situação da conta, incluindo o tratamento quando contato/produto não tem vínculo ou a situação não permite transição.
- Obter aprovação do tratamento fiscal/contábil do adicional oculto do combo antes de qualquer NF-e.
- Validar cenários de timeout, HTTP 429, refresh concorrente, token renovado, evento repetido, Bling indisponível, divergência de total e recuperação manual.
- Homologar em ambiente isolado reproduzível. O projeto Supabase canônico continua read-only até estabelecer baseline seguro; não usar a base original para experimentar escrita.
- No gate fiscal final, confirmar sequência gerar → consultar → enviar → consultar autorização e testar rejeição/cancelamento/recuperação sem emissão de produção durante desenvolvimento.

## Fontes consultadas

- [Bling API — documentação e autenticação](https://developer.bling.com.br/bling-api)
- [Aplicativos e OAuth](https://developer.bling.com.br/aplicativos)
- [Migração para JWT](https://developer.bling.com.br/migracao-jwt)
- [Migração de URL](https://developer.bling.com.br/migracao-url)
- [Limites da API](https://developer.bling.com.br/limites)
- [Referência da API](https://developer.bling.com.br/referencia)
- [OpenAPI vigente consultado](https://developer.bling.com.br/build/assets/openapi-DA9aa7wN.json)
- [Boas práticas: paginação e PUT substitui o recurso](https://developer.bling.com.br/boas-praticas)
- [Webhooks](https://developer.bling.com.br/webhooks)
- [Perguntas frequentes e homologação de app público](https://developer.bling.com.br/perguntas-frequentes)
- [Changelog](https://developer.bling.com.br/changelogs)

## Limite da evidência desta revisão

Esta nota consolida leitura estática do checkout, leitura remota autorizada somente para metadados/código do gateway e documentação oficial. Não prova health atual do OAuth/Hub, não confirma acesso de um usuário Admin, não validou os schemas aninhados do pedido por escrita de homologação e não executou ação no Bling. Não houve leitura de valores de secrets nem escrita, NF-e ou alteração remota.
