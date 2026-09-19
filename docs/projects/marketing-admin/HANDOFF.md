# HANDOFF — Marketing Admin / Organic Social — Dona Antônia

Leia primeiro `CURRENT-STATE.md`, `AUTONOMOUS-COMPLETION-PLAN.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS-AND-GUARDRAILS.md` e `TECHNICAL-INVENTORY.md`.

## Branch canônica
`marketing-admin-round8-continue-20260918`

## Estado consolidado
Fase `connection_homologation`, com desenvolvimento interno autônomo. Meta App ID `1547249776748513` validado via Graph `v26.0`; backend aceita somente Page `1928140920768577` e Instagram Business `17841451162237654` / `@dona_antonia_cuiaba`. Meta ainda depende de App Domain/Valid OAuth Redirect URI e consentimento. Pinterest depende de App/Secret/board.

Publicação deve permanecer fechada: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0`, `attribution_recording_enabled=false`, channel gates=false. Sem canary sem autorização explícita. Make não é runtime novo.

## Rodadas concluídas
- Rodada 11 do plano condensado: Observabilidade + Agenda Editorial concluída.

## Rodada 12 — checkpoint
Atribuição existente já fornece tracking UTM preview-only, touchpoints append-only, `evidence_key`, parent chain e read-model determinístico. Nesta rodada foi aplicada `marketing_round12_channel_metrics_v1` e salva a migration canônica no GitHub.

Novo estado:
- `marketing_channel_metric_snapshots` criada com RLS;
- `anon/authenticated` sem acesso bruto;
- service role pode inserir/ler evidência;
- `evidence_key` único para dedupe;
- providers permitidos: Meta/Pinterest;
- `marketing_channel_metrics_read_model_v1()` service-role-only normaliza reach/impressions/views/engagement/saves/shares;
- nenhum coletor externo existe ou está ativo;
- read-model retorna `insufficient_data`, 0 snapshots, collection OFF e `external_side_effect=false`.

## Próxima ação segura
Continuar a Rodada 12 com adapters puros/fixtures sintéticas/testes e integração read-only do novo read-model ao backend/Admin. Não consultar Meta/Pinterest de verdade. Ao fechar o gate da Rodada 12, avançar à Rodada 13 no mesmo ciclo se houver tempo.

## Bloqueios humanos
- Meta App Domains + Valid OAuth Redirect URI;
- consentimento OAuth e identidade Meta;
- Pinterest App/Secret/board;
- autorização explícita futura de canary.

## Plano autônomo condensado
São 9 rodadas amplas, Rodada 11–19. Após `PROGRAMMATIC_COMPLETE=true`, não criar novo escopo; preservar gates e aguardar `HUMAN-ACTIONS.md`.
