# Rodada 6 — pedidos, separação e integração Bling

Data: 25/10/2026
Branch: `project/whatsapp-atendimento-github-20261025`
Estado: fila, separação e preflight local implementados; migration e credenciais externas não aplicadas. Escritas Bling seguem bloqueadas.

## Decisão

Adicionar ao Admin uma fila própria de pedidos e uma tela de detalhe. O servidor mantém a autoridade sobre revisões, atribuição, itens separados/faltantes, recálculo a partir da revisão GitHub fixada e transições. Cada alteração concorrente usa `revision` e cada operação externa tem uma chave idempotente em `integration_jobs`.

A pesquisa confirma que o Bling separa criar pedido de venda, gerar NF-e, consultar seu estado e enviá-la para autorização. Este snapshot não contém regra de vencimento por forma de pagamento, contato Bling do cliente ou regra fiscal para reconciliar o preço comercial da cesta com a soma das linhas. O código registra esses bloqueios e cria `integration_jobs` em `blocked`; cliente OAuth, chamadas de venda/NF-e e transições de entrega ficam para homologação com mapeamentos aprovados. Nenhuma chamada Bling foi feita.

Quando a falta altera o total, o pedido fica em `attention` aguardando novo aceite. A proposta com linhas afetadas e total atualizado entra cifrada na outbox; o webhook confirma ou cancela o pedido apenas se canal, telefone, pedido e revisão coincidirem. Nenhum consumidor da outbox existe, então a mensagem não é enviada.

## Passos

1. Expandir o schema privado com atribuição, conferência por item, status fiscal/entrega e `integration_jobs`.
2. Preservar no snapshot as seleções por grupo da cesta para recalcular pelo commit fixado.
3. Criar rotas autenticadas para fila, detalhe, atribuição e separação; aceitar/cancelar ajuste pelo webhook inbound.
4. Integrar fila e detalhe à navegação Admin, incluindo substituto elegível da revisão GitHub fixada.
5. Registrar preflight idempotente com bloqueios explícitos para OAuth, contato, forma/vencimento e divergência fiscal. Cliente OAuth, venda, NF-e, despacho e conclusão aguardam homologação com esses contratos fechados.
6. Atualizar handoff e contratos. Conferir `pnpm build` e `git diff --check`; sem testes nem chamadas externas.

## Gatilhos de segurança e negócio

- Não atualizar estoque externo automaticamente nesta rodada.
- Não emitir nem autorizar NF-e automaticamente; despacho exige status autorizado confirmado no Bling.
- Em timeout na criação da venda, reconciliar pela referência estável `numeroLoja` antes de repetir.
- Se os itens precificados não reconciliarem com o total comercial aceito, não criar a venda nem inventar desconto, despesa ou item de ajuste.
- Não enviar mensagem ao cliente, não aplicar migration e não conectar conta Bling durante desenvolvimento.

## Estado entregue nesta rodada

- `whatsapp-admin-api` expõe GET de fila/detalhe, assumir separação, editar linha e concluir separação com revisão otimista e eventos de auditoria.
- Falta/substituição é recalculada pelo catálogo no `catalogCommit` do pedido. O cliente precisa aceitar; linhas voltam a `pending` depois do aceite para nova conferência.
- O pedido concluído entra em `awaiting_invoice`, mas a operação Bling `create_sale` é registrada `blocked`. O preflight guarda código dos bloqueios e compara soma das linhas com o total comercial.
- `integration_credentials` e `integration_oauth_states` são apenas schema para uma fase posterior; não há credencial, cliente OAuth, consumidor outbox ou chamada externa ativos.
- Para habilitar escrita futura, ainda falta aprovar a política para o ajuste fiscal, cadastrar vínculos cliente/contato e forma/vencimento, criar OAuth server-side e desenhar reconciliação e NF-e sem duplicação.
- Migration criada pelo Supabase CLI, ainda não aplicada. `pnpm build` é verificado; não executar testes nem deploy durante esta rodada.
