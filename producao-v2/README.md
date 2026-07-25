# Admin oficial Dona Antônia

O painel em `producao-v2/` é o sistema administrativo oficial da Dona Antônia. O acesso habitual por `producao/` direciona para esta versão.

## Decisões de operação

- não existe login ou gestão de usuários dentro do painel;
- token GitHub, webhooks Make e demais configurações ficam no `localStorage` do navegador autorizado;
- a fonte oficial dos produtos é o Firebase Realtime Database em `/produtos`;
- o catálogo público é sincronizado para `site/produtos-home.json` e `catalog-version.json`;
- banners foram removidos do site e não fazem mais parte do fluxo administrativo;
- operações destrutivas, como arquivar produto e cancelar pedido, exigem confirmação na própria ação.

## Produtos

- busca, filtros, ordenação e paginação;
- edição por assunto;
- salvamento por `PATCH`, apenas dos campos alterados;
- comparação completa entre versão original, versão remota e alteração local;
- aviso de conflito por campo quando outra sessão alterou o mesmo dado;
- criação manual de produto novo;
- verificação de código e EAN duplicados;
- campos comerciais, fiscais, logísticos, SEO e Bling;
- categoria, subcategoria, marca e fornecedor digitáveis;
- imagem editada em WebP e enviada ao GitHub;
- histórico das URLs de imagem anteriores;
- lixeira em `produtos_excluidos`, com restauração pela mesma chave;
- auditoria das gravações em `logs_admin`.

## Catálogo público

Qualquer gravação em `/produtos` solicita uma sincronização imediata pelo GitHub. Como contingência, um workflow também sincroniza a cada cinco minutos.

A sincronização atualiza em conjunto:

- `site/produtos-home.json`;
- `catalog-version.json`.

O botão de publicação manual continua disponível como contingência e utiliza os mesmos campos do sincronizador automático.

## Entrada de NF-e

- leitura de XML ou conteúdo colado;
- chave de 44 números e controle de duplicidade;
- agrupamento de itens;
- multiplicador caixa para unidade;
- desconto, custo e margem;
- correspondência automática ou manual;
- validade, lotes e produto sem validade;
- produto existente ou novo;
- arquivamento do XML;
- registro fiscal atualizado após cada item;
- retomada após execução parcial.

A importação exige a simulação e a confirmação da nota dentro da própria tela.

## Estoque e validade

- vencidos, estoque zerado, estoque baixo e sem validade;
- filtros de 5, 10, 15, 20, 25 e 30 dias;
- ordenação pelo vencimento mais próximo;
- ajuste com motivo obrigatório;
- reconsulta remota antes da gravação;
- histórico em `ajustes_estoque`.

## Cestas, kits e Compra Rápida

- criação, edição, exclusão e publicação de cestas e kits;
- validação dos itens contra o Firebase;
- estoque, substitutos, economia e limite disponível;
- fila de carrossel do Instagram por `kit_codigo`;
- editor da Compra Rápida dentro da V2;
- seções e itens personalizáveis;
- pesquisa de produtos;
- seleção de todos os resultados da busca em um clique;
- produto padrão por item.

## Ofertas e cupons

- ofertas automáticas por validade;
- ofertas manuais preservadas;
- bloqueio reversível de venda insegura;
- histórico em `site/ofertas-historico.json`;
- limpeza de ofertas vencidas;
- execução automática a cada hora;
- criação, edição, ativação, desativação e exclusão de cupons;
- publicação de `site/cuponsativos.json`.

## Pedidos

- lista, busca e filtros;
- detalhes do cliente, entrega, pagamento e itens;
- atualização de separação, conferência, entrega e cancelamento;
- reenvio controlado ao Make/Bling;
- registro da resposta ou erro no pedido;
- etiqueta de separação 100 × 150 mm, sem valores e com produtos faltantes separados.

## Cadastros

- categorias, subcategorias, subsubcategorias, marcas, fornecedores e tags derivados do Firebase;
- detecção de variações por maiúsculas, acentos e espaços;
- renomeação e mesclagem em lote;
- digitação direta de novos valores no editor de produto.

## Backup e diagnóstico

- backup de produtos em JSON;
- exportação de produtos em CSV;
- backup das configurações locais;
- backup de cupons e Compra Rápida;
- auditoria local e auditoria no Firebase;
- comparação entre Firebase e arquivos públicos;
- diagnóstico de catálogo, estoque, cestas, kits, ofertas e integrações.

## Testes automatizados

O workflow `Testar Admin V2 definitivo` valida:

- sintaxe dos módulos JavaScript;
- resolução dos imports relativos;
- JSONs obrigatórios;
- banners vazios e desativados;
- workflows de catálogo e ofertas;
- cadastro, lixeira, conflito por campo, pedidos, cupons e Compra Rápida;
- etiqueta 100 × 150 mm e reenvio Make/Bling.

## Testes manuais obrigatórios

Antes de considerar o trabalho operacionalmente encerrado, devem ser executados em navegador autorizado:

1. editar e salvar um produto existente de teste;
2. cadastrar, arquivar e restaurar um produto de teste;
3. publicar um cupom e uma pequena alteração na Compra Rápida;
4. testar uma NF-e ainda não utilizada;
5. confirmar no site público a sincronização do catálogo;
6. testar um pedido controlado no Make/Bling.

Nenhum desses testes deve utilizar uma NF-e ou pedido real já processado anteriormente.
