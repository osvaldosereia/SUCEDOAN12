# Vitrine Admin — continuidade da organização estrutural (18/10/2026)

## Escopo vigente
Refatorar o **sistema legado funcional** em `vitrine/admin/`, sem reconstrução da aplicação, sem migração WhatsApp e sem alterar regras de negócio, contratos Supabase, Bling, fiscal, estoque ou impressão. Preservar alterações de segurança P0.

## Referência de continuidade
Repositório: `osvaldosereia/SUCEDOAN12`.
Commits recentes examinados:
- `07106da`: privilégios de execução de RPCs Supabase;
- `b910faf`: autenticação na busca de cliente por telefone;
- `96c1314`: expiração OAuth Bling;
- `c21ba83`: estoque verificado e reconexão Bling na tela de produtos.

## Diagnóstico comprovado pela leitura do início de `vitrine/admin/index.html`
- CSS extensivo incorporado diretamente ao HTML;
- sucessivas redefinições de `:root` e estilos de aparência (base, Material-like e Visual Standard V4), com dependência explícita da ordem de cascata;
- regras responsivas distribuídas em múltiplos blocos;
- estilos de produtos, clientes, pedidos, compras XML, estoque, validade e impressão compartilhando o mesmo documento.

Esses fatos indicam acoplamento estrutural e dificultam manutenção. **Não significam que as regras sejam mortas ou duplicadas semanticamente**: não remover seletores sem mapear usos e precedência.

## Execução em lotes amplos, sem mudanças funcionais
1. Inventariar scripts, estilos, seções, pontos de entrada, dependências e funções públicas do Admin.
2. Extrair CSS por blocos contíguos preservando a ordem original, especificidade, media queries e URLs relativas; manter a folha de estilo atual como referência até confirmar paridade.
3. Isolar helpers puros e constantes sem alterar assinatura, inicialização, escopo ou ordem de execução.
4. Consolidar funções comprovadamente equivalentes após verificar todos os call sites; não apagar código por mera semelhança de nomes.
5. Organizar por domínio: produtos, clientes, pedidos, estoque, compras/XML, expedição, financeiro/fiscal, atendimento, impressão, marketing e infraestrutura.
6. Conferir sintaxe, imports e referências de arquivos alterados com verificações leves; executar testes específicos apenas quando uma mudança afetar contratos ou comportamento.
7. Registrar cada lote com arquivos alterados, commit e riscos remanescentes.

## Restrições
- Sem deploy automático ou migrações em produção.
- Sem mexer em autenticação/login como escopo de produto; não reverter proteções já implementadas.
- Não declarar homologação operacional sem evidência.
- Não modificar múltiplos domínios críticos em uma única substituição cega.

## Próxima ação técnica
Ler o HTML completo e a árvore dos assets do Admin para identificar pontos de extração com limites exatos; executar o primeiro lote de extrações em branch, preservando ordem e comportamento.
