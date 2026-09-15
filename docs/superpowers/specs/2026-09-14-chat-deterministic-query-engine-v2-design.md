# Chat Deterministic Query Engine V2 — Design

## Objetivo

Evoluir o Chat Comprar para responder o maior número possível de perguntas comerciais sem IA, usando combinações de palavras, dados reais de produtos/cestas e fallback hierárquico leve.

## Escopo

- Produtos ativos, verificados e com estoque do Supabase.
- Cestas ativas e sua composição real.
- Comparações de preço, quantidade e composição.
- Busca por produto, marca, embalagem, categoria e atributos textuais.
- Perguntas com inclusão/exclusão e quantidade.
- Contexto curto da conversa para referências como “qual a mais cara?” depois de falar de cestas.
- IA somente como último fallback semântico, mantendo IA generativa desligada.

## Requisitos funcionais

O motor deve responder deterministicamente, entre outros casos:

- “Qual a maior cesta?”
- “Qual a mais cara?”
- “Quero uma cesta com 2 arroz”
- “Tem cesta sem material de limpeza?”
- “Qual café você tem?”
- “Qual cesta tem mais arroz?”
- “Qual cesta mais barata com pelo menos 3 arroz?”
- “Quais cafés de 500g vocês têm?”
- “Tem Pilão?”
- “Qual amaciante Downy mais barato?”
- “Quero uma cesta até 300 reais sem produto de limpeza”

## Arquitetura

A ordem de decisão do Chat Comprar será:

1. Regra explícita publicada no Admin.
2. Motor determinístico de consulta estruturada.
3. Atalhos determinísticos já existentes.
4. Busca simples de produto.
5. Classificador semântico por IA opcional.
6. Fallback seguro com chips.

O motor não deve gerar linguagem livre com IA. Ele interpreta localmente a frase em uma consulta estruturada e responde a partir do Supabase.

## Parser local

O parser extrai tokens e sinais simples:

- domínio: cesta, produto;
- operação: maior, menor, mais cara, mais barata, listar, existe;
- quantidade: “2 arroz”, “pelo menos 3 arroz”;
- orçamento: “até 300”, “tenho 250”;
- inclusão: “com arroz”, “que tenha café”;
- exclusão: “sem limpeza”, “sem sabão”;
- produto/marca: reconhecimento contra nomes e marcas do catálogo;
- embalagem: 500g, 1L, 2 litros, tamanho M, etc.

O parser deve usar normalização sem acentos, stopwords e um pequeno dicionário de sinônimos comerciais. Não haverá embeddings nem banco vetorial.

## Consulta de cestas

As respostas de cesta usam `basket_templates`, `basket_template_items` e `products`.

O motor deve conseguir:

- ordenar por preço;
- calcular quantidade total de itens;
- encontrar maior/menor cesta por quantidade total;
- filtrar por quantidade de um produto/família;
- incluir/excluir categorias de produto;
- combinar orçamento + quantidade + exclusão;
- listar uma ou poucas cestas correspondentes.

Para “maior cesta”, o critério padrão é quantidade total de unidades da composição. Em empate, maior preço e depois `sort_order` apenas para desempate estável.

## Consulta de produtos

Produtos elegíveis: `physically_verified=true`, `is_active=true`, `stock>0`.

Ranking de busca:

1. nome contendo todos os termos relevantes;
2. marca exata ou parcial;
3. embalagem/volume compatível;
4. categoria de origem;
5. categoria comercial.

Perguntas como “qual café você tem?” devem buscar produtos cujo nome realmente contenha “café” ou cujo produto seja identificado como café; não abrir toda a categoria `CAFÉ DA MANHÃ`.

Quando houver muitos resultados, retornar os mais relevantes e deixar a UI de `product_lookup` carregar os cards reais.

## Fallback hierárquico

Quando a consulta exata não retorna resultado:

1. remover modificadores fracos (barato, grande, simples);
2. manter produto/marca principal;
3. tentar família/sinônimo;
4. tentar categoria de origem;
5. tentar categoria comercial;
6. só então classificador IA, se habilitado;
7. caso contrário, fallback com Cestas/Produtos.

## Contexto curto

Guardar no resultado roteado metadados leves como `topic: baskets|products`, `entity` e `filters`. A mensagem seguinte pode reutilizar o tópico recente quando a frase for elíptica, por exemplo “qual a mais cara?”. Não usar histórico longo nem IA para isso.

## Desempenho

- Sem embeddings.
- Sem carregar os 763 produtos em memória a cada mensagem.
- Preferir consultas SQL pequenas e filtradas.
- Limitar resultados e campos selecionados.
- No máximo poucas consultas por mensagem típica.

## Segurança e isolamento

- Não criar handoff humano.
- Não usar WhatsApp worker.
- Não alterar automações legadas.
- Respeitar os toggles atuais de Cestas, Produtos, Ofertas, Checkout e OpenAI.
- Se IA estiver desligada, o chat continua funcional.

## Testes

Criar regressão com pelo menos 100 perguntas combinatórias cobrindo:

- comparação de cestas;
- quantidade de produto em cesta;
- inclusão/exclusão de categorias;
- orçamento;
- produto + marca + embalagem;
- buscas amplas e fallback;
- referências de contexto curto;
- toggles desligados;
- garantia de `ai_used=false` nos casos determinísticos.

## Critério de pronto

A versão só pode ser considerada pronta quando a suíte completa passar, os casos exemplares responderem com dados reais e um smoke em produção confirmar que as novas consultas não chamam IA desnecessariamente.