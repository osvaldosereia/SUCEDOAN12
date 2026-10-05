# Marketing Dona Antônia — Motor de Estratégia para Cestas e Kits

**Data:** 2026-10-05  
**Status:** aguardando revisão final do usuário  
**Escopo:** Vitrine/Admin → Marketing → Estratégia  
**Base existente:** catálogo canônico de Cestas/Kits, campanhas, públicos, templates Meta, snapshots, worker, relatórios e pedidos.

## 1. Objetivo

Criar uma nova área **Marketing → Estratégia** que funcione como o cérebro comercial da Dona Antônia para WhatsApp.

O produto principal das campanhas não será o item avulso. O motor deve trabalhar prioritariamente com **Cestas e Kits prontos**, oferecendo combinações já fáceis de entender e comprar, alinhadas ao pedido mínimo de **R$ 75** e à política comercial de **entrega grátis para as Cestas/Kits elegíveis dentro da área atendida**.

O sistema deve:

1. consultar continuamente as Cestas/Kits que realmente estão disponíveis para venda;
2. identificar o que faz mais sentido divulgar em cada momento;
3. montar uma estratégia semanal;
4. criar campanha e template quando necessário;
5. pedir aprovação humana antes de enviar qualquer template novo à Meta;
6. acompanhar a aprovação da Meta;
7. pedir nova aprovação humana antes do disparo aos clientes;
8. registrar entrega, leitura, clique, interação, acesso ao site, carrinho, pedido e receita quando tecnicamente disponível;
9. aprender com os resultados e melhorar as estratégias seguintes;
10. gerenciar o ciclo de vida dos templates para evitar acúmulo desnecessário na Meta.

A automação será inicialmente **assistida**, não autônoma para envio.

---

## 2. Princípio comercial central

A estratégia parte de uma premissa simples:

> A Dona Antônia deve vender uma solução pronta para a necessidade do cliente, e não apenas uma lista de preços.

Por isso, o motor de Marketing deve preferir:

- Cesta Econômica;
- Cesta Família;
- Cesta Só Alimentos;
- Kit Limpeza;
- Kit Higiene;
- Kit Limpeza + Higiene;
- novos kits temáticos que venham a ser cadastrados;
- combinações de duas ou mais Cestas/Kits quando necessário para formar uma oferta comercial válida.

Itens avulsos podem existir na composição do produto e no checkout, mas **não são a unidade principal de decisão do motor de Marketing v1**.

---

## 3. Regras de negócio obrigatórias

### 3.1 Pedido mínimo

A política comercial atual tem pedido mínimo de **R$ 75**.

O motor nunca deve recomendar como oferta principal uma combinação que, sozinha, leve o cliente a uma compra inválida.

Regra:

- se uma Cesta/Kit tiver preço final >= R$ 75, pode ser ofertada isoladamente;
- se uma Cesta/Kit tiver preço abaixo de R$ 75, ela só pode entrar como parte de uma **combinação pronta** cujo total atinja o mínimo;
- a UI deve mostrar claramente quando a recomendação é uma combinação de dois ou mais modelos.

### 3.2 Entrega grátis

As campanhas de Cestas/Kits podem destacar **entrega grátis** apenas quando a oferta e o destino estiverem dentro das regras comerciais vigentes.

O motor não deve prometer entrega grátis para destino fora da área atendida ou para uma combinação que não satisfaça as regras vigentes.

### 3.3 Estoque e disponibilidade

Somente Cestas/Kits realmente vendáveis entram na seleção normal.

O motor deve usar o catálogo canônico e respeitar, no mínimo:

- modelo ativo;
- categoria ativa;
- lote apto;
- `public_available > 0`;
- `availability_reason = available`;
- preço comercial atual;
- imagem e nome públicos atuais.

Antes do disparo, a disponibilidade deve ser revalidada. Se uma oferta ficar indisponível entre a aprovação da estratégia e o envio, o disparo deve ser bloqueado para aquela oferta e retornar à revisão, ou o sistema deve propor substituição antes de prosseguir.

