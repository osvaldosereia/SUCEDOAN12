# Marketing Dona Antônia — Motor de Estratégia para Cestas e Kits

**Data:** 2026-10-05  
**Status:** aguardando revisão e aprovação do usuário  
**Escopo:** Vitrine/Admin → Marketing → Estratégia  
**Base existente:** catálogo canônico de Cestas/Kits, clientes, pedidos, campanhas, públicos, templates Meta, snapshots, worker, relatórios e telemetria comercial.

## 1. Objetivo

Criar a nova área **Marketing → Estratégia**, responsável por transformar os dados comerciais da Dona Antônia em recomendações semanais de Marketing pelo WhatsApp.

O Marketing deve ser centrado em **Cestas e Kits prontos**, e não em itens avulsos. A própria Cesta ou Kit é a combinação comercial oferecida ao cliente: uma solução fácil de entender, com valor final conhecido, alinhada ao pedido mínimo e à política de entrega grátis quando elegível.

O sistema deve:

1. consultar as Cestas/Kits realmente disponíveis no catálogo canônico;
2. identificar qual Cesta/Kit ou conjunto de alternativas merece divulgação naquele momento;
3. considerar clientes, histórico de compra, sazonalidade, estoque, preço, disponibilidade e resultados anteriores;
4. criar uma estratégia semanal explicável;
5. produzir campanha, público, texto e criativo;
6. reutilizar templates Meta aprovados sempre que possível;
7. quando for necessário template novo, aguardar aprovação humana antes de enviá-lo à Meta;
8. acompanhar aprovação ou rejeição pela Meta;
9. aguardar uma segunda aprovação humana antes do disparo aos clientes;
10. medir entrega, leitura, clique, interação, acesso ao site, carrinho, pedido e receita quando tecnicamente disponíveis;
11. aprender com os resultados para melhorar as estratégias seguintes;
12. gerenciar o ciclo de vida dos templates sem apagá-los da Meta automaticamente.

A v1 será **assistida por IA, com humano no controle das ações externas**.

---

## 2. Princípio comercial

> A Dona Antônia deve vender uma solução pronta para a necessidade do cliente, e não apenas uma lista de preços.

O motor pode selecionar, por exemplo:

- Cesta Econômica;
- Cesta Família;
- Cesta Só Alimentos;
- Kit Limpeza;
- Kit Higiene;
- Kit Limpeza + Higiene;
- novos Kits/Cestas temáticos cadastrados futuramente.

Itens avulsos podem fazer parte da composição e do checkout, mas **não são a unidade principal de decisão do Marketing v1**.

A v1 **não cria um “combo de duas Cestas/Kits” para superar o pedido mínimo**. Cada Cesta/Kit divulgada deve ser comercialmente válida por si só.

---

## 3. Regras comerciais obrigatórias

### 3.1 Pedido mínimo de R$ 75

O pedido mínimo atual é **R$ 75**.

Regra dura do motor:

- Cesta/Kit com preço final >= R$ 75 pode ser selecionada para Marketing;
- Cesta/Kit abaixo de R$ 75 fica **inelegível para Marketing isolado** até que preço/composição seja ajustado na fonte canônica;
- o Marketing não altera preço, composição ou regra do checkout para tornar uma oferta elegível;
- carrossel pode mostrar várias alternativas, mas **cada card deve ser uma Cesta/Kit válida individualmente**.

### 3.2 Entrega grátis

O texto pode destacar **entrega grátis** somente quando a Cesta/Kit e o destino estiverem dentro das regras comerciais vigentes.

O motor nunca pode prometer entrega grátis fora da área atendida ou em condição que não seja realmente elegível.

### 3.3 Estoque e disponibilidade

Somente Cestas/Kits realmente vendáveis entram na seleção.

A fonte deve ser o catálogo canônico já existente, respeitando pelo menos:

- modelo ativo;
- categoria ativa;
- lote apto;
- disponibilidade pública positiva;
- motivo de disponibilidade compatível com venda;
- preço público atual;
- imagem e nome públicos atuais.

A disponibilidade, preço e elegibilidade devem ser revalidados imediatamente antes do envio. Mudança material devolve a estratégia para revisão.

### 3.4 Operação e calendário

A estratégia deve respeitar:

