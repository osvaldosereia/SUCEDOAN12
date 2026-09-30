# Marketing Center — Run 39 — 2026-09-11

## Escopo
Somente Marketing. Sem Make. Nenhuma publicação externa, provider pago, canary ou rollout foi ativado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 38 revisados antes das alterações.
- `main` observado em `d460fd4384f72f10b419498cb196e9c8ba5f0027`, após Vitrine V2 e outras frentes não-Marketing.
- PR limpa #276 permaneceu a superfície de trabalho; estava aberta, draft e mergeable=true no início desta rodada.
- A branch limpa estava divergida da `main`; nenhuma tentativa de rebase/merge forçado foi feita.
- Supabase real: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com `external_side_effect=true`.
- Runtime real: Marketing OFF, `execution_mode=off`, canary 0, kill switch ON, geração/render/IA OFF, publishing global e todos os canais OFF, aprovação obrigatória, budgets 0, attribution OFF, triage/requeue OFF e triage kill switch ON.
- Security Advisor reexecutado: Marketing permanece no padrão server-only com RLS ligado e sem policies públicas; os WARNs de `SECURITY DEFINER` encontrados pertencem a WhatsApp/Agent Workflow, fora deste escopo.

## Bloco implementado
Segundo slice da UI privada/dormente foi transplantado: `admin-v3/marketing-editor-v1.js`.

O editor:
- exige a sessão JWT do Admin V3 e envia `Authorization: Bearer <access_token>`;
- usa exclusivamente a Edge protegida `admin-marketing-workflow-v1`;
- recusa respostas que não declarem `external_side_effect=false`;
- permite edição rápida de título, formato, headline, subtítulo, preço, CTA, escala e posição;
- oferece preview local no navegador;
- mantém revisão/fork para conteúdo aprovado ou imutável;
- permite solicitar renderização apenas pela fila interna e pelos gates server-side já existentes;
- mantém intenção `ai/hybrid` separada de execução, com IA real ainda OFF;
- não chama Meta, OpenAI, Pinterest ou Google diretamente;
- continua sem qualquer mount no Admin público `admin/app-lite.js`.

## TDD e CI
Foi executado um ciclo RED→GREEN real:
1. o contrato `scripts/test-marketing-editor-v1.mjs` entrou antes do arquivo do editor;
2. o workflow `Marketing Center Clean Transplant` falhou como esperado no commit `274d05617d2c0c73f332f614e58513ae9ea4b493`, provando que o contrato detectava a ausência da implementação;
3. o editor foi transplantado, o guard de isolamento foi ampliado e o workflow passou a executar `node --check` no editor;
4. o workflow `Marketing Center Clean Transplant` no commit funcional `ef40addfcc997e1d15b7dd4974e0ceec28832ad6` concluiu `completed/success`.

O contrato cobre: JWT obrigatório, fail-closed de side-effect, ausência de chamadas externas diretas, isolamento do Admin público, revisão append-only, imutabilidade após aprovação e renderização delegada ao gate de banco.

## Rollout
Nenhuma migration ou Edge Function foi implantada nesta rodada. Nenhum gate do Supabase foi alterado. Nenhuma publicação, geração paga, requeue ou integração externa foi acionada.

## Próxima rodada segura
1. Reauditar `main`/PR #276/Supabase.
2. Continuar o transplante da UI privada por slice coerente, preferencialmente compositor principal/biblioteca de comandos-modelos e seus contratos, sem montar nada no Admin público.
3. Manter o editor e demais superfícies Marketing fora do Admin público até existir host autenticado compatível com RBAC/JWT.
4. Continuar sem publishers reais, IA paga, requeue ou aumento de canary.
5. Se a divergência com `main` tornar a integração insegura, criar novo transplante limpo em vez de forçar merge/rebase.