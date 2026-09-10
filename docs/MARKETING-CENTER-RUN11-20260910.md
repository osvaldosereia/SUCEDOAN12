# Marketing Center — Run 11 — validadores oficiais dry-run + read model de métricas

Data: 2026-09-10.

## Escopo

Somente Marketing. Sem Make. Sem alterar WhatsApp Flow. Sem ativar Instagram/Messenger/Ads. Sem publicação externa. Sem gasto de IA.

## Auditoria inicial

- `docs/RETOMADA-DONA-ANTONIA.md` relido;
- Run 10 relida na branch `feat/marketing-center-v1-20260910`;
- CI `Marketing Center V1` da Run 10 confirmado verde;
- PR #254 continua aberta e isolada; `main` avançou por outra frente e a PR passou a reportar conflito/mergeable=false, portanto nenhum merge/rebase automático foi feito nesta rodada;
- Supabase `ssbesxgaijknwsjbsbcz` confirmado `ACTIVE_HEALTHY`;
- `admin-marketing-workflow-v1` v5 e `admin-marketing-media-v1` v1 confirmadas com `verify_jwt=true`.

## Pesquisa oficial revalidada

### Pinterest

Documentação oficial consultada em 10/09/2026:

- Pinterest API v5 mantém `POST Create Pin`;
- Sandbox oficial lista `POST Create Pin` e foi atualizado em 08/09/2026;
- criação orgânica usa escopo `pins:write`;
- vídeo passa pelo fluxo de media upload antes do Create Pin.

### Google Business Profile

Documentação oficial consultada em 10/09/2026:

- `accounts.locations.localPosts.create` usa `POST https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/localPosts`;
- escopo atual aceito: `https://www.googleapis.com/auth/business.manage`;
- LocalPost suporta `summary`, `media`, CTA e `scheduledTime` conforme tipo/regras da API.

### Meta

Nesta rodada não foi criado dispatcher nem endpoint Graph fixo. O preview Meta permanece estrutural (`STORIES` / `CAROUSEL`) e registra explicitamente que versão Graph, token e endpoint só serão resolvidos na homologação oficial. Isso evita cristalizar contrato não revalidado ou ativar publicação por acidente.

## Validador determinístico de canais

Criado:

- `scripts/marketing-channel-dry-run-v1.mjs`;
- `scripts/test-marketing-channel-dry-run-v1.mjs`.

Cobertura:

- seis canais oficiais do projeto;
- Pinterest: preview de `POST /v5/pins`, board obrigatório, mídia HTTPS e `pins:write`;
- Google Perfil da Empresa: parent `accounts/{account}/locations/{location}`, Local Post e scope `business.manage`;
- Instagram Story / Facebook Story / Instagram Carousel: preview estrutural sem endpoint/token/versão Graph;
- WhatsApp Status continua `manual_confirm` e sem request automático;
- toda resposta dry-run declara `external_side_effect=false`;
- URLs HTTP são recusadas;
- carrossel exige 2–10 mídias;
- nenhuma credencial é necessária ou lida.

## Edge Function dry-run

Criada e implantada:

- `admin-marketing-dry-run-v1` v1;
- `verify_jwt=true`;
- somente `owner|operator` ativo pode usar;
- não contém dispatcher externo;
- não lê credencial de Meta/Pinterest/Google;
- não faz chamada aos providers;
- retorno sempre marca `dry_run=true` e `external_side_effect=false`.

`supabase/config.toml` passou a fixar explicitamente JWT obrigatório para:

- `admin-marketing-workflow-v1`;
- `admin-marketing-media-v1`;
- `admin-marketing-dry-run-v1`.

## Métricas — read model V1

Migration aplicada:

- `marketing_metrics_read_model_v9`.

Arquivo:

- `supabase/migrations/20260910143000_marketing_metrics_read_model_v9.sql`.

RPC:

- `marketing_metrics_read_model_v1(from,to)`.

Entrega:

- total de conteúdos no período;
- aprovados;
- distribuição por modo `no_ai | ai | hybrid | manual`;
- custo estimado e custo real registrados;
- jobs totais, publicados, agendados e `review_required`;
- distribuição por canal e status;
- eventos totais e contagem de eventos com side effect externo;
- atribuição explicitamente `foundation_only`: nenhuma venda/conversa é inferida sem contrato determinístico de evidência.

Segurança confirmada:

```text
anon_execute=false
authenticated_execute=false
service_role_execute=true
```

Consulta real de 30 dias executada após a migration retornou `ok=true`, `external_side_effect=false`, zero assets/jobs e zero custo; havia 2 eventos internos e 0 side effects externos.

## Gates reconfirmados após DDL/deploy

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

## CI

O workflow `Marketing Center V1` foi ampliado para validar:

- sintaxe do novo validador;
- contrato dry-run oficial dos seis canais;
- presença da nova Edge Function/migration nos paths relevantes;
- todos os testes anteriores continuam preservados.

## Próximo bloco seguro

1. confirmar CI desta Run 11;
2. expor `marketing_metrics_read_model_v1` no Admin por Edge Function autenticada e painel simples de 7/30/90 dias;
3. integrar preview dry-run ao Admin, usando dados do job/asset sem persistir credenciais;
4. revalidar contrato Meta por documentação oficial antes de fixar qualquer endpoint Graph;
5. evoluir source image/crop/posição por slide;
6. definir contrato determinístico de atribuição `conteúdo -> conversa -> pedido` sem PII no analytics e sem inferência de IA;
7. manter geração paga e publicação real OFF até autorização explícita.