- área de atendimento vigente;
- domingos e feriados nacionais fechados;
- regra operacional de pedidos após 12h quando aplicável;
- fuso `America/Cuiaba`;
- capacidade operacional para cumprir a oferta comunicada.

Quinta-feira pela manhã pode ser uma hipótese inicial de horário, mas deve ser configurável e substituída pelos dados reais quando houver histórico suficiente.

### 3.5 Frequência

Política inicial:

- no máximo **1 campanha programada de Marketing por cliente por semana**;
- mensagens utilitárias/operacionais não contam como Marketing;
- revogação/`NAO_CONTATAR` exclui o cliente;
- todos os gates atuais de consentimento, telefone válido, deduplicação e segurança continuam valendo.

---

## 4. Navegação

A navegação principal de Marketing passa a ser:

- **Visão geral**
- **Estratégia**
- **Templates**
- **Campanhas**
- **Públicos**

Responsabilidades:

- **Estratégia:** decide e explica o que vale a pena fazer;
- **Templates:** administra os modelos Meta;
- **Campanhas:** executa o que foi aprovado;
- **Públicos:** suporta seleção e segmentação;
- **Relatórios:** alimentam aprendizado e comparação.

A nova área **não cria um segundo motor de campanhas**. Ela usa o transporte, snapshots, worker, runtime e relatórios existentes.

---

## 5. Fluxo de aprovação obrigatório

Existem três portões distintos.

### Portão A — aprovação interna

A automação prepara:

- objetivo;
- Cesta/Kit ou carrossel de alternativas;
- público;
- argumento comercial;
- texto;
- criativo;
- horário sugerido;
- template reutilizável ou necessidade de template novo;
- justificativa baseada em dados.

Estado:

`Rascunho da IA → Aguardando sua aprovação`

A Meta **não é chamada** antes desta aprovação.

Ações:

- `Aprovar estratégia`
- `Editar`
- `Gerar alternativa`
- `Descartar`

Quando for necessário template novo, a ação explícita será:

`Aprovar e enviar para Meta`

### Portão B — aprovação da Meta

Somente após o Portão A o backend autorizado envia o template à Meta.

Estados de UI:

- Enviando para Meta;
- Em análise;
- Aprovado;
- Rejeitado.

Se houver rejeição:

- registrar o motivo retornado quando disponível;
- a IA pode sugerir correção;
- qualquer correção volta ao Portão A;
- nenhuma nova submissão ocorre sem nova aprovação humana.

### Portão C — aprovação do disparo

Template aprovado pela Meta **não significa campanha enviada**.

A campanha passa para:

`Pronta para envio`

Ações:

- `Aprovar e enviar agora`
- `Aprovar e agendar`
- `Editar estratégia`
- `Cancelar`

Qualquer alteração material de oferta, texto ou template invalida a aprovação correspondente.

---

## 6. Tela `Marketing → Estratégia`

### 6.1 Recomendação da semana

Card principal, por exemplo:

**Recomendação da semana — Cesta Família**

- Público: todos os clientes elegíveis nesta fase inicial;
- Melhor janela sugerida: quinta-feira, 09:00;
- Objetivo: compra do mês;
- Preço: valor canônico atual;
- Entrega: grátis quando elegível;
- Confiança: Boa oportunidade.

**Por que esta estratégia?**

- início do mês;
- estoque saudável;
- Cesta acima do pedido mínimo;
- necessidade de formar histórico próprio;
- ausência de campanha equivalente recente para os clientes elegíveis.

Ações:

- `Revisar estratégia`
- `Aprovar`
- `Gerar alternativa`

### 6.2 Oportunidades detectadas

Cards de linguagem simples, como:

- `Nova Cesta sem histórico — vale testar`;
- `Kit Limpeza com estoque saudável`;
- `Clientes entrando na janela provável de recompra`;
- `Cesta com bom desempenho no início do mês`;
- `Novo Kit que ainda precisa de dados`.

### 6.3 Calendário comercial

Visão mensal com:

- estratégia sugerida por semana;
- sazonalidades;
- campanhas já enviadas;
- campanhas aprovadas/agendadas;
- datas comerciais;
- lacunas sem campanha.

O calendário não dispara nada sozinho na v1.

### 6.4 Aprendizados

Exemplos de apresentação:

- `Cestas completas tiveram melhor resultado do dia 1 ao dia 8.`
- `Kit Limpeza converteu melhor entre clientes que já compraram limpeza.`
- `Carrossel com quatro Cestas/Kits gerou mais acessos que oferta única.`

Toda conclusão deve mostrar uma base mínima, por exemplo:

`3 campanhas · 1.284 entregas · 47 pedidos`

Sem evidência suficiente, usar `Sinal inicial` ou `Tendência`, nunca apresentar hipótese como fato.

---

## 7. Motor de Oportunidades

O motor deve separar fatos de interpretação.

### 7.1 Camada determinística

Responsável por fatos reproduzíveis:

- Cestas/Kits disponíveis;
- preço;
- estoque/disponibilidade;
- categoria e lote;
- data de criação/ativação;
- histórico de venda;
- última compra do cliente;
- frequência;
- ticket médio;
- Cestas/Kits/categorias compradas;
- campanhas recebidas;
- leitura, clique e interação;
- pedidos e receita atribuídos;
- sazonalidade configurada;
- frequência semanal;
- consentimento/supressão;
- calendário operacional.

### 7.2 Camada de IA

Responsável por:

- explicar a oportunidade;
- sugerir estratégia;
- redigir texto;
- propor título/argumento;
- escolher entre formatos permitidos;
- sugerir experimento;
- resumir aprendizados;
- sugerir a próxima ação.

A IA **não pode**:

- inventar preço, estoque, produto ou resultado;
- ignorar pedido mínimo ou disponibilidade;
- tornar cliente inelegível elegível;
- enviar campanha;
- submeter template à Meta antes da aprovação humana;
- excluir template da Meta;
- alterar dados canônicos de estoque, pedido ou cliente.

---

## 8. Score inicial

A v1 usa pontuação explicável, não um modelo opaco.

Cada Cesta/Kit ou seleção de campanha recebe componentes como:

- disponibilidade e estoque: 0–25;
- adequação ao momento/sazonalidade: 0–20;
- adequação ao público: 0–20;
- desempenho histórico: 0–20;
- exploração/novidade: 0–10;
- qualidade operacional da oferta: 0–5.

Total: 0–100.

Faixas de UI:

- 80–100: `Excelente oportunidade`;
- 60–79: `Boa oportunidade`;
- 40–59: `Vale testar`;
- abaixo de 40: não priorizar por padrão.

Pesos devem ser configuráveis e versionados.

---

## 9. Formação de histórico — cold start

Nas primeiras semanas ainda não haverá dados suficientes para personalização forte. Portanto, a estratégia inicial será deliberadamente ampla.

### 9.1 Primeiros ciclos

- enviar a campanha para **todos os clientes elegíveis**, depois de aplicar consentimento, supressão, deduplicação e limite semanal;
- manter no máximo uma campanha programada por cliente por semana;
- variar Cestas/Kits entre as semanas;
- usar carrossel quando houver várias opções válidas e fizer sentido aprender preferência;
- cada card do carrossel deve respeitar individualmente o mínimo de R$ 75;
- cada card/oferta deve ter rastreamento próprio;
- registrar qual Cesta/Kit foi visualizada, clicada e comprada quando os sinais estiverem disponíveis.

Objetivo: formar rapidamente uma base própria de comportamento sem fingir que o sistema já conhece preferências que ainda não conhece.

### 9.2 Exploração controlada

O motor não deve recomendar apenas a campeã histórica.

Cestas/Kits novos ou alterados recebem oportunidade controlada para gerar evidência. Isso evita que os primeiros vencedores impeçam a descoberta de ofertas melhores.

---

## 10. Personalização futura

Quando houver histórico suficiente, o motor passa a ponderar individualmente ou por segmentos.

Sinais possíveis:

- frequência típica de compra;
- dias desde a última compra;
- ticket médio;
- Cestas/Kits já comprados;
- categorias presentes nas compras;
- faixa de preço aceita;
- campanhas lidas/clicadas;
- campanhas que geraram pedido;
- ofertas repetidamente ignoradas.

Exemplos:

- cliente mensal entrando na janela de recompra → Cesta do mês;
- histórico de limpeza → Kit Limpeza;
- ticket alto → Cesta Família/Premium;
- cliente inativo → Cesta/Kit de maior apelo comprovado;
- comprador recorrente da mesma Cesta → recompra ou upgrade controlado.

