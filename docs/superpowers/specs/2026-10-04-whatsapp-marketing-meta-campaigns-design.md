# Dona Antônia — Marketing WhatsApp Meta no Vitrine/Admin

Data: 2026-10-04
Status: design aprovado em conversa; aguarda revisão final do arquivo antes do plano de implementação
Repositório: `osvaldosereia/SUCEDOAN12`
Supabase canônico: `ssbesxgaijknwsjbsbcz`
Issue principal: `#630`

## 1. Objetivo

Construir no Vitrine/Admin da Dona Antônia uma central própria para:

1. criar, editar, sincronizar, acompanhar e excluir templates oficiais da WhatsApp Business Platform / Meta Cloud API;
2. organizar públicos comerciais a partir dos dados canônicos da Dona Antônia;
3. criar campanhas de WhatsApp com templates de marketing aprovados;
4. validar consentimento, opt-out e elegibilidade antes de cada envio;
5. enfileirar e enviar campanhas pelo transporte Meta já homologado;
6. acompanhar `sent`, `delivered`, `read`, `failed`, respostas, opt-outs e pedidos atribuídos à campanha;
7. manter 0975 e 1018 conectados ao PapoAI durante esta fase.

O sistema não deve ser um “disparador em massa” irrestrito. Ele deve ser uma plataforma de campanhas consentidas, auditáveis e compatíveis com as regras da Meta.

## 2. Decisões de negócio confirmadas

1. Não retirar o 0975 do PapoAI nesta fase.
2. Não retirar o 1018 do PapoAI nesta fase.
3. `inbound_provider` permanece `papoai` para os dois canais enquanto este projeto é desenvolvido.
4. O outbound humano da Central própria continua usando Meta, como já homologado.
5. `ana_enabled=false` e `campaigns_enabled=false` permanecem nos dois canais durante desenvolvimento e homologação.
6. A primeira versão de campanhas reais, quando homologada, deve priorizar o 0975 como canal comercial.
7. O 1018 permanece canal normal de atendimento e só entra em campanhas depois de homologação específica.
8. Não usar Make nem n8n.
9. Não enviar campanha por loop no browser.
10. Não reutilizar template `UTILITY` como promoção.
11. Campanha de marketing só pode usar template `MARKETING` aprovado pela Meta.
12. Cliente sem consentimento atual de marketing não pode entrar em campanha.
13. Pedido para parar de receber ofertas deve bloquear novos envios imediatamente.
14. Etiquetas são filtros auxiliares; não são a fonte canônica de cliente, consentimento ou pedido.
15. Cliente, pedido, produto, compra, consentimento e resultado de campanha permanecem canônicos no Supabase/Dona Antônia.

## 3. Estado real encontrado em 2026-10-04

### 3.1 Runtime dos canais

Nos dois canais:

```text
inbound_provider = papoai
outbound_provider = meta
send_enabled = true
human_send_enabled = true
ana_enabled = false
campaigns_enabled = false
```

Nenhum cutover de inbound faz parte deste projeto.

### 3.2 Templates

A tabela `whatsapp_templates_v1` já existe e já contém cache sincronizado da Meta.

Estado observado:

- 15 templates sincronizados;
- 13 `UTILITY` aprovados;
- 2 `MARKETING` aprovados no 0975;
- `mktcatalogodonaantoniav1`;
- `ver_ofertas`;
- templates de marketing ainda não estão liberados pelo gate do módulo de Atendimento individual.

A infraestrutura existente inclui:

- `admin-whatsapp-templates-v1`;
- `_shared/whatsapp-meta-templates-v1.mjs`;
- `_shared/whatsapp-meta-transport-v1.mjs`;
- cache `whatsapp_templates_v1`;
- outbox Meta e reconciliação por WAMID/status.

A base existente deve ser ampliada, não substituída.

### 3.3 Consentimento

Estado observado em `customers`:

- 519 clientes;
- 7 com `marketing_opt_in=true`;
- 512 com `marketing_opt_in=false`;
- 0 nulos.

O booleano atual não é suficiente para auditoria histórica. Precisamos distinguir pelo menos:

