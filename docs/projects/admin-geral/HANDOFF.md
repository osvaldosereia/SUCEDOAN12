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
R1–R6 DONE. R7 IN_PROGRESS — Cestas e Central Comercial.
R6 foi fechada com quatro fluxos explícitos no hub de Conferência Física: Balanço rápido, Gôndolas, Validades e ficha do produto. Gôndolas recebeu camada aditiva de confirmação/busy/anti-duplo acionamento; Balanço recebeu camada aditiva de busy/cooldown, acessibilidade e clareza offline; contratos backend existentes permaneceram intactos. Validades foi apenas exposta como capacidade legada existente, sem criar novo runtime. Teste: `tests/admin-r6-inventory-v2-contract.test.mjs`. Nenhuma escrita real/canary/publishing/outbound foi usada para validar.
Próxima execução: inventariar código real de Cestas e Central Comercial, confirmar gates da Central Comercial e iniciar melhorias mobile/desktop sem ativar o módulo gated nem alterar pedidos/dados reais.