### 3.4 Área e calendário operacional

O Marketing deve respeitar a operação de venda local. Campanhas não devem criar expectativa impossível de entrega.

A recomendação de horário deve considerar:

- dias de operação;
- domingos e feriados nacionais fechados;
- regra operacional de pedidos após 12h quando aplicável;
- fuso `America/Cuiaba`.

A v1 pode usar quinta-feira pela manhã como hipótese inicial de envio, mas esse horário é **configurável e deve ser substituído pelos dados reais assim que houver histórico suficiente**.

### 3.5 Frequência

Política inicial:

- no máximo **1 campanha programada de Marketing por cliente por semana**;
- campanhas operacionais/utilitárias não contam como Marketing;
- cliente com revogação/`NAO_CONTATAR` não entra;
- cliente inelegível pelos gates já existentes continua excluído no backend.

---

## 4. Navegação

A área Marketing passa a ter a navegação principal:

- **Visão geral**
- **Estratégia**
- **Templates**
- **Campanhas**
- **Públicos**

`Estratégia` não substitui Campanhas.

Responsabilidades:

- **Estratégia:** decide e explica o que vale a pena fazer;
- **Templates:** gerencia os modelos Meta;
- **Campanhas:** executa o que foi aprovado;
- **Públicos:** apoia segmentações;
- **Relatórios:** alimentam o aprendizado.

---

## 5. Fluxo de aprovação obrigatório

A v1 terá três portões separados.

### Portão A — aprovação interna da estratégia e conteúdo

A automação cria:

- objetivo;
- Cesta/Kit ou combinação;
- público;
- argumento comercial;
- texto;
- criativo/carrossel quando aplicável;
- horário sugerido;
- template a reutilizar ou novo template necessário.

Estado:

`Rascunho da IA → Aguardando sua aprovação`

A Meta ainda não é chamada.

Ações:

- `Aprovar estratégia`
- `Editar`
- `Gerar outra sugestão`
- `Descartar`

Se a estratégia exigir um template novo, a ação principal passa a ser:

`Aprovar e enviar para Meta`

### Portão B — aprovação Meta

Somente após o Portão A o backend envia o template para a Meta.

Estados simplificados:

- Enviando para Meta;
- Em análise;
- Aprovado;
- Rejeitado.

Se rejeitado:

- registrar motivo disponível;
- IA pode sugerir uma correção;
- a correção volta obrigatoriamente ao Portão A;
- nenhuma nova versão é submetida sem aprovação humana.

### Portão C — aprovação do disparo

Mesmo com template aprovado pela Meta, a campanha não envia automaticamente na v1.

Estado:

`Pronta para envio`

Ações:

- `Aprovar e enviar agora`
- `Aprovar e agendar`
- `Editar estratégia`
- `Cancelar`

Qualquer edição material de texto/template/oferta depois de aprovado invalida a aprovação anterior e retorna ao estágio correspondente.

---

## 6. Tela `Marketing → Estratégia`

### 6.1 Cabeçalho

Título:

**Estratégia de Marketing**

Subtítulo curto:

`A Dona Antônia analisa Cestas, Kits, clientes e resultados para sugerir a melhor campanha da semana.`

Ações:

- `Gerar estratégia agora`
- `Calendário`
- `Configurações`

### 6.2 Card principal — Recomendação da semana

Exemplo visual de conteúdo:

**Recomendação da semana**  
`Cesta Família + Kit Limpeza`

- Público estimado: 412 clientes elegíveis antes da revalidação final;
- Melhor janela sugerida: quinta, 09:00;
- Objetivo: compra do mês;
- Entrega: grátis conforme regra vigente;
- Total da oferta: R$ 149,90;
- Confiança: Boa oportunidade.

**Por que esta estratégia?**

- início do mês;
- estoque saudável;
- combinação acima do pedido mínimo;
- histórico recente favorável para Cestas;
- clientes selecionados ainda não receberam esta oferta no período.

Ações:

- `Revisar estratégia`
- `Aprovar`
- `Gerar alternativa`

