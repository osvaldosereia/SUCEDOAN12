# Design — Histórico de compras do cliente no Vitrine Admin

Data: 2026-09-23  
Projeto: Dona Antônia — Vitrine/Admin  
Repositório: `osvaldosereia/SUCEDOAN12`

## Objetivo

Criar no `/vitrine/admin` um histórico de compras por cliente, simples para operação diária e confiável como base futura de recompra, atendimento e marketing.

O histórico deve consolidar:
- histórico legado/principal já existente no Supabase `ssbesxgaijknwsjbsbcz`;
- pedidos novos gerados pela Vitrine no Supabase `qxstkwshuvplmmftrctj`;
- itens, cestas, valores e status históricos sem substituir snapshots antigos por dados atuais.

## Decisão arquitetural

A base principal `ssbesxgaijknwsjbsbcz` será a fonte canônica do histórico de compras do cliente.

A Vitrine continua operando pedidos e estoque no Supabase `qxstkwshuvplmmftrctj`, mas cada pedido criado/alterado na Vitrine será espelhado de forma idempotente para a base canônica.

Não será criado um terceiro banco nem um histórico paralelo no navegador.

## Identidade do cliente

Ordem de resolução:
1. `source_customer_id` exato quando presente e válido;
2. CPF/CNPJ exato;
3. WhatsApp/telefone E.164 exato, apenas se houver correspondência única;
4. caso contrário, pedido permanece não vinculado.

Nunca vincular automaticamente por nome, similaridade ou aproximação.

Pedidos sem vínculo continuam visíveis e podem ser reconciliados manualmente depois.

## Identidade dos produtos

Ordem de resolução ao importar pedido da Vitrine:
1. GTIN/EAN exato;
2. SKU/código exato;
3. sem correspondência: manter `product_id=null` e preservar `name_snapshot`, quantidade, preço e total históricos.

Nenhum snapshot histórico será reescrito com nome, preço ou embalagem atual.

## Contrato de sincronização

Cada pedido originado da Vitrine terá uma chave idempotente estável:

`vitrine:<qx_order_uuid>`

A sincronização será feita server-side. Reprocessar o mesmo pedido atualiza o registro canônico em vez de criar duplicata.

Eventos sincronizados:
- criação do pedido;
- mudança de status;
- confirmação;
- entrega;
- cancelamento;
- eventual devolução;
- alterações de cliente quando o pedido for reconciliado.

Falha de sincronização não pode impedir o fechamento do pedido na Vitrine. O pedido local continua sendo a fonte operacional imediata.

Será usada uma **outbox simples** no projeto operacional, com uma linha por pedido Vitrine e estados `pending | synced | failed`, número de tentativas, último erro e timestamps. Criação/alteração do pedido marca a outbox como pendente. O envio pode ocorrer imediatamente e também ser repetido com segurança pela mesma chave idempotente.

Não haverá fila complexa nem novo serviço externo nesta etapa.

## Fonte de verdade do histórico

No Supabase principal:
- `orders` + `order_items` = fonte de verdade;
- `customer_purchase_summary_v1` = resumo;
- `get_customer_purchase_history_v1` = histórico paginado;
- `get_customer_last_purchase_v1` = última compra;
- `get_customer_order_detail_v1` = detalhe;
- `customer_product_stats` = frequência e recorrência por produto.

Compras válidas para métricas:
- `storefront_received`
- `confirmed`
- `sent_to_bling`
- `processing`
- `ready`
- `out_for_delivery`
- `delivered`

Excluídas das métricas:
- `cancelled`
- `returned`

Cancelados/devolvidos continuam aparecendo na linha do tempo, apenas não somam em LTV, ticket e frequência.

## Interface no /vitrine/admin

O histórico ficará dentro de **Clientes**, não em uma nova aba principal.

### Lista de clientes

Manter busca atual por nome, CPF e WhatsApp.

Adicionar indicadores compactos quando disponíveis:
- nº de compras;
- total comprado;
- data da última compra.

### Perfil do cliente

Ao abrir o cliente:

**Cabeçalho**
- nome;
- WhatsApp;
- CPF;
- endereço principal;
- status.

**Resumo**
- Compras;
- Total comprado;
- Ticket médio;
- Última compra.

**Histórico de compras**
Lista do mais recente para o mais antigo:
- data;
- número do pedido;
- origem;
- status;
- valor;
- quantidade de itens.

Cada pedido expande/abre detalhe com:
- produtos;
- quantidade;
- valor unitário;
- total por item;
- cesta, quando houver;
- forma de pagamento;
- endereço de entrega histórico;
- status e datas relevantes.

A lista será paginada/carregada sob demanda, sem carregar todo o histórico de uma vez.

