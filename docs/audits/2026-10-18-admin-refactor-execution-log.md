# Reorganização incremental do Vitrine Admin — lote 1

## Escopo aplicado nas branches
- PR #1106: sete formatadores extraídos para `core/formatters.js`.
- PR #1107: quatro formatadores de identificação extraídos para `core/identifiers.js`.
- PR #1108: catálogo `errorMessage` extraído para `core/errors.js`.

Os três PRs são encadeados: #1108 depende de #1107, que depende de #1106. Nenhum PR está automaticamente autorizado para merge/deploy.

## Invariantes
1. Os scripts auxiliares são carregados **antes** da IIFE principal do Admin.
2. O Admin continua usando os nomes locais existentes por desestruturação, sem alterar chamadas.
3. O conteúdo das funções foi copiado literalmente; qualquer alteração funcional exige PR específico.
4. Estoque, separação, NF-e, Bling e criação de pedidos permanecem fora do escopo destes lotes.
5. Não introduzir autenticação ou novo login.

## Gates
- Executar os três testes de extração e as regressões de pedidos, fiscal e integração WhatsApp.
- Revisar manualmente o carregamento dos scripts no navegador e erros de console antes de merge.
- Após integração, verificar navegação, pedidos, telefone/CPF e mensagens de erro em homologação.
- Em caso de falha, reverter o commit de integração e restaurar a versão anterior.

## Próximos lotes
1. Isolar CSS de impressão e sua construção em módulo próprio **com teste visual e impressão real**.
2. Mapear os controladores de telas para extração por responsabilidade, evitando mover funções com dependências implícitas.
3. Organizar módulos de pedidos e estoque após testes transacionais e de concorrência.

**Estado:** código em branches de revisão; produção inalterada.