### 6.3 Oportunidades detectadas

Cards menores:

- `Nova Cesta sem histórico — testar`
- `Kit Limpeza com alto estoque`
- `Clientes próximos de recompra`
- `Cesta vencedora no início do mês`
- `Público inativo com boa afinidade`

Cada card deve explicar em linguagem simples o motivo da oportunidade.

### 6.4 Calendário comercial

Visão mensal com:

- estratégia planejada por semana;
- sazonalidades;
- datas comerciais;
- início/meio/fim do mês;
- campanhas já enviadas;
- campanhas aprovadas/agendadas;
- lacunas sem campanha.

O calendário não dispara nada sozinho na v1.

### 6.5 Aprendizados

Bloco de leitura simples, por exemplo:

- `Cestas completas convertem melhor do dia 1 ao dia 8.`
- `Kit Limpeza teve mais pedidos entre clientes que já compraram limpeza.`
- `Carrosséis com 4 ofertas geraram mais acessos que campanhas de oferta única.`
- `Clientes sem compra há 45–70 dias responderam melhor à Cesta Econômica.`

Toda afirmação deve estar ligada a dados reais. A IA não pode inventar aprendizados sem evidência suficiente.

---

## 7. Motor de Oportunidades

O motor deve separar **fatos determinísticos** de **interpretação da IA**.

### 7.1 Camada determinística

Responsável por fatos e pontuações reproduzíveis:

- Cestas/Kits disponíveis;
- preço;
- estoque público;
- categoria;
- lote;
- data de criação/ativação;
- histórico de vendas;
- clientes elegíveis;
- última compra;
- frequência de compra;
- ticket médio;
- categorias compradas;
- campanhas recebidas;
- leitura/clique/resposta;
- pedidos atribuídos;
- receita atribuída;
- sazonalidade configurada;
- limite semanal;
- consentimento/supressão;
- dia/horário.

### 7.2 Camada de IA

Responsável por:

- explicar a oportunidade;
- sugerir a estratégia;
- escrever o texto;
- propor títulos;
- escolher entre formatos permitidos;
- sugerir teste A/B;
- resumir aprendizados;
- sugerir próximo experimento.

A IA **não pode**:

- inventar preço;
- inventar estoque;
- inventar produto;
- inventar resultado;
- ignorar o pedido mínimo;
- marcar cliente inelegível como elegível;
- enviar campanha;
- enviar template à Meta sem aprovação humana;
- excluir template da Meta;
- alterar diretamente dados canônicos de estoque, pedido ou cliente.

---

## 8. Pontuação inicial das oportunidades

A v1 usa score explicável, não um modelo de machine learning opaco.

Cada Cesta/Kit ou combinação recebe componentes de pontuação, por exemplo:

- **Disponibilidade e estoque:** 0–25;
- **Adequação ao momento/sazonalidade:** 0–20;
- **Adequação ao público:** 0–20;
- **Desempenho histórico:** 0–20;
- **Valor de exploração/novidade:** 0–10;
- **Qualidade operacional da oferta:** 0–5.

Total: 0–100.

Faixas de apresentação:

- 80–100: `Excelente oportunidade`;
- 60–79: `Boa oportunidade`;
- 40–59: `Vale testar`;
- abaixo de 40: não priorizar por padrão.

Os pesos devem ser configuráveis e versionados para podermos comparar mudanças de estratégia.

---

## 9. Fase inicial — formação de histórico

Como ainda haverá muitos kits novos sem histórico, a v1 não deve fingir que conhece o comportamento individual desde o primeiro dia.

### 9.1 Cold start

Nas primeiras campanhas:

- usar base ampla de clientes elegíveis;
- respeitar supressão e limite semanal;
- variar as Cestas/Kits oferecidas entre semanas;
- preferir carrossel quando houver várias opções relevantes;
- usar links rastreáveis separados por card/oferta;
- registrar qual Cesta/Kit foi visualizada e qual foi comprada.

Objetivo: produzir dados próprios rapidamente.

