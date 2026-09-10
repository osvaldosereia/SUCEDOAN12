# Marketing Center — Run 5 — 10/09/2026

## Auditoria de retomada

- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN4-20260910.md` relidos antes das alterações.
- PR #254 permanece aberta e isolada em `feat/marketing-center-v1-20260910`.
- CI do head anterior `09142db10d46131d0d32bcc857c76d97227ddba2`: `Marketing Center V1` concluído com sucesso.
- Supabase `ssbesxgaijknwsjbsbcz`: `ACTIVE_HEALTHY`.
- Nenhum cenário Make foi criado ou utilizado.

## Workflow de revisão e aprovação V4

Migration aplicada: `marketing_review_calendar_v4`.

Adiciona:

- trilha de `review_requested_at`, `reviewed_at`, `reviewed_by` e nota de aprovação no asset;
- aprovação auditável dos jobs por `approved_at`, `approved_by` e nota;
- `submit_marketing_asset_review_v1`;
- `approve_marketing_asset_v1`;
- `schedule_marketing_publication_v1`;
- `unschedule_marketing_publication_v1`;
- `marketing_calendar_v1` para leitura editorial dos próximos conteúdos.

Regras de segurança:

- asset só entra em aprovação a partir de `draft | rendered`;
- somente asset em `review` pode ser aprovado;
- job só pode ser agendado quando job e asset estão aprovados;
- agendar não publica nem dispara provider;
- desagendar retorna para `approved`;
- eventos gravados com `external_side_effect=false`;
- todas as novas RPCs: `anon=false`, `authenticated=false`, `service_role=true`.

## Edge Function administrativa separada

Criada e implantada `admin-marketing-workflow-v1`, atualmente versão 2, com `verify_jwt=true`.

Ações permitidas:

- `workflow_overview`;
- `calendar`;
- `submit_review`;
- `approve_asset` somente owner;
- `schedule_job` somente owner;
- `unschedule_job` somente owner.

Deliberadamente ausentes:

- publish;
- enable/canary;
- escrita de token/credencial;
- chamadas Meta/Pinterest/Google;
- OpenAI/Veo/Runway ou qualquer provider pago.

## Admin

Criado `admin-v3/marketing-workflow-v1.js` e carregador no `admin/config.js`.

Nova aba interna **Calendário e aprovação**:

- lista rascunhos/renderizados e permite enviar para revisão;
- owner pode aprovar;
- jobs aprovados recebem seletor simples de data/hora;
- jobs agendados podem ser desagendados;
- calendário dos próximos 31 dias agrupado por data;
- textos deixam explícito que agendar não significa publicar.

CSS do Marketing recebeu layout responsivo para agenda e calendário.

## CI

Criado `scripts/test-marketing-workflow-v1.mjs` e workflow ampliado para:

- checar sintaxe do novo JS e `admin/config.js`;
- validar presença e permissões das RPCs;
- garantir que endpoint/UI não contenham dispatch para Meta, Pinterest, Google ou OpenAI;
- preservar todos os testes anteriores de WebP, MP4 e worker.

## Runtime preservado após DDL/deploy

```text
enabled=false
execution_mode=off
canary_percent=0
kill_switch=true
generation_enabled=false
deterministic_render_enabled=false
ai_image_enabled=false
ai_video_enabled=false
publishing_enabled=false
whatsapp_status_publish_enabled=false
instagram_story_publish_enabled=false
facebook_story_publish_enabled=false
instagram_carousel_publish_enabled=false
pinterest_publish_enabled=false
google_business_publish_enabled=false
```

Nenhum gate foi alterado.

## Próxima rodada

1. Confirmar o novo CI da PR #254 e corrigir qualquer regressão.
2. Implantar/validar `admin-marketing-v1` somente quando o contrato atual estiver verde, pois a UI-base já o referencia; manter JWT e sem ações de publish/enable.
3. Evoluir preview visual real: produto/foto, crop, escala, posição, texto, preço, CTA, duplicação de versão e reordenação de carrossel.
4. Integrar enqueue do renderer ao Admin em modo seguro, sem habilitar processamento pago.
5. Criar adapters oficiais por canal apenas como `dry_run/homologation` e sem credenciais reais inicialmente.
6. IA de imagem/vídeo continua opcional e bloqueada até autorização explícita de provider/orçamento.
