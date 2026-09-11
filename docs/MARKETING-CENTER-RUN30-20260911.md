# Marketing Center — Run 30 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher real, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN29-20260911.md` relidos.
- PR #254 auditada: aberta na branch isolada `feat/marketing-center-v1-20260910`, `mergeable=false`; nenhum rebase/merge forçado.
- `main` auditada em `0f14743e09eda9076a0ca53f0221f70d652dd024`, avançando por Product Studio; fora do escopo.
- Supabase `ssbesxgaijknwsjbsbcz` auditado no schema real de `marketing_runtime_config`.
- Gates reais confirmados: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render determinístico/IA OFF, publishing global e seis canais OFF, atribuição OFF, triagem OFF, requeue OFF, kill switch de triagem ON, aprovação obrigatória e limites diários zero.
- Antes da homologação havia 1 owner ativo e 0 operators ativos.

## CI
O GitHub continua sem workflow run associado ao HEAD funcional `6058c88ac3012a229091d4a2119de06a1ae54b6d`. Não declarar CI verde sem execução real.

## Homologação transacional V17 — cancel/replay/RBAC
Executada uma única transação de homologação com fixture temporária seguida de `ROLLBACK` integral.

Cobertura validada:
1. owner cancela solicitação `pending_review` com `status=cancelled`, `idempotent=false` e `external_side_effect=false`;
2. replay do mesmo cancelamento retorna `status=cancelled`, `idempotent=true` e `external_side_effect=false`;
3. regra de operator foi homologada sem criar usuário persistente: dentro da mesma transação o owner foi temporariamente alterado para `operator`, cancelou uma solicitação criada pelo próprio ator e a operação foi aceita;
4. o mesmo operator tentou cancelar solicitação criada por outro ator sintético e recebeu `triage_cancel_forbidden`, com `external_side_effect=false`;
5. qualquer desvio do contrato acima faria o bloco PL/pgSQL abortar por exceção;
6. ao final foi executado `ROLLBACK`, portanto nenhuma fixture, evento, alteração de papel ou job persistiu.

Auditoria após rollback confirmou:
- assets = 0;
- render jobs = 0;
- publication jobs = 0;
- triage requests = 0;
- eventos Marketing com efeito externo = 0;
- active owners = 1;
- active operators = 0.

## Tentativa do próximo bloco de UI
Foi preparada a evolução somente leitura para exibir no Renderer o `summary`, buckets de idade e oldest pending/approved da V18. A tentativa de criar o novo componente JS foi bloqueada pela camada de segurança da ferramenta antes de qualquer escrita no GitHub. O bloqueio não foi contornado e nenhum arquivo parcial foi criado.

Não há necessidade de DDL adicional para esse bloco: a RPC V18 e a Edge v5 já entregam os dados redigidos necessários. Na próxima rodada, tentar novamente apenas por um caminho normalmente permitido; se o bloqueio persistir, não contorná-lo.

## Gates preservados
- Marketing OFF;
- execution_mode OFF;
- canary 0%;
- kill switch ON;
- triagem OFF;
- requeue OFF;
- kill switch de triagem ON;
- aprovação obrigatória;
- geração/render/IA OFF;
- publicação global e seis canais OFF;
- atribuição OFF;
- budgets/limites zero.

## Próximo bloco seguro
1. Confirmar novamente o GitHub Actions `Marketing Center V1` no HEAD atual.
2. Levar os contadores V18 para a aba Renderer em UI somente leitura, sem polling, retry/requeue ou providers externos, apenas se a ferramenta aceitar a escrita normalmente.
3. Adicionar contrato de CI específico da UI de resumo de triagem quando o componente puder ser persistido.
4. Manter requeue real e todos os publishers OFF/dry-run.

O Marketing ainda não está integralmente concluído/homologado.