- consentiu;
- nunca consentiu / não elegível;
- revogou consentimento;
- origem do consentimento;
- momento e texto do consentimento apresentado.

### 3.4 Marketing atual no Admin

A seção atual de Marketing nasceu como:

- Radar de Marketing;
- Segmentação;
- Links / Campanhas;
- Marcas autorizadas;
- inteligência comercial orientada ao PapoAI.

Ela não foi projetada como central própria de templates e campanhas Meta. Por isso será reorganizada em vez de receber apenas novos cards desconexos.

## 4. Regras Meta que a arquitetura deve respeitar

A implementação deve seguir as regras vigentes da WhatsApp Business Platform e ser atualizável sem reescrever todo o produto.

Regras arquiteturais obrigatórias:

1. Mensagem iniciada pela empresa fora da janela aplicável exige template aprovado.
2. Template de marketing deve ser tratado como `MARKETING`.
3. Template só pode ser enviado quando o status local sincronizado for `APPROVED`.
4. `REJECTED`, `DISABLED`, `FLAGGED`, `PAUSED` ou estado equivalente bloqueia novos envios.
5. Motivo de rejeição e qualidade devem ser exibidos no Admin quando fornecidos pela Meta.
6. O destinatário deve ter consentimento válido para marketing antes de entrar na fila.
7. Opt-out posterior prevalece sobre campanha já criada.
8. Antes de cada despacho, elegibilidade e opt-out devem ser revalidados.
9. O sistema deve respeitar limites e respostas da Meta sem tentar contornar rate limiting.
10. WAMID e webhooks de status são a evidência canônica de aceite/entrega.
11. Envio incerto não pode ser refeito cegamente.
12. A Meta é fonte de verdade para estado/qualidade do template remoto; o Supabase mantém cache e histórico local.

## 5. Fontes de verdade

| Domínio | Fonte de verdade |
|---|---|
| Cliente | `customers` / Supabase |
| Telefone normalizado | dados canônicos E.164 da Dona Antônia |
| Pedido e itens | `orders` e estruturas canônicas |
| Produto / categoria / marca / oferta | Supabase |
| Consentimento atual | camada canônica de consentimento da Dona Antônia |
| Histórico de consentimento | novo ledger de consentimentos |
| Etiquetas internas | `attendance_labels_v1` + vínculos |
| Template remoto | Meta Cloud API |
| Cache de template | `whatsapp_templates_v1` |
| Campanha | novas tabelas canônicas de campanha |
| Destinatários congelados | snapshot da campanha |
| Execução | outbox/worker Supabase |
| WAMID / status | Meta + tabelas canônicas WhatsApp |
| Resultado comercial | pedidos/campanha no Supabase |

## 6. Nova organização da página Marketing

A página `Marketing` será reorganizada em cinco áreas principais.

### 6.1 Visão Geral

Mostrar apenas indicadores úteis:

- templates aprovados / pendentes / rejeitados;
- campanhas em rascunho;
- campanhas agendadas;
- campanhas em execução;
- clientes com opt-in válido;
- opt-outs recentes;
- últimas campanhas e resultados;
- alertas de template/qualidade.

Não carregar listas grandes automaticamente. Cada card abre sua área sob demanda.

### 6.2 Templates Meta

Tela operacional de templates oficiais.

Funções:

- escolher canal/WABA;
- sincronizar com Meta;
- listar por status, categoria e idioma;
- criar template;
- duplicar template para nova versão;
- editar quando suportado pela Meta e pelas regras atuais;
- excluir quando permitido;
- visualizar componentes;
- visualizar motivo de rejeição;
- visualizar qualidade;
- visualizar última sincronização;
- acompanhar status remoto.

O browser nunca recebe token Meta.

### 6.3 Públicos

Construtor de público comercial com filtros combináveis.

Filtros iniciais suportados:

- cliente individual;
- etiquetas do Atendimento;
- cidade;
- bairro quando confiável;
- comprou cesta;
- comprou produto;
- comprou categoria;
- comprou marca;
- última compra;
- quantidade de compras;
- ticket / gasto histórico;
- não compra há X dias;
- origem/campanha anterior;
- interesse comercial canônico quando existente;
- opt-in atual.

