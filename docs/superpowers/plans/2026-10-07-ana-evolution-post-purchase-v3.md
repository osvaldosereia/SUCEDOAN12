# ANA V3 — Evolução Profunda do Atendimento e Pós-compra

Data: 2026-10-07
Repositório: osvaldosereia/SUCEDOAN12
Supabase canônico: ssbesxgaijknwsjbsbcz

## Objetivo

Evoluir a ANA de atendente reativa para uma camada operacional de relacionamento que acompanha a jornada completa do cliente sem perder os princípios atuais:

- automação determinística primeiro;
- IA apenas quando agrega valor;
- humano como fallback;
- nenhuma ação irreversível silenciosa;
- pedido canônico no Supabase;
- mesmo pedido mantém o mesmo identificador do início ao fim;
- Meta/WhatsApp usado conforme categoria e consentimento;
- Bling continua como integração fiscal/ERP, não como fonte de UX do cliente.

A primeira prioridade desta fase é permitir que, logo após concluir um pedido no site, o cliente possa acrescentar produtos ao MESMO pedido por uma vitrine rápida, sem criar novo pedido.

---

# 1. Princípios de arquitetura

1. O pedido original nunca é substituído e nunca ganha novo número.
2. Acréscimos usam o mesmo `order_id` e o mesmo código público.
3. Nenhum cliente altera pedido depois que a operação entrou em separação.
4. Alterações são append-only/auditáveis e idempotentes.
5. Estoque é revalidado no momento do acréscimo.
6. Reserva local é recalculada na mesma transação.
7. A primeira versão só permite acréscimos enquanto o pedido estiver em `storefront_received`.
8. Se o operador confirmar o pedido antes do cliente finalizar o acréscimo, a vitrine rápida fecha de forma segura.
9. A confirmação WhatsApp continua transacional/UTILITY; ofertas e recomendações proativas por WhatsApp passam pelos gates de marketing/consentimento.
10. O site pode exibir cross-sell imediatamente após o checkout sem misturar categorias de mensagem do WhatsApp.

---

# 2. Vitrine rápida de acréscimo ao mesmo pedido

## 2.1 Experiência do cliente

Depois do checkout:

- tela mostra "Pedido recebido";
- abaixo aparece um bloco opcional:
  "Quer acrescentar algo ao mesmo pedido?";
- CTA: "Adicionar produtos";
- cliente abre uma vitrine curta, rápida e mobile-first;
- vê produtos recomendados e busca simples;
- escolhe quantidade;
- revisa o valor adicional;
- toca "Adicionar ao pedido";
- recebe confirmação:
  "Itens adicionados ao pedido ####";
- o total atualizado aparece imediatamente;
- nenhuma nova compra/pedido é criada.

A mesma oportunidade pode aparecer na página pública do pedido enquanto a janela estiver aberta.

## 2.2 Janela de alteração

V1:

- apenas `orders.status = storefront_received`;
- prazo configurável, inicialmente 20 minutos;
- fecha imediatamente quando ocorrer qualquer um:
  - pedido confirmado;
  - separação iniciada;
  - sincronização ao Bling;
  - cancelamento;
  - expiração da sessão.

V2 futura poderá permitir pedido `confirmed` antes da separação, mas somente com regra de reabertura/lock explícita.

## 2.3 Token seguro

Não reutilizar o UUID do pedido como credencial de escrita.

Criar sessão específica de acréscimo:

`order_addon_sessions_v1`

Campos conceituais:

- id;
- order_id;
- token_hash;
- created_at;
- expires_at;
- consumed/closed_at;
- status;
- max_operations;
- source;
- metadata mínima.

O browser recebe um token aleatório opaco; o banco guarda somente hash.

## 2.4 RPC atômico de acréscimo

Criar operação canônica, por exemplo:

`ops3_add_items_to_existing_order_v1(...)`

Fluxo dentro de uma única transação:

1. validar token;
2. bloquear pedido `FOR UPDATE`;
3. validar status/janela;
4. validar que separação não começou;
5. validar que Bling ainda não foi sincronizado;
6. validar produtos ativos;
7. obter preço canônico atual;
8. validar estoque vendável;
9. aumentar quantidade da linha existente ou inserir nova linha;
10. recalcular subtotal/total/fiscal/ajustes;
11. chamar `reserve_vitrine_order_stock_v1(order_id)`;
12. atualizar `checkout_snapshot`/histórico sem destruir snapshot original;
13. atualizar snapshot público;
14. registrar evento auditável;
15. retornar total novo e itens adicionados.

Idempotência obrigatória por `session_id + request_key`.

## 2.5 Concorrência

Cenário operador confirma ao mesmo tempo que cliente adiciona:

- ambos bloqueiam a mesma linha de `orders`;
- quem obtiver lock primeiro conclui;
- se confirmação vencer, o acréscimo retorna `addon_window_closed`;
- se acréscimo vencer, a confirmação subsequente lê total/reserva já atualizados.

Nenhum merge tardio de carrinho.

---

