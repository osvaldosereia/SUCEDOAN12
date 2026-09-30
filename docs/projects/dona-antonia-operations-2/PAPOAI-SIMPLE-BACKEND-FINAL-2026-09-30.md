# PapoAI + Supabase — backend simples final (2026-09-30)

## Decisão arquitetural

- PapoAI continua responsável por conversa, IA, áudio, Flow e automações internas.
- Supabase continua sendo a fonte de verdade para cliente, pedido, cadastro e vínculo conversa/pedido.
- Não usar Meta Cloud API direto nesta arquitetura.
- Não usar Make em produção para este fluxo.
- Pedido do site existe antes do WhatsApp e não depende do Flow.

## Regras canônicas

- Identidade mínima: nome + telefone.
- Cadastro completo: identidade + documento válido + endereço utilizável (rua + cidade).
- `flow_required=true` quando faltam identidade ou endereço utilizável.
- Falta apenas documento: `document_only_pending=true`; não bloquear o pedido nem exigir Flow por padrão.
- Novo pedido retorna `registration_complete`, `registration_state`, `registration_missing_fields`, `flow_required` e `document_only_pending`.
- Mensagem recebida do PapoAI contendo `NUMERO: XXXXXXXX` vincula conversa e pedido pelo número exato; fallback só ocorre quando há um único candidato inequívoco.

## Estado do PapoAI

- Automação `cadastro 0975`: ativa.
- Automação `cadastro 1018`: desativada.
- Automação `Pedido`: desativada.
- Flow 0975 preservado com Nome Completo, CPF, Endereço, Bairro e Cidade.
- `CADASTRO_PENDENTE` é apenas tag de apoio; não é fonte da verdade.
- Conclusão do cadastro é determinada pelo Supabase, não por tag.

## Gatilho simples recomendado no PapoAI

A automação `cadastro 0975` deve reagir a qualquer uma destas condições exatas:

1. `CLIENTE: NOVO`
2. `ENDERECO: NAO INFORMADO`

Opcionalmente também `CIDADE: NAO INFORMADA`, se o editor permitir OR sem duplicar envio.

Motivo: todos os pedidos recentes com `flow_required=true` estavam sem endereço/cidade. Isso cobre cliente novo e cliente já existente porém ainda incompleto sem exigir mudança no frontend.

## Snapshot verificado em produção

- 48 pedidos de site nos últimos 31 dias.
- 16 pedidos com cadastro pendente no resumo operacional.
- 14 pedidos com Flow necessário no resumo canônico; 2 são apenas documento pendente.
- 9 eventos de Flow processados; 0 em revisão.
- 1.032 eventos PapoAI totais no health v3.
- 399 eventos nas últimas 24h.
- 0 raw pending.
- 0 eventos com erro.
- 0 review_required.
- 831 eventos pelo 0975 e 201 pelo 1018 nos últimos 31 dias.
- `structured_order_commit_enabled=false`.
- 0 pedidos automáticos originados do PapoAI.

## Arquivos SQL consolidados

A branch `papoai-simple-backend-final` contém somente as migrations finais de cadastro, jornada, health, vínculo inbound, resumo e enriquecimento do resultado do pedido. Estruturas experimentais de Meta direto/outbound não fazem parte desta branch.