Filtros obrigatórios e não removíveis:

- telefone E.164 válido;
- `marketing_opt_in=true` ou equivalente canônico;
- sem opt-out ativo;
- cliente não bloqueado;
- um destinatário por telefone normalizado;
- canal de destino válido.

A tela deve separar:

- encontrados;
- elegíveis;
- excluídos;
- motivo de exclusão.

### 6.4 Campanhas

Fluxo de criação:

1. nome da campanha;
2. canal;
3. template `MARKETING` aprovado;
4. público;
5. valores/variáveis do template;
6. deep link/campanha quando aplicável;
7. prévia;
8. envio de teste interno;
9. revisão;
10. aprovação do operador;
11. envio agora ou agendamento.

Campanha nunca é enviada diretamente do browser.

### 6.5 Resultados / Consentimentos

Resultados:

- total congelado;
- elegíveis no momento do snapshot;
- pulados na revalidação;
- enviados;
- aceitos pela Meta;
- sent;
- delivered;
- read;
- failed;
- respostas;
- opt-outs;
- pedidos atribuídos;
- receita atribuída quando confiável.

Consentimentos:

- cliente;
- estado atual;
- data do último consentimento;
- origem;
- data da revogação;
- evidência textual/versão da mensagem de consentimento;
- histórico.

## 7. Gestão de templates Meta

### 7.1 Reutilizar o backend existente

`admin-whatsapp-templates-v1` já faz:

- autenticação Admin;
- sync Meta;
- leitura do cache;
- envio individual seguro;
- bloqueio de campos arbitrários de destino;
- transporte Meta server-side.

Essa função será ampliada ou dividida de forma controlada para suportar gestão de templates sem quebrar o envio individual existente.

### 7.2 Operações desejadas

A camada Meta deve suportar, conforme API vigente:

- criar template;
- listar/sincronizar;
- consultar detalhes;
- editar template elegível;
- excluir template;
- receber/registrar atualizações de status;
- acompanhar qualidade quando disponibilizada.

### 7.3 Builder de template

Campos mínimos:

- conta/canal;
- nome normalizado;
- idioma;
- categoria;
- header opcional;
- body;
- footer opcional;
- variáveis;
- botões;
- exemplos necessários à submissão;
- prévia.

Na V1, priorizar componentes que a operação realmente usará:

- texto;
- header texto;
- URL;
- quick reply;
- catálogo, se já homologado e suportado pelo canal.

Não implementar componentes exóticos apenas porque a API permite.

### 7.4 Estados locais

O cache deve representar estados remotos sem inventar estado “aprovado local”.

Exemplos:

- `PENDING`;
- `APPROVED`;
- `REJECTED`;
- `PAUSED`;
- `DISABLED`;
- `FLAGGED`;
- outros retornados pela Meta.

`sendable` para campanha exige, no mínimo:

```text
category = MARKETING
status = APPROVED
meta_missing = false
campaign use enabled localmente
```

## 8. Ledger de consentimento

Criar estrutura append-only para registrar mudanças de consentimento.

Campos conceituais:

- `id`;
- `customer_id`;
- `phone_e164` no momento do evento;
- `decision`: `opt_in` | `opt_out`;
- `source`: checkout, cadastro, atendimento, campanha, importação validada etc.;
- `source_ref` opcional;
- `consent_text_version`;
- `consent_text_snapshot` quando necessário;
- `occurred_at`;
- `recorded_by` / ator;
- `metadata` mínima.

O estado atual continua fácil de consultar, mas o histórico não é sobrescrito.

## 9. Opt-out

Opt-out deve ser soberano.

Origens aceitas:

- preferência no cadastro/checkout;
- ação manual no Atendimento;
- resposta do cliente a campanha;
- palavras de saída configuradas;
- botão/quick reply de saída quando usado.

V1 deve reconhecer, com normalização segura, pelo menos:

- SAIR;
- PARAR;
- NÃO QUERO OFERTAS;
- equivalentes explicitamente aprovados no produto.

Ao registrar opt-out:

1. atualizar estado atual;
2. inserir evento no ledger;
3. impedir novos snapshots elegíveis;
4. fazer campanhas ainda não despachadas pularem o destinatário;
5. registrar motivo de skip.

