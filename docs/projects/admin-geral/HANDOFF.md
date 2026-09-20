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
R1–R7 DONE. R8 IN_PROGRESS — Imagens, nomes e qualidade do catálogo.
R7 foi fechada com Cestas responsivas e guardas contra duplo acionamento em busca/adicionar/atualizar/remover/salvar. A Central Comercial foi apenas inventariada em read-only e continua dormente por `commercialTruthUiEnabled=false`; nenhuma ativação foi feita.
R8 lote 1 criou `admin-catalog-quality-v2.js/css` como hub DOM-only dentro de Produtos. Ele apenas organiza acesso ao cadastro oficial, `nomes-produtos.html` e `imagens-ia.html`; não possui fetch/storage/API/IA próprios. Nomes e Imagens continuam autoridades funcionais, e qualquer ação com custo ou mutação exige comando explícito nas ferramentas existentes. Teste: `tests/admin-r8-catalog-quality-v2-contract.test.mjs`.
Próxima execução: revisar mobile/desktop e guardas das ferramentas Nomes/Imagens, preservar APIs/custos sob comando explícito e avaliar indicadores de completude somente com dados reais já disponíveis. Quando R8 estiver segura/completa, promover R9 — Pedidos.
