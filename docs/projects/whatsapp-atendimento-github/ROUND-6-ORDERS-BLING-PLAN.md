# Rodada 6 — pedidos, separação e integração Bling

Data: 25/10/2026
Branch: `project/whatsapp-atendimento-github-20261025`
Estado: Rodada 6 concluída localmente. Fila, separação, preflight, OAuth local e prévia redigida da venda implementados; DTO da fila/detalhe minimizado; migration e credenciais externas não aplicadas. Conexão está desligada por padrão e escritas Bling seguem bloqueadas até fechar o contrato comercial/fiscal e homologar em ambiente controlado.

## Decisão

Adicionar ao Admin uma fila própria de pedidos e uma tela de detalhe. O servidor mantém a autoridade sobre revisões, atribuição, itens separados/faltantes, recálculo a partir da revisão GitHub fixada e transições. Cada alteração concorrente usa `revision` e cada operação externa tem uma chave idempotente em `integration_jobs`.

A prévia read-only `blingHubPreviewOrderSync` do Vitrine Admin confirma que a venda usa o contato Bling já vinculado ao cliente, registra a forma de pagamento em `observacoes` e não exige forma financeira nem vencimento. A criação de contas/baixa financeira é uma operação distinta e fica fora deste pedido. O código de referência também define `commercial_delta = total aceito - soma das linhas`; diferença positiva é `outrasDespesas`, negativa é `desconto`. Este projeto reimplementa o cálculo e exige vínculo de contato conferido manualmente; nenhuma chamada externa é feita.

Quando a falta altera o total, o pedido fica em `attention` aguardando novo aceite. A proposta com linhas afetadas e total atualizado entra cifrada na outbox; o webhook confirma ou cancela o pedido apenas se canal, telefone, pedido e revisão coincidirem. Nenhum consumidor da outbox existe, então a mensagem não é enviada.

## Passos

1. Expandir o schema privado com atribuição, conferência por item, status fiscal/entrega e `integration_jobs`.
2. Preservar no snapshot as seleções por grupo da cesta para recalcular pelo commit fixado.
3. Criar rotas autenticadas para fila, detalhe, atribuição e separação; aceitar/cancelar ajuste pelo webhook inbound.
4. Integrar fila e detalhe à navegação Admin, incluindo substituto elegível da revisão GitHub fixada.
5. Registrar preflight idempotente, conciliar o total sem expor ajuste interno e permitir vínculo de contato Bling revisado pelo operador. Manter bloqueios explícitos para OAuth e conector desabilitado. Implementar OAuth server-side com `state` de uso único e tokens cifrados; venda, NF-e, despacho e conclusão aguardam contratos e homologação.
6. Atualizar handoff e contratos. Conferir `pnpm build` e `git diff --check`; sem testes nem chamadas externas.

## Gatilhos de segurança e negócio

