# Marketing Center — Run 10 — carrossel visual + preview privado real

Data: 2026-09-10.

## Escopo

Somente Marketing. Sem Make. Sem alteração do WhatsApp Flow. Sem ativar Instagram/Messenger/Ads. Sem publicação externa. Sem gasto de IA.

## Auditoria inicial

- `docs/RETOMADA-DONA-ANTONIA.md` relido;
- `docs/MARKETING-CENTER-RUN9-20260910.md` relido na branch da PR #254;
- PR #254 confirmada aberta, mergeable e isolada em `feat/marketing-center-v1-20260910`;
- Supabase `ssbesxgaijknwsjbsbcz` confirmado `ACTIVE_HEALTHY` em `sa-east-1`;
- migrations Marketing V1–V8 confirmadas aplicadas;
- `admin-marketing-media-v1` confirmado ativo com `verify_jwt=true`;
- advisor de segurança sem achado novo específico do Marketing; permanecem INFO de tabelas server-only com RLS sem policy e WARN preexistente de leaked-password protection; Auth não foi alterado.

## Admin — Carrossel e mídia

Novo módulo:

- `admin-v3/marketing-carousel-media-v1.js`.

Nova aba interna `Carrossel e mídia` no Marketing Center:

- lista os assets de carrossel;
- edita de 2 a 10 slides;
- cada slide mantém escolha independente `Sem IA | Híbrido | Manual | Com IA`;
- edita título, chamada, preço e CTA por slide;
- reordena slides com ações subir/descer;
- duplica slide;
- adiciona e remove slide respeitando os limites 2–10;
- salvar usa a RPC guardada `save_marketing_carousel_slides_v1`;
- qualquer alteração volta o conteúdo para `draft` e invalida aprovação/agendamento anteriores conforme contrato V8;
- nenhuma ação chama Meta, Pinterest ou Google.

O carregador `admin-v3/marketing-workflow-v1.js` foi ampliado para carregar esse painel sem modificar a base do Marketing Center.

## Preview privado real

A mesma aba agora mostra a biblioteca `marketing_media_objects` do conteúdo e permite abrir uma prévia real.

Fluxo:

1. Admin autenticado escolhe a mídia;
2. frontend chama `admin-marketing-media-v1`;
3. Edge Function valida JWT e papel `owner|operator`;
4. resolve somente mídia signable do bucket privado `marketing-private`;
5. cria URL assinada com validade solicitada de 300 segundos;
6. mostra imagem ou MP4 no Admin;
7. registra evento `admin_preview_signed` sem side effect externo.

O bucket continua privado; nenhum object path vira URL pública permanente.

## Workflow Edge Function V5

`admin-marketing-workflow-v1` foi implantada como **versão 5**, mantendo `verify_jwt=true`.

Novas ações administrativas:

- `carousel_overview`;
- `carousel_read`;
- `carousel_save`.

Guardrails:

- UUID obrigatório;
- 2–10 slides no servidor;
- payload de carrossel limitado a 100 KB;
- modos permitidos somente `no_ai | ai | hybrid | manual`;
- escrita sempre delegada à RPC V8 já protegida;
- respostas declaram `external_side_effect=false`;
- não existem URLs/endpoints de Meta, Pinterest ou Google nesse workflow;
- não existe ação `publish`, ativação de gate, alteração de canary, escrita de token ou chamada paga.

## Segurança confirmada no banco

As RPCs abaixo foram verificadas após a implantação:

```text
marketing_carousel_current_v1
marketing_media_signable_v1
save_marketing_carousel_slides_v1
```

Todas retornaram:

```text
anon_execute=false
authenticated_execute=false
service_role_execute=true
```

## Gates reconfirmados após a rodada

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

## Testes / CI

Criado:

- `scripts/test-marketing-carousel-media-admin-v1.mjs`.

Cobertura:

- ações de carrossel presentes no Admin;
- preview por URL assinada de curta duração;
- limites 2–10 no cliente e no servidor;
- persistência somente pela RPC guardada;
- ausência de dispatch para Meta/Pinterest/Google;
- auditoria do signer com `external_side_effect=false`.

O workflow `.github/workflows/marketing-center-v1.yml` foi atualizado para:

- validar sintaxe do novo módulo;
- executar o novo contrato de segurança;
- manter todos os testes anteriores de WebP, FFmpeg, worker, editor, calendário, mídia privada e carrossel.

## Sem DDL nesta rodada

Nenhuma migration nova foi necessária. A implementação reaproveita corretamente o contrato V8 já aplicado, reduzindo risco e evitando mudança desnecessária no schema.

## Próximo bloco seguro

1. confirmar CI da Run 10;
2. criar validadores e payload previews **dry-run** para Pinterest e Google Business Profile sem credenciais e sem rede;
3. revalidar documentação oficial Meta e criar payload previews para Instagram Story/carrossel e Facebook Story, também sem token/dispatcher;
4. iniciar read model de métricas e atribuição do Marketing;
5. evoluir preview/edição de source image e crop/posição por slide;
6. manter geração paga e publicação real OFF até autorização explícita.
