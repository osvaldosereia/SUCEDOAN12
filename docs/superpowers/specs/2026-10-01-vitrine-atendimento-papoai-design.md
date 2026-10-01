# Vitrine/Admin — Central de Atendimento PapoAI

Data: 2026-10-01
Status: design aprovado em conversa; implementação bloqueada até revisão desta especificação

## 1. Objetivo

Criar dentro do `Vitrine/Admin` uma Central de Atendimento própria da Dona Antônia, simplificada para a operação real da empresa, mantendo o PapoAI como infraestrutura de WhatsApp/Meta/IA/Flow e evitando que a equipe precise usar o chat operacional do PapoAI no dia a dia.

A Central deve unir, em uma única tela:
- conversas dos dois números oficiais, visualmente separadas;
- chat humano;
- contexto do cliente;
- histórico e situação de pedidos;
- consulta de produtos e estoque;
- ações de catálogo/orçamento/nova venda;
- copiloto interno opcional;
- regras operacionais da Meta apresentadas ao atendente sem exigir conhecimento técnico.

Princípio central: o módulo deve reduzir troca de telas, cliques e erro operacional. Não deve virar um CRM genérico.

## 2. Restrições e princípios

1. Preservar PapoAI e automações atuais até homologação do novo módulo.
2. Não desligar ANA automaticamente durante a implantação.
3. Não enviar mensagem real durante desenvolvimento sem teste controlado autorizado.
4. Supabase continua fonte canônica de cliente, pedido, vínculo de conversa e dados operacionais.
5. PapoAI permanece infraestrutura de canal WhatsApp onde já está conectado.
6. Não introduzir Make.
7. Não expor segredo, URL sensível de webhook ou chave do PapoAI no navegador.
8. Não afirmar entregue/lido sem evento confiável do provedor.
9. Respeitar janela de atendimento de 24 horas e uso de template Meta fora da janela.
10. Não adicionar recursos sem necessidade operacional clara.

## 3. Estado real já disponível

O projeto canônico já possui:
- `whatsapp_accounts` com os dois números oficiais;
- `conversations` com vínculo a `whatsapp_account_id`, `customer_id`, telefone, estado humano/IA e timestamps;
- `whatsapp_messages_v1` com mensagens canônicas recebidas do PapoAI;
- `customers`, `customer_addresses`, `orders`, `order_items`;
- `papoai_webhook_inbox_v2` e ponte de recepção PapoAI;
- vínculo observado dos canais PapoAI aos números 0975 e 1018;
- geração de links `catalogo_####` vinculados a conversa/cliente;
- histórico de pedidos e dados de cliente já usados no Admin.

O módulo novo deve reutilizar essas fontes, não criar uma segunda base de clientes ou mensagens.

## 4. Arquitetura-alvo

### Entrada

Cliente WhatsApp
→ Meta / canal oficial
→ PapoAI
→ webhook de mensagem recebida
→ `papo-external-agent-v1`
→ normalização canônica
→ `conversations` + `whatsapp_messages_v1`
→ Central de Atendimento no Vitrine/Admin

### Saída humana

Central de Atendimento
→ backend privado do Admin
→ validação de conversa/canal/janela
→ transporte PapoAI homologado
→ PapoAI
→ Meta / WhatsApp
→ cliente

### Contexto operacional

Central
→ Supabase
→ cliente + endereço + pedidos + itens + produtos + estoque + consentimento + catálogo

## 5. Estrutura visual desktop

A tela deve usar praticamente toda a largura útil do Admin e ter quatro áreas simultâneas:

1. coluna de conversas 0975;
2. coluna de conversas 1018;
3. conversa selecionada;
4. painel contextual à direita.

Layout aproximado:

```text
┌──────────────┬──────────────┬─────────────────────────┬──────────────────────┐
│ 0975         │ 1018         │ CONVERSA                │ CONTEXTO             │
│ conversas    │ conversas    │ mensagens               │ Cliente / Pedidos    │
│              │              │                         │ Produtos / Assistente│
│              │              │                         │                      │
│              │              │                         │                      │
│              │              ├─────────────────────────┤                      │
│              │              │ composer / ações        │                      │
└──────────────┴──────────────┴─────────────────────────┴──────────────────────┘
```

A conversa central deve permanecer relativamente estreita para leitura confortável; o painel direito deve ter largura suficiente para cards operacionais.

