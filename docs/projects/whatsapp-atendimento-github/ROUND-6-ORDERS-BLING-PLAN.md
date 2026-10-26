# Rodada 6 — pedidos, separação e integração Bling

Data: 25/10/2026
Branch: `project/whatsapp-atendimento-github-20261025`
Estado: fila, separação, preflight e OAuth local implementados; migration e credenciais externas não aplicadas. Conexão está desligada por padrão e escritas Bling seguem bloqueadas.

## Decisão

Adicionar ao Admin uma fila própria de pedidos e uma tela de detalhe. O servidor mantém a autoridade sobre revisões, atribuição, itens separados/faltantes, recálculo a partir da revisão GitHub fixada e transições. Cada alteração concorrente usa `revision` e cada operação externa tem uma chave idempotente em `integration_jobs`.

A pesquisa confirma que o Bling separa criar pedido de venda, gerar NF-e, consultar seu estado e enviá-la para autorização. O código atual do Vitrine Admin fornece o contrato comercial de referência: `commercial_delta = total aceito - soma das linhas`; diferença positiva é `outrasDespesas`, negativa é `desconto`. O projeto novo implementa esse cálculo de forma independente e exibe só o resumo autenticado no Admin. Vencimento, vínculo do cliente e mapeamentos de pagamento ainda bloqueiam o job; venda/NF-e e transições de entrega seguem sem chamadas externas.

Quando a falta altera o total, o pedido fica em `attention` aguardando novo aceite. A proposta com linhas afetadas e total atualizado entra cifrada na outbox; o webhook confirma ou cancela o pedido apenas se canal, telefone, pedido e revisão coincidirem. Nenhum consumidor da outbox existe, então a mensagem não é enviada.

## Passos

1. Expandir o schema privado com atribuição, conferência por item, status fiscal/entrega e `integration_jobs`.
2. Preservar no snapshot as seleções por grupo da cesta para recalcular pelo commit fixado.
3. Criar rotas autenticadas para fila, detalhe, atribuição e separação; aceitar/cancelar ajuste pelo webhook inbound.
4. Integrar fila e detalhe à navegação Admin, incluindo substituto elegível da revisão GitHub fixada.
5. Registrar preflight idempotente e conciliar o total por diferença comercial sem expor ajuste interno; manter bloqueios explícitos para OAuth, contato, forma/vencimento e conector desabilitado. Implementar OAuth server-side, com `state` de uso único e tokens cifrados; venda, NF-e, despacho e conclusão aguardam homologação com os mapeamentos fechados.
6. Atualizar handoff e contratos. Conferir `pnpm build` e `git diff --check`; sem testes nem chamadas externas.

## Gatilhos de segurança e negócio

- Não atualizar estoque externo automaticamente nesta rodada.
- Não emitir nem autorizar NF-e automaticamente; despacho exige status autorizado confirmado no Bling.
- Em timeout na criação da venda, reconciliar pela referência estável `numeroLoja` antes de repetir.
- Se os totais não forem centavos inteiros seguros ou o balanço das linhas, `outrasDespesas` e `desconto` não corresponder ao valor aceito, bloquear a venda. Não adicionar linha fictícia.
- Não enviar mensagem ao cliente, não aplicar migration e não conectar conta Bling durante desenvolvimento.

## Estado entregue nesta rodada

- `whatsapp-admin-api` expõe GET de fila/detalhe, assumir separação, editar linha e concluir separação com revisão otimista e eventos de auditoria.
- Falta/substituição é recalculada pelo catálogo no `catalogCommit` do pedido. O cliente precisa aceitar; linhas voltam a `pending` depois do aceite para nova conferência.
- O pedido concluído entra em `awaiting_invoice`, mas a operação Bling `create_sale` é registrada `blocked`. O preflight guarda códigos de bloqueio e o resumo da conciliação comercial.
- O preflight calcula `delta = total aceito - soma das linhas`; delta positivo é mostrado como `outrasDespesas`, delta negativo como `desconto`. A prévia de conciliação é visível somente na tela administrativa autenticada e não inclui dados pessoais nem payload de venda.
- `integration_credentials` e `integration_oauth_states` são tabelas privadas. O início OAuth exige sessão administrativa e allowlist; o callback valida e consome uma única vez o hash de `state`, troca o código server-side e cifra tokens AES-GCM antes de gravá-los. Um helper server-side renova access/refresh tokens sob lock transacional e persiste o par rotacionado cifrado. `BLING_OAUTH_ENABLED` permanece `false`; não há credencial, conexão, consumidor outbox ou chamada externa ativos.
- Para habilitar escrita futura, ainda faltam os vínculos de cliente/contato e forma/vencimento, além da reconciliação idempotente da venda e das etapas de NF-e. Existe um cliente Bling limitado a GET server-side, mas nenhuma rota o chama; o refresh não é acionado sem uma chamada futura a esse cliente.
- Referência do fluxo Authorization Code e refresh token: [documentação oficial Bling](https://developer.bling.com.br/aplicativos).
- Migration criada pelo Supabase CLI, ainda não aplicada. `pnpm build` é verificado; não executar testes nem deploy durante esta rodada.