Esses sinais são internos. O cliente não recebe linguagem invasiva como `você está há 43 dias sem comprar`.

---

## 11. Sazonalidade

Criar calendário interno versionado com regras como:

- início, meio e fim do mês;
- volta às aulas;
- Páscoa;
- Dia das Mães;
- festas juninas;
- Dia das Crianças;
- Black Friday;
- Natal;
- Ano Novo;
- sazonalidades locais configuradas pela Dona Antônia.

Cada regra pode influenciar:

- Cestas/Kits prioritários;
- objetivo;
- janela de envio;
- peso do score;
- argumento sugerido.

A v1 não depende de clima ou dados externos da web para funcionar.

---

## 12. Formatos de oferta da v1

Existem apenas dois formatos comerciais principais:

### 12.1 Oferta única

Uma Cesta/Kit elegível, com preço >= R$ 75 e disponibilidade válida.

### 12.2 Carrossel de alternativas

Duas ou mais Cestas/Kits independentes, cada uma comercialmente válida por si só e com rastreamento próprio.

O carrossel é especialmente útil no cold start para descobrir preferências.

**Fora de escopo da v1:** criar um produto sintético juntando duas ou mais Cestas/Kits apenas para alcançar o pedido mínimo. Se isso for desejado futuramente, terá desenho comercial e técnico próprio.

---

## 13. Rastreamento e atribuição

O sistema deve medir mais do que `enviado`.

Eventos desejados por campanha/destinatário/oferta, quando tecnicamente disponíveis:

1. selecionado para público;
2. enviado;
3. entregue;
4. lido;
5. card/link clicado;
6. vitrine aberta;
7. interação/resposta no WhatsApp;
8. Cesta/Kit adicionada ao carrinho;
9. checkout iniciado;
10. pedido criado;
11. pedido confirmado;
12. pedido cancelado;
13. receita atribuída.

### 13.1 Links rastreáveis

Todo CTA deve usar deep link rastreável da Dona Antônia, preferencialmente com token opaco, relacionando:

- estratégia;
- campanha;
- oferta/card;
- cliente quando permitido;
- sessão;
- pedido.

Evitar expor UUIDs internos na URL pública.

### 13.2 Atribuição

Separar:

- **direta:** o pedido carrega origem/token explícito da campanha;
- **assistida:** o cliente recebeu/interagiu e realizou pedido dentro de janela configurável, sem campanha posterior mais explicativa.

Janela inicial sugerida: 7 dias.

Relatórios nunca devem somar atribuição direta e assistida como se fossem a mesma certeza.

A identificação da Cesta/Kit comprada deve preferir os metadados canônicos de pedido já existentes (`basket_id`, `basket_lot_id` ou equivalentes).

---

## 14. Métricas de aprendizado

Por estratégia, campanha, público e Cesta/Kit:

- selecionados/elegíveis;
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

Métrica econômica principal inicial:

> **Pedidos e receita por 1.000 mensagens entregues.**

---

## 15. Ciclo de vida de Templates Meta

### 15.1 Reuse first

Antes de criar template novo, o sistema procura:

1. template aprovado reutilizável;
2. família aprovada compatível com a estratégia;
3. somente então propõe um template novo.

### 15.2 Estados locais

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

### 15.3 Templates protegidos

Templates operacionais/utilitários críticos terão `protected = true` e nunca entrarão na limpeza automática sugerida.

### 15.4 Candidato à exclusão

Regra inicial para template de Marketing:

- não protegido;
- nenhuma campanha ativa, agendada ou futura depende dele;
- nenhuma estratégia aprovada depende dele;
- último uso há pelo menos 60 dias;
- sem pendência operacional conhecida.

O sistema apenas recomenda e explica.

### 15.5 Exclusão

A automação **não exclui template da Meta sozinha**.

Fluxo:

`Candidato à exclusão → Revisar limpeza → Usuário confirma → Backend autorizado exclui na Meta`

O histórico local permanece, incluindo conteúdo, ID Meta antigo, campanhas, resultados, motivo de aposentadoria e data da exclusão.

Apagar da Meta **não apaga a inteligência histórica**.

---

## 16. Dados e estruturas

### 16.1 Reutilizar obrigatoriamente

**Cestas/Kits**
- catálogo comercial canônico;
- preço, imagem, categoria, lote, disponibilidade e estoque público.

