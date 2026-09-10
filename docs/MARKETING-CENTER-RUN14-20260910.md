# Marketing Center — Run 14 — 2026-09-10

## Escopo

Somente Marketing da Dona Antônia, sem Make, sem rollout externo e sem gasto pago.

## Auditoria prévia

- `docs/RETOMADA-DONA-ANTONIA.md` relido.
- checkpoint mais recente relido: `docs/MARKETING-CENTER-RUN13-20260910.md`.
- PR #254 mantida isolada em `feat/marketing-center-v1-20260910`; nenhuma tentativa de merge.
- PRs recentes auditadas; Flow e atendimento permanecem em branches/PRs separadas.
- CI específico da Run 13 confirmado verde antes da mudança (`Marketing Center V1`, run 86).
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes da mudança.
- `marketing_runtime_config` confirmado com Marketing OFF, canary 0, kill switch ON, geração/render/IA/publicação OFF e budgets 0.
- bucket `marketing-private` confirmado privado, 100 MB e MIME allowlist WebP/PNG/JPEG/MP4.
- `marketing_media_signable_v1` e `register_marketing_private_media_v2` continuam executáveis apenas por `postgres/service_role`, sem `anon/authenticated`.
- eventos de Marketing com `external_side_effect=true`: 0.

## Implementado

### 1. Resolver privado server-side para o renderer

Novo `scripts/marketing-private-media-resolver-v1.mjs`:

- resolve apenas `media_id` já registrado em `marketing_media_objects` por meio de `marketing_media_signable_v1`;
- exige Supabase HTTPS em hostname `*.supabase.co`;
- exige `service_role` no worker, nunca no browser/Admin;
- valida `media_id`, `asset_id` e `asset_version` para impedir leitura cross-asset/cross-version;
- exige bucket `marketing-private`;
- aceita como fonte do renderer somente WebP/PNG/JPEG;
- valida prefixo do object path `asset_id/vN/` e bloqueia `..`, path absoluto e NUL;
- baixa somente do endpoint autenticado fixo do Supabase Storage;
- usa `redirect: error`, evitando seguir redirect para host arbitrário;
- limita mídia a 100 MB;
- confere `byte_size` quando disponível e SHA-256 quando registrado;
- materializa em arquivo temporário local e retorna apenas caminho local;
- não cria nem persiste URL assinada;
- `external_side_effect=false`.

A estratégia está alinhada à documentação atual do Supabase para buckets privados: download autenticado ou signed URL. Para processamento server-side foi escolhido download autenticado direto, sem exposição de URL temporária ao renderer.

### 2. Worker ligado ao resolver, fail-closed

`marketing-render-worker-v1.mjs` agora reconhece fonte privada em layer de imagem por:

- `source_ref.kind=private_media`;
- `source_refs[]` com `kind=private_media`;
- compatibilidade controlada com `private_media_id`.

Quando existe fonte privada:

1. exige identidade de asset/version;
2. exige `sourceResolution` explicitamente configurado;
3. cria diretório temporário dentro do workspace;
4. resolve a mídia privada;
5. substitui o identificador por `src` local antes do Sharp;
6. mantém o `crop` intacto;
7. renderiza;
8. apaga o diretório temporário em `finally`, inclusive em erro.

Sem resolver configurado, o job falha com `private_source_resolution_required`; não existe fallback para URL pública ou remota.

A CLI exige `--resolve-private` explicitamente, além das credenciais server-side. A persistência do output continua separada (`--persist`).

### 3. Testes de segurança

Novo `test-marketing-private-media-resolver-v1.mjs` cobre:

- resolução nominal;
- ausência de signed URL;
- redirects bloqueados;
- escopo asset/version;
- checksum SHA-256;
- host Supabase obrigatório;
- preservação do crop durante materialização.

`test-marketing-worker-v1.mjs` ganhou:

- fail-closed quando fonte privada existe sem resolver;
- materialização + render determinístico com fonte privada;
- contagem de fontes resolvidas;
- preservação de `external_side_effect=false`.

O workflow `Marketing Center V1` passou a checar sintaxe do resolver e executar o teste dedicado.

## Supabase / rollout

Nenhuma migration, Edge Function, policy, gate ou credencial foi alterada nesta rodada. O bloco reutiliza o contrato privado já homologado no banco.

Estado que deve permanecer:

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

Nenhum Meta/Pinterest/Google foi chamado, nenhum Instagram/Messenger/Ads foi ativado e nenhum Make foi usado.

## CI

- Run 86 confirmado verde antes desta rodada.
- novo CI da Run 14 disparado pela atualização do workflow/worker/resolver; confirmar conclusão antes de avançar na próxima rodada.

## Próximo bloco seguro

1. confirmar CI da Run 14;
2. fazer homologação controlada `media_id -> materialização temporária -> crop -> WebP` com asset descartável/rollback ou fixture privada, sem habilitar geração global;
3. transformar o contrato de slides salvo no Admin em `render_spec` determinístico explícito, preservando versionamento;
4. implementar atribuição determinística append-only `conteúdo -> clique/conversa -> pedido`, inicialmente somente coleta/read model e sem inferência;
5. manter todos os adapters sociais em dry-run até autorização explícita.

## Conclusão

Marketing ainda não está integralmente concluído nem homologado programaticamente. A automação recorrente deve permanecer ativa.