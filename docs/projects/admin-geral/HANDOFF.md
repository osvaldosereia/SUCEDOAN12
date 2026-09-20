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
R1–R8 DONE. R9 IN_PROGRESS — Pedidos e operação de venda.
R8 foi fechada preservando as autoridades funcionais de Nomes/Imagens, mobile/touch e ações de custo explícitas; `image-r8-safety.js` adiciona guarda UI contra repetição acidental sem API/storage próprios.
R9 lote 1 criou `admin-orders-r9-v2.js/css`: camada DOM-only sobre `pedidos-v2.js`, com referência visual do fluxo operacional e cards mobile, sem criar transições de status nem persistência paralela. Teste: `tests/admin-r9-orders-v2-contract.test.mjs`.
Próxima execução: inventariar detalhe/status reais do backend de Pedidos, reforçar guardas de ações repetíveis e melhorar filtros apenas sobre contratos já existentes. Bling/WhatsApp/outbound continuam sem ativação.