### 9.2 Exploração controlada

O motor não deve mostrar sempre apenas a campeã histórica.

Uma parcela das oportunidades deve receber bônus de exploração para:

- Cesta/Kit novo;
- composição recém-alterada;
- nova faixa de preço;
- novo formato de comunicação.

Isso evita que o algoritmo fique preso às primeiras opções vencedoras.

---

## 10. Fase aprendida — personalização

Com histórico suficiente, o motor passa a ponderar por cliente/público.

Sinais possíveis:

- frequência típica de compra;
- dias desde a última compra;
- ticket médio;
- Cestas/Kits já comprados;
- categorias presentes nas compras;
- preço médio aceito;
- campanhas lidas;
- campanhas clicadas;
- campanhas que geraram pedido;
- ofertas repetidamente ignoradas.

Exemplos:

- cliente mensal entrando na janela de recompra → Cesta do mês;
- histórico de limpeza → Kit Limpeza;
- ticket alto → Cesta Família/Premium;
- cliente inativo → combinação de entrada com alto apelo;
- comprador recorrente da mesma cesta → recompra ou upgrade controlado.

A pessoa não deve receber textos invasivos como `você está há 43 dias sem comprar`. Esses sinais são internos.

---

## 11. Sazonalidade

Criar calendário interno versionado.

Tipos de regra:

- início do mês;
- meio do mês;
- fim do mês;
- volta às aulas;
- Páscoa;
- Dia das Mães;
- festas juninas;
- Dia das Crianças;
- Black Friday;
- Natal;
- Ano Novo;
- sazonalidades locais cadastradas pela Dona Antônia.

Cada regra pode sugerir:

- categorias de Cesta/Kit;
- objetivo;
- janela de envio;
- peso no score;
- texto-base opcional.

A v1 não depende de dados externos de clima ou web para funcionar. Fontes externas podem ser avaliadas futuramente.

---

## 12. Seleção de oferta e combinações

O motor trabalha com três tipos de oferta:

### 12.1 Oferta simples

Uma única Cesta/Kit que já satisfaz as regras comerciais.

### 12.2 Carrossel de alternativas

De 2 a N Cestas/Kits independentes, cada card levando para sua vitrine/ação rastreável.

Uso recomendado no cold start para aprender preferências.

### 12.3 Combinação pronta

Duas ou mais Cestas/Kits apresentadas como uma solução única quando isso fizer sentido comercial ou for necessário para atingir o mínimo.

A combinação deve guardar os IDs canônicos de cada componente para atribuição posterior.

---

## 13. Rastreamento e atribuição

O sistema deve medir mais do que `enviado`.

### 13.1 Eventos desejados

Por campanha/destinatário/oferta quando disponíveis:

1. selecionado para público;
2. enviado;
3. entregue;
4. lido;
5. link/card clicado;
6. vitrine aberta;
7. interação/resposta no WhatsApp;
8. item/cesta adicionada ao carrinho;
9. checkout iniciado;
10. pedido criado;
11. pedido confirmado;
12. pedido cancelado;
13. receita atribuída.

### 13.2 Links de campanha

Todo CTA de Marketing deve usar um deep link rastreável da Dona Antônia com identificadores não sensíveis ou token opaco.

O token deve permitir relacionar:

- estratégia;
- campanha;
- oferta/card;
- cliente quando permitido;
- sessão;
- pedido.

Não expor UUIDs internos em URL pública quando isso puder ser evitado.

### 13.3 Atribuição de venda

Hierarquia sugerida:

**Atribuição direta**

Pedido contém token/origem explícita da campanha.

**Atribuição assistida**

Cliente recebeu/interagiu com a campanha e realizou pedido dentro de uma janela configurável, sem outra campanha posterior que explique melhor a conversão.

Janela inicial sugerida: 7 dias.

Relatórios devem separar `direta` de `assistida`; não somar ambas como se fossem a mesma certeza.

### 13.4 Identificação da Cesta/Kit comprada

A atribuição deve preferir dados canônicos do pedido, incluindo os metadados de Cesta/Lote já registrados no motor de pedidos.