# 3. Motor de recomendações da vitrine rápida

V1 deve ser determinística, sem IA generativa.

Ranking sugerido:

1. complementares à cesta/produtos já comprados;
2. produtos frequentemente comprados juntos;
3. categorias `INT_*` do cliente, quando existirem;
4. ofertas reais vigentes;
5. produtos com estoque saudável;
6. itens de recompra frequente;
7. excluir itens indisponíveis;
8. reduzir duplicação de itens já presentes no pedido;
9. no máximo 8–12 sugestões.

Criar evidência do motivo da recomendação:
- `basket_complement`;
- `co_purchase`;
- `interest`;
- `offer`;
- `replenishment`.

A IA poderá ordenar sugestões numa fase posterior, nunca inventar produto/preço/estoque.

---

# 4. Integração com o WhatsApp

## 4.1 Confirmação do pedido

Continuar separada:

- mensagem de pedido recebido = transacional;
- template Utility;
- não inserir texto promocional no template atual.

Quando houver template aprovado apropriado, um botão "Ver pedido" poderá abrir a página pública do pedido. A página poderá mostrar a vitrine rápida quando elegível.

## 4.2 Ofertas pós-compra por WhatsApp

Se a empresa iniciar uma mensagem contendo oferta/recomendação:

- exigir consentimento de marketing;
- usar template MARKETING aprovado;
- respeitar opt-out;
- revalidar consentimento antes de enviar;
- nunca reutilizar Utility para promoção.

## 4.3 ANA durante a conversa

Se cliente disser:

- "quero acrescentar arroz";
- "esqueci um produto";
- "posso colocar mais uma coisa no pedido?";

ANA:

1. localiza pedido recente canônico do cliente;
2. verifica janela de acréscimo;
3. se aberta, envia o link seguro da vitrine rápida;
4. se fechada, explica objetivamente e oferece atendimento humano;
5. não cria segundo pedido silenciosamente.

---

# 5. Follow-up depois do pedido

Criar motor de eventos de relacionamento separado da ANA conversacional.

Eventos:

- order_received;
- addon_window_opened;
- order_confirmed;
- separation_started;
- ready;
- out_for_delivery;
- delivered;
- delivery_problem;
- cancelled;
- returned.

Cada evento define:

- se existe mensagem;
- categoria WhatsApp;
- consentimento necessário;
- template;
- delay;
- canal;
- condição de cancelamento;
- chave idempotente.

## 5.1 Pós-entrega transacional

Após entrega:

- status "pedido entregue" pode continuar como atualização operacional;
- sem oferta embutida.

## 5.2 Satisfação

Mensagem de avaliação/feedback deve ter política própria e ser tratada conservadoramente como comunicação promocional/engajamento quando iniciada pela empresa.

Sugestão:
- delay de 2–6 horas após entrega;
- somente opt-in quando exigido pelo canal/template;
- pergunta curta:
  "Deu tudo certo com seu pedido?";
- opções:
  - Sim;
  - Preciso de ajuda.

"Preciso de ajuda" abre atendimento humano prioritário.

## 5.3 Recompra

A infraestrutura de recompra +10 dias já existe.

Evoluir para janela inteligente:

- cesta básica: ciclo de recompra observado;
- higiene/limpeza: ciclo por categoria;
- bebê/pet: comportamento real;
- nunca inferir atributos sensíveis;
- consentimento obrigatório;
- cancelar lembrete se houver compra nova.

---

# 6. Carrinho de recompra rápida

Criar "Comprar novamente" sem criar pedido automaticamente.

Fluxo:

1. ANA/link abre carrinho pré-preenchido com compra anterior;
2. sistema revalida preço e estoque;
3. itens indisponíveis aparecem claramente;
4. cliente altera quantidades;
5. checkout normal cria novo pedido somente após confirmação explícita.

Diferente da vitrine pós-compra:
- pós-compra acrescenta ao pedido existente;
- recompra cria um novo pedido deliberadamente.

---

# 7. ANA contextual

Ampliar contexto operacional permitido:

- pedido recente;
- status;
- entrega prevista;
- pagamento escolhido;
- itens do pedido;
- se janela de acréscimo está aberta;
- histórico resumido de compras;
- categorias de interesse;
- campanhas/consentimento;
- problemas em aberto.

A ANA continua proibida de inventar:
- preço;
- estoque;
- prazo;
- status;
- pagamento;
- ação concluída.

Dados dinâmicos devem vir de ferramentas/RPCs seguras.

---

# 8. Ferramentas operacionais da ANA

Criar ações server-side pequenas e auditáveis:

- `find_recent_order`;
- `get_order_status`;
- `get_addon_link`;
- `get_order_public_link`;
- `get_reorder_link`;
- `handoff_with_reason`;
- `apply_interest`;
- `remove_interest`;
- futuramente `request_order_addition` somente com confirmação explícita.

Não permitir à IA chamar mutações genéricas em tabelas.

---

# 9. Atendimento pós-venda

Criar classificadores/automação para:

