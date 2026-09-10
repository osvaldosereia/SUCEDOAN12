# Marketing Center — Run 7 — Salvar/renderizar + registro de mídia

Data: 2026-09-10.

## Escopo

Somente Marketing. Sem Make. Sem alteração do WhatsApp Flow. Sem ativar Instagram/Messenger/Ads. Sem publicação externa. Sem gasto de IA.

## Auditoria inicial

- `docs/RETOMADA-DONA-ANTONIA.md` relido;
- checkpoint Run 6 relido;
- PR #254 aberta na branch `feat/marketing-center-v1-20260910`;
- CI específico `Marketing Center V1` do head anterior estava verde;
- `main` avançou em outra automação de imagens de produtos, portanto esta rodada não fez rebase nem alteração naquela frente;
- Supabase saudável em `sa-east-1`;
- tabelas Marketing permaneciam sem assets/jobs reais;
- gates reconfirmados OFF antes das alterações.

A revisão do changelog atual do Supabase não encontrou breaking change aplicável a estas RPCs/Postgres. O breaking change de logs de 2026-09-23 não afeta este bloco.

## V6 — pedido de renderização guardado

Migration aplicada:

- `marketing_render_media_registry_v6`.

Nova RPC service-role only:

- `request_marketing_asset_render_v1`.

A função converte o modo do asset para um tipo de job:

- imagem `no_ai/manual` -> `deterministic_image`;
- vídeo `no_ai/manual` -> `economical_video`;
- imagem `ai` -> `ai_image`;
- vídeo `ai` -> `ai_video`;
- `hybrid` começa pelo renderer determinístico; melhoria por IA fica separada e explícita.

A RPC não possui bypass. Ela delega para `queue_marketing_render_v2`, portanto `marketing_runtime_config` continua sendo a autoridade dos gates.

Carrossel ainda falha fechado com `carousel_requires_slide_rendering` até o modelo de slides ser implementado.

## Registro/read model de mídia

Novas RPCs service-role only:

- `register_marketing_media_object_v1`;
- `marketing_asset_media_read_v1`.

O registro valida:

- versão do asset;
- papel `source | preview | output | thumbnail | poster`;
- storage provider permitido;
- path sem `..`;
- MIME;
- dimensões;
- duração;
- tamanho máximo;
- checksum/metadados.

Toda inclusão gera evento interno com `external_side_effect=false`.

## Admin — Editor rápido

O Editor agora oferece:

- `Salvar edição`;
- `Salvar e renderizar`;
- `Renderizar atual`;
- status explícito dos gates de render sem IA / com IA / publicação;
- painel de jobs recentes do asset;
- painel de mídias registradas do asset.

Quando Marketing está OFF, `Salvar e renderizar` salva o rascunho e recebe bloqueio explícito da fila. O frontend não tenta contornar o bloqueio e informa que a renderização não iniciou.

O preview local continua sem provider externo.

## Edge Function

`admin-marketing-workflow-v1` foi implantada como versão 4 com `verify_jwt=true`.

Novas ações internas:

- `editor_render`;
- `editor_save_and_render`.

`editor_overview` agora também entrega somente o read model interno de:

- `marketing_media_objects`;
- `marketing_render_jobs`.

Continuam deliberadamente ausentes ações para publish, enable, canary, token ou provider pago.

## Testes reais no Supabase

Foi criado um asset sintético descartável para testar a V6.

Resultado do pedido de render com gates OFF:

```text
ok=false
error=marketing_generation_disabled
render_kind=deterministic_image
external_side_effect=false
```

Resultado: nenhum render job foi criado.

O registro de um preview sintético foi validado com sucesso em `marketing_media_objects` e em seguida todo o asset/mídia/evento de teste foi removido.

Estado final do autoteste:

```text
assets_left=0
media_left=0
jobs_left=0
```

Privilégios confirmados:

```text
anon_render=false
authenticated_render=false
service_render=true
anon_media=false
authenticated_media=false
service_media=true
```

## Gates confirmados após a rodada

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

## Segurança / Advisors

Nenhuma mudança de Auth foi feita. Permanecem avisos preexistentes do projeto, principalmente `RLS Enabled No Policy` em tabelas server-only e `Leaked Password Protection Disabled`. O padrão Marketing continua RLS + revogação de `anon/authenticated` + acesso service-role.

## Próximo bloco seguro

1. confirmar o CI do head desta rodada;
2. implementar storage durável de previews/outputs e URL assinada somente para Admin autenticado;
3. conectar o worker determinístico ao registro de mídia sem ativar geração em produção;
4. modelar carrossel com slides versionados, ordem, duplicação e render por slide;
5. criar validadores/adapters oficiais Meta/Pinterest/Google somente em `dry_run`, sem credenciais reais e sem dispatcher;
6. iniciar read model de métricas e atribuição.

IA paga e publicação real continuam bloqueadas até autorização explícita.