Isso permite saber não apenas se houve pedido, mas **qual Cesta/Kit efetivamente vendeu**.

---

## 14. Métricas de aprendizado

Por estratégia, campanha, público e Cesta/Kit:

- público selecionado;
- público elegível;
- enviados;
- entregues;
- lidos;
- taxa de leitura;
- cliques;
- taxa de clique por entregue;
- respostas/interações;
- abertura de vitrine;
- adição ao carrinho;
- pedidos;
- conversão por entregue;
- receita direta;
- receita assistida;
- ticket médio;
- receita por 1.000 entregues;
- tempo médio até pedido;
- cancelamentos;
- opt-outs/supressões associados quando disponíveis.

Principal métrica econômica inicial:

> **Receita e pedidos por 1.000 mensagens entregues.**

Isso permite comparar campanhas de tamanhos diferentes.

---

## 15. Ciclo de vida de Templates Meta

### 15.1 Regra `reuse first`

Antes de criar um template, o sistema procura:

1. template aprovado idêntico/reutilizável;
2. família aprovada que aceite os dados da nova oferta;
3. somente então cria um template novo.

Objetivo: reduzir submissões e acúmulo.

### 15.2 Famílias de template

Quando o contrato Meta e o worker atual permitirem parametrização segura, preferir famílias reutilizáveis como:

- oferta única de Cesta/Kit;
- carrossel de Cestas/Kits;
- recompra;
- oportunidade sazonal.

Se a estrutura/mídia não puder ser reutilizada com segurança, criar versão específica.

### 15.3 Estados locais

- Rascunho;
- Aguardando aprovação interna;
- Aprovado internamente;
- Enviado para Meta;
- Em análise Meta;
- Aprovado Meta;
- Rejeitado Meta;
- Em uso;
- Aposentado;
- Candidato à exclusão;
- Excluído da Meta.

### 15.4 Templates protegidos

Templates operacionais/utilitários críticos devem ter `protected = true`.

Exemplos:

- confirmação de pedido;
- atendimento operacional;
- fluxos necessários ao checkout/pós-pedido.

Eles nunca entram na fila automática de limpeza.

### 15.5 Candidato à exclusão

Regra inicial sugerida para Marketing:

- não protegido;
- nenhuma campanha ativa/agendada/futura usa o template;
- nenhuma estratégia aprovada depende dele;
- último uso há pelo menos 60 dias;
- sem pendência operacional conhecida.

O sistema marca e explica.

### 15.6 Exclusão

A automação **não apaga template da Meta sozinha**.

Fluxo:

`Candidato à exclusão → Revisar limpeza → Usuário confirma → Backend exclui na Meta`

Após exclusão na Meta, manter localmente:

- ID Meta antigo;
- nome;
- conteúdo;
- mídia/referências permitidas;
- campanhas associadas;
- resultados;
- motivo da aposentadoria;
- data da exclusão;
- aprendizado.

Apagar da Meta não apaga inteligência histórica.

---

## 16. Tela de Gestão de Templates dentro de Estratégia

Adicionar bloco `Saúde dos templates` ou atalho para Templates com visão operacional:

- Protegidos;
- Em uso;
- Em análise;
- Rejeitados;
- Aposentados;
- Candidatos à exclusão.

Exemplo:

`7 templates de Marketing podem ser aposentados. 3 já podem ser removidos da Meta com segurança.`

Ações:

- `Revisar limpeza`
- `Manter`
- `Aposentar`
- `Excluir selecionados da Meta`

Toda exclusão exige confirmação explícita.

---

## 17. Dados existentes a reutilizar

A implementação deve reutilizar o sistema atual em vez de duplicá-lo.

### Cestas/Kits

Fonte canônica prevista:

- catálogo comercial canônico de Cestas/Kits;
- disponibilidade pública;
- preço;
- imagem;
- categoria;
- lote atual;
- estoque público;
- disponibilidade e motivo.

### Campanhas

Reutilizar:

