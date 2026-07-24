# Relatório de testes — Admin Dona Antônia V2

Data da consolidação: 24/07/2026

## Escopo

Validação da reconstrução paralela localizada em `producao-v2/`, sem substituição do admin atual.

## Testes de sintaxe e estrutura

- `node --check` nos módulos JavaScript usados nos testes locais: aprovado.
- Grafo de imports relativos: todos os destinos encontrados.
- HTML e componentes dinâmicos: nenhum ID duplicado após carregamento conjunto.
- Navegação principal: Visão geral, Produtos, Operações, Vendas e promoções, Cadastros e Configurações carregadas no smoke test.

## Produtos e catálogo

- carregamento e normalização do Firebase;
- filtros e paginação;
- edição local por produto;
- erros obrigatórios e avisos de qualidade;
- conflito de estoque;
- bloqueio de base64;
- ordem de publicação Firebase → produtos-home → catalog-version.

Resultado: aprovado com serviços simulados para escrita.

## Entrada de NF-e

- XML 4.00;
- chave com 44 números;
- agrupamento de linhas repetidas;
- multiplicador caixa/unidade;
- rateio de desconto;
- custo e margem;
- correspondência automática/manual;
- validade, lotes e produto sem validade;
- simulação de produto existente e novo;
- duplicidade global, por grupo e por `entradas_nfe`;
- arquivamento do XML;
- atualização do registro após cada item;
- falha parcial e retomada segura.

Caso real reproduzido: `35260715436940002734550010431539491114617900`.

Resultado: aprovado em modo simulado. Nenhuma NF-e real foi importada pela V2.

## Estoque e validade

- status vencido, crítico, próximo, sem estoque, estoque baixo e sem validade;
- janelas de 5, 10, 15, 20, 25 e 30 dias;
- lote com validade mais próxima;
- motivo obrigatório;
- conflito remoto;
- histórico do ajuste.

Resultado: aprovado com gravação simulada.

## Cestas e kits

- preço predefinido de cesta preservado;
- produto inexistente/inativo/sem preço/sem estoque;
- estoque suficiente conforme quantidade;
- substitutos;
- economia e desconto de kit;
- período e limite;
- fila de Instagram por `kit_codigo`;
- bloqueio de imagem base64.

Resultado: aprovado com publicação GitHub simulada.

## Ofertas automáticas

- limites inferiores e superiores de todas as faixas;
- oferta manual preservada;
- bloqueio reversível com até dois dias;
- produto vencido;
- limpeza fora da janela;
- restauração após validade segura;
- conflito remoto.

Resultado: aprovado com gravação simulada.

## Cadastros

- agrupamento por valor normalizado;
- variantes de maiúsculas, acentos e espaços;
- categoria/subcategoria/subsubcategoria;
- marcas, fornecedores e tags;
- mesclagem contextual;
- conflito remoto durante lote.

Resultado: aprovado com gravação simulada.

## Leitura rápida

- EAN, código e busca parcial;
- foco contínuo para leitor;
- estoque, validade, lotes e localização;
- atalhos para os editores oficiais.

Resultado: aprovado no navegador automatizado.

## Diagnóstico e backup

- Firebase;
- produtos-home;
- catalog-version;
- cestas, kits e fila;
- auditoria integrada;
- CSV;
- backup JSON sem token GitHub;
- Make e Bling não chamados.

Resultado: aprovado no navegador automatizado.

## Smoke test integrado

Todos os módulos, exceto a NF-e — já validada em teste de navegador próprio — foram carregados juntos com rotas interceptadas e dados simulados equivalentes às fontes reais.

Verificações:

- 3 produtos carregados;
- Leitura rápida e Estoque ativos em Operações;
- Cestas, Kits e Ofertas ativos em Vendas e promoções;
- Cadastros ativo;
- Diagnóstico executado;
- nenhum erro JavaScript de página;
- nenhum ID duplicado.

Resultado: aprovado.

## Pendência obrigatória antes de substituir produção

Executar homologação controlada com:

1. credenciais reais em navegador autorizado;
2. uma NF-e de teste ainda não utilizada;
3. um produto de teste no Firebase;
4. uma publicação de catálogo de teste;
5. uma cesta ou kit de teste;
6. confirmação visual no site público e nos registros fiscais.

Até essa homologação, todas as travas devem permanecer desligadas e o PR deve permanecer em rascunho.
