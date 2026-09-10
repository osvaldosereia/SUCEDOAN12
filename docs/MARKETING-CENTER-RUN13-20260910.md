# Marketing Center — Run 13 — 2026-09-10

## Escopo desta rodada

Somente módulo Marketing da Dona Antônia, sem Make e sem qualquer alteração de rollout externo.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` relido na branch isolada.
- checkpoint anterior relido: `docs/MARKETING-CENTER-RUN12-20260910.md`.
- PR isolada mantida: `#254`, branch `feat/marketing-center-v1-20260910`.
- CI da Run 12 confirmado verde: `Marketing Center V1`, run 79.
- PRs abertas recentes auditadas; Flow, atendimento, Agent Core e demais frentes seguem separados deste bloco.
- Supabase `ssbesxgaijknwsjbsbcz` confirmado `ACTIVE_HEALTHY`.
- migrations de Marketing confirmadas aplicadas até `marketing_metrics_read_model_v9`.
- runtime Marketing reconfirmado diretamente antes das mudanças: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, geração/render/IA/publicação OFF, budgets 0 e `require_approval=true`.
- Security Advisor relido: somente padrão global preexistente de tabelas server-only com RLS sem policy e WARN preexistente de leaked-password protection; nenhuma DDL nova nesta rodada.

## Implementado

### 1. Enquadramento do editor aplicado no renderer determinístico

O renderer WebP `scripts/marketing-render-deterministic-v1.mjs` passou a interpretar o mesmo contrato versionado usado pelo Admin em `crop`:

- `fit`: apenas `contain | cover`;
- `x`: 0–100%;
- `y`: 0–100%;
- `scale`: 0,5–3x;
- fallback compatível com o `fit` legado do layer;
- limites/clamps centralizados por `normalizeCrop`.

A imagem é redimensionada, posicionada e recortada dentro do frame antes de compor o canvas final. URLs remotas continuam bloqueadas; o renderer segue `ai_used=false` e `external_side_effect=false`.

### 2. Clipping seguro para zoom e deslocamento

O primeiro CI da implementação (`Marketing Center V1`, run 81) encontrou uma limitação real do Sharp ao tentar compor um overlay ampliado maior que o frame. A implementação foi corrigida para calcular a interseção visível, extrair apenas o trecho necessário e então compor um buffer que nunca excede o frame. O algoritmo corrigido também foi validado localmente com enquadramentos à esquerda, direita e escala reduzida antes do novo CI.

### 3. Teste visual determinístico do crop

`scripts/test-marketing-render-v1.mjs` agora cria uma imagem direcional sintética e confirma por SHA-256 que mudanças de X e escala alteram efetivamente os pixels renderizados. Também cobre clamps de `fit/x/y/scale`, segurança contra URL remota e o contrato WebP existente.

### 4. Imagem-fonte privada explícita por slide

`admin-v3/marketing-carousel-media-v1.js` ganhou seletor `Imagem-fonte privada` em cada slide. O seletor:

- lista somente mídias `image/*` do próprio asset;
- persiste somente `{ media_id, kind: 'private_media' }` em `source_refs`;
- não persiste URL assinada, URL pública ou token;
- mantém o preview separado e temporário pelo serviço existente;
- continua invalidando aprovação/agendamento quando o carrossel é salvo como nova edição.

O teste de contrato do Admin foi ampliado para exigir o seletor privado e impedir regressão para persistência de URL.

## Supabase / segurança

Nenhuma migration ou Edge Function nova foi necessária nesta rodada. O banco não foi alterado.

Estado reconfirmado:

```text
marketing.enabled=false
marketing.execution_mode=off
marketing.canary_percent=0
marketing.kill_switch=true
marketing.generation_enabled=false
marketing.deterministic_render_enabled=false
marketing.ai_image_enabled=false
marketing.ai_video_enabled=false
marketing.publishing_enabled=false
whatsapp_status_publish_enabled=false
instagram_story_publish_enabled=false
facebook_story_publish_enabled=false
instagram_carousel_publish_enabled=false
pinterest_publish_enabled=false
google_business_publish_enabled=false
require_approval=true
max_daily_publications=0
max_daily_ai_image_generations=0
max_daily_ai_video_seconds=0
max_daily_ai_cost_cents=0
```

Nenhum Instagram/Messenger/Ads foi ativado, nenhum provider foi chamado, nenhum gasto pago foi criado e nenhum Make foi usado.

## CI

- Run 79 (Run 12): verde antes desta rodada.
- Run 81: falhou apenas no novo teste do renderer e revelou o caso de overlay maior que frame; demais contratos anteriores passaram até esse passo.
- correção de clipping aplicada.
- CI mais recente desta rodada foi disparado após a correção e a seleção privada de source image; confirmar conclusão antes do próximo bloco se ainda estiver em execução.

## Próximo bloco seguro

1. confirmar o CI mais recente da Run 13;
2. validar em asset de homologação a seleção `media_id -> slide -> render spec`, sem ativar geração global;
3. criar resolver server-side/worker de `media_id` privado para arquivo temporário local, sem URL persistente e sem SSRF;
4. ligar esse resolver ao renderer determinístico apenas atrás dos gates existentes;
5. avançar contrato determinístico de atribuição `conteúdo -> clique/conversa -> pedido`, append-only e sem inferência;
6. manter adapters sociais somente em dry-run até autorização explícita.

## Critério de conclusão

Projeto Marketing ainda não está integralmente concluído/homologado programaticamente. A automação recorrente deve permanecer ativa.
