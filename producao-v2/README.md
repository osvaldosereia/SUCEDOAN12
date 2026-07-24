# Admin Dona Antônia V2 — ambiente paralelo

Esta pasta contém a reconstrução gradual do admin. Ela foi criada para permitir limpeza estrutural, testes e validação sem alterar o admin em uso em `producao/index.html`.

## Garantias desta etapa

- `producao/index.html` permanece inalterado.
- `producao/nfe-import.js` permanece inalterado.
- A V2 carrega produtos diretamente do Firebase.
- A V2 inicia com gravações bloqueadas (`writeMode: false`).
- A V2 possui nova navegação, painel geral, lista de produtos, filtros e editor lateral.
- O salvamento implementado na V2 consulta novamente o produto remoto e bloqueia conflito de estoque.

## Estrutura

- `index.html`: casca da interface.
- `assets/admin.css`: sistema visual consolidado.
- `js/config.js`: configurações padrão.
- `js/core/store.js`: estado e alterações pendentes.
- `js/core/utils.js`: utilidades sem dependência de interface.
- `js/services/firebase.js`: carregamento e salvamento seguro.
- `js/modules/products.js`: lista, filtros e editor de produtos.
- `js/app.js`: navegação, painel e coordenação da aplicação.

## Próximas migrações

1. Consolidar a validação final e publicação do catálogo público.
2. Migrar Entrada de NF-e preservando a ponte e a proteção contra duplicidade.
3. Migrar cestas e kits.
4. Migrar ofertas automáticas.
5. Migrar categorias, marcas, fornecedores e tags.
6. Migrar integrações, importação/exportação e diagnóstico.
7. Executar testes comparativos antes de considerar a substituição do admin atual.