## 10. Público e snapshot

O público é uma consulta editável enquanto campanha está em rascunho.

Ao aprovar uma campanha, criar snapshot imutável dos destinatários.

Cada linha do snapshot contém pelo menos:

- campaign_id;
- customer_id;
- phone_e164;
- whatsapp_account_id;
- eligibility_at_snapshot;
- segment evidence resumida;
- parâmetros resolvidos ou origem dos parâmetros;
- status de execução;
- motivo de skip/falha;
- outbox/message/WAMID quando houver.

O snapshot impede que alterações de etiqueta durante a execução mudem silenciosamente a audiência aprovada.

## 11. Revalidação antes do envio

Mesmo depois do snapshot, cada destinatário deve ser revalidado imediatamente antes do envio.

Bloquear quando:

- opt-in foi revogado;
- telefone ficou inválido;
- cliente foi bloqueado;
- template deixou de ser `APPROVED`;
- template ficou desabilitado/flagged/paused;
- campanha foi pausada/cancelada;
- canal ficou desabilitado;
- guardrail global de campanhas está OFF;
- ocorreu condição de segurança definida pelo worker.

Esse bloqueio deve virar `skipped`, não `failed`, quando não houve tentativa Meta.

## 12. Modelo de campanha

Estados sugeridos:

```text
draft
ready_for_review
approved
scheduled
running
paused
completed
cancelled
failed
```

Transições críticas exigem ação explícita do Admin.

`campaigns_enabled=false` impede qualquer transição que resulte em envio real.

## 13. Execução / worker

### 13.1 Sem loop no navegador

O browser apenas:

- cria campanha;
- calcula prévia/público;
- solicita snapshot;
- aprova;
- agenda/aciona.

O backend executa.

### 13.2 Supabase

Como `pg_cron` e `pg_net` já existem no projeto, a primeira arquitetura de agendamento pode permanecer no Supabase, sem Make/n8n.

Preferência:

- fila persistente;
- worker em lotes pequenos;
- claim atômico;
- idempotência;
- retry somente em falhas sabidamente retryable;
- estado incerto sem reenvio automático;
- backoff controlado;
- pausa global por flag.

### 13.3 Transporte

Reutilizar `_shared/whatsapp-meta-transport-v1.mjs` e o padrão de outbox/WAMID já homologado.

Não criar segundo cliente Graph para campanhas.

## 14. Idempotência e duplicidade

Cada destinatário de campanha deve possuir chave idempotente estável derivada de campanha + destinatário + versão do template/variantes relevantes.

Garantias:

- uma campanha não envia duas vezes para o mesmo E.164 por retry do worker;
- clique duplo do operador não cria lote duplicado;
- resposta incerta da Meta não vira resend cego;
- WAMID é persistido e reconciliado quando aceito.

## 15. Segurança

1. Token Meta nunca vai para o browser.
2. Browser não escolhe `phone_number_id` arbitrariamente.
3. Browser não injeta WABA arbitrário.
4. Browser não injeta template remoto por nome sem validação no cache canônico.
5. Operações de criação/edição/exclusão de template exigem Admin autenticado.
6. Aprovação/agendamento/cancelamento de campanha exige Admin autenticado.
7. RPCs críticas não ficam abertas para `anon` ou `authenticated` genérico quando puderem ser chamadas apenas via Edge/service-role.
8. Nenhuma campanha é enviada enquanto `campaigns_enabled=false`.
9. Tabelas de consentimento/campanha devem ter RLS/policies revisadas explicitamente.
10. Logs não armazenam token Meta, Authorization ou segredo bruto.

## 16. Separação Atendimento x Marketing

O envio individual no Atendimento continua independente.

Não transformar a tela de chat em tela de campanha.

Atendimento pode:

- enviar template individual permitido;
- marcar opt-out;
- adicionar/remover etiquetas;
- mostrar histórico de campanha do cliente.

Marketing pode:

- construir públicos;
- gerir templates;
- criar campanhas;
- acompanhar resultados.

## 17. Uso das etiquetas

