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
R1–R14 DONE. R15 IN_PROGRESS — Automações, Copiloto, Integrações e Saúde.
R15 lote 1 inventariou Automation Builder e Copiloto, preservando `automationBuilderUiEnabled=false` e `humanCopilotEnabled=false`; criou `admin-r15-systems-v2.js/css` e contrato próprio para UX/mobile/busy guard sem transporte ou persistência paralela. Nenhum runtime, IA paga ou outbound foi acionado.
`main` permanece divergente apenas por SEO/dados públicos de cestas, fora do escopo atual; não incorporar automaticamente.
Próxima execução: inventariar superfícies restantes de integrações e saúde/observabilidade, seus gates e contratos. Integrar apenas UX/observabilidade segura, sem probes destrutivos, providers reais, IA paga, outbound ou clientes/dados reais. Se os critérios programáveis da R15 forem satisfeitos, marcar DONE e promover R16.
