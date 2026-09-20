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
R1 e R2 DONE. R3 IN_PROGRESS.
Shell V2 do Admin principal está integrado. `gondolas.html`, `creative-studio.html` e `pedidos.html` usam migração direta. `nomes-produtos.html` e `imagens-ia.html` passaram a usar bootstrap allowlisted pelo `comprar-ui.js`, que injeta Design System/Shell somente nessas páginas e mantém fallback legado se o import falhar. Próximo lote: revisar Marketing, Relacionamento e Atendimento para adoção segura do shell sem tocar gates/efeitos; depois tratar `inteligencia.html` e `aprendizados.html` separadamente por ainda usarem a família visual antiga. Manter R3 aberta até cobertura segura das superfícies principais em desktop/tablet/mobile.
