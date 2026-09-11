# Marketing Center — Run 24 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum rollout, publisher, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 23 relidos.
- PR #254 auditada: aberta, branch isolada `feat/marketing-center-v1-20260910`, ainda `mergeable=false`; nenhum rebase/merge forçado.
- `main` avançou para `7b8199346ca1cd81d01b8a5f6e709df1ea082aa4` em frente paralela de Admin/IA; PRs recentes paralelos foram auditados e não foram alterados.
- Supabase auditado: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, `require_approval=true`, geração/render determinístico/IA/publicação global e os seis canais OFF, atribuição OFF e budgets/limites em zero.
- Estado de dados: 0 assets, 0 render jobs, 0 publication jobs e 0 eventos Marketing com `external_side_effect=true`.
- `marketing_render_diagnostics_read_model_v1` revalidada: `anon=false`, `authenticated=false`, `service_role=true`.
- Homologação read-only real: `ok=true`, `external_side_effect=false`, 0 leases vencidos, 0 processamentos sem lease, 0 filas acima do limiar e 0 falhas/revisões recentes.
- O HEAD anterior e o novo HEAD seguem sem workflow/check-run identificável do GitHub Actions; não considerar CI verde até existir execução conclusiva.

## Implementado
### Painel Renderer — diagnóstico redigido no Admin
`admin-v3/marketing-render-observability-v1.js` foi evoluído para consumir `metrics.render_diagnostics` da Edge v5 e mostrar, sem escrita:
- contadores de lease vencido, processamento sem lease, fila acima do limiar e falhas/revisões recentes;
- lista de jobs potencialmente presos com somente tipo de render, ID abreviado, status, tentativas, idade e razão classificada;
- lista de falhas/revisões recentes com classe determinística (`timeout`, `rate_limit`, `authentication`, `storage`, `validation`, `network`, `other`, `unspecified`), sem erro bruto;
- janelas manuais 7/30/90 dias e botão Atualizar, sem polling contínuo;
- texto explícito de que a tela é somente leitura e não enfileira render, não chama IA e não publica externamente.

### Fail-closed no próprio navegador
Além do fail-closed server-side já existente na Edge, a UI agora recusa o diagnóstico se:
- `external_side_effect` não for exatamente `false`;
- qualquer marcador de redaction deixar de ser exatamente `false` para erro bruto, input spec, output spec ou identidade do worker.

A UI não lê os campos sensíveis correspondentes e não contém ação de retry/requeue/render/publicação.

### Contrato de CI endurecido
`scripts/test-marketing-render-diagnostics-v1.mjs` agora também audita o painel Renderer:
- exige consumo de `render_diagnostics` e validação fail-closed das flags de redaction;
- exige os sinais `potentially_stuck`, `recent_failures`, `expired_leases`, `processing_without_lease` e `queued_over_threshold`;
- proíbe leitura direta de erro/specs/identidade de lease, ações de retry/render/publicação e endpoints de providers;
- exige IDs abreviados e mantém as janelas manuais 7/30/90 dias.

O workflow `Marketing Center V1` já executa esse contrato e já observa o arquivo do painel. Nenhum novo workflow permissivo foi criado.

## Auditoria pós-alteração
- HEAD da PR após esta rodada: `84a40ce3541e41194ccba12eece1497749fe365a` antes deste checkpoint; este documento gera um commit posterior na mesma branch.
- GitHub reportava 0 check-runs no HEAD imediatamente anterior ao checkpoint.
- Nenhuma migration, Edge Function, runtime config ou dado de produção foi alterado nesta Run.
- Supabase permaneceu com 0 assets, 0 render jobs, 0 publication jobs e 0 eventos externos de Marketing.

## Gates preservados
- Marketing OFF.
- execution_mode OFF.
- canary 0%.
- kill switch ON.
- aprovação obrigatória.
- geração, renderer determinístico, IA imagem e IA vídeo OFF.
- publicação global OFF.
- WhatsApp Status, Instagram Stories, Facebook Stories, Instagram Carrossel, Pinterest e Google Perfil da Empresa OFF.
- atribuição OFF.
- budgets/limites zero.
- nenhum Make e nenhum gasto/efeito externo.

## Próximo bloco seguro
1. Confirmar o GitHub Actions `Marketing Center V1` do HEAD desta Run e corrigir somente falhas do Marketing.
2. Projetar uma triagem manual de renderer separada do diagnóstico, com comando explícito, RBAC, auditoria, idempotência e gate/kill switch próprios, mas manter execução/requeue efetivos desligados.
3. Antes de qualquer mecanismo de requeue, homologar transacionalmente os estados elegíveis e impedir requeue de job ativo, lease válido, job concluído ou asset/version incompatível.
4. Continuar sem publishers reais, sem IA paga e sem elevar canary.

O Marketing ainda não está integralmente concluído/homologado.