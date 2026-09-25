# Dona Antônia Operations 2.0 — AI, Observabilidade e Continuidade (DRAFT)

> Documento analítico. Não implementar ainda.
> Última atualização: 2026-09-25.

## Problema a resolver
O proprietário não pode depender de:
- lembrar prompts;
- lembrar decisões antigas;
- saber em qual conversa algo foi feito;
- abrir várias ferramentas;
- descobrir manualmente se algo falhou.

## Solução conceitual
Criar uma única camada de observabilidade e inteligência acima de:
- Bling;
- site;
- Vitrine/Admin;
- PapoAI/WhatsApp;
- Supabase;
- automações.

Nome de trabalho: **Dona Antônia Control Tower**.

## Duas interfaces, uma mesma inteligência operacional

### Interface A — Admin
Copiloto OpenAI via API:
- conversa persistente;
- botões contextuais;
- visão de pendências;
- aprovações;
- relatórios;
- consulta ao Bling e dados internos.

### Interface B — ChatGPT
Quando suportado pela conta/plano:
- MCP Dona Antônia;
- possivelmente MCP Bling oficial;
- mesmas consultas;
- ações protegidas por aprovação.

O estado não vive nas conversas. Vive nas fontes oficiais e no ledger.

## OpenAI — capacidades atuais relevantes
Pesquisa oficial em 2026-09-25 confirma:
- Responses API suporta function calling e MCP remoto;
- Conversations API cria objetos persistentes de conversa entre sessões/dispositivos/jobs;
- Agents SDK/API suporta guardrails e human-in-the-loop para ações sensíveis;
- ChatGPT Apps/MCP pode ter UI interativa;
- full MCP write no ChatGPT está, no momento consultado, em beta para Business/Enterprise/Edu;
- ChatGPT e API Platform possuem faturamento separado.

## Padrão de execução da IA
1. usuário clica ou pergunta;
2. sistema monta contexto mínimo relevante;
3. modelo consulta fontes oficiais via tools/MCP;
4. modelo responde ou propõe ação;
5. se ação requer aprovação, cria item de aprovação;
6. usuário aprova/rejeita;
7. executor determinístico executa;
8. resultado é registrado no ledger;
9. dashboard atualiza.

## Regra anti-alucinação operacional
Para respostas sobre estado atual:
- IA deve consultar dados;
- deve indicar timestamp/fonte;
- se fonte está indisponível, responder "não confirmado";
- nunca inferir saldo, pagamento, estoque ou status fiscal de uma conversa antiga.

## Context packages
Em vez de enviar o banco inteiro à IA, cada botão cria um pacote:

### Pedido
- pedido;
- cliente;
- itens;
- estoque;
- vínculo Bling;
- fiscal;
- entrega;
- conversa relacionada;
- timeline do pedido.

### Produto
- cadastro;
- estoque;
- lotes/validade;
- fornecedor;
- custo;
- histórico de compra;
- ofertas;
- divergências Bling.

### Cliente
- cadastro;
- pedidos;
- contatos;
- PapoAI;
- pendências;
- financeiro relacionado permitido.

### Financeiro
- contas;
- vencimentos;
- origem;
- baixas;
- divergências.

## Relatórios
Relatórios devem ter:
- data/hora da geração;
- período;
- fontes;
- indicadores;
- exceções;
- ações recomendadas;
- links para itens;
- estado: informativo / requer ação.

## Continuidade do projeto
GitHub continua sendo a documentação canônica do sistema.
O Control Tower será a documentação canônica do **que aconteceu na operação**.

Resumo:
- GitHub = arquitetura/regras/decisões/runbooks;
- Bling = ERP;
- Supabase = regras e ledger operacional especial;
- PapoAI = canal de atendimento;
- OpenAI = raciocínio/cópiloto;
- ChatGPT = interface adicional, não fonte de verdade.

## Requisito de correlação
Toda ação futura deve carregar `correlation_id` sempre que possível para unir:
mensagem -> rascunho -> pedido -> Bling -> estoque -> fiscal -> entrega -> pagamento.

Isso permitirá investigação ponta a ponta.

## Princípio de transparência
Toda automação importante deve responder quatro perguntas:
1. O que ela faz?
2. Quando foi executada?
3. O que mudou?
4. O que acontece se falhar?

Essas respostas devem estar disponíveis no dashboard sem precisar ler código.
