# Chat Comprar — Motor Determinístico de Consulta

## Objetivo

Evoluir o Chat Comprar para responder combinações de perguntas sobre cestas e produtos usando dados reais do Supabase, sem depender de IA na maior parte das interações.

O motor deve priorizar: regras explícitas do Admin -> consulta determinística estruturada -> busca de produto/cesta -> fallback abrangente -> IA opcional somente como último recurso.

## Escopo

O motor deve responder, sem IA, perguntas como:

- Qual a maior cesta?
- Qual a mais cara?
- Qual a mais barata?
- Quero uma cesta com 2 arroz.
- Qual cesta tem mais arroz?
- Tem cesta sem material de limpeza?
- Tem cesta sem sabão?
- Qual cesta tem café?
- Tenho R$ 250, qual cesta dá?
- Quero uma cesta até R$ 300 sem limpeza.
- Qual café você tem?
- Qual café é mais barato?
- Tem café Pilão 500g?
- Tem leite sem lactose?
- Qual Downy é mais barato?

## Dados atuais considerados

- Mais de 700 produtos ativos/verificados/com estoque no Supabase.
- 4 grandes categorias comerciais: mercearia, limpeza/lavanderia, higiene/beleza e casa/pet.
- 21 categorias de origem e mais de 180 marcas.
- 9 cestas ativas com composição real em `basket_template_items`.

O motor nunca deve inventar produto, preço, estoque, composição ou oferta.

## Arquitetura

### 1. Normalizador leve

Transforma a frase para comparação segura:

- minúsculas;
- remoção de acentos para matching;
- limpeza de pontuação;
- preservação de números, unidades e marcas;
- reconhecimento de variações comuns como `2 arroz`, `dois arroz`, `2x arroz`, `500g`, `1 litro`.

### 2. Parser determinístico

Extrai uma estrutura pequena da mensagem:

- `domain`: cesta | produto | comercial;
- `operation`: listar | maior | menor | mais_cara | mais_barata | contem | nao_contem | quantidade_exata | quantidade_minima | preco_maximo | comparar;
- `entity`: arroz, café, leite, Downy, Pilão etc.;
- `brand`: quando corresponder a uma marca real do banco;
- `quantity`: número solicitado;
- `budget`: valor máximo;
- `size_or_unit`: peso/volume/tamanho;
- `exclude`: produto/categoria que não pode aparecer.

Nenhum LLM é usado nessa etapa.

### 3. Vocabulário derivado do banco

Em vez de cadastrar manualmente centenas de palavras, o motor usa:

- nomes dos produtos ativos;
- marcas ativas;
- categorias de origem;
- `sales_category`;
- pequeno dicionário fixo de sinônimos úteis.

Exemplos de sinônimos:

- material de limpeza -> limpeza/lavanderia;
- sabão de roupa -> lavanderia;
- papel de banheiro -> papel higiênico;
- comida de cachorro -> ração;
- água sanitária -> cloro/água sanitária quando houver correspondência.

### 4. Consultas de cestas

Para perguntas sobre cestas, consultar `basket_templates`, `basket_template_items` e produtos relacionados.

Capacidades:

- maior cesta por quantidade total de unidades;
- mais cara/mais barata por `base_price`;
- cesta com quantidade exata ou mínima de determinado produto;
- cesta que contém ou não contém produto/família/categoria;
- cesta dentro de orçamento;
- combinação de orçamento + inclusão/exclusão;
- comparação entre Bonini/Koblenz e tamanhos.

Quando várias cestas satisfizerem a condição, mostrar até 3 opções mais relevantes e abrir a UI `baskets`.

### 5. Consultas de produtos

Para produtos, usar somente itens:

- `physically_verified = true`;
- `is_active = true`;
- `stock > 0`.

Ranking determinístico:

1. nome exato / frase exata no nome;
2. marca + termo do produto;
3. todos os tokens principais no nome;
4. marca;
5. embalagem/volume;
6. categoria de origem;
7. grande categoria comercial.

Capacidades:

- listar opções de um produto;
- filtrar por marca;
- filtrar por peso/volume;
- mais barato/mais caro;
- disponibilidade;
- combinar produto + marca + tamanho.

Exemplo: `Qual café você tem?` deve pesquisar produtos realmente relacionados a café, e não devolver toda a categoria `CAFÉ DA MANHÃ`.

### 6. Fallback hierárquico

Se a consulta específica não encontrar resultado:

1. remover restrição de volume/tamanho;
2. remover marca;
3. buscar família de produto;
4. abrir categoria de origem;
5. abrir `sales_category`;
6. só então usar fallback genérico.

O sistema deve dizer quando não encontrou exatamente o pedido, sem inventar.

### 7. IA

- `generative_ai_enabled` permanece desligada no nível recomendado.
- classificador semântico permanece opcional e só roda depois que o motor determinístico falhar.
- IA nunca substitui consultas de preço, estoque, cestas ou produtos.

## Contexto curto da conversa

O motor pode reaproveitar o último domínio/entidade da conversa para perguntas como:

- `Qual a mais cara?` após falar de cestas;
- `E a mais barata?` após listar cafés;
- `Tem de 500g?` após pesquisar café.

O contexto deve ser simples, baseado nas últimas mensagens e no `ai_interpretation.routing`, sem criar memória complexa.

## Desempenho

- Não carregar todos os produtos em cada mensagem.
- Fazer consultas filtradas e limitadas.
- Reusar categorias/marcas apenas quando necessário.
- Limitar retorno a poucos candidatos.
- Evitar vetores/embeddings nesta fase.

Meta: manter a resposta majoritariamente em 1–3 consultas ao Supabase.

## Segurança e isolamento

- Não tocar no fluxo nativo de WhatsApp.
- Não reativar workers antigos.
- Não criar handoff humano.
- Respeitar os flags individuais já existentes no Admin.
- Se `products`, `baskets`, `offers` ou `checkout` estiver desligado, o motor não pode usar aquela capacidade.

## Testes

Criar testes de contrato e regressão com pelo menos 100 frases, incluindo combinações de:

- cesta + preço;
- cesta + quantidade de produto;
- cesta + exclusão de produto/categoria;
- cesta + orçamento;
- produto + marca;
- produto + peso/volume;
- produto + comparação de preço;
- contexto curto de follow-up;
- ausência de resultado;
- flags desligados.

Casos obrigatórios:

- `Qual a maior cesta?`
- `Qual a mais cara?`
- `Quero uma cesta com 2 arroz`
- `Tem cesta sem material de limpeza?`
- `Qual café você tem?`

## Critério de pronto

A implementação só é considerada pronta quando:

1. os casos obrigatórios respondem sem IA;
2. a maior parte da suíte de 100+ frases usa `ai_used=false`;
3. nenhum preço/estoque/composição é inventado;
4. os flags do Admin são respeitados;
5. testes do Chat Comprar e Admin continuam verdes;
6. smoke real em produção confirma cestas e produtos.
