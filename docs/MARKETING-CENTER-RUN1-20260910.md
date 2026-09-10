# Marketing Center — Run 1 — 10/09/2026

## Objetivo desta rodada

Criar a fundação isolada do módulo `Marketing` da Dona Antônia, sem Make e sem ativar publicação real, para suportar conteúdo editável e reutilizável nos canais:

- Status WhatsApp;
- Stories Instagram;
- Stories Facebook;
- Carrossel Instagram;
- Pinterest;
- Perfil da Empresa no Google.

## Entregue

### Admin

Nova aba `Marketing`, carregada de forma modular pelo `admin/config.js`, com:

- visão geral e estado dos gates;
- criação de imagem, vídeo e carrossel;
- escolha por conteúdo entre `Sem IA`, `Com IA`, `Híbrido` e `Manual`;
- edição persistente de rascunhos;
- biblioteca de comandos reutilizáveis e versionados;
- campanhas editáveis em draft;
- seleção de produtos/agenda/política de IA configurável;
- preparação de jobs por canal, ainda apenas em `draft`;
- painel de canais e conexões;
- kill switch owner-only.

A UI pode ficar visível sem liberar qualquer side effect externo porque não existe action administrativa de `publish`, `enable`, `approve` ou aumento de canary nesta versão.

### Banco / Supabase

Migrations aplicadas com sucesso:

- `marketing_center_foundation_v1`;
- `marketing_default_presets_v1`.

Tabelas server-only com RLS:

- `marketing_runtime_config`;
- `marketing_channel_accounts`;
- `marketing_command_presets`;
- `marketing_content_templates`;
- `marketing_campaigns`;
- `marketing_assets`;
- `marketing_publication_jobs`;
- `marketing_events`.

Todos os privilégios diretos de `anon` e `authenticated` foram revogados. As RPCs administrativas são executáveis somente por `service_role` e chegam ao usuário autenticado exclusivamente através da Edge Function administrativa.

O runtime foi conferido após a migration:

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
max_daily_publications=0
max_daily_ai_cost_cents=0
```

A criação de campanha em transação com `ROLLBACK` retornou `status=draft`, `enabled=false`, `execution_mode=off`, `kill_switch=true` e `external_side_effect=false`.

### Presets iniciais

Comandos editáveis em draft:

- oferta quadrada sem IA;
- Story/Status vertical sem IA;
- carrossel de ofertas sem IA;
- Pin vertical sem IA;
- vídeo econômico sem IA/FFmpeg;
- imagem com IA opcional;
- vídeo com IA opcional.

Templates editáveis:

- 1080×1080;
- Story/Status 1080×1920;
- Instagram carrossel 1080×1350;
- Pinterest 1000×1500;
- vídeo vertical 1080×1920.

### Segurança

- nenhuma credencial é salva no browser;
- futuras credenciais externas serão referências ao Vault;
- publicação e IA paga têm gates separados;
- budgets globais começam em zero;
- campanhas possuem `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`;
- WhatsApp Status fica modelado como `manual_confirm` até existir caminho oficial que dispense confirmação humana;
- nenhum fluxo de Marketing usa Make.

O advisor de segurança do Supabase reportou `RLS Enabled No Policy` para tabelas server-only; isso é intencional aqui porque o acesso direto foi revogado de `anon/authenticated` e não existe política cliente. Também reportou a configuração global já existente de proteção contra senhas vazadas, fora do escopo desta rodada.

### Edge Function

`admin-marketing-v1` está versionada no repositório, com JWT obrigatório no `supabase/config.toml`, autenticação do usuário e RBAC `owner/operator`. A tentativa de deploy direto nesta rodada foi bloqueada pela camada de segurança da ferramenta, portanto o código foi mantido versionado e o deploy deve ser retomado na próxima rodada por caminho seguro disponível.

### CI

Adicionados:

- `scripts/test-marketing-center-v1.mjs`;
- `.github/workflows/marketing-center-v1.yml`.

O contrato testa defaults OFF, RLS/revokes, todos os canais/modos, ausência de Make, ausência de actions de ativação/publicação, edição de rascunhos e JWT da Edge Function.

## Próxima rodada

1. Confirmar CI e integrar este branch de forma segura sem conflitar com o Flow em desenvolvimento paralelo.
2. Implementar a camada de render determinístico real para imagens (foto real + layout + texto/preço + WebP otimizado), sem IA.
3. Implementar pipeline de vídeo econômico com FFmpeg, sem IA generativa.
4. Criar media storage/versionamento/preview real e operações de duplicar/recortar/reordenar.
5. Criar adapters oficiais por canal em modo `dry_run/homologation`, sem liberar publish.
6. Adicionar calendário visual, aprovação, agendamento e métricas, sempre atrás de gates e budgets.
7. Só depois homologar IA de imagem/vídeo como opção explícita com teto de custo e fallback sem IA.

## Regra para retomada autônoma

A próxima execução deve ler este arquivo e `docs/RETOMADA-DONA-ANTONIA.md`, auditar `main`, PRs concorrentes e o estado real do Supabase antes de alterar qualquer coisa. Trabalhar somente no módulo Marketing e preservar todos os gates dos demais módulos.
