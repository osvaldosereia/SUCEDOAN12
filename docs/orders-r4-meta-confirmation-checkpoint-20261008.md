# R04 — Confirmação comercial Meta com botão CONFIRMADO (08/10/2026)

Plano canônico: [GitHub issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · PR draft [#969](https://github.com/osvaldosereia/SUCEDOAN12/pull/969).

## Auditoria da situação anterior
- `whatsapp-meta-webhook-v1` já confere `x-hub-signature-256` usando `META_WHATSAPP_APP_SECRET` sobre corpo bruto **antes de parse/ingestão**, guarda evento e envia mensagens para atendimento/ANA.
- `admin-orders-v1` já utiliza **Meta Cloud API direta** para templates e `ops2_accept_order_whatsapp_meta_v1` grava no banco o **WAMID real** da mensagem que a Meta aceitou; não é necessário voltar ao PapoAI.
- `ops2_order_whatsapp_confirmation_v1` é somente uma **VIEW do envio/outbox**, não comprovante de clique de confirmação do cliente.
- `orders.status` pode aparecer como `confirmed` antes do clique, portanto **NÃO é prova** da concordância do cliente; o novo ledger `order_meta_confirmations_v1` é a fonte de verdade na etapa de separação.

## Contrato de segurança
1. Somente webhook POST com HMAC Meta válido pode reconhecer o clique; texto escrito pelo cliente, áudio, botão diferente ou `smb_message_echoes` nunca autoriza.
2. Em mensagens `type=button` (resposta rápida de template), comparar `button.payload` a `CONFIRMADO`. Para `interactive.button_reply`, comparar `button_reply.id` a `CONFIRMADO`. Não comparar texto de apresentação.
3. Exigir identificador da resposta recebida `wamid.*` e `context.id` = **WAMID exato do template outbound**. Sem contexto ⇒ não confirmar automaticamente.
4. Após persistir mensagem canônica com selo **assinado pelo servidor**, RPC `ops2_apply_order_meta_confirmation_v1` verifica `provider=meta`, inbound, conta WhatsApp, conversa, outbox `status=sent`, `recipient_kind=customer`, `message_kind=order_received`, janela de 7 dias, ordem não cancelada e fonte elegível.
5. RPC é **SECURITY DEFINER com search_path vazio**, execução revogada de `PUBLIC/anon/authenticated`, somente `service_role`. Tabela de provas com RLS e chave única por pedido/evento. Repetir webhook ⇒ resposta idempotente, sem novo estado nem notificação da ANA.
6. Alteração de `orders.confirmed_at` é **comercial**; jamais emitir NF-e, movimentar estoque ou registrar saída física no clique.
7. Gate de separação é **opt-in** em `order_meta_confirmation_runtime_v1`: flag default `false`, ativação exige `enabled_at` e aplica-se só aos pedidos novos. Com flag ativa, impede atribuir separador, marcar `SEPARADO/FALTOU`, inserir conclusão e avançar `orders.status` para processamento/entrega sem prova. Ao receber o botão válido, libera.

## Pré-requisitos ainda não resolvidos
- Templates Meta Utility com botão **quick reply** índice 0 **efetivamente aprovados** em 0975/1018. A flag `ORDER_META_CONFIRM_BUTTON_ENABLED` fica desligada por padrão. Ao ativar, exige `ORDER_META_CONFIRM_BUTTON_TEMPLATE_0975` e `ORDER_META_CONFIRM_BUTTON_TEMPLATE_1018`; sem os nomes, envio falha fechado. Os modelos atuais `pedidoorganizadosite...v2` **não tiveram botão confirmado** nesta auditoria; não assumir a aprovação.
- Checar se ambos os canais Meta retornam o contexto WAMID nos callbacks reais. Respostas sem contexto ficam sem autorização automática; não fazer correspondência baseada somente em telefone.
- Testar com a estrutura **canônica completa** no sandbox da R02. O SQL `supabase/sql/orders-r4-meta-button-confirmation-contract-v1.sql` é **rascunho**, NÃO migration de produção. Antes de implementar: gerar migration no Supabase CLI, conferir triggers, grants/RLS, janela de 7 dias e ordem de bloqueios com R05.
- O status inicial dos pedidos poderá exigir `pending_confirmation` (validar constraints, telas e triggers) em R05; até isso, mesmo que a tela mostre confirmado, o **gate verdadeiro é o registro assinado no ledger**.
- Ordem de chegada: o webhook pode anteceder a persistência do outbound; R05 deve criar reprocessamento seguro para evento Meta não correlacionado, sem aceitar pelo número do pedido.
- Verificar formatos finais com R03: a identidade pública semanal `DD|MM|AAAA - 001` é texto de apresentação, **não substitui WAMID nem UUID** como chave de segurança.

## Cobertura executável
`scripts/test-orders-r4-meta-confirmation-v1.mjs`: HMAC de bytes originais (não adulterados), aceitação de `button.payload` e `interactive.button_reply.id`, recusa de texto, assinatura ausente, outro canal, evento do app/echo e ausência de contexto. Asserções estruturais garantem persistência antes da decisão e decisão antes da ANA.

`scripts/sql/orders-r4-meta-hml-fixture.sql` e `scripts/sql/orders-r4-meta-hml-assertions.sql`: duas contas Meta fictícias, duas vendas sintéticas, outbound WAMID único, clique válido, duplicidade, clique de outro canal, WAMID falso, flag default OFF e bloqueio de separação/status quando ligada; prova destrava apenas o pedido correto.

A CI `orders-r4-meta-confirmation-ci.yml` usa PostgreSQL 17 descartável e Node 22; **sem segredos, contatos, mensagens, Bling ou SEFAZ reais**.

## Regras de release
Não fazer merge, deploy, envio nem habilitar as flags em produção só porque CI sintética passou. Fechamento técnico de R04 precisa da confirmação de modelos Meta aprovados, migração gerada e validação real end-to-end no sandbox R02/R05, com roteiro de rollback e canário limitado.

## Resultado CI R04 — 08/10/2026
- **[GitHub Actions #37874721994 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37874721994)**, PostgreSQL 17 descartável e Node 22, sem credenciais nem serviços externos.
- HMAC contra corpo bruto verificado; payload modificado reprovado. Testes de webhook Meta existentes passaram junto com os casos novos.
- Respostas estruturadas pelos canais 0975/1018, texto livre rejeitado, botão inválido e WAMID de outro pedido/conta não dão autorização.
- Prova persistente idempotente; gatilhos impedem atribuição, marcação de itens, conclusão e transição direta de status sem o clique **quando o opt-in está habilitado apenas no laboratório**.
- **Concorrência**: [workflow #37874721994](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37874721994) executou dois RPCs em paralelo, com mensagens diferentes do mesmo pedido, e conferiu **uma única linha no ledger**.
- **Situação:** programação e testes sintéticos R04 prontos em PR draft; **Meta não foi configurada**, botão/flags continuam desligados por padrão. Falta aprovação de templates e homologação canônica antes de qualquer deploy.
