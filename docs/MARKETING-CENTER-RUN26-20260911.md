# Marketing Center — Run 26 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN25-20260911.md` relidos.
- PR #254 auditada: aberta, branch isolada `feat/marketing-center-v1-20260910`, `mergeable=false`; nenhum rebase/merge forçado.
- HEAD inicial da PR: `8f801042e95173ff3f09029cfc510eb249f530a1`.
- O GitHub ainda retornava 0 workflow runs associados a esse HEAD; não declarar CI verde sem execução conclusiva.
- `main` continuou avançando em frentes paralelas; commit recente observado: `f6dc324b4714ada36477701688437007b17b4e66` (`chore: process product studio image batch`). Main não foi alterada nesta rodada.
- Supabase `ssbesxgaijknwsjbsbcz` ACTIVE_HEALTHY. Auditoria confirmou Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicação OFF, triagem OFF, requeue OFF, kill switch de triagem ON e budgets zero.
- Contagens antes das mudanças: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com efeito externo.
- Changelog Supabase revisado; nenhuma mudança hospedada recente exige alteração deste bloco. A mudança breaking de gateway de agosto/2026 é específica de self-hosted e não afeta este projeto hospedado.

## Implementado — Renderer Triage Admin V17
### Edge `admin-marketing-render-triage-v1`
Nova ação server-side `list`:
- aceita somente `owner|operator`, como o restante da Edge;
- lista exclusivamente `pending_review | approved | blocked`;
- consulta a tabela server-only com service role, mas devolve projeção redigida;
- não retorna `eligibility_snapshot`, `result_snapshot`, `idempotency_key`, `requested_by` ou `reviewed_by`;
- anexa apenas `render_kind`, status atual do job e contador de tentativas;
- entrega também gates efetivos de triagem/requeue/Marketing para a UI;
- declara redaction explícita e `external_side_effect=false`.

Ações existentes permanecem:
- `preview` e `request`: owner|operator;
- `approve` e `execute`: owner apenas;
- nenhuma chamada externa/provider.

### Painel Renderer
A aba Renderer agora possui bloco `Triagem manual`:
- mostra gates atuais de triagem, kill switch, requeue, Marketing, execution mode e geração;
- lista triagens pendentes/aprovadas/bloqueadas com IDs abreviados e sem payload/spec/erro bruto;
- jobs potencialmente presos e falhas recentes ganharam botão `Verificar elegibilidade`;
- o preview usa `preview_marketing_render_requeue_v1` via Edge e mostra motivo/tentativas;
- `Solicitar triagem` só é renderizado quando `eligible=true`, `triage_enabled=true` e `triage_kill_switch=false`;
- a chave idempotente fica estável no estado da página para retries do mesmo preview;
- a UI não expõe approve nem execute, portanto não há requeue manual direto no navegador;
- sem polling contínuo.

### Fail-closed / redaction
A UI recusa a listagem se a Edge deixar de declarar como `false` qualquer um destes sinais:
- `eligibility_snapshot_exposed`;
- `result_snapshot_exposed`;
- `idempotency_key_exposed`;
- `actor_ids_exposed`;
- `raw_error_exposed`.

## Testes/CI
`test-marketing-render-triage-v1.mjs` foi ampliado para cobrir:
- ação `list` e estados permitidos;
- projeção explícita redigida;
- flags de redaction;
- UI usando apenas `list/preview/request`;
- ausência de approve/execute no painel Renderer;
- botão de request condicionado ao gate + kill switch;
- ausência de polling e providers externos.

O workflow dedicado já executa esse contrato e observa os arquivos alterados. O status do novo HEAD deve ser verificado na próxima rodada; não considerar CI verde antes disso.

## Gates preservados
- Marketing OFF;
- execution_mode OFF;
- canary 0%;
- kill switch ON;
- triagem OFF;
- requeue OFF;
- kill switch de triagem ON;
- aprovação obrigatória;
- geração/renderer/IA OFF;
- publicação global e seis canais OFF;
- atribuição OFF;
- budgets/limites zero.

## Próximo bloco seguro
1. Confirmar o GitHub Actions `Marketing Center V1` deste HEAD e corrigir somente falhas do Marketing.
2. Homologar a ação `list`/redaction e a Edge implantada, mantendo gates OFF.
3. Evoluir a triagem com ação explícita de `cancel` para solicitação ainda pendente, com owner/operator conforme política, auditoria e idempotência, sem tocar em requeue real.
4. Manter approve/execute fora da UI até decisão específica; requeue real continua OFF.
5. Continuar sem publishers reais, sem IA paga e sem elevar canary.

O Marketing ainda não está integralmente concluído/homologado.