- `marketing_campaigns_v1`;
- snapshots de campanha;
- destinatários do snapshot;
- eventos da campanha;
- dispatches;
- worker/agendamento;
- runtime de execução;
- relatórios atuais.

### Templates

Reutilizar:

- `whatsapp_templates_v1`;
- sincronização Meta existente;
- Edge Functions Admin existentes;
- função de carrossel já criada/deployada;
- status de template vindos da Meta.

### Clientes

Reutilizar:

- cadastro canônico;
- telefone canônico;
- histórico de pedidos;
- etiquetas/interesses quando úteis;
- consentimento/supressão;
- métricas de compra existentes ou views derivadas.

### Pedidos

Usar `orders`/`order_items` e metadados canônicos de Cesta/Kit/Lote para atribuição.

---

## 18. Novas estruturas previstas

Os nomes abaixo são proposta arquitetural e podem ser ajustados no plano técnico se o schema atual oferecer uma opção melhor.

### `marketing_strategy_runs_v1`

Uma linha por estratégia gerada.

Campos conceituais:

- id;
- período de referência;
- status;
- objetivo;
- audience definition;
- suggested_send_at;
- score/nível de confiança;
- rationale;
- snapshot das regras/pesos;
- AI model/version metadata;
- aprovado por/em;
- rejeitado por/em;
- campaign_id quando materializada;
- timestamps.

### `marketing_strategy_offers_v1`

Ofertas pertencentes à estratégia:

- strategy_id;
- commercial_id da Cesta/Kit;
- lot_id selecionado/snapshot quando aplicável;
- posição/hero/card;
- preço snapshot;
- estoque snapshot;
- score;
- reasons;
- offer snapshot.

Para combinação pronta, permitir grupo de componentes.

### `marketing_strategy_events_v1`

Ledger append-only:

- generated;
- internally_approved;
- internally_rejected;
- sent_to_meta;
- meta_approved;
- meta_rejected;
- campaign_created;
- send_approved;
- scheduled;
- completed;
- retired.

### `marketing_seasonality_rules_v1`

Calendário/regras:

- nome;
- período;
- recorrência;
- prioridade;
- categorias/ofertas preferidas;
- peso;
- notas;
- ativo.

### `marketing_template_lifecycle_v1`

Complemento operacional ao cache Meta:

- template_id;
- protected;
- lifecycle_status;
- purpose;
- last_used_at;
- retired_at;
- delete_candidate_at;
- deleted_from_meta_at;
- deletion_reason;
- strategy metadata.

### `marketing_attribution_events_v1`

Somente para eventos que ainda não tenham fonte canônica adequada.

Não duplicar `delivery/read` se o WhatsApp ledger atual já os representar. Preferir views agregadoras sobre fontes existentes.

Eventos possíveis:

- campaign_link_open;
- storefront_view;
- add_to_cart;
- checkout_started;
- direct_order_attribution.

---

## 19. Estratégia de cold start recomendada

Primeiro ciclo operacional sugerido: 8 semanas.

### Semanas 1–4

- 1 campanha semanal;
- base ampla elegível;
- alternância de Cestas/Kits;
- carrossel quando útil;
- rastreamento por oferta;
- sem segmentação agressiva baseada em pouco dado.

### Semanas 5–8

- começar a comparar grupos;
- recompra;
- afinidade por Cesta/Kit/categoria;
- faixa de ticket;
- inatividade;
- aprendizado de horário;
- exploração de novos kits.

Ao final, o painel deve conseguir comparar resultados e recomendar a fase seguinte.

---

## 20. Experimentos

O sistema deve suportar aprendizado deliberado.

Tipos iniciais:

- oferta única vs carrossel;
- Cesta Econômica vs Cesta Família;
- 3 cards vs 4 cards;
- argumento `economia` vs `praticidade`;
- horário A vs horário B;
- público amplo vs público com afinidade.

Regras:

- cada experimento guarda hipótese;
- grupos mutuamente exclusivos quando necessário;
- mesma janela de comparação;
- métrica principal definida antes do envio;
- resultado registrado mesmo quando inconclusivo.

