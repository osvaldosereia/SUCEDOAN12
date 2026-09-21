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
R1–R13 DONE. R14 IN_PROGRESS — Logística, Financeiro, Bling e Fiscal.
R13 integrou Marketing ao Admin Geral apenas por camada UI-only aditiva; publishing, execution mode, channel gates, canary e credenciais continuam sob autoridade/gates do projeto Marketing Admin. Homologação externa permanece bloqueio próprio e não impede a conclusão segura da integração de interface do Admin Geral.
`main` permanece divergente apenas por SEO/dados públicos de cestas, fora do escopo atual; não incorporar automaticamente.
Próxima execução: inventariar as superfícies reais de Logística, Financeiro, Bling e Fiscal, incluindo contratos existentes e rotas do Admin. Preservar qualquer emissão fiscal, sincronização Bling, mutação financeira e operação real atrás dos gates/ações humanas já existentes. Melhorar apenas o que for seguro, aditivo e validável sem atingir pedidos/clientes/dados reais.