## 6. Colunas 0975 e 1018

As duas filas ficam visíveis lado a lado. Não usar seletor que esconda um número no desktop.

Cada cabeçalho mostra:
- nome curto do canal (`0975`, `1018`);
- estado da conexão;
- quantidade que precisa de atenção.

Cada conversa mostra somente:
- nome do cliente ou telefone;
- trecho da última mensagem;
- horário;
- contador de não lidas;
- no máximo três estados operacionais: `Humano`, `Pedido`, `Cadastro pendente`.

Ordenação padrão:
1. conversa com mensagem nova / atenção;
2. data da última atividade decrescente.

Filtros opcionais, discretos:
- Todos;
- Não lidos;
- Precisa de humano.

Busca global por nome ou telefone.

## 7. Conversa central

### Cabeçalho

Mostrar:
- nome do contato;
- telefone;
- canal 0975 ou 1018;
- estado atual: `ANA atendendo` ou `Atendimento humano`;
- última atividade.

Ações principais:
- `Assumir atendimento`;
- `Finalizar atendimento humano`;
- menu secundário `…`.

Ao assumir atendimento, a integração deve solicitar pausa/stop da resposta do assistente no PapoAI somente após transporte homologado. Não permitir humano e IA responderem simultaneamente por desenho.

### Timeline

Carregar inicialmente somente as mensagens mais recentes, por exemplo 30.

Paginação para cima:
- usuário rola ao topo;
- carrega lote anterior;
- preserva posição da rolagem.

Renderização:
- texto;
- áudio, quando mídia estiver homologada;
- imagem, quando mídia estiver homologada;
- documento, quando mídia estiver homologada;
- marcador visual para mensagem do cliente / humano / IA quando essa origem estiver disponível.

Não inventar preview de mídia se a URL/objeto real não estiver disponível.

### Composer

Contém:
- campo de texto;
- botão enviar;
- anexar mídia somente após homologação;
- gravar áudio somente após homologação;
- atalhos de respostas rápidas;
- botão catálogo.

Enter envia; Shift+Enter quebra linha no desktop.

## 8. Regra Meta / janela de atendimento

A Central deve calcular a janela a partir do último inbound confirmado.

Se dentro de 24h:
- badge verde: `Janela de atendimento aberta`;
- mostrar tempo restante aproximado;
- mensagem livre permitida.

Se fora da janela:
- badge âmbar: `Janela encerrada`;
- desabilitar envio livre pelo caminho normal;
- oferecer `Enviar template` somente quando houver template aprovado e transporte homologado.

O backend deve validar novamente a regra; a UI não é autoridade de segurança.

## 9. Painel contextual direito

Apenas quatro abas na primeira versão.

### 9.1 Cliente — padrão

Mostrar no card principal:
- nome;
- telefone;
- cidade;
- endereço resumido;
- cadastro completo / incompleto;
- última compra;
- quantidade de pedidos;
- valor acumulado, quando confiável;
- consentimento de marketing.

Ações:
- `Editar cadastro`;
- `Copiar telefone`;
- `Abrir cliente` apenas se realmente necessário.

CPF/CNPJ deve aparecer mascarado na visão resumida.

### 9.2 Pedidos

Priorizar pedidos do cliente selecionado.

Cada card mostra:
- número;
- data;
- total;
- status;
- origem;
- ação `Abrir pedido`.

Ações rápidas:
- `Nova venda para este cliente`;
- `Criar orçamento`.

Os dados conhecidos do cliente devem ser pré-preenchidos nessas operações; o atendente não redigita telefone/endereço sem necessidade.

Um bloco secundário pode mostrar poucos pedidos recentes gerais da loja, sem transformar a aba em painel completo de pedidos.

### 9.3 Produtos

Não carregar catálogo completo.

Interface de busca por:
- nome;
- EAN.

Resultado compacto:
- foto;
- nome;
- preço atual;
- estoque vendável;
- oferta, se aplicável.

Ações:
- `Enviar produto`;
- `Adicionar ao orçamento`;
- `Adicionar à nova venda`.

A resposta sobre estoque/preço deve vir da fonte operacional atual, nunca de texto estático da IA.

### 9.4 Assistente

Copiloto interno, sempre manual.

Ações iniciais:
- `Resumir conversa`;
- `Sugerir resposta`;
- `O que falta resolver?`.