A IA pode sugerir experimento, mas não pode mudar silenciosamente a métrica depois de ver o resultado.

---

## 21. Decisão semanal do motor

Fluxo conceitual:

1. carregar Cestas/Kits vendáveis;
2. excluir ofertas comercialmente inválidas;
3. carregar estado de clientes elegíveis;
4. aplicar limite de frequência e supressões;
5. carregar sazonalidade;
6. carregar desempenho histórico;
7. calcular score de ofertas;
8. aplicar exploração controlada;
9. escolher oferta simples, carrossel ou combinação;
10. escolher público inicial;
11. definir objetivo e hipótese;
12. montar texto/criativo;
13. verificar template reutilizável;
14. montar estratégia;
15. salvar rationale + snapshots;
16. aguardar aprovação humana.

Nada é enviado durante este processo.

---

## 22. Revalidação antes do envio

Imediatamente antes de materializar/disparar:

- revalidar template aprovado;
- revalidar canal;
- revalidar runtime;
- revalidar consentimento/supressão;
- revalidar telefone;
- deduplicar;
- revalidar frequência semanal;
- revalidar Cesta/Kit/lote/estoque;
- revalidar preço;
- revalidar mínimo de R$ 75;
- revalidar regras de entrega;
- revalidar agenda/feriado quando aplicável.

Se preço ou composição tiverem mudado de forma que altere o conteúdo aprovado, bloquear e devolver à revisão.

---

## 23. Segurança e responsabilidades

- navegador Admin nunca chama Graph API diretamente;
- service role permanece somente no backend;
- toda chamada Meta passa pelas Edge Functions autorizadas;
- estratégia não contorna os gates existentes;
- snapshots/eventos de decisão importantes são append-only quando possível;
- ações destrutivas ficam auditadas;
- aprovação interna registra operador e data;
- aprovação de envio registra operador e data;
- exclusão Meta registra operador, template e motivo;
- nenhuma ação automática deve ligar `campaigns_enabled` ou mudar runtime de `off` para `live` sem fluxo explícito de homologação.

---

## 24. Estados resumidos

### Estratégia

`draft → awaiting_internal_approval → approved_internal → waiting_meta (se necessário) → ready_to_send → send_approved → scheduled/running → completed`

Alternativas:

`rejected_internal`, `meta_rejected`, `cancelled`, `superseded`.

### Template

`draft → awaiting_internal_approval → meta_pending → meta_approved → active → retired → delete_candidate → meta_deleted`

### Campanha

Continuar usando os estados canônicos atuais, acrescentando apenas adaptação de UI/integração necessária; não criar um segundo motor de execução.

---

## 25. Critérios para a IA dizer que aprendeu algo

A IA só deve apresentar um aprendizado como conclusão quando houver suporte mínimo definido.

V1:

- mostrar `Sinal inicial` quando amostra for pequena;
- mostrar `Tendência` quando houver repetição consistente;
- mostrar `Aprendizado forte` somente após volume mínimo e resultado consistente definido no plano técnico.

Sempre apresentar base simples:

`3 campanhas · 1.284 entregas · 47 pedidos`

Evitar frases absolutas com poucos dados.

---

## 26. Relatório de Estratégia

Além do relatório de campanha existente, a nova área deve responder:

- Qual estratégia escolhemos?
- Por que escolhemos?
- O que oferecemos?
- Para quem?
- Qual era a hipótese?
- Quantos receberam?
- Quantos leram?
- Quantos acessaram?
- Quantos compraram?
- Qual Cesta/Kit compraram?
- Quanto faturou?
- Qual receita por 1.000 entregues?
- Funcionou melhor ou pior que campanhas comparáveis?
- O que o motor recomenda fazer diferente na próxima semana?

---

## 27. Rollout

### Fase 1 — Instrumentação e Estratégia assistida

- nova aba Estratégia;
- ingestão do catálogo canônico;
- score explicável;
- recomendação semanal;
- aprovação interna;
- tracking de campanha/oferta;
- sem envio automático.

