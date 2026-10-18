# Marketing Center — Run 38 — 2026-09-11

## Escopo
Somente Marketing. Sem Make. Nenhuma publicação externa, provider pago, canary ou rollout foi ativado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 37 revisados antes das alterações.
- `main` observado em `9f1f458b4d1e221d2a111a20e7190f24cbf10c23`.
- PR limpa #276 permaneceu a superfície de trabalho; a branch divergiu da `main` após novas mudanças de Admin/Contagem/Flow, então não houve merge/rebase forçado nesta rodada.
- Supabase real: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com `external_side_effect=true`.
- Runtime real: Marketing OFF, `execution_mode=off`, canary 0, kill switch ON, geração/render/IA OFF, publishing global e canais OFF, aprovação obrigatória, budgets 0, attribution OFF, triage/requeue OFF e triage kill switch ON.

## Bloco implementado
Primeiro slice da UI privada/dormente foi transplantado da branch histórica para a branch limpa:
- `admin-v3/marketing-center.css`
- `admin-v3/marketing-carousel-progress-v1.js`

O leitor de progresso:
- exige sessão JWT do Admin V3;
- chama somente `admin-marketing-carousel-v1`;
- envia `Authorization: Bearer <access_token>`;
- falha fechado se `external_side_effect !== false`;
- não chama Meta, OpenAI, Pinterest ou Google diretamente;
- não está carregado por `admin/app-lite.js` e portanto continua inacessível no Admin público.

## Contratos/CI
`test-marketing-clean-transplant-v1.mjs` foi endurecido para exigir:
- ausência de referências Marketing no Admin público;
- `verify_jwt=true` nas sete Edge Functions Marketing;
- existência do slice dormente;
- bearer JWT no leitor de progresso;
- fail-closed no marcador de efeito externo;
- ausência de endpoints externos diretos.

O workflow `Marketing Center Clean Transplant` agora observa também `admin-v3/marketing-*.js|css`, executa `node --check` no novo JS e roda o contrato de segurança.

## Rollout
Nenhuma migration, Edge Function ou UI foi implantada nesta rodada. Nenhum gate foi alterado no Supabase.

## Próxima rodada segura
1. Confirmar CI verde do HEAD desta rodada.
2. Continuar o transplante da UI privada por slices coerentes, começando pelo compositor/editor e somente com todos os seus contratos/dependências.
3. Reconciliar a PR #276 com a `main` atual apenas por caminho não-forçado; se a divergência continuar perigosa, preparar nova branch limpa baseada na `main` sem levar arquivos compartilhados antigos.
4. Manter a UI fora do Admin público até existir host autenticado.