Regras:
- resultado não é enviado automaticamente;
- sugestão de resposta preenche rascunho editável;
- IA nunca altera pedido/cadastro sem ação explícita;
- IA não cria informação de preço/estoque fora da fonte operacional.

## 10. Ferramentas rápidas úteis

Manter apenas:
- Enviar catálogo;
- Respostas rápidas;
- Criar orçamento;
- Nova venda;
- Enviar produto;
- Editar cadastro/endereço;
- Marcar retorno simples;
- Registrar opt-out de marketing.

### Respostas rápidas iniciais

Somente respostas frequentes:
- pagamento;
- entrega;
- cidades atendidas;
- pedido pelo catálogo;
- horário/prazo;
- confirmação de recebimento do pedido.

Devem ser conteúdo editável no futuro, mas a primeira versão pode usar uma configuração simples e pequena.

## 11. Recursos explicitamente fora da primeira versão

Não implementar agora:
- Kanban;
- pipeline comercial;
- lead scoring;
- departamentos complexos;
- dezenas de tags;
- chatbot novo concorrendo com ANA;
- campanhas dentro da tela de chat;
- dashboard analítico pesado;
- automações genéricas configuráveis pelo atendente;
- transcrição automática contínua de todo áudio;
- leitura/entrega simulada;
- CRM paralelo.

## 12. Backend novo

Criar uma API fina e privada específica para o módulo, em vez de aumentar ainda mais o monólito `admin-service-intelligence-v1`.

Nome recomendado:
- `admin-attendance-v1`.

Responsabilidades:
- listar filas por conta;
- buscar conversa;
- carregar mensagens paginadas;
- carregar contexto do cliente;
- carregar pedidos;
- pesquisar produtos;
- emitir catálogo vinculado;
- criar intenção de envio humano;
- assumir/finalizar atendimento;
- validar janela Meta;
- chamar transporte PapoAI somente quando homologado.

Nenhuma chave sensível vai ao navegador.

## 13. Dados adicionais mínimos

Evitar novas tabelas quando dados existentes resolvem.

Adicionar somente o que faltar comprovadamente para UX operacional, por exemplo:
- unread/read cursor por operador ou por Central;
- lembrete simples de retorno;
- estado de entrega da intenção outbound local.

Se um único proprietário/operador continuar sendo a realidade inicial, não modelar equipe complexa prematuramente.

## 14. Outbound PapoAI

O transporte deve ser implementado atrás de uma interface interna, para que a UI não dependa do contrato externo.

Contrato interno conceitual:

```json
{
  "conversation_id": "uuid",
  "channel_account_id": "uuid",
  "to_phone_e164": "+55...",
  "kind": "text",
  "text": "mensagem",
  "idempotency_key": "..."
}
```

Gates obrigatórios:
- conversa existe;
- canal pertence à conversa;
- telefone coincide;
- modo humano ativo quando exigido;
- janela aberta para texto livre;
- transporte homologado;
- idempotência.

Estado local mínimo:
- queued;
- accepted;
- failed.

Não converter `accepted` em `delivered`.

## 15. Realtime / atualização da tela

Preferência:
- Supabase Realtime nas tabelas/read-models canônicos necessários, se viável com segurança e volume;
- fallback leve de atualização somente da fila quando necessário.

Evitar polling agressivo.

Nova mensagem deve atualizar:
- conversa central se aberta;
- preview e horário da fila correspondente;
- contador de não lidas.

## 16. Performance

O `vitrine/admin/index.html` é monolítico e grande. O novo módulo não deve adicionar todo o código diretamente nele.

Criar módulo carregado sob demanda, por exemplo:
- `vitrine/admin/atendimento/index.html` ou assets dedicados equivalentes;
- scripts e estilos próprios;
- shell do Admin abre o módulo sem carregar seus dados nas demais seções.

Regras de performance:
- mensagens paginadas;
- buscas com debounce;
- contexto carregado após seleção;
- produtos apenas sob busca;
- imagens lazy;
- nenhuma carga global de histórico no boot do Admin.

## 17. Responsividade

### Desktop
Quatro áreas simultâneas.

### Tablet
- duas filas podem reduzir largura;
- painel direito abre/fecha como drawer;
- conversa permanece central.

