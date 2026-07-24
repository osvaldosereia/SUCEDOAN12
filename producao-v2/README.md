# Admin Dona Antônia V2 — ambiente paralelo

Esta pasta contém a reconstrução modular do painel administrativo. Ela permite homologação completa sem alterar o admin em uso em `producao/index.html`.

## Proteção do sistema atual

Permanecem inalterados:

- `producao/index.html`;
- `producao/nfe-import.js`;
- `producao/nfe-import-core.js`.

Todos os arquivos desta reconstrução ficam dentro de `producao-v2/`. A V2 inicia com todas as gravações bloqueadas.

## Travas de gravação

A configuração possui uma trava geral e travas independentes:

- `writeMode`: gravação geral;
- `nfeImportMode`: importação de NF-e;
- `stockWriteMode`: ajustes manuais de estoque e validade;
- `collectionsWriteMode`: publicação de cestas e kits;
- `offerWriteMode`: aplicação das ofertas automáticas;
- `registryWriteMode`: padronização em lote de cadastros.

Ativar uma trava específica sem ativar `writeMode` não libera a operação. Ações críticas também exigem confirmação dentro da própria tela.

## Módulos implementados

### Visão geral e produtos

- dashboard de prioridades;
- lista rápida com busca, filtros, ordenação e paginação;
- editor lateral dividido por assunto;
- estado local por produto, sem reconstrução global da tela;
- auditoria de campos obrigatórios e avisos de qualidade;
- bloqueio de imagens base64;
- reconsulta remota e proteção de conflito de estoque;
- publicação segura de `site/produtos-home.json` e `catalog-version.json`.

### Entrada de NF-e

- leitura de arquivo XML ou conteúdo colado;
- validação de chave com 44 números e SHA-256;
- agrupamento por EAN/código do fornecedor;
- multiplicador caixa → unidade;
- rateio de desconto, custo unitário e preço sugerido;
- correspondência automática e manual com produtos;
- validade por lote, produto sem validade e regras manter/mais próxima/substituir;
- comparação campo a campo;
- simulação completa de produto existente ou novo;
- prévia exata de estoque, validade, lotes, histórico de custo e `entradas_nfe`;
- arquivamento do XML fiscal;
- registro fiscal atualizado após cada item;
- bloqueio global e por grupo contra duplicidade;
- estado `falhou` para retomada segura após execução parcial.

### Estoque e validade

- fila única de vencidos, sem estoque, estoque baixo e sem validade;
- filtros de vencimento em 5, 10, 15, 20, 25 e 30 dias;
- ordenação pela validade mais próxima entre os lotes;
- consulta de localização, lotes e estoque;
- ajuste manual com motivo obrigatório;
- reconsulta do estoque remoto antes de salvar;
- histórico em `ajustes_estoque`.

### Leitura rápida

- campo com foco contínuo para pistola/leitor;
- busca exata por EAN, código, SKU ou chave;
- busca por nome quando necessário;
- foto, preço, estoque, validade, lotes e localização;
- atalhos para o editor oficial de produto e para a fila oficial de estoque;
- nenhuma rotina de gravação duplicada.

### Cestas básicas e kits promocionais

- leitura de `site/produtos-cesta-basica.json` e `site/kits.json`;
- preservação do preço predefinido da cesta;
- validação da composição contra o Firebase;
- quantidade e estoque suficiente por item;
- produtos substitutos;
- cálculo de compra avulsa, economia e desconto do kit;
- limite disponível conforme estoque;
- preservação dos campos comerciais e do Instagram;
- diagnóstico de `carrosseis-kits/fila.json` por `kit_codigo`;
- criação, edição, exclusão e publicação sequencial protegida.

### Ofertas automáticas

Faixas implementadas:

- 3–7 dias: 50%;
- 8–15 dias: 40%;
- 16–31 dias: 35%;
- 32–46 dias: 30%;
- 47–65 dias: 25%;
- 66–76 dias: 20%;
- 77–91 dias: 10%;
- 92–105 dias: 5%.

A V2 nunca sobrescreve oferta manual. Com até dois dias ou produto vencido, a venda é bloqueada de forma reversível, preservando a situação anterior. Um novo lote seguro pode restaurar o produto pela mesma simulação.

### Cadastros

- categorias, subcategorias e subsubcategorias derivadas dos produtos;
- marcas, fornecedores e tags derivados do Firebase;
- detecção de variações por maiúsculas, acentos e espaços;
- mesclagem e renomeação em lote;
- escopo contextual para subcategorias;
- deduplicação de tags;
- reconsulta do campo remoto antes de cada alteração.

### Diagnóstico, integrações e backup

- consulta não destrutiva do Firebase e dos arquivos públicos;
- comparação Firebase × `produtos-home`;
- auditoria conjunta de catálogo, estoque, validade, cestas, kits, ofertas e cadastros;
- referência local dos webhooks Make sem dispará-los;
- registro de que o Bling continua mediado pelo Make;
- backup JSON sem o token GitHub;
- exportação CSV dos produtos;
- nenhuma chamada automática que crie pedido, contato, produto ou execução de cenário.

## Testes executados

- sintaxe de todos os módulos JavaScript locais com `node --check`;
- testes unitários de NF-e, transação, estoque, validade, cestas, kits, ofertas, cadastros, leitura rápida e diagnóstico;
- teste de falha parcial da NF-e e retomada sem duplicidade;
- testes de conflito remoto em estoque, ofertas e cadastros;
- testes de navegador separados para cada módulo;
- smoke test integrado com Produtos, Operações, Leitura rápida, Estoque, Cestas, Kits, Ofertas, Cadastros e Diagnóstico carregados juntos;
- verificação de IDs duplicados no DOM: nenhum;
- verificação dos destinos de todos os imports relativos: aprovada;
- comparação com `main`: alterações restritas a `producao-v2/`.

## Limites da homologação

Nenhuma gravação real foi executada no Firebase, GitHub, Make ou Bling durante os testes automatizados. Os testes de escrita usaram serviços simulados para validar ordem, conflitos, falhas parciais e recuperação. Antes de substituir o admin atual, ainda é necessário executar uma homologação controlada em navegador real com credenciais de teste e uma NF-e não utilizada.

O PR deve permanecer em rascunho e não deve ser mesclado até essa homologação controlada ser concluída.
