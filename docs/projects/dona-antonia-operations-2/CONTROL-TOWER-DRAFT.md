# Dona Antônia Operations 2.0 — Control Tower / Dashboard com IA (DRAFT)

> Documento de análise. Não é autorização de implementação.
> Última atualização: 2026-09-25.

## Objetivo
Criar no Vitrine/Admin uma **Central de Controle da Operação** que permita ao proprietário entender, supervisionar e controlar o que está acontecendo sem depender de lembrar o que perguntar em um chat.

A Central deve combinar:
1. visão operacional clara;
2. fila explícita do que precisa de ação humana;
3. automações visíveis e auditáveis;
4. assistente OpenAI embutido no Admin;
5. acesso ao Bling, PapoAI, site e dados Dona Antônia;
6. histórico completo de ações humanas, automáticas e de IA;
7. documentação permanente para continuidade do projeto.

## Conclusão de viabilidade
É tecnicamente viável.

A arquitetura recomendada não deve tentar "embutir a conversa atual do ChatGPT" como fonte de verdade. Em vez disso:
- o Admin terá um **copiloto OpenAI próprio**, usando OpenAI API;
- o ChatGPT externo poderá, quando o plano/conector permitir, acessar a mesma Central por MCP;
- os dois enxergarão as mesmas fontes reais: Bling, banco operacional, PapoAI e documentação;
- a continuidade vem dos dados/documentos, não da memória de uma conversa específica.

Isso evita depender de um chat longo ou de um único dispositivo.

## Restrição atual de produto ChatGPT
Documentação OpenAI consultada em 2026-09-25:
- full MCP com ações de escrita no ChatGPT está em beta para Business/Enterprise/Edu;
- não deve ser dependência obrigatória do projeto para uma conta Plus;
- o Admin pode usar OpenAI API diretamente, com cobrança separada da assinatura ChatGPT;
- a OpenAI API permite Function Calling, MCP remoto, Conversations persistentes e aprovação humana em workflows de agentes.

Portanto o projeto deve funcionar perfeitamente **sem exigir troca imediata do plano ChatGPT**.

## Bling
O Bling possui MCP oficial hospedado em:
`https://mcp.bling.com.br/mcp`

O MCP oficial permite, conforme permissões Bling:
- consultar vendas, NF-e, contatos, estoque, contas a pagar/receber;
- criar/atualizar cadastros;
- criar pedidos de venda e compra;
- fazer lançamentos de estoque;
- montar relatórios/panoramas;
- diagnosticar NF-e e estoque.

A OpenAI API suporta servidores MCP remotos. Assim, em arquitetura futura, o copiloto do Admin poderá usar o MCP oficial do Bling quando OAuth/permissões estiverem adequadamente implementados.

Alternativa de transição: reutilizar a integração Bling API já existente, mas o alvo arquitetural deve preferir capacidades oficiais em vez de duplicar ferramentas.

## Princípio central: dashboard primeiro, chat depois
O proprietário não deve precisar perguntar:
- "o que tenho que fazer?";
- "tem problema hoje?";
- "o financeiro está certo?";
- "o que está parado?";
- "alguma automação falhou?"

A tela deve responder isso **antes de qualquer pergunta**.

O chat entra como camada de investigação e comando, não como única interface operacional.

## Tela inicial proposta — "Central"

### Faixa 1 — Situação agora
Cards grandes e objetivos:
- Pedidos novos
- Aguardando confirmação
- Em separação
- Prontos para expedir
- Em entrega
- Pagamentos pendentes
- Fiscal pendente
- Estoque crítico
- Produtos próximos do vencimento
- Compras/XML para revisar
- Conversas PapoAI que precisam de humano
- Automações com falha
- Itens aguardando aprovação do proprietário

Cada card abre diretamente a fila correspondente.

### Faixa 2 — "Precisa de você"
Esta é a área principal para supervisão humana.

Exemplos:
- Cliente sem CPF para sincronização com Bling
- Endereço incompleto
- Pedido WhatsApp aguardando confirmação humana
- Conversão caixa->unidade ambígua
- XML com produto sem correspondência
- Conta a pagar com divergência
- NF-e rejeitada
- Estoque divergente
- Pedido parado há tempo excessivo
- Entrega não concluída
- Automação que pediu aprovação

Cada item deve mostrar:
- o que aconteceu;
- por que precisa de humano;
- impacto;
- recomendação da IA;
- botões claros: Aprovar / Corrigir / Ignorar / Abrir / Perguntar à IA.

### Faixa 3 — Automações
Mostrar cada rotina importante como um "robô" supervisionável:
- XML diário
- sincronização Bling
- webhooks Bling
- alertas de validade
- ofertas automáticas
- follow-up PapoAI
- relatórios diários
- reconciliações
- backups/saúde

