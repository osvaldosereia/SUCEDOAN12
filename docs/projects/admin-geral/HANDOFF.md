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
2. Ler CURRENT-STATE.md.
3. Ler a seção da rodada corrente em ROADMAP-MASTER.md.
4. Inspecionar código real antes de editar; não presumir arquitetura antiga.
5. Implementar um lote amplo, coerente e reversível.
6. Validar sintaxe/contratos/testes disponíveis.
7. Não abrir efeitos externos para “testar”.
8. Atualizar CURRENT-STATE.md e EXECUTION-LOG.md no fim.
9. Se a rodada concluir, marcar DONE e promover a próxima.
10. Se houver bloqueio humano, registrá-lo e continuar todo trabalho seguro independente.

## Autorização
O proprietário autorizou decisões técnicas autônomas e avanço até R16. Interação só é indispensável para credencial/ação humana, custo novo, produção real, efeito em clientes/dados reais ou operação destrutiva relevante. Isso não interrompe tarefas seguras paralelas.

## Isolamentos
- App Dona Antônia: fora do escopo e não deve ser modificado.
- Customer & Marketing OS: preservar seus gates e documentação.
- Marketing Admin / Organic Social: preservar publishing OFF/kill switch e gates atuais até homologação própria.

## Ponto de retomada
R1–R3 DONE. R4 IN_PROGRESS.
A navegação global/responsiva está coberta pelo Shell V2, subpage shell, bootstrap fail-safe e context nav aditivo. Relacionamento, Atendimento, Inteligência e Aprendizados preservam suas navegações/estilos internos e agora têm retorno consistente ao Admin sem alterar gates. A R4 começou com `admin-dashboard-v2.js/css`: o Início ganhou “Precisa da sua atenção”, derivado apenas das métricas já carregadas e sem novo fetch/escrita. Próximo lote: enriquecer a Central de Trabalho com pendências read-only reais disponíveis, manter baixa densidade no mobile e só oferecer período/comparação se houver contrato backend real.
