# Relatório de validação — Admin oficial Dona Antônia

Data da consolidação: 25/07/2026

## Escopo validado automaticamente

O workflow `Testar Admin V2 definitivo` executa a validação estrutural do painel e dos processos de publicação.

### Estrutura e sintaxe

- todos os arquivos JavaScript de `producao-v2/js/` passam por `node --check`;
- imports relativos são resolvidos e seus destinos precisam existir;
- JSONs de cupons, Compra Rápida, ofertas e banners são analisados;
- os módulos obrigatórios do painel oficial precisam estar presentes;
- o arquivo de banners precisa permanecer vazio e explicitamente desativado.

Resultado atual: aprovado no GitHub Actions.

## Produtos

Validado no código e em testes automatizados:

- carregamento compartilhado do Firebase;
- cache curto com invalidação após gravação;
- salvamento por `PATCH`;
- detecção de conflito por campo;
- normalização de números, booleanos, EAN, NCM e CEST;
- cadastro manual de produto novo;
- lixeira, restauração e preservação da chave;
- histórico de imagens anteriores;
- auditoria em `logs_admin`;
- campos comerciais, fiscais, logísticos, SEO e Bling;
- categorias, marcas e fornecedores digitáveis.

Não foi criado nem alterado um produto real durante os testes automatizados.

## Catálogo público

Validado:

- sincronização imediata solicitada após mutação de produto;
- contingência automática a cada cinco minutos;
- geração de `site/produtos-home.json` diretamente do Firebase;
- atualização conjunta de `catalog-version.json`;
- paridade de campos entre publicação manual e automática;
- ausência de consulta pública ao arquivo de banners.

## Banners

- `site/banners/banners.json` permanece vazio;
- o arquivo está marcado como desativado;
- o catálogo público não possui endpoint nem armazenamento de banners;
- o workflow de ofertas não publica banners;
- as rotinas de oferta utilizam arquivo temporário isolado quando um contrato legado exige o parâmetro.

Resultado: banners removidos do fluxo público e administrativo.

## Ofertas e cupons

Validado:

- limpeza de ofertas por validade antes do processamento;
- execução de ofertas agendada a cada hora;
- publicação de produtos, estado, histórico e versão do catálogo;
- arquivo `site/ofertas-historico.json` presente;
- editor de cupons com criação, edição, ativação, desativação e exclusão;
- publicação de `site/cuponsativos.json`.

Nenhuma oferta real foi criada ou encerrada durante o teste estrutural.

## Compra Rápida, cestas e kits

Validado:

- editor da Compra Rápida incorporado à V2;
- seções e itens editáveis;
- busca de produtos;
- seleção de todos os resultados em um clique;
- definição de produto padrão;
- publicação de `site/compra-rapida.json`;
- módulos existentes de cestas e kits carregados pela cadeia oficial.

## Pedidos, Make e Bling

Validado:

- leitura dos pedidos do Firebase;
- filtros e detalhes;
- alteração de status;
- registro da alteração em `logs_admin`;
- reenvio controlado ao webhook de pedidos;
- armazenamento do resultado ou erro no pedido;
- configuração do webhook salva no `localStorage`;
- etiqueta 100 × 150 mm sem preços;
- separação visual dos itens faltantes.

Nenhum pedido real foi reenviado ao Make ou ao Bling durante os testes automatizados.

## NF-e

A lógica existente permanece validada para:

- XML 4.00;
- chave de 44 números;
- agrupamento de itens;
- multiplicador caixa/unidade;
- desconto, custo e margem;
- correspondência automática/manual;
- validade e lotes;
- produto existente ou novo;
- duplicidade global e por item;
- arquivamento e registro fiscal;
- falha parcial e retomada.

Nenhuma NF-e real foi importada nesta validação.

## Limite dos testes automatizados

Testes de sintaxe e contratos não substituem uma operação real com credenciais, regras do Firebase, token GitHub, webhooks Make e Bling.

## Teste manual obrigatório restante

A implantação deve parar para validação humana somente após o merge e a publicação, nos seguintes pontos:

1. salvar um produto existente de teste;
2. criar, arquivar e restaurar um produto temporário;
3. confirmar a atualização no site público;
4. importar uma NF-e de teste ainda não utilizada;
5. publicar um cupom ou uma pequena alteração na Compra Rápida;
6. reenviar um pedido controlado ao Make/Bling.

Esses testes alteram dados reais e, por isso, não devem ser executados automaticamente sem selecionar registros próprios para teste.