Para cada automação:
- ativa/pausada;
- última execução;
- próxima execução/evento;
- duração;
- resultado;
- itens processados;
- erros;
- última ação tomada;
- botão "Ver histórico";
- botão "Pausar" apenas quando seguro e autorizado.

### Faixa 4 — Linha do tempo da empresa
Uma timeline unificada:
- 08:02 pedido #DA... criado pelo site
- 08:03 pedido enviado ao Bling
- 08:05 Ana iniciou separação
- 08:11 conferência concluída
- 08:12 NF-e autorizada
- 08:15 pedido saiu para entrega
- 08:22 XML fornecedor X recebido
- 08:23 14 produtos conciliados
- 08:24 2 itens aguardando revisão de caixa/unidade
- 08:30 automação de validade desativou produto vencido
- 08:40 PapoAI transferiu conversa de Maria para humano

Filtros:
- Pedidos
- Financeiro
- Estoque
- Compras
- Fiscal
- PapoAI/WhatsApp
- Automação
- Humano
- IA
- Bling

### Faixa 5 — Copiloto
Painel lateral ou inferior:
**"Pergunte sobre sua operação"**

Exemplos prontos:
- O que precisa da minha atenção agora?
- Resuma o dia.
- Quais pedidos estão atrasados?
- O que falhou desde ontem?
- Quais clientes precisam de retorno?
- Quais contas vencem nos próximos 7 dias?
- O que devo comprar esta semana?
- Existem divergências entre o Bling e o sistema?
- Quais produtos estão próximos do vencimento?
- Revise os XMLs recebidos hoje.
- Explique por que este pedido não foi ao Bling.

O assistente responde usando dados atuais e sempre deve mostrar a origem da informação.

## Botões e chat
Não obrigar o usuário a saber prompts.

### Botões contextuais
Em qualquer card/item:
- "Explique"
- "O que faço?"
- "Investigar"
- "Corrigir com IA"
- "Comparar com Bling"
- "Mostrar histórico"
- "Criar relatório"
- "Aprovar"
- "Rejeitar"

O botão monta automaticamente contexto para a IA.

Exemplo:
Usuário abre pedido com problema e clica **"Investigar"**.
O copiloto recebe automaticamente:
- ID do pedido;
- cliente;
- itens;
- eventos;
- vínculo Bling;
- fiscal;
- estoque;
- conversa PapoAI relacionada;
- erros/logs relevantes.

O proprietário não precisa explicar tudo no texto.

## Três níveis de automação
### Nível A — automático sem aprovação
Somente ações determinísticas e reversíveis/baixo risco:
- atualizar dashboard;
- classificar alerta;
- gerar relatório;
- reconciliar leitura;
- detectar duplicidade;
- avisar estoque baixo;
- registrar webhook;
- montar rascunho.

### Nível B — automático com regra + auditoria
Pode executar sem aprovação somente se critérios rígidos forem satisfeitos:
- sincronizações idempotentes;
- atualização de espelho local;
- aplicação de regras já aprovadas de ofertas;
- notificações operacionais previamente autorizadas.

### Nível C — exige humano
- emitir/cancelar documento fiscal quando houver risco;
- alterar valor financeiro relevante;
- dar baixa financeira fora de regra;
- cancelar venda;
- alterar estoque de forma excepcional;
- aceitar conversão ambígua caixa->unidade;
- resolver correspondência fiscal incerta;
- aprovar pedido extraído de mensagem ambígua;
- ações irreversíveis ou de alto impacto.

A OpenAI Agents API suporta interrupções/aprovações humanas para side effects. O mesmo conceito deve existir mesmo se a implementação usar Responses API + camada própria.

## "Caixa-preta" operacional — requisito essencial
Hoje existem registros fragmentados:
- `bling_hub_audit_v2`: 293 eventos;
- `product_lifecycle_audit`: 39 eventos;
- `admin_audit_logs`: 0 registros;
- jobs Bling, fiscal, XML e conversas estão em estruturas separadas.

Isso não é suficiente para uma Central de Controle confiável.

O Projeto Final deve prever um **ledger operacional unificado, append-only**, sem substituir os dados oficiais dos módulos.

Campos conceituais:
- event_id
- occurred_at
- domain
- entity_type
- entity_id
- event_type
- actor_type: human | automation | ai | external
- actor_id/label
- source_system
- correlation_id
- automation_run_id
- conversation_id
- order_id
- bling_ref
- severity
- summary
- details
- before/after quando aplicável
- status
- approval_id quando aplicável
- idempotency_key

Objetivo: qualquer pergunta "quem fez isso, quando e por quê?" deve ser respondível.

## Memória operacional para IA
Separar quatro tipos de memória:

### 1. Estado atual
Dados vivos:
- Bling
- pedidos
- estoque
- financeiro
- PapoAI
- fiscal
- XML
- entregas

Nunca depender de texto antigo para saber o estado atual.

### 2. Eventos históricos
Ledger operacional.
Serve para:
- auditoria;
- investigação;
- relatórios;
- aprendizado operacional;
- detectar padrões.

### 3. Decisões e regras
GitHub/docs:
- arquitetura;
- regras de negócio;
- decisões;
- runbooks;
- migrações;
- gates;
- fonte de verdade;
- integrações.

### 4. Conversas de IA
A OpenAI Conversations API pode manter conversas duráveis entre sessões.
Útil para continuidade da experiência do copiloto, mas **não deve ser fonte de verdade operacional**.

## Documentação permanente
O projeto deve continuar mantendo documentação curta e canônica no GitHub:
- HANDOFF.md
- CURRENT-STATE.md
- SOURCE-OF-TRUTH.md
- PROJECT-MASTER.md
- DECISIONS.md
- OPERATIONS.md
- RUNBOOKS/
- INTEGRATIONS/
- MIGRATION-AND-ROLLBACK.md

Não registrar cada pedido/estoque em Markdown. Isso fica no banco/ERP.
GitHub registra o **como e por quê do sistema**.

## Relatórios automáticos propostos
A Central poderá gerar sem o usuário pedir:
- Resumo de abertura do dia
- Pendências críticas
- Fechamento do dia
- Vendas
- Financeiro
- Estoque
- Produtos a vencer
- Compras sugeridas
- XMLs processados/revisão
- Pedidos atrasados
- Entregas não concluídas
- PapoAI: atendimentos, handoffs, oportunidades perdidas
- Saúde das integrações

O dashboard guarda relatórios anteriores para comparação.

## Supervisão de IA
A IA também deve ser supervisionada.

Mostrar no Admin:
- ações sugeridas pela IA;
- ações executadas;
- ferramentas consultadas;
- aprovações humanas;
- falhas;
- custo aproximado de IA;
- duração;
- resultado;
- justificativa resumida.

Nunca exibir chain-of-thought privado; registrar justificativa operacional resumida e evidências usadas.

## Acesso do ChatGPT externo
Arquitetura futura ideal:
- criar um MCP "Dona Antônia Operations" com ferramentas de leitura e ações controladas;
- ChatGPT consulta a Central de Controle;
- MCP fornece dados já normalizados e auditados;
- ações sensíveis passam por approval queue;
- o mesmo MCP pode ser usado por outros clientes compatíveis.

Assim, no ChatGPT externo seria possível perguntar:
"Como está a empresa hoje?"
e receber o mesmo estado que aparece no Admin.

Porém esta capacidade não é requisito para o funcionamento do Admin.

## Relação com Bling
Evitar duplicação:
- para dados nativos do ERP, ler preferencialmente Bling;
- para recursos oficiais disponíveis via MCP, considerar MCP;
- para eventos, receber webhooks;
- para regras especiais Dona Antônia, usar banco próprio;
- para dashboard, montar uma visão composta, sem criar um segundo ERP.

## Relação com PapoAI
Central deve mostrar:
- conversas que precisam de humano;
- pedidos/rascunhos originados no WhatsApp;
- falhas de webhook;
- clientes aguardando resposta;
- follow-ups executados;
- status da integração.

PapoAI continua canal; Central apenas supervisiona.

## Lacunas atuais encontradas
1. Admin já tem uma boa base na aba "Hoje", com cards de pedidos, fechamento, backlog, problemas e validades.
2. Ela é operacional, mas ainda não é uma Control Tower completa.
3. Não existe timeline unificada.
4. `admin_audit_logs` está vazio e não há uso encontrado no código canônico.
5. Auditoria Bling/fiscal existe, mas fragmentada.
6. Não há venda manual canônica no Admin.
7. Admin atual filtra pedidos de origem `vitrine`, então não representa operação multicanal completa.
8. PapoAI atual possui endpoint aposentado ainda recebendo chamadas.
9. Não existe hoje uma fila universal "Precisa de você".
10. Não existe copiloto operacional embutido no Admin.

## Direção recomendada
A futura interface deve evoluir a aba **Hoje** para **Central** em vez de criar um segundo painel paralelo.

A Central será a página inicial.
A IA será embutida nela.
A operação continuará sendo feita nas telas especializadas quando necessário.

## Gate antes de implementar
Só implementar depois de fechar:
- fluxo final de pedidos;
- fonte de verdade;
- financeiro;
- XML/compras;
- PapoAI;
- separação/fiscal/expedição;
- modelo de aprovação;
- permissões;
- logs/auditoria;
- custos e limites de OpenAI/Bling;
- estratégia de autenticação OAuth/MCP.