**Campanhas**
- `marketing_campaigns_v1`;
- snapshots e destinatários;
- eventos/dispatches;
- worker/agendamento;
- runtime de execução;
- relatórios existentes.

**Templates**
- `whatsapp_templates_v1`;
- sincronização Meta existente;
- Edge Functions Admin atuais;
- fluxo de carrossel já existente.

**Clientes**
- cadastro canônico e telefone;
- histórico de pedidos;
- interesses/etiquetas quando úteis;
- consentimento/supressão.

**Pedidos**
- pedidos e itens canônicos;
- metadados de Cesta/Kit/Lote para atribuição.

### 16.2 Novas estruturas previstas

Os nomes finais podem ser refinados no plano técnico, sem mudar o contrato funcional.

**`marketing_strategy_runs_v1`**  
Uma linha por estratégia gerada, contendo período, estado, objetivo, público, horário sugerido, score, justificativa, versão das regras/pesos, metadados da IA, aprovações e campanha materializada.

**`marketing_strategy_offers_v1`**  
Cestas/Kits pertencentes à estratégia, com ID canônico, lote/snapshot quando aplicável, posição no carrossel, preço/estoque snapshot, score e justificativas.

**`marketing_strategy_events_v1`**  
Ledger append-only de geração, aprovação, submissão Meta, aprovação/rejeição Meta, criação da campanha, aprovação de envio, agendamento, conclusão e aposentadoria.

**`marketing_seasonality_rules_v1`**  
Calendário e pesos de sazonalidade configuráveis.

**`marketing_template_lifecycle_v1`**  
Camada de ciclo de vida/proteção sobre o cache Meta existente.

**`marketing_attribution_events_v1`**  
Somente para eventos ainda sem fonte canônica adequada, como abertura de vitrine, add-to-cart, checkout e atribuição direta. Não duplicar eventos de entrega/leitura já existentes.

---

## 17. Experimentos e aprendizado

O sistema deve permitir testes planejados, por exemplo:

- oferta única vs carrossel;
- Cesta Econômica vs Cesta Família;
- três cards vs quatro cards;
- argumento `economia` vs `praticidade`;
- horário A vs horário B;
- público amplo vs segmento, quando já houver dados suficientes.

Cada experimento guarda:

- hipótese;
- grupos comparáveis;
- métrica principal definida antes do envio;
- período de comparação;
- resultado, inclusive quando inconclusivo.

A IA não pode escolher a métrica depois de ver o resultado.

---

## 18. Processo semanal do motor

1. carregar Cestas/Kits vendáveis;
2. excluir qualquer Cesta/Kit abaixo do pedido mínimo ou comercialmente inelegível;
3. carregar todos os clientes elegíveis para a fase atual;
4. aplicar consentimento, supressões, deduplicação e limite semanal;
5. carregar sazonalidade;
6. carregar desempenho histórico;
7. calcular score das ofertas;
8. aplicar exploração controlada a novas Cestas/Kits;
9. escolher oferta única ou carrossel;
10. definir público;
11. definir objetivo e hipótese;
12. montar texto/criativo;
13. procurar template reutilizável;
14. salvar estratégia e snapshots;
15. apresentar justificativa;
16. aguardar aprovação humana.

Nada é enviado durante essa análise.

---

## 19. Revalidação antes do disparo

Imediatamente antes do envio, revalidar:

- template aprovado;
- canal e runtime;
- consentimento/supressão;
- telefone válido;
- deduplicação;
- limite semanal;
- Cesta/Kit/lote/estoque;
- preço;
- mínimo de R$ 75;
- entrega grátis/área;
- agenda operacional e feriado quando aplicável.

Se preço, disponibilidade, composição ou conteúdo comercial tiver mudado materialmente, bloquear o envio e devolver à revisão.

A implementação **não pode ativar automaticamente** `campaigns_enabled` nem mudar runtime de `off` para `live` como efeito colateral da criação da nova área.

---

## 20. Segurança

- navegador Admin nunca chama Graph API diretamente;
- `service_role` fica somente no backend;
- chamadas Meta passam pelas Edge Functions autorizadas;
- estratégia não contorna gates atuais;
- aprovações registram operador e data;
- ações destrutivas são auditadas;
- snapshots relevantes preservam o contexto da decisão;
- nenhuma campanha é enviada pela IA diretamente;
- nenhum template é submetido à Meta antes da aprovação humana;
- nenhum template é excluído da Meta sem confirmação humana.