### Fase 2 — Ciclo Meta completo

- reaproveitamento de template;
- criação de template quando necessário;
- aprovação interna antes da Meta;
- acompanhamento de status;
- fluxo de rejeição;
- gestão de ciclo de vida;
- fila de limpeza com exclusão somente após aprovação.

### Fase 3 — Aprendizado comercial

- atribuição de pedidos;
- receita;
- métricas por Cesta/Kit;
- recompra;
- afinidade;
- sazonalidade;
- insights com evidência.

### Fase 4 — Experimentos

- A/B;
- exploração de novos Kits;
- comparação de horários/argumentos/formatos.

### Fase 5 — Automação limitada futura

Somente depois de histórico e confiança:

- determinadas estratégias recorrentes podem ser auto-preparadas;
- envio automático permanece uma decisão separada de produto e segurança;
- exclusão de template Meta continua exigindo confirmação humana salvo futura decisão explícita em contrário.

---

## 28. Testes obrigatórios

Seguir TDD e PRs pequenos.

Cobrir pelo menos:

1. só selecionar Cesta/Kit disponível;
2. respeitar mínimo de R$ 75;
3. criar combinação válida quando necessário;
4. nunca enviar à Meta antes da aprovação interna;
5. nunca disparar campanha antes da aprovação de envio;
6. invalidar aprovação após mudança material;
7. reusar template aprovado quando compatível;
8. nunca sugerir exclusão de template protegido;
9. bloquear exclusão se houver campanha ativa/agendada dependente;
10. manter histórico local após exclusão Meta;
11. respeitar frequência semanal;
12. respeitar supressão/consentimento;
13. revalidar estoque/preço antes do envio;
14. registrar tracking e atribuição sem duplicar pedidos;
15. separar receita direta de assistida;
16. não permitir Graph direto do browser;
17. manter runtime de produção seguro durante homologação;
18. regressão das áreas Templates, Campanhas, Públicos, Atendimento e Cestas/Kits.

---

## 29. Critério de conclusão da primeira versão

A v1 está pronta quando o operador consegue:

1. abrir `Marketing → Estratégia`;
2. ver uma recomendação semanal baseada apenas em Cestas/Kits vendáveis;
3. entender por que ela foi sugerida;
4. revisar público, oferta, texto e horário;
5. aprovar internamente;
6. quando necessário, enviar o template à Meta somente após essa aprovação;
7. acompanhar aprovação/rejeição Meta;
8. aprovar separadamente o disparo;
9. executar usando o motor atual de campanhas;
10. acompanhar entrega/leitura/clique/interação/pedido conforme disponibilidade dos eventos;
11. ver receita e Cesta/Kit vendido;
12. ver o aprendizado proposto para a próxima campanha;
13. revisar templates aposentados/candidatos à exclusão;
14. excluir da Meta somente após confirmação humana;
15. preservar integralmente histórico e métricas locais.

---

## 30. Decisões fechadas nesta especificação

- Marketing será centrado em **Cestas e Kits**.
- Pedido mínimo de **R$ 75** é regra dura do motor.
- Combinações prontas podem ser criadas pela estratégia quando necessário.
- Entrega grátis só é comunicada quando a oferta é elegível segundo as regras da empresa.
- Estratégia inicial é semanal.
- Começo usa público amplo elegível para formar histórico.
- Personalização aumenta conforme os dados próprios amadurecem.
- IA sugere; fatos vêm de fontes determinísticas.
- Usuário aprova antes de qualquer novo template ser enviado à Meta.
- Meta aprova o template.
- Usuário aprova novamente antes do envio aos clientes.
- Templates devem ser reutilizados sempre que possível.
- Templates operacionais ficam protegidos.
- Templates antigos de Marketing entram em fila automática de limpeza.
- Exclusão da Meta exige confirmação humana.
- Histórico local nunca é apagado junto com o template Meta.
- Sistema atual de campanhas, worker, snapshots e gates é reaproveitado; não haverá transporte paralelo.
