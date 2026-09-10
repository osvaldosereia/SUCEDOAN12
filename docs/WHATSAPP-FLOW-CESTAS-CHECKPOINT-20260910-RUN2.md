# WhatsApp Flow Cestas — checkpoint Run 2 — 2026-09-10

## Escopo

Continuação segura da homologação do candidato `flow-cestas-comercial-v8-stable`, artefato V31 e runtime comercial V22, sem abrir rollout global.

## Estado confirmado

Supabase:

- candidato `flow-cestas-comercial-v8-stable` em `ready`;
- Meta `DRAFT` e validação sem erros;
- `provider_id=2579927222524475`;
- `handler_version=v22`;
- `flow_json_version=v31-stable-text-products`;
- `production_enabled=false`;
- `live_percent=0`;
- catálogo inteiro proibido no Flow;
- consultas de produto limitadas a subconjuntos de até 20 resultados;
- componentes da cesta continuam sem preço individual;
- preço, estoque, quantidade e total seguem determinísticos no Supabase;
- upsell permanece opcional.

O preflight de infraestrutura V2 passou 29/29 checks para o alvo homologado, incluindo allowlist, criptografia, assinatura Meta, replay guard, isolamento do candidato e gates globais fechados.

## Correção Make — outbound Flow V31

Foi encontrada uma incompatibilidade concreta no cenário `Dona Antônia - WhatsApp Outbound Event-Driven v3`: a rota `Enviar WhatsApp Flow comercial` ainda filtrava por um `flow_id` antigo (`1070149582048643`). Isso bloquearia o candidato V31 mesmo quando o Supabase tivesse emitido corretamente uma sessão owner-only.

A rota foi corrigida para aceitar exclusivamente:

- `delivery_mode=interactive`;
- `interactive.type=flow`;
- `flow_action=data_exchange`;
- `flow_id=2579927222524475` do candidato V31;
- presença obrigatória de `homologation_session_id`.

A mudança não aceita Flow arbitrário e não abre o envio global.

## Drift de allowlist corrigido

A primeira tentativa controlada foi bloqueada antes do envio com `homologation_recipient_not_allowed`. A causa era um drift interno: lease/preflight utilizavam o purpose `controlled_live_homologation`, enquanto o emissor de token ainda exigia `flow_v31_owner_homologation`.

Foi criada e aplicada a migration:

`20260910142700_whatsapp_flow_v31_owner_allowlist_purpose_unification_v1.sql`

Ela unifica o emissor no único purpose owner-only ativo, `controlled_live_homologation`, sem inserir nenhum novo destinatário e mantendo execução server-only.

## Dispatcher owner-only endurecido

A segunda tentativa controlada revelou dois pontos adicionais antes de qualquer envio:

1. o dispatcher dedicado ainda consultava o purpose antigo;
2. o payload enviado ao Make não repassava `homologation_session_id`, embora a rota segura do Make agora exija esse marcador.

Foi criada e aplicada:

`20260910143500_whatsapp_flow_v31_owner_dispatch_contract_v2.sql`

O dispatcher agora:

- usa `controlled_live_homologation`;
- exige conversa em modo IA;
- bloqueia explicitamente qualquer handoff humano `open/claimed`;
- valida sessão owner-only, definição V31, token e `flow_id`;
- repassa `homologation_session_id` até o Make;
- mantém o dispatcher dedicado separado do rollout normal.

## Preflight V3 + dispatcher V6

O preflight V2 verificava corretamente a infraestrutura, mas não a disponibilidade operacional da conversa. Por isso podia retornar `ok=true` e o dispatcher bloquear logo depois.

Foi criada e aplicada:

`20260910144200_whatsapp_flow_v31_owner_preflight_v3_dispatch_v6.sql`

O novo preflight adiciona:

- `owner_conversation_ai`;
- `owner_service_window_open`;
- `owner_handoff_clear`.

O novo helper `queue_and_dispatch_whatsapp_flow_owner_homologation_v6` executa esse preflight antes de emitir/enviar o Flow. Se houver controle humano, encerra com retorno seguro e sem outbound.

Teste real do V6 contra o alvo autorizado retornou corretamente:

- infraestrutura: aprovada;
- service window: aberta;
- conversa: `mode=human`;
- handoff humano: ativo;
- resultado: `owner_conversation_preflight_failed`;
- nenhuma mensagem V31 enviada.

A precedência do atendimento humano foi preservada; o sistema não tentou alterar modo, fechar handoff ou contornar a proteção.

## Contrato de regressão ampliado

`scripts/test-whatsapp-flow-v31-runtime-contract.mjs` foi ampliado para cobrir:

- purpose único de homologação;
- `homologation_session_id` no payload até o Make;
- `flow_id` e `flow_action` emitidos pelo backend;
- bloqueio quando a conversa não está em IA;
- bloqueio quando existe handoff humano;
- preflight V3;
- dispatcher V6;
- privilégios server-only.

O workflow `Test WhatsApp Flow V31 Runtime` foi atualizado para observar as novas migrations.

## Gates preservados

Devem permanecer exatamente assim até autorização explícita:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente recebeu o candidato nesta rodada e nenhum rollout foi aumentado.

## Estado funcional alvo

O Flow continua estruturado para:

1. escolher cesta básica;
2. personalizar a composição sem mostrar preço individual dos componentes;
3. escolher seção macro;
4. escolher termos/subseções que funcionam como buscas dinâmicas;
5. carregar somente produtos reais correspondentes, nunca o catálogo inteiro;
6. permitir busca direta quando a intenção já estiver clara;
7. adicionar extras com preço, estoque e quantidade reais;
8. oferecer upsell/cross-sell pequeno e opcional;
9. revisar total determinístico;
10. reutilizar cadastro/endereço já conhecido;
11. confirmar pagamento conforme regras vigentes;
12. finalizar e retornar por `nfm_reply`;
13. pedir localização na conversa WhatsApp para confirmar entrega.

## Próximo ponto exato

1. confirmar CI verde das novas proteções;
2. aguardar uma conversa do número owner homologado que esteja naturalmente em modo IA, service window aberta e sem handoff humano;
3. então usar exclusivamente `queue_and_dispatch_whatsapp_flow_owner_homologation_v6`;
4. validar jornada V31 ponta a ponta e `nfm_reply`;
5. corrigir regressões encontradas sem abrir gates globais.

Não há ação manual indispensável do proprietário para continuar a programação. O teste real deve permanecer bloqueado enquanto o atendimento humano estiver ativo; essa proteção é intencional.