### Mobile
Não comprimir quatro colunas.
Fluxo:
- abas 0975 / 1018;
- lista;
- conversa;
- botão de contexto abre drawer com Cliente/Pedidos/Produtos/Assistente.

## 18. Segurança

- RLS e acesso interno em todas as novas estruturas;
- nenhuma credencial do PapoAI em frontend;
- validar UUID, conta, telefone e vínculo no servidor;
- mensagens não podem ser enviadas para telefone arbitrário a partir de payload do browser sem vínculo operacional;
- sanitizar renderização de texto;
- limitar tamanho de mensagem;
- rate limit de envio humano;
- registro mínimo de erro e idempotência;
- evitar armazenar payload bruto externo indefinidamente.

Achado existente a tratar separadamente antes de ampliar marketing:
- `marketing_repurchase_state_v1` e `marketing_optout_events_v1` atualmente precisam revisão de RLS/policies; não misturar essa correção automaticamente com o módulo de atendimento sem validar políticas.

## 19. Homologação

### Fase A — somente leitura
- nova tela;
- duas filas reais;
- abrir conversa;
- cliente;
- pedidos;
- produtos;
- sem envio.

Gate: não altera PapoAI nem produção operacional.

### Fase B — outbound controlado
- configurar transporte PapoAI;
- usar somente contato de teste autorizado;
- texto dentro da janela;
- confirmar canal correto;
- confirmar idempotência;
- confirmar erro sem duplicação.

### Fase C — takeover humano
- assumir conversa;
- confirmar pausa da ANA;
- enviar;
- finalizar;
- confirmar comportamento da ANA depois.

### Fase D — ferramentas
- catálogo;
- nova venda;
- orçamento;
- produto;
- respostas rápidas;
- opt-out.

### Fase E — template fora de 24h
Somente após confirmar contrato de template aprovado pelo PapoAI/Meta.

## 20. Critérios de aceite

1. 0975 e 1018 aparecem em filas separadas no desktop.
2. Selecionar uma conversa mostra histórico correto sem misturar números.
3. Cliente e pedidos correspondem ao telefone/customer_id canônico.
4. Busca de produto retorna preço/estoque atuais.
5. Admin não fica mais lento nas demais seções.
6. Nenhuma mensagem real é enviada durante a fase somente leitura.
7. Depois de homologado, resposta sai pelo mesmo canal da conversa.
8. Duplicar clique/envio não gera duas mensagens externas.
9. Fora de 24h, texto livre fica bloqueado.
10. ANA e humano não respondem simultaneamente quando takeover estiver ativo.
11. Erros de transporte ficam visíveis sem fingir sucesso.
12. O módulo funciona em desktop e permanece utilizável em mobile.

## 21. Testes mínimos

### Backend
- listagem por conta;
- isolamento 0975/1018;
- paginação;
- resolução cliente;
- pedidos do cliente;
- pesquisa produto;
- janela 24h;
- idempotência outbound;
- bloqueio de telefone/canal divergente;
- transporte desligado = fail closed.

### Frontend
- duas filas independentes;
- seleção de conversa;
- troca rápida entre filas;
- paginação sem pular rolagem;
- estado vazio;
- erro de backend;
- badge da janela;
- drawer tablet/mobile;
- busca produto;
- context tabs.

### Integração
- PapoAI inbound → aparece no Admin;
- takeover controlado;
- Admin → PapoAI → contato teste;
- 0975 e 1018 separadamente;
- retorno à ANA após encerramento.

## 22. Cutover e rollback

Não haverá cutover único.

A Central entra primeiro como observadora. O chat PapoAI permanece disponível como fallback até todas as etapas críticas estarem homologadas.

Rollback da UI:
- ocultar/desativar módulo novo;
- nenhuma alteração necessária no canal PapoAI.

Rollback do outbound:
- `dispatch_enabled=false` / gate equivalente;
- leitura continua funcionando.

## 23. Resultado esperado

O operador deve conseguir resolver a maior parte do atendimento sem sair de uma única tela:
- ver em qual número o cliente falou;
- entender o contexto;
- consultar cadastro;
- localizar pedido;
- consultar produto;
- responder;
- mandar catálogo;
- iniciar venda/orçamento;
- encerrar atendimento humano.

O PapoAI continua como infraestrutura de canal e automação; o Vitrine/Admin passa a ser a interface operacional principal do atendimento humano da Dona Antônia.
