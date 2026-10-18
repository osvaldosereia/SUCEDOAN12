# Plano de extração dos controladores — Vitrine Admin

## Linha de base
Após os lotes #1106 a #1109, o HTML ainda contém aproximadamente 508 declarações de função no padrão `function nome(...)` e 116 nomes com prefixos típicos de controladores (`render`, `paint`, `load`, `open`, `print`, `handle`). Essas contagens são heurísticas, não uma análise completa de chamadas.

## Critérios antes de mover controladores
- Identificar dependências sobre `state`, `api`, `toast`, `esc`, `window`, `document`, timers e serviços externos.
- Registrar os elementos DOM usados e a ordem de inicialização.
- Manter os contratos e os nomes chamados por outros módulos.
- Adicionar testes de interface para cada conjunto antes de separar.
- Não mover, no mesmo PR, ações de estoque, separação, emissão fiscal ou integrações Bling.

## Sequência sugerida
1. Renderizadores sem mutação de estado nem chamadas externas.
2. Controladores de interface com dependências explicitamente injetadas.
3. Operações de leitura, paginação e filtros.
4. Escritas operacionais com testes de regressão transacionais.
5. Serviços de integração e efeitos externos, após homologação dedicada.

## Testes mínimos
- Carregamento de todos os scripts no navegador sem erro de console.
- Navegação entre Central, Atendimento, Pedidos, Produtos e Estoque.
- Formatação de pedidos e contatos, erros e impressão.
- Fluxo de pedidos sem mudança no status, reserva ou consumo de estoque.
- Separação, Bling e NF-e em ambiente controlado.

## Política de integração
PRs encadeados devem ser integrados em ordem, após aprovação dos testes e revisão de compatibilidade. Testes automatizados de Node não substituem homologação em navegador.