Etiquetas internas podem ser usadas como filtro de público.

Não devem:

- substituir consentimento;
- inferir atributos sensíveis;
- alterar cliente canônico;
- disparar campanha automaticamente na V1.

Etiquetas atuais pouco utilizadas não bloqueiam o projeto. O módulo deve funcionar também com filtros de compra/cliente sem etiqueta.

## 18. Segmentação comercial

Segmentos permitidos devem ser comerciais e explicáveis.

Exemplos:

- comprou cesta;
- comprou fraldas;
- comprou categoria Bebê;
- comprou determinada marca;
- clientes sem compra há 30 dias;
- compradores recorrentes;
- clientes de determinada campanha anterior.

Evitar inferências pessoais como sexo, maternidade/paternidade, religião, saúde ou qualquer atributo sensível.

## 19. Deep links e atribuição

Reutilizar a estrutura já existente de:

- `origem`;
- `campanha`;
- `categoria`;
- `marca`;
- `ofertas`.

Quando a campanha usa URL, gerar slug/código estável para atribuição.

Pedido proveniente do link deve preservar contexto para permitir:

- campanha -> pedido;
- campanha -> receita;
- campanha -> categoria/produto comprado.

Atribuição deve ser explícita e auditável, não inferida apenas por proximidade temporal.

## 20. Resultados

Métricas mínimas por campanha:

- snapshot total;
- eligible_at_snapshot;
- skipped_before_send;
- attempted;
- Meta accepted;
- sent;
- delivered;
- read;
- failed;
- replied;
- opted_out;
- attributed_orders;
- attributed_revenue.

Taxas devem usar denominadores claros.

## 21. Guardrails automáticos

Pausar novos despachos quando ocorrer condição como:

- template deixa `APPROVED`;
- campanha cancelada/pausada;
- `campaigns_enabled=false`;
- taxa anormal de falhas em lote;
- erros Meta que indiquem configuração/qualidade e não retry;
- inconsistência de WABA/phone_number_id;
- credencial Meta indisponível;
- worker detecta estado incerto além do limite definido.

A V1 não precisa automatizar decisões comerciais de IA.

## 22. Template de marketing padrão

Novos templates de marketing devem ter saída clara quando apropriado.

Padrão preferido:

- mensagem objetiva;
- CTA relevante;
- indicação de como deixar de receber ofertas;
- quick reply de opt-out quando compatível com o layout e estratégia;
- sem linguagem enganosa ou falsa urgência.

Os templates atuais serão revisados antes de uso em campanha real.

## 23. Migração da página Marketing existente

Preservar o que ainda agrega valor:

- Radar de oportunidades;
- deep links;
- filtros por categoria/marca;
- sinais determinísticos.

Reorganizar em:

1. Visão Geral;
2. Templates Meta;
3. Públicos;
4. Campanhas;
5. Resultados / Consentimentos.

O Radar pode virar um bloco na Visão Geral ou uma fonte para “Criar campanha a partir desta oportunidade”.

Remover ou esconder elementos antigos cuja função era apenas preparar ações manuais no PapoAI quando houver equivalente próprio melhor.

## 24. Fases de entrega

### Fase A — contratos e segurança

- contratos TDD;
- gates de campanha;
- regras de template;
- contrato de consentimento;
- sem envio real.

### Fase B — Central de Templates Meta

- criar/listar/sincronizar;
- editar/excluir quando permitido;
- status/qualidade/rejeição;
- prévia no Admin;
- nenhuma campanha.

### Fase C — Consentimento e Públicos

- ledger;
- opt-out;
- audiência;
- elegibilidade e motivos de exclusão.

### Fase D — Campanhas em rascunho

- campanha;
- público;
- snapshot;
- revisão;
- teste interno;
- `campaigns_enabled=false` continua bloqueando envio real.

### Fase E — Worker e agendamento

- fila;
- claim;
- idempotência;
- lotes;
- status;
- pause/cancel;
- ainda sem graduação para clientes reais.

### Fase F — Homologação

- somente números internos/autorizados;
- validar WAMID;
- delivered/read;
- dedupe;
- opt-out;
- pause;
- template disabled/flagged simulado quando possível;
- nenhum cliente real sem consentimento.

