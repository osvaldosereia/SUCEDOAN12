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
- A Entrada de NF-e está disponível somente para leitura e conferência; não grava estoque, produto, lote, nota ou XML.

## Estrutura

- `index.html`: casca da interface.
- `assets/admin.css`: sistema visual consolidado.
- `assets/nfe.css`: interface isolada da bancada de conferência de NF-e.
- `js/config.js`: configurações padrão.
- `js/core/store.js`: estado e alterações pendentes.
- `js/core/utils.js`: utilidades sem dependência de interface.
- `js/core/catalog.js`: normalização, validação, auditoria e geração do catálogo público.
- `js/core/nfe.js`: parsing, agrupamento, multiplicador, custos, margem, correspondência e duplicidade da NF-e.
- `js/services/firebase.js`: carregamento e salvamento seguro.
- `js/services/github.js`: leitura de registros fiscais, teste de conexão e publicação sequencial no GitHub.
- `js/modules/products.js`: lista, filtros, qualidade e editor de produtos.
- `js/modules/publish.js`: revisão obrigatória e coordenação da publicação.
- `js/modules/nfe.js`: bancada visual de análise da NF-e em modo somente leitura.
- `js/nfe-bootstrap.js`: inicialização isolada e carregamento sob demanda do catálogo para a NF-e.
- `js/app.js`: navegação, painel, diagnóstico e coordenação da aplicação.

## Validações implementadas

Erros que bloqueiam salvamento/publicação incluem campos essenciais ausentes, preço inválido, oferta inválida ou sem data final, desconto acima do limite e imagem local/base64. EAN, NCM, imagem pública, subcategoria, marca, fornecedor, descrição e custo ausentes são mostrados como avisos de qualidade.

## NF-e — fase de conferência

A V2 já consegue:

- ler arquivo XML ou conteúdo colado;
- validar a chave de acesso com 44 números;
- comparar a chave escaneada com o XML;
- gerar SHA-256 do documento quando o navegador oferece suporte;
- agrupar linhas repetidas por EAN ou código do fornecedor;
- detectar multiplicador por `qCom/qTrib` e pela descrição da embalagem;
- distribuir o desconto total da nota entre os grupos;
- calcular unidades recebidas, custo líquido unitário e preço sugerido por margem;
- localizar produtos por EAN e sugerir vínculos por código ou nome;
- calcular o estoque projetado sem alterar o Firebase;
- consultar `fiscal/nfe-importadas/registros/{chave}.json`;
- bloquear visualmente notas e grupos já aplicados;
- detectar duplicidade adicional em `entradas_nfe` do produto;
- exportar um JSON da análise para comparação.

Nenhum botão de aplicar/importar foi criado nesta fase.

## Teste comparativo executado

Foi reproduzido o caso fiscal `35260715436940002734550010431539491114617900`, que possui duas linhas do mesmo EAN. O teste confirmou:

- agrupamento das duas linhas em um produto;
- quantidade comercial total de 10 unidades;
- valor bruto de R$ 99,90;
- desconto total de R$ 24,99;
- valor líquido de R$ 74,91;
- custo unitário calculado de R$ 7,49;
- preço sugerido de R$ 12,48 com margem simulada de 40%;
- detecção do registro fiscal concluído;
- manutenção do bloqueio de duplicidade mesmo após vínculo manual do produto.

## Próximas migrações

1. Comparar outros XMLs reais entre o admin atual e a bancada V2 e corrigir divergências de cálculo ou vínculo.
2. Adicionar validade, lotes e regras de atualização em modo de simulação.
3. Implementar sessão transacional e salvamento controlado da NF-e, ainda sem substituir o admin atual.
4. Migrar a fila operacional de estoque e validade.
5. Migrar cestas e kits.
6. Migrar ofertas automáticas.
7. Migrar categorias, marcas, fornecedores e tags.
8. Migrar Make, Bling, importação/exportação e manutenção avançada.
9. Executar testes comparativos antes de considerar a substituição do admin atual.
