# Regras de manutenção do site público

Estas regras se aplicam a qualquer ajuste em `/site`. O objetivo é evoluir o site atual sem acumular correções sobrepostas nem quebrar o pedido e o checkout.

## Antes de alterar

- Leia este arquivo, `site/README.md` e os módulos que atendem a tela afetada.
- Trace o fluxo atual do usuário e os dados da API antes de mudar a interface. Preserve as regras de negócio e reutilize a estrutura e as funções existentes quando couber.
- Faça a menor alteração completa possível. Não recrie a mesma tela, evento, regra ou componente em outro lugar para contornar o código existente.

## CSS e interface

- Edite a regra existente no lugar. Não empilhe overrides ao fim da folha para substituir estilos anteriores.
- Quando uma mudança de HTML/renderização tornar estilos antigos desnecessários, remova os seletores e estados obsoletos na mesma alteração.
- Antes de concluir, compare seletores de classe e ID com `index.html` e as marcações montadas nos templates JavaScript. Considere também referências por `classList`, seletores e estados condicionais. Não remova algo só por uma busca simples sem conferir esses usos.
- Mantenha o CSS responsivo e teste a tela em largura móvel e desktop. Para ícones, prefira os SVGs inline existentes; não adicione uma biblioteca de ícones para poucos símbolos.

## JavaScript e comportamento

- Mantenha cada responsabilidade no módulo existente: API, carrinho, clientes, paginação ou renderização. Extraia um módulo somente se reduzir acoplamento e tiver mais de um uso claro.
- Não deixe funções, imports, estado, marcação ou estilos sem uso. Remova o caminho antigo quando substituí-lo.
- Conteúdo vindo de produtos, clientes ou da API precisa continuar escapado antes de entrar em HTML. Preserve a carga sob demanda e o tratamento de erros de rede.
- No checkout, preserve a ordem: cesta, componentes da cesta sem preço individual e produtos avulsos com preço.

## Verificação antes do PR

1. Rode `node --test site/tests/*.test.mjs` e `node --check` nos módulos JavaScript alterados.
2. Rode `git diff --check` e revise o diff completo para encontrar duplicação, código morto e mudanças fora do escopo.
3. Teste a tela afetada no navegador em mobile e desktop, incluindo os principais controles do fluxo. Nunca envie um pedido real durante o teste.
4. Atualize as versões de cache no HTML quando CSS ou JavaScript publicado mudar; confirme que o HTML publicado carrega as versões esperadas.
5. Faça alterações no branch em sequência. Não grave arquivos diferentes em paralelo na mesma branch por chamadas de GitHub que possam competir e sobrescrever o ponteiro do branch.
6. No PR, registre o comportamento preservado e os testes feitos. Só declare publicado após confirmar o merge e a versão carregada no domínio.