---

## 21. Rollout

### Fase 1 — Estratégia assistida e instrumentação

- aba Estratégia;
- leitura do catálogo canônico;
- filtro obrigatório de R$ 75;
- score explicável;
- recomendação semanal;
- primeiros envios para todos os clientes elegíveis;
- tracking por oferta;
- aprovação humana obrigatória.

### Fase 2 — Ciclo Meta

- reuso de templates;
- criação de template quando necessário;
- aprovação interna antes da Meta;
- acompanhamento de status;
- tratamento de rejeição;
- gestão de ciclo de vida;
- limpeza somente após confirmação humana.

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
- exploração de novos Kits/Cestas;
- comparação de horários, argumentos e formatos.

### Fase 5 — Automação limitada futura

Somente depois de histórico e confiança suficientes. Qualquer mudança para envio automático será uma decisão de produto separada e explícita.

---

## 22. Testes obrigatórios

Seguir TDD e PRs pequenos.

Cobrir pelo menos:

1. selecionar somente Cesta/Kit disponível;
2. excluir da recomendação qualquer Cesta/Kit abaixo de R$ 75;
3. garantir que cada card de carrossel seja comercialmente válido individualmente;
4. nunca enviar template à Meta antes da aprovação interna;
5. nunca disparar campanha antes da aprovação de envio;
6. invalidar aprovação após mudança material;
7. reutilizar template aprovado quando compatível;
8. nunca sugerir exclusão de template protegido;
9. bloquear exclusão se campanha ativa/agendada depender do template;
10. preservar histórico local após exclusão Meta;
11. respeitar limite semanal;
12. respeitar consentimento/supressão;
13. revalidar estoque/preço/mínimo antes do envio;
14. registrar tracking e atribuição sem duplicar pedido;
15. separar receita direta de assistida;
16. impedir Graph direto do browser;
17. não alterar runtime de produção automaticamente;
18. regressão das áreas Templates, Campanhas, Públicos, Atendimento e Cestas/Kits.

---

## 23. Critério de conclusão da v1

A primeira versão estará pronta quando o operador conseguir:

1. abrir `Marketing → Estratégia`;
2. ver recomendação baseada somente em Cestas/Kits vendáveis e >= R$ 75;
3. entender por que foi sugerida;
4. revisar público, oferta, texto, criativo e horário;
5. aprovar internamente;
6. enviar um template novo à Meta somente após essa aprovação;
7. acompanhar aprovação/rejeição Meta;
8. aprovar separadamente o disparo;
9. executar pelo motor de campanhas atual;
10. acompanhar entrega/leitura/clique/interação/pedido conforme disponibilidade dos eventos;
11. ver receita e Cesta/Kit comprada;
12. ver o aprendizado sugerido para a campanha seguinte;
13. revisar templates aposentados/candidatos à exclusão;
14. excluir da Meta somente após confirmação humana;
15. preservar histórico e métricas locais.

---

## 24. Decisões fechadas

- Marketing é centrado em **Cestas e Kits**.
- Pedido mínimo de **R$ 75** é regra dura.
- A própria Cesta/Kit é a combinação pronta; a v1 não cria “combo de combos” para atingir o mínimo.
- Carrosséis podem mostrar alternativas, desde que cada Cesta/Kit seja válida individualmente.
- Entrega grátis só é comunicada quando realmente elegível.
- Estratégia inicial é semanal.
- Nas primeiras campanhas, o público padrão será **todos os clientes elegíveis**, após os gates de consentimento e frequência.
- A personalização aumenta conforme os dados próprios amadurecem.
- IA interpreta e sugere; fatos comerciais vêm de fontes determinísticas.
- Usuário aprova antes de template novo ir à Meta.
- Meta aprova/rejeita o template.
- Usuário aprova novamente antes do disparo.
- Templates aprovados devem ser reutilizados quando compatíveis.
- Templates operacionais são protegidos.
- Templates antigos de Marketing podem entrar automaticamente em fila de limpeza, mas **a exclusão da Meta exige confirmação humana**.
- Histórico local nunca é apagado junto com o template Meta.
- Campanhas, snapshots, worker, runtime e gates atuais são reaproveitados; não haverá transporte paralelo.
