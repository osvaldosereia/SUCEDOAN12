# HANDOFF — Admin Geral R1–R16

Leia este arquivo PRIMEIRO em toda retomada automática ou nova conversa.

Repositório: `osvaldosereia/SUCEDOAN12`
Branch oficial desta frente: `admin-geral-r1-r16-autonomous-20260919`
Estado canônico: `docs/projects/admin-geral/CURRENT-STATE.md`
Plano mestre: `docs/projects/admin-geral/ROADMAP-MASTER.md`
Log: `docs/projects/admin-geral/EXECUTION-LOG.md`
Design System: `docs/projects/admin-geral/DESIGN-SYSTEM-V2.md`

## Procedimento obrigatório por rodada
1. Confirmar HEAD da branch e verificar mudanças paralelas relevantes em main.
2. Ler CURRENT-STATE.md e a rodada corrente no ROADMAP-MASTER.md.
3. Inspecionar código real antes de editar; não presumir arquitetura antiga.
4. Implementar lote amplo, coerente, reversível e validar contratos/testes disponíveis.
5. Não abrir efeitos externos para testar.
6. Atualizar CURRENT-STATE.md e EXECUTION-LOG.md ao terminar.
7. Se a rodada concluir, marcar DONE e promover a próxima.
8. Bloqueio humano em um subitem não impede trabalho seguro independente.

## Autorização e isolamentos
O proprietário autorizou decisões técnicas autônomas até R16. Interação só é indispensável para credencial/ação humana, custo novo, produção real, efeito em clientes/dados reais ou operação destrutiva relevante.
- App Dona Antônia: fora do escopo.
- Customer & Marketing OS: preservar gates/documentação.
- Marketing Admin / Organic Social: preservar publishing OFF/kill switch até homologação própria.

## Ponto de retomada
R1–R15 DONE. R16 IN_PROGRESS — Segurança, QA, homologação e limpeza final.
R16 lote 1 criou o contrato transversal `tests/admin-r16-final-contract.test.mjs` e o workflow read-only `.github/workflows/admin-geral-contracts.yml`, que executa os contratos `tests/admin-*.test.mjs` sem secrets/deploy/providers. A primeira execução do CI foi iniciada e ainda estava em andamento no fechamento do lote.
`main` permanece divergente apenas por SEO/dados públicos de cestas (`be2b3d54`), fora do escopo atual; não incorporar automaticamente.
Próxima execução: fazer o preflight novamente, inspecionar o resultado do workflow Admin Geral contracts e corrigir qualquer falha programável real. Se todos os contratos passarem e não houver regressão nova de gates/rotas/capacidades, registrar a evidência final, marcar R16 DONE e encerrar o roadmap autônomo. Homologação externa não faz parte desse DONE programável: credenciais, Meta, publishing, outbound, canary, IA paga, Bling/fiscal, providers e dados reais continuam exigindo gates/evidência humana próprios.
