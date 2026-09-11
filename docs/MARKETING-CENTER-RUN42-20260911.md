# Marketing Center — Run 42 — 2026-09-11

## Escopo desta rodada

Somente Marketing, sem Make. Continuação da branch limpa `feat/marketing-center-clean-20260911` / PR #276. Todos os publishers e integrações externas permanecem OFF; nenhuma publicação real, IA paga, Instagram/Messenger/Ads ou gasto externo foi ativado.

## Auditoria antes das alterações

- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN41-20260911.md` foram relidos.
- `main` foi auditada e havia avançado para `830da6fa108843856b94c8344afa939281f65c83`, incluindo PRs recentes de Vitrine/Admin/Contagem e processamento de imagens, fora do escopo Marketing.
- PR #276 foi reavaliada sem rebase/merge forçado.
- Supabase real `ssbesxgaijknwsjbsbcz` foi auditado antes da implementação.
- Runtime Marketing encontrado: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, geração/render determinístico/IA OFF, publishing global OFF, seis publishers por canal OFF, attribution OFF, triage/requeue OFF, triage kill switch ON, aprovação obrigatória e budgets/limites pagos em zero.
- Contagens: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 8 eventos internos e 0 eventos com `external_side_effect=true`.
- `marketing_channel_accounts=0`.
- Todas as tabelas `public.marketing_%` auditadas permanecem com RLS ligado; nenhuma função `public.marketing_%` auditada está como `SECURITY DEFINER`.

## TDD

Foi criado primeiro o contrato `scripts/test-marketing-readiness-readonly-v1.mjs`, exigindo:

- bearer JWT obrigatório;
- uso exclusivo da Edge protegida `admin-marketing-insights-v1`;
- ações somente `overview` e `metrics`;
- fail-closed em `external_side_effect`;
- visão dos seis canais oficiais;
- gates OFF explícitos;
- janelas 7/30/90 dias;
- ausência de publish/execute/schedule/approve/requeue/kill/create/update;
- ausência de polling automático;
- ausência de endpoints diretos Meta/OpenAI/Pinterest/Google;
- isolamento do `admin/app-lite.js` público.

O workflow `Marketing Center Clean Transplant` run `34655389195` terminou em `failure` no commit RED `f3d79238925ccc38573cd52f4ac34ea69b0bfcbb`, como esperado, porque `admin-v3/marketing-readiness-readonly-v1.js` ainda não existia.

## Implementado

Novo módulo privado/dormente: `admin-v3/marketing-readiness-readonly-v1.js`.

A superfície consolida:

- estado global seguro do runtime (`OFF`, kill switch, canary);
- readiness dos seis canais: Status WhatsApp, Stories Instagram, Stories Facebook, Carrossel Instagram, Pinterest e Google Perfil da Empresa;
- indicação explícita do gate de publicação por canal;
- caminho planejado (`manual_confirm` para Status WhatsApp e `official_api_planned` para os demais);
- métricas internas em janelas de 7, 30 ou 90 dias;
- conteúdos, aprovados, publication jobs, agendados, revisão necessária, render jobs, falhas e efeitos externos.

Segurança:

- JWT lido de `da_admin_v3_auth` e enviado como Bearer;
- usa somente `admin-marketing-insights-v1`;
- exige `external_side_effect=false` em toda leitura e falha fechado caso contrário;
- não possui ações mutantes;
- não possui polling automático;
- não contém endpoints externos;
- continua sem qualquer mount/import no Admin público.

O guard `scripts/test-marketing-clean-transplant-v1.mjs` foi ampliado para proteger esse novo módulo e impedir sua ligação ao Admin público.

O workflow `.github/workflows/marketing-center-clean-v1.yml` passou a executar syntax-check e o contrato dedicado.

## Verificação

Commit funcional final do bloco: `321c863bb702da440aa66d1a486b5ec203cabbdf`.

Workflow `Marketing Center Clean Transplant` run `34655487542` terminou `completed/success` nesse commit, cobrindo sintaxe, isolamento do Admin público e os contratos do editor, biblioteca, operações e readiness.

## Auditoria pós-implementação

Nenhuma migration ou Edge Function foi implantada/reimplantada no Supabase.

Auditoria final confirmou novamente:

- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 8 eventos internos;
- 0 eventos externos;
- 0 channel accounts configurados;
- nenhuma tabela Marketing auditada com RLS desligado;
- nenhuma função Marketing auditada com `SECURITY DEFINER`;
- runtime integralmente fechado com canary 0% e kill switch ON.

A PR #276 permaneceu aberta, draft e `mergeable=true` no commit funcional desta rodada.

## Próxima rodada segura

1. Reauditar `main`, PR #276 e Supabase.
2. Transplantar o dry-run/preflight dos publicadores oficiais para a branch limpa, usando somente payload preview local/protegido e sem rede externa.
3. Incluir contratos por canal para validar payloads de Status WhatsApp, Stories Instagram/Facebook, Carrossel Instagram, Pinterest e Google Perfil da Empresa sem publicar.
4. Manter toda ação real de publisher OFF, sem credenciais sociais, sem canary e sem gasto externo.
5. Continuar mantendo Marketing fora do Admin público até existir uma superfície autenticada compatível com JWT/RBAC.