### Fase G — Graduação controlada do 0975

Só após aprovação humana explícita e evidência dos gates.

- habilitar campanha apenas no 0975;
- público mínimo com consentimento comprovado;
- monitorar;
- manter 1018 fora de campanhas até homologação própria.

## 25. Critérios de homologação antes de qualquer campanha real

Todos devem passar:

- CI verde;
- template `MARKETING` aprovado;
- sync Meta funcionando;
- Admin auth obrigatório;
- zero segredo no frontend;
- opt-in obrigatório;
- opt-out bloqueia imediatamente;
- snapshot deduplicado por E.164;
- revalidação pré-envio;
- WAMID persistido;
- delivered/read reconciliados;
- retry seguro;
- estado incerto não reenvia automaticamente;
- pause/cancel funcional;
- `campaigns_enabled=false` comprovadamente bloqueia despacho;
- canário interno aprovado;
- PapoAI 0975 e 1018 continuam operacionais.

## 26. Testes obrigatórios

### Unit/contrato

- builder Meta válido;
- categoria incorreta bloqueada;
- template não aprovado bloqueado;
- template de outra conta bloqueado;
- payload de botão/variável validado;
- paginação sync segura;
- paging URL restrita a `graph.facebook.com` e WABA esperado;
- consentimento obrigatório;
- opt-out obrigatório;
- dedupe E.164;
- idempotência.

### Banco

- ACL/RLS;
- transitions de campanha;
- snapshot imutável;
- claim concorrente;
- skip após opt-out;
- rollback de smoke;
- nenhuma duplicidade.

### Edge

- auth Admin;
- create/update/delete template;
- sync;
- Meta error mapping;
- envio worker;
- uncertain handling;
- sem token em resposta/log.

### UI

- Marketing não carrega tudo de uma vez;
- template preview;
- filtros de público;
- contagem encontrados/elegíveis/excluídos;
- revisão antes de aprovar;
- campanhas OFF visivelmente bloqueiam envio;
- mobile utilizável.

## 27. Observabilidade

Cada campanha deve ser rastreável por:

- campaign_id;
- recipient_id;
- outbox_id;
- canonical_message_id;
- WAMID;
- template_id;
- account_id;
- timestamps de snapshot/claim/attempt/accepted/status.

Dashboards simples são suficientes na V1; não criar stack analítica paralela.

## 28. Rollback

Durante desenvolvimento:

- `campaigns_enabled=false` é o kill-switch principal;
- nenhuma mudança de `inbound_provider`;
- PapoAI permanece conectado;
- templates novos podem ser deixados sem uso caso a UI precise rollback;
- migrations devem ser aditivas quando possível;
- deploys de Edge devem manter versão anterior identificada para rollback.

Quando campanhas forem graduadas:

1. desligar `campaigns_enabled`;
2. parar novos claims;
3. não reprocessar `uncertain` automaticamente;
4. preservar histórico;
5. investigar antes de religar.

## 29. Fora de escopo nesta primeira implementação

- remover PapoAI;
- mudar inbound de 0975/1018;
- ligar ANA automática;
- campanha decidida automaticamente por IA;
- personalização sensível;
- CRM genérico;
- kanban comercial novo;
- automação irrestrita baseada em qualquer etiqueta;
- importação de lista comprada/externa sem consentimento comprovado;
- bypass de limites da Meta;
- envio de marketing com template `UTILITY`.

## 30. Primeira sequência de implementação recomendada

1. consolidar esta especificação;
2. escrever plano de implementação;
3. PR 1: contratos e schema mínimo de template-management/consentimento, sem envio;
4. PR 2: criação/edição/exclusão/sync de templates Meta;
5. PR 3: nova UI `Templates Meta`;
6. PR 4: ledger de consentimento + opt-out central;
7. PR 5: público/eligibilidade;
8. PR 6: campanha + snapshot, ainda sem despacho;
9. PR 7: worker/outbox Meta;
10. PR 8: resultados/atribuição;
11. homologação interna;
12. decisão explícita separada para ligar campanhas no 0975.

Nenhum desses PRs autoriza sozinho campanha real.