- produto faltando;
- produto errado;
- atraso;
- avaria;
- dúvida de pagamento;
- endereço;
- entrega;
- pedido não encontrado.

Estratégia:

- reconhecer intenção;
- coletar no máximo um dado necessário por vez;
- puxar pedido real;
- não prometer ressarcimento/troca automaticamente;
- criar caso/etiqueta;
- transferir para humano com resumo objetivo.

---

# 10. Métricas

Painel sob demanda:

## Vitrine rápida
- sessões criadas;
- abertas;
- conversão;
- valor adicional;
- AOV antes/depois;
- produtos mais adicionados;
- sessão expirada;
- bloqueio por confirmação;
- falha por estoque.

## ANA
- automação acionada;
- handoff;
- IA fallback;
- respostas elegíveis;
- falso positivo;
- pedidos com link de acréscimo enviado;
- conversão do link.

## Pós-entrega
- entregas acompanhadas;
- respostas positivas;
- pedidos de ajuda;
- opt-outs;
- recompra;
- receita incremental atribuída.

---

# 11. UX do Admin

Adicionar na Central ANA:

- "Jornada pós-compra";
- "Vitrine rápida";
- "Follow-ups";
- "Resultados".

Não carregar dados pesados automaticamente.

Configurações simples:

- janela de acréscimo;
- máximo de sugestões;
- categorias elegíveis;
- habilitar/desabilitar vitrine pós-compra;
- follow-up de satisfação;
- recompra;
- templates vinculados;
- guardrails.

---

# 12. Guardrails obrigatórios

1. Nunca criar novo pedido para um acréscimo ao pedido aberto.
2. Mesmo `order_id` e mesmo código público.
3. Nunca aceitar acréscimo após início da separação.
4. Nunca alterar pedido fiscalizado/entregue.
5. Nunca alterar item/preço usando valor vindo do browser.
6. Nunca confiar no token bruto no banco.
7. Nunca permitir cliente escolher `order_id` arbitrariamente.
8. Revalidar estoque na transação.
9. Reserva de estoque deve refletir o pedido final.
10. Nenhum upsell WhatsApp sem gate correto de marketing/consentimento.
11. Opt-out vence qualquer automação futura.
12. Nenhuma publicação automática de regra ANA sem teste/homologação.

---

# 13. Estratégia de programação por rodadas

## Rodada 1 — auditoria e contratos
- mapear checkout, pedido, reserva, confirmação, separação, Bling e página pública;
- testes RED da janela de acréscimo;
- contrato de token e elegibilidade.

## Rodada 2 — domínio de sessão
- tabela de sessões;
- token hash;
- expiração;
- RPC read-only de elegibilidade;
- testes de segurança/RLS.

## Rodada 3 — motor atômico de acréscimo
- RPC de mutação;
- recálculo;
- estoque/reserva;
- idempotência;
- concorrência;
- rollback tests.

## Rodada 4 — vitrine rápida pública
- página mobile-first;
- produtos/recomendações;
- quantidade;
- revisão e confirmação;
- estados de expirado/fechado/estoque.

## Rodada 5 — integração pós-checkout/página do pedido
- CTA após pedido;
- página pública mostra janela;
- preservar confirmação Utility.

## Rodada 6 — ANA contextual
- intenção "esqueci/adicionar produto";
- pedido recente;
- link de acréscimo;
- fallback humano.

## Rodada 7 — recomendador determinístico
- complementares;
- co-purchase;
- interesse;
- ofertas;
- estoque;
- métricas.

## Rodada 8 — follow-up pós-entrega
- event engine;
- status transacional;
- satisfação;
- pedido de ajuda;
- consentimento/template gates.

## Rodada 9 — recompra inteligente
- melhorar +10 dias;
- ciclo por categoria;
- carrinho de recompra;
- atribuição.

## Rodada 10 — observabilidade e Admin
- painel;
- configurações;
- métricas;
- auditoria.

## Rodada 11 — hardening
- concorrência;
- duplicate clicks;
- expiração;
- estoque mudou;
- pedido confirmou durante edição;
- Bling já sincronizado;
- Meta/consentimento.

## Rodada 12 — homologação final
- CI;
- smoke transacional;
- rollback;
- advisors;
- deploy controlado;
- canário;
- documentação;
- ativação gradual.

---

# 14. Estratégia Git/execução

Em todas as rodadas:

1. ler `main` e Supabase antes de programar;
2. nunca escrever direto na `main`;
3. branch `agent/*`;
4. commits pequenos e atômicos;
5. recuperar SHA antes de editar arquivo;
6. sem writes concorrentes no mesmo arquivo;
7. teste antes do PR;
8. merge apenas verde;
9. migration aditiva/reversível;
10. deploy controlado;
11. nenhuma mensagem de marketing real antes de template/consentimento homologados;
12. se um bloqueio externo ocorrer, continuar frentes independentes.

Quando todas as frentes técnicas estiverem concluídas, executar auditoria final e desativar a tarefa recorrente.
