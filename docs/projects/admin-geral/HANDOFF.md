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
R1–R5 DONE. R6 IN_PROGRESS.
R6 lote 1 inventariou as superfícies reais e criou `admin-inventory-v2.js/css`: hub DOM-only na rota Produtos apontando para `contagem/`, `admin/gondolas.html` e ficha de Produtos, sem fetch/storage/escrita própria. Balanço mantém `inventory-fast-balance-v3` + `scan_batch`/fila local; Gôndolas mantém `admin-gondolas-v1` + `scan_ean`. Contrato novo em `tests/admin-r6-inventory-v2-contract.test.mjs`. Preflight: HEAD inicial `490bcb40`, branch 91 à frente/0 atrás, merge-base = main `c635df8`. Próximo lote: guardas contra ações acidentais em Gôndolas, ergonomia/duplo acionamento do Balanço e revisão de validade usando somente contratos reais; nenhuma escrita real/canary deve ser usada para validar.
