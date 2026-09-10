# WhatsApp Flow Cestas — checkpoint Run 2 — 2026-09-10

## Escopo

Continuação segura da homologação do candidato `flow-cestas-comercial-v8-stable`, artefato V31 e runtime comercial V22, sem abrir rollout global.

## Auditoria inicial

Estado confirmado no Supabase:

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

Preflight owner-only executado contra a conversa homologada: `ok=true`, com 29/29 checks aprovados, incluindo allowlist exata, criptografia, assinatura Meta, replay guard, candidato isolado e gates globais fechados.

## Correção Make — outbound Flow

Foi encontrada uma incompatibilidade concreta no cenário `Dona Antônia - WhatsApp Outbound Event-Driven v3`: a rota `Enviar WhatsApp Flow comercial` ainda filtrava por um `flow_id` antigo (`1070149582048643`). Isso impediria o envio do candidato V31 mesmo quando o Supabase tivesse emitido corretamente uma sessão owner-only.

A rota foi corrigida para aceitar exclusivamente:

- `delivery_mode=interactive`;
- `interactive.type=flow`;
- `flow_action=data_exchange`;
- `flow_id=2579927222524475` do candidato V31;
- presença obrigatória de `homologation_session_id`.

A mudança não aceita Flow arbitrário e não abre o envio global. O candidato continua dependente do helper server-only do Supabase, que emite token apenas para a conversa/telefone previamente autorizados e mantém o alvo na allowlist `controlled_live_homologation`.

## Contrato de regressão ampliado

O teste `scripts/test-whatsapp-flow-v31-runtime-contract.mjs` foi reforçado para impedir regressão do outbound owner-only. Agora ele também exige que o helper:

- obtenha o `flow_id` do token emitido pelo backend;
- grave `homologation_session_id` no payload outbound;
- envie `interactive.type=flow`;
- preserve `flow_id` e `flow_action` emitidos pelo backend;
- use o dispatcher dedicado de homologação.

## Gates preservados

Continuam rigorosamente fechados:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente recebeu o candidato nesta rodada e nenhum rollout foi aumentado.

## Estado funcional do Flow

A arquitetura alvo permanece:

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

## Próximo bloco seguro

1. conferir CI do contrato V31 após o reforço;
2. executar sessão owner-only ponta a ponta usando o dispatcher dedicado;
3. validar no journey audit INIT → cesta → personalização → seções/termos → produto → quantidade → extras → upsell → revisão → cliente/endereço → pagamento → finalização;
4. conferir retorno `nfm_reply` e pedido de localização;
5. corrigir somente regressões encontradas;
6. manter todos os gates globais fechados até autorização explícita do proprietário.

Nenhuma ação manual do proprietário é necessária para continuar a programação segura.