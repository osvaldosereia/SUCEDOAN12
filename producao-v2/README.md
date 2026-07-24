# Admin Dona Antônia V2 — ambiente paralelo

Esta pasta contém a reconstrução gradual do admin. Ela foi criada para permitir limpeza estrutural, testes e validação sem alterar o admin em uso em `producao/index.html`.

## Garantias desta etapa

- `producao/index.html` permanece inalterado.
- `producao/nfe-import.js` permanece inalterado.
- A V2 carrega produtos diretamente do Firebase.
- A V2 inicia com gravações bloqueadas (`writeMode: false`).
- A V2 possui nova navegação, painel geral, lista de produtos, filtros e editor lateral.
- O salvamento implementado na V2 consulta novamente o produto remoto e bloqueia conflito de estoque.
- A publicação exige catálogo confirmado pelo Firebase, ausência de erros obrigatórios, GitHub configurado e confirmação explícita.
- O fluxo publica primeiro os produtos alterados no Firebase e somente depois atualiza `site/produtos-home.json` e `catalog-version.json`.
- Salvamentos em lote atualizam a interface apenas ao final, evitando renderização completa a cada produto.

## Estrutura

- `index.html`: casca da interface.
- `assets/admin.css`: sistema visual consolidado.
- `js/config.js`: configurações padrão.
- `js/core/store.js`: estado e alterações pendentes.
- `js/core/utils.js`: utilidades sem dependência de interface.
- `js/core/catalog.js`: normalização, validação, auditoria e geração do catálogo público.
- `js/services/firebase.js`: carregamento e salvamento seguro.
- `js/services/github.js`: teste de conexão e publicação sequencial no GitHub.
- `js/modules/products.js`: lista, filtros, qualidade e editor de produtos.
- `js/modules/publish.js`: revisão obrigatória e coordenação da publicação.
- `js/app.js`: navegação, painel, diagnóstico e coordenação da aplicação.

## Validações implementadas

Erros que bloqueiam salvamento/publicação incluem campos essenciais ausentes, preço inválido, oferta inválida ou sem data final, desconto acima do limite e imagem local/base64. EAN, NCM, imagem pública, subcategoria, marca, fornecedor, descrição e custo ausentes são mostrados como avisos de qualidade.

## Próximas migrações

1. Migrar Entrada de NF-e preservando a ponte, lotes, validade e proteção contra duplicidade.
2. Migrar a fila operacional de estoque e validade.
3. Migrar cestas e kits.
4. Migrar ofertas automáticas.
5. Migrar categorias, marcas, fornecedores e tags.
6. Migrar Make, Bling, importação/exportação e manutenção avançada.
7. Executar testes comparativos antes de considerar a substituição do admin atual.
