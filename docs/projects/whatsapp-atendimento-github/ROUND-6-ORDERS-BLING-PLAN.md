# Rodada 6 — pedidos, separação e integração Bling

Data: 25/10/2026
Branch: `project/whatsapp-atendimento-github-20261025`
Estado: fila, separação, preflight, OAuth local e prévia redigida da venda implementados; DTO da fila/detalhe minimizado; migration e credenciais externas não aplicadas. Conexão está desligada por padrão e escritas Bling seguem bloqueadas.

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
- Consulta por referência com resultado ambíguo, dados divergentes ou timeout inconclusivo marca o job `unknown`; nunca repetir cegamente. O helper read-only local usa `numerosLojas[]`, `pagina`/`limite`, abre o detalhe por ID e é classificado como `absent`, `matched`, `ambiguous` ou `unknown`. Está sem rota/worker chamador e não foi executado; ausência só é conclusiva se a busca terminar antes do limite de paginação.
- A OpenAPI consultada exige `parcelas` e lista `valorLista` como obrigatório sem defini-lo no schema de propriedades do item. O candidato provisório usa `parcelas: []` e `valorLista = valor`; o novo bloqueio `BLING_SALE_CONTRACT_REVIEW_REQUIRED` impede escrita até validar essa inconsistência e o payload em homologação.
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
- A futura reconciliação deve buscar por `numeroLoja` antes de POST e depois de qualquer sucesso ou timeout. Uma venda compatível pode ser vinculada; ausência inconclusiva, duplicidade ou incompatibilidade mantém `unknown` para revisão. O helper GET-only foi escrito, mas não é chamado por rota ou worker e não foi executado; nenhum POST foi adicionado e não houve requisição ao host da API Bling.
- `integration_credentials` e `integration_oauth_states` são tabelas privadas. O início OAuth exige sessão administrativa e allowlist; o callback valida e consome uma única vez o hash de `state`, troca o código server-side e cifra tokens AES-GCM antes de gravá-los. Um helper server-side renova access/refresh tokens sob lock transacional e persiste o par rotacionado cifrado. `BLING_OAUTH_ENABLED` permanece `false`; não há credencial, conexão, consumidor outbox ou chamada externa ativos.
- Para habilitar escrita futura, ainda faltam OAuth válido, worker de reconciliação idempotente da venda e as etapas de NF-e. A baixa/conta financeira exigirá contrato próprio caso seja adicionada. Existe um cliente Bling limitado a GET server-side, mas nenhuma rota o chama; o refresh não é acionado sem uma chamada futura a esse cliente.
- Referência do fluxo Authorization Code e refresh token: [documentação oficial Bling](https://developer.bling.com.br/aplicativos).
- Migration criada pelo Supabase CLI, ainda não aplicada. `pnpm build` é verificado; não executar testes nem deploy durante esta rodada.