- Não atualizar estoque externo automaticamente nesta rodada.
- Não emitir nem autorizar NF-e automaticamente; despacho exige status autorizado confirmado no Bling.
- Em timeout na criação da venda, reconciliar pela referência estável `numeroLoja` antes de repetir.
- A referência local é `WA-{UUID sem hífens}`, protegida por unicidade. Hash SHA-256 cobre o candidato completo; `result_summary` persiste somente a referência e um resumo redigido sem campos pessoais.
- Consulta por referência com resultado ambíguo, dados divergentes ou timeout inconclusivo retorna `unknown`; nunca repetir cegamente. A rota autenticada `POST /orders/{id}/bling-sale/reconcile` usa somente GET no Bling e persiste o resultado na projeção do job e no evento de auditoria. Uma chave idempotente evita repetir a mesma consulta concluída; um lease de cinco minutos bloqueia concorrência e permite recuperar execução interrompida. `BLING_SALE_RECONCILIATION_ENABLED=false` e `BLING_OAUTH_ENABLED=false` mantêm a operação desligada por padrão. Resultado ausente só é conclusivo se a busca terminar antes do limite de paginação.
- A OpenAPI oficial atual para `POST /pedidos/vendas` (consulta em 25/10/2026) marca `contato`, `data`, `dataPrevista`, `dataSaida`, `itens` e `parcelas` como obrigatórios. `VendasItemDTO` também marca `valorLista` como obrigatório, mas não declara essa propriedade; os campos `data*` têm descrições condicionais e a referência não deixa claro como dispensar parcelas. Cada parcela requer vencimento, valor e `formaPagamento.id`; esse ID não é derivável com segurança das quatro formas de pagamento usadas no WhatsApp. O candidato local ainda envia somente `data`, `parcelas: []` e `valorLista = valor`. `BLING_SALE_CONTRACT_REVIEW_REQUIRED` deve continuar bloqueando qualquer escrita até confirmar o payload aceito, mapeamento de forma de pagamento e política de vencimento em ambiente controlado. Fonte: [referência oficial da API Bling](https://developer.bling.com.br/referencia).
- Se os totais não forem centavos inteiros seguros ou o balanço das linhas, `outrasDespesas` e `desconto` não corresponder ao valor aceito, bloquear a venda. Não adicionar linha fictícia.
- Não enviar mensagem ao cliente, não aplicar migration e não conectar conta Bling durante desenvolvimento.

## Estado entregue nesta rodada

- `whatsapp-admin-api` expõe GET de fila/detalhe, assumir separação, editar linha e concluir separação com revisão otimista e eventos de auditoria.
- Falta/substituição é recalculada pelo catálogo no `catalogCommit` do pedido. O cliente precisa aceitar; linhas voltam a `pending` depois do aceite para nova conferência.
- O pedido concluído entra em `awaiting_invoice`, mas a operação Bling `create_sale` é registrada `blocked`. O preflight guarda códigos de bloqueio e o resumo da conciliação comercial.
- O operador pode salvar, no schema privado, um ID de contato informado manualmente e confirmar que o conferiu no painel Bling. A alteração é protegida pela sessão GitHub/allowlist, revisão do pedido e evento de auditoria; não consulta o Bling. O preflight aceita somente vínculos revisados.
- As respostas administrativas são projeções mínimas: a fila seleciona colunas resumidas e não lê o snapshot completo; o detalhe omite o snapshot, telefone e ID Supabase do cliente e devolve endereço e pagamento explicitamente para a operação autorizada.
- O preflight calcula `delta = total aceito - soma das linhas`; delta positivo é mostrado como `outrasDespesas`, delta negativo como `desconto`. A prévia de conciliação é visível somente na tela administrativa autenticada e não inclui dados pessoais nem payload de venda.
- O servidor agora monta uma proposta local de venda a partir do snapshot fixado e dos itens separados, calcula a impressão digital SHA-256 sem armazenar o JSON e grava a referência determinística no pedido. A tela autenticada mostra referência, data, contagem de itens, observação de pagamento e se o hash foi calculado; o objeto `integrationJob` não inclui campos pessoais nem JSON da requisição. O endpoint de detalhe expõe somente os campos operacionais autorizados descritos acima, sem devolver o snapshot bruto.
- A reconciliação busca por `numeroLoja` e persiste apenas o resultado redigido. Mesmo uma resposta única não pode ser marcada como compatível enquanto o candidato local não incluir datas previstas/saída e parcelas para comparação; portanto, um registro encontrado segue `unknown` e não é associado ao job. A rota tem flag independente e não foi chamada; nenhum POST foi adicionado e não houve requisição ao host da API Bling.
- `integration_credentials` e `integration_oauth_states` são tabelas privadas. O início OAuth exige sessão administrativa e allowlist; o callback valida e consome uma única vez o hash de `state`, troca o código server-side e cifra tokens AES-GCM antes de gravá-los. Um helper server-side renova access/refresh tokens sob lock transacional e persiste o par rotacionado cifrado. `BLING_OAUTH_ENABLED` permanece `false`; não há credencial, conexão, consumidor outbox ou chamada externa ativos.
- Para habilitar escrita futura, ainda faltam OAuth válido, decisão do contrato da venda e worker de criação que use a reconciliação idempotente já implementada antes/depois do POST. Também faltam as etapas de NF-e. A baixa/conta financeira exigirá contrato próprio caso seja adicionada. O cliente Bling segue limitado a GET; com as flags desligadas, a rota de reconciliação não o chama e o refresh não é acionado.
- Referência do fluxo Authorization Code e refresh token: [documentação oficial Bling](https://developer.bling.com.br/aplicativos).
- Migration criada pelo Supabase CLI, ainda não aplicada. `pnpm build` é verificado; não executar testes nem deploy durante esta rodada.

## Critério de encerramento local

- Os fluxos administrativos de fila, atribuição, separação e ajuste trabalham com revisão otimista, catálogo fixado e eventos idempotentes; as respostas não expõem o snapshot pessoal bruto.
- OAuth Bling e a rota de reconciliação existem no servidor e exigem sessão/allowlist; ambas as flags permanecem `false` por padrão. A reconciliação usa somente GET, registra resultado redigido com chave idempotente/lease e nunca libera `create_sale`.
- O critério local da Rodada 6 está atendido. O projeto não está pronto para operação: falta decidir valores/datas de vencimento e o mapeamento da forma de pagamento, implementar e homologar a escrita da venda, fechar NF-e e despacho, e validar a ligação dos Flows. Esses itens passam como gates explícitos para a Rodada 7; nenhuma API real, conta ou migration foi acionada nesta rodada.