**Produtos mais comprados**
Mostrar os produtos mais recorrentes com:
- nome;
- quantidade total;
- número de compras;
- valor acumulado;
- última compra.

Essa área é informativa; não terá IA nem recomendações nesta etapa.

## Compatibilidade com pedidos da Vitrine

Os pedidos da Vitrine hoje vivem no Supabase `qxstkwshuvplmmftrctj`.

O bridge será **server-to-server**, sem consulta cruzada feita pelo navegador e sem expor `service_role` de um projeto ao frontend.

Fluxo:
1. o projeto operacional `qxst...` monta um payload normalizado a partir de `orders + order_items + order_item_components`;
2. uma Edge Function interna envia esse payload para um endpoint de ingestão no projeto canônico `ssbes...`;
3. a chamada usa um segredo compartilhado exclusivo dessa integração, armazenado somente no ambiente server-side;
4. o projeto canônico valida origem, esquema e idempotency key;
5. resolve cliente;
6. resolve produtos por GTIN/SKU;
7. faz upsert do pedido canônico;
8. substitui os itens do pedido canônico de forma transacional/idempotente;
9. atualiza o perfil de compras do cliente;
10. registra resultado e erro de sincronização.

A chave idempotente é `vitrine:<qx_order_uuid>`.

Para evitar acoplamento excessivo, o projeto canônico nunca receberá credenciais administrativas do projeto operacional; recebe somente o payload necessário para o histórico.

## Backfill inicial

Executar uma única rotina para os pedidos já existentes na Vitrine.

Regras:
- não criar duplicata;
- não inferir cliente por nome;
- não apagar histórico existente;
- registrar pedidos sem cliente como não vinculados;
- gerar relatório de reconciliação com contagem: importados, atualizados, não vinculados, falhos.

## Segurança

- nenhuma operação de histórico será feita com `service_role` no navegador;
- endpoints administrativos continuam protegidos;
- RPCs/funções internas sem acesso público direto;
- preservar RLS nas tabelas expostas;
- validar UUIDs, paginação e limites no servidor;
- nenhuma busca de histórico aceita ID de outro cliente sem validação.

## Performance

- reutilizar `idx_orders_customer_history_v1`;
- paginação de histórico por cliente;
- itens carregados apenas ao abrir detalhe quando possível;
- resumo vindo da view/agregados existentes, não recalculado no frontend;
- evitar N+1 para produtos mais comprados;
- índices adicionais somente se EXPLAIN/advisor indicar necessidade.

## Tratamento de erros

- histórico indisponível: perfil do cliente continua abrindo e mostra estado de erro somente na seção;
- pedido sem cliente: aparece em fila de reconciliação, nunca é associado por aproximação;
- produto sem correspondência: snapshot continua visível;
- sync falho: retry idempotente;
- pedido repetido: update, nunca insert duplicado.

## Testes obrigatórios

### Banco / integração
- criar pedido Vitrine e sincronizar uma vez;
- sincronizar novamente e confirmar idempotência;
- alterar status e confirmar atualização;
- cancelar e confirmar exclusão das métricas;
- cliente por `source_customer_id`;
- cliente por CPF exato;
- cliente por telefone único;
- telefone ambíguo não vincula;
- produto por EAN;
- produto por SKU;
- produto não encontrado preserva snapshot;
- backfill sem duplicatas.

### Admin
- busca cliente;
- abrir perfil;
- resumo consistente;
- histórico paginado;
- abrir detalhe;
- status/origem/valor corretos;
- produtos mais comprados;
- estado sem compras;
- erro parcial não quebra a página.

## Fora de escopo desta etapa

- IA para recomendação;
- automações de recompra;
- campanhas de marketing;
- segmentação automática;
- edição manual de pedidos históricos;
- exclusão de histórico;
- unificação total dos dois Supabases.

Esses recursos poderão consumir esta camada posteriormente.

## Observabilidade

No `vitrine/admin`, o histórico do cliente não exibirá detalhes técnicos da sincronização no fluxo normal.

Para suporte:
- pedidos com sync `failed` ficam identificáveis no backend;
- registrar `last_attempt_at`, `attempt_count` e `last_error`;
- disponibilizar retry administrativo server-side;
- não duplicar pedido ao repetir retry.

## Critério de conclusão

A implementação só será considerada pronta quando:
1. histórico legado e pedidos da Vitrine aparecerem juntos no mesmo perfil;
2. métricas baterem com os pedidos válidos;
3. nenhum pedido seja duplicado no reprocessamento;
4. cancelados/devolvidos não somem em LTV/frequência;
5. pedidos sem identidade segura permaneçam não vinculados;
6. testes de integração e regressão passarem;
7. Security Advisor não apresentar alerta novo causado por esta implementação.
