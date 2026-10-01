# Dona Antônia — WhatsApp Meta Native V1 — Design Técnico

Data: 2026-09-30  
Status: especificação arquitetural para revisão  
Escopo: Vitrine/Admin + Supabase canônico + integração WhatsApp  
Repositório: `osvaldosereia/SUCEDOAN12`  
Supabase canônico: `ssbesxgaijknwsjbsbcz`

---

## 1. Objetivo

Construir dentro do Vitrine/Admin uma base própria, simples na interface e profissional por baixo, para operar WhatsApp com dois números da Dona Antônia (`0975` e `1018`) e substituir o PapoAI somente depois de homologação comprovada.

A V1 deve priorizar:

- atendimento básico e rápido;
- direcionamento do cliente ao catálogo personalizado;
- histórico confiável de conversas e mensagens;
- cadastro e vínculo com clientes e pedidos existentes;
- templates oficiais Meta;
- automações simples;
- pós-venda e recompra;
- campanhas segmentadas;
- rastreamento de envio, entrega, leitura e falha;
- handoff humano;
- áudio com transcrição;
- coexistência segura com PapoAI durante a migração.

A V1 não deve tentar ser um CRM omnichannel, um ERP, um clone completo do PapoAI ou uma plataforma de IA sofisticada.

---

## 2. Princípios obrigatórios

1. **PapoAI continua em produção durante o desenvolvimento.**
2. **Nenhum número será desconectado antecipadamente.**
3. **Nada novo usa o Supabase legado.** Todo o runtime usa `ssbesxgaijknwsjbsbcz`.
4. **Clientes, pedidos e identidade existentes serão reaproveitados.**
5. **O núcleo WhatsApp não será acoplado ao fornecedor.** PapoAI e Meta entram como adaptadores.
6. **Texto livre não cria pedido automaticamente.** Quando houver compra, a origem converge ao motor canônico de pedido já existente.
7. **Idempotência é obrigatória** em webhook, mensagem, automação, campanha e envio.
8. **Nenhum token Meta fica no navegador.**
9. **A interface V1 é deliberadamente simples.** A complexidade fica na camada de dados e serviços.
10. **Não criar cron, Edge Function ou tabela paralela sem função clara.**
11. **Não apagar legado antes do gate de migração.**
12. **Não reconstruir módulos já confiáveis** como `customers`, `orders`, identidade de catálogo e recompra.

---

## 3. Baseline observado em 2026-09-30

### 3.1 Supabase

Projeto canônico ativo:

- `ssbesxgaijknwsjbsbcz`

Projeto antigo Chat Commerce OS:

- `qxstkwshuvplmmftrctj`
- estado inativo;
- não deve voltar ao runtime.

### 3.2 Dados já existentes e aproveitáveis

Observado no Supabase canônico:

- `whatsapp_accounts`: 2 registros;
- `conversations`: 864 registros;
- `papoai_webhook_inbox_v2`: 1183 eventos;
- `papoai_customer_flow_events_v1`: 10 eventos;
- `ops2_papoai_outbound_intents_v1`: 19 registros;
- `storefront_identity_tokens`: estrutura existente para `catalogo_####`;
- `customers` e `customer_phones`: identidade principal do cliente;
- `marketing_repurchase_state_v1`: recompra canônica de 10 dias;
- `marketing_optout_events_v1`: opt-out existente.

### 3.3 Canais

`0975`:

- conta cadastrada em `whatsapp_accounts`;
- binding PapoAI ativo;
- ainda sem `phone_number_id`/WABA Meta completos no cadastro canônico.

`1018`:

- conta cadastrada em `whatsapp_accounts`;
- binding PapoAI ativo;
- possui identificação Meta histórica armazenada;
- envio Meta direto permanece desabilitado e não homologado.

### 3.4 Legado Meta direto

Existem funções antigas chamadas:

- `whatsapp-meta-direct-v1`;
- `admin-whatsapp-direct-v1`.

Elas estão deliberadamente aposentadas e retornam `410`. Não serão reativadas nem usadas como fundação da nova implementação.

### 3.5 PapoAI atual

A captura PapoAI está funcional e recebe eventos. A arquitetura atual já possui:

- inbox de webhook;
- vínculo de conversa;
- Flow de cadastro;
- identidade por telefone;
- link personalizado `catalogo_####`;
- vínculo seguro do pedido ao token resgatado;
- estrutura de outbound;
- bloqueio de escrita externa até homologação.

A nova V1 deve absorver essas capacidades gradualmente, não duplicá-las.

---

## 4. Arquitetura escolhida

### 4.1 Modelo lógico

```text
0975 / 1018
     |
     v
Adaptador de Canal
(PapoAI hoje / Meta depois)
     |
     v
Núcleo WhatsApp Canônico
     |
     +--> Contato / Cliente
     +--> Conversa
     +--> Mensagem
     +--> Mídia / Transcrição
     +--> Evento / Status
     +--> ANA V1 / Humano
     +--> Automação
     +--> Campanha
     +--> Outbox
     |
     v
Adaptador de Saída
(PapoAI durante transição / Meta após homologação)
```

### 4.2 Regra de desacoplamento

Nenhuma regra de negócio deve depender diretamente de campos específicos do PapoAI ou da Meta quando puder depender de um contrato canônico.

Exemplo:

- errado: campanha grava `papoai_contact_id` como chave principal;
- correto: campanha grava `customer_id`, `conversation_id`, `whatsapp_account_id` e resolve o transporte no momento do envio.

Campos específicos de fornecedor podem existir em metadados ou tabelas de binding, nunca como eixo central da aplicação.

---

## 5. Componentes

### 5.1 Channel Adapter — PapoAI

Responsabilidade:

- continuar recebendo eventos atuais;
- normalizar eventos PapoAI em eventos/mensagens canônicos;
- preservar `event_key`, referências externas e rastreabilidade;
- não mudar a operação atual;
- permitir backfill confiável quando possível.

### 5.2 Channel Adapter — Meta

Responsabilidade futura:

- validar webhook da Meta;
- verificar assinatura de requisição quando aplicável;
- identificar `phone_number_id` e conta canônica;
- persistir payload bruto de forma auditável;
- normalizar mensagens recebidas;
- normalizar status `sent`, `delivered`, `read`, `failed` e demais eventos suportados;
- resolver mídia;
- nunca executar regra comercial diretamente no webhook.

### 5.3 Núcleo WhatsApp

Responsabilidade:

- ser fonte operacional da conversa WhatsApp da Dona Antônia;
- manter mensagens inbound e outbound;
- garantir idempotência;
- controlar estado da conversa;
- registrar quem/que componente produziu a resposta;
- manter histórico independente do fornecedor de transporte.

### 5.4 ANA V1

Responsabilidade:

- resolver casos simples por regras;
- transcrever áudio;
- usar IA somente no fallback previsto;
- priorizar envio ao catálogo personalizado;
- respeitar handoff humano;
- respeitar opt-out;
- não criar pedido a partir de texto livre.

### 5.5 Outbox

Responsabilidade:

- centralizar qualquer envio externo;
- impedir envio duplicado;
- registrar tentativa, retorno, `wamid` e erro;
- aplicar gate de canal;
- permitir retry controlado;
- servir igualmente ANA, humano, automação e campanha.

### 5.6 Templates

Responsabilidade:

- espelhar templates Meta relevantes;
- acompanhar idioma, categoria e status;
- permitir criação/edição/sincronização pelo Admin quando a integração Meta estiver habilitada;
- impedir uso de template não aprovado.

### 5.7 Automação

Responsabilidade:

- executar regras simples e explícitas;
- pós-venda;
- recompra;
- cadastro;
- lembretes/follow-ups aprovados;
- nunca disparar cliente com opt-out.

### 5.8 Campanhas

Responsabilidade:

- guardar definição de público;
- reavaliar elegibilidade no momento do disparo;
- congelar destinatários elegíveis daquele envio;
- gerar outbox idempotente;
- acompanhar resultados.

---

## 6. Modelo de dados

A implementação deve reaproveitar tabelas atuais e adicionar somente o que falta para tornar mensagens e transporte canônicos.

### 6.1 Tabelas existentes — manter

#### `whatsapp_accounts`

Continua sendo o cadastro dos números/canais.

Uso canônico:

- `id` — chave interna;
- `slug` — `dona-antonia-0975`, `dona-antonia-1018`;
- `phone_e164`;
- `phone_number_id`;
- `waba_id`;
- `is_active`.

Não armazenar access token Meta nesta tabela.

#### `customers`

Fonte do cliente Dona Antônia.

Campos relevantes:

- `id`;
- `name`;
- `primary_whatsapp_e164`;
- `marketing_opt_in`;
- histórico comercial existente.

#### `customer_phones`

Fonte de telefones normalizados e relacionamento de identidade.

#### `conversations`

Será mantida como tabela canônica de conversa.

Já possui campos úteis:

- `whatsapp_account_id`;
- `customer_id`;
- `wa_contact_e164`;
- `status`;
- `stage`;
- `human_required`;
- `mode`;
- `last_inbound_at`;
- `last_outbound_at`;
- `service_window_expires_at`;
- `assigned_admin_user_id`;
- `channel`;
- `channel_account_id`;
- `external_user_id`.

A implementação deve reduzir dependências de campos antigos de IA que não sejam necessários, mas não removê-los na primeira migração.

#### `storefront_identity_tokens`

Mantém o mecanismo `catalogo_####`.

#### `marketing_repurchase_state_v1`

Continua sendo a fonte da elegibilidade de recompra de 10 dias.

#### `marketing_optout_events_v1`

Continua sendo parte da trilha de opt-out. A captura deixará de depender exclusivamente do inbox PapoAI quando o Meta nativo entrar.

---

### 6.2 Nova tabela — `whatsapp_channel_runtime_v1`

Objetivo: permitir coexistência e corte seguro por número.

Campos mínimos:

- `whatsapp_account_id uuid primary key`;
- `inbound_provider text` — `papoai` ou `meta`;
- `outbound_provider text` — `papoai`, `meta` ou `disabled`;
- `capture_enabled boolean`;
- `send_enabled boolean`;
- `ana_enabled boolean`;
- `campaigns_enabled boolean`;
- `human_send_enabled boolean`;
- `homologated_at timestamptz`;
- `updated_at timestamptz`;
- `metadata jsonb`.

Regra:

- alterar o provider de um número é operação explícita;
- `send_enabled=false` por padrão para Meta até homologação;
- 0975 e 1018 podem migrar separadamente.

---

### 6.3 Nova tabela — `whatsapp_webhook_events_v1`

Objetivo: inbox neutro para qualquer fornecedor.

Campos mínimos:

- `id uuid primary key`;
- `whatsapp_account_id uuid`;
- `provider text`;
- `provider_event_id text`;
- `event_type text`;
- `provider_message_id text`;
- `phone_e164 text`;
- `received_at timestamptz`;
- `payload_hash text`;
- `payload jsonb`;
- `status text` — `received`, `normalized`, `ignored`, `review_required`, `failed`;
- `processed_at timestamptz`;
- `last_error text`;
- `metadata jsonb`.

Idempotência:

- índice único quando houver `provider_event_id`;
- fallback por `provider + payload_hash` quando o fornecedor não tiver ID confiável.

Payload bruto é evidência de integração, não fonte de regra comercial.

---

### 6.4 Nova tabela — `whatsapp_messages_v1`

Objetivo: histórico canônico de mensagem.

Campos mínimos:

- `id uuid primary key`;
- `conversation_id uuid not null`;
- `whatsapp_account_id uuid not null`;
- `customer_id uuid`;
- `direction text` — `inbound` ou `outbound`;
- `message_type text` — `text`, `audio`, `image`, `document`, `location`, `interactive`, `template`, `reaction`, `system`, `unknown`;
- `provider text`;
- `provider_message_id text` — `wamid` quando Meta;
- `provider_conversation_id text` quando disponível;
- `reply_to_message_id uuid`;
- `text_body text`;
- `status_current text`;
- `sender_kind text` — `customer`, `ana_rule`, `ana_ai`, `human`, `automation`, `campaign`, `system`;
- `sender_ref text`;
- `sent_at timestamptz`;
- `received_at timestamptz`;
- `created_at timestamptz`;
- `metadata jsonb`.

Índices mínimos:

- conversa + tempo;
- conta + provider_message_id único quando presente;
- cliente + tempo;
- status outbound.

Regra:

- uma mensagem Meta nunca é identificada só pelo texto;
- o `wamid` é referência externa principal quando existir.

---

### 6.5 Nova tabela — `whatsapp_message_status_events_v1`

Objetivo: trilha append-only de estados.

Campos mínimos:

- `id uuid primary key`;
- `message_id uuid not null`;
- `provider text`;
- `provider_message_id text`;
- `status text`;
- `occurred_at timestamptz`;
- `received_at timestamptz`;
- `error_code text`;
- `error_title text`;
- `error_detail text`;
- `payload jsonb`.

Regra:

- nunca sobrescrever a história do status;
- `whatsapp_messages_v1.status_current` é projeção do último estado conhecido;
- a ordenação usa timestamp do evento, pois webhooks podem chegar fora de ordem.

Estados V1 relevantes:

- `queued`;
- `sending`;
- `accepted`;
- `sent`;
- `delivered`;
- `read`;
- `failed`;
- `cancelled`.

---

### 6.6 Nova tabela — `whatsapp_media_v1`

Objetivo: anexos e áudio.

Campos mínimos:

- `id uuid primary key`;
- `message_id uuid not null`;
- `provider_media_id text`;
- `media_type text`;
- `mime_type text`;
- `file_size bigint`;
- `storage_bucket text`;
- `storage_path text`;
- `sha256 text`;
- `transcription text`;
- `transcription_status text`;
- `created_at timestamptz`;
- `metadata jsonb`.

Segurança:

- bucket privado;
- sem URL pública permanente;
- playback do Admin por URL assinada de curta duração.

Áudio V1:

1. receber metadata;
2. baixar mídia por backend;
3. salvar em Storage privado;
4. transcrever;
5. gravar transcrição;
6. passar a transcrição ao mesmo motor de regras usado para texto.

---

### 6.7 Nova tabela — `whatsapp_templates_v1`

Objetivo: espelho canônico de templates.

Campos mínimos:

- `id uuid primary key`;
- `whatsapp_account_id uuid` ou escopo WABA quando compartilhado;
- `meta_template_id text`;
- `name text`;
- `language text`;
- `category text`;
- `status text`;
- `components jsonb`;
- `quality_rating text`;
- `last_synced_at timestamptz`;
- `created_at timestamptz`;
- `updated_at timestamptz`;
- `metadata jsonb`.

O Admin não considera um template utilizável até o status permitido pela Meta estar sincronizado.

---

### 6.8 Nova tabela — `whatsapp_outbox_v1`

Objetivo: única fila de envio externo.

Campos mínimos:

- `id uuid primary key`;
- `idempotency_key text unique not null`;
- `whatsapp_account_id uuid not null`;
- `conversation_id uuid`;
- `customer_id uuid`;
- `to_phone_e164 text not null`;
- `message_id uuid`;
- `purpose text`;
- `message_type text`;
- `template_id uuid`;
- `payload jsonb`;
- `provider text`;
- `status text` — `queued`, `claimed`, `sent`, `failed`, `cancelled`;
- `attempt_count integer`;
- `available_at timestamptz`;
- `claimed_at timestamptz`;
- `sent_at timestamptz`;
- `provider_message_id text`;
- `last_error text`;
- `created_at timestamptz`;
- `updated_at timestamptz`.

Regras:

- toda saída passa pela outbox;
- campanha, humano, ANA e automação não chamam a Meta diretamente;
- retry é controlado e limitado;
- falhas permanentes não entram em loop.

---

### 6.9 Nova tabela — `whatsapp_ana_settings_v1`

Objetivo: configuração simples da ANA sem código espalhado.

Modelo singleton/versionado.

Campos mínimos:

- `id`;
- `version`;
- `is_active`;
- `business_hours jsonb`;
- `catalog_behavior jsonb`;
- `fallback_ai_enabled boolean`;
- `audio_transcription_enabled boolean`;
- `human_handoff_rules jsonb`;
- `response_style jsonb`;
- `updated_at`;
- `metadata jsonb`.

Não guardar prompt gigante como única regra de negócio. Regras críticas ficam estruturadas.

---

### 6.10 Nova tabela — `whatsapp_automation_rules_v1`

Objetivo: automações explícitas.

Campos mínimos:

- `id uuid primary key`;
- `name text`;
- `event_type text`;
- `is_enabled boolean`;
- `priority integer`;
- `conditions jsonb`;
- `actions jsonb`;
- `cooldown_seconds integer`;
- `created_at`;
- `updated_at`.

V1 inclui apenas automações necessárias, não um construtor genérico complexo.

---

### 6.11 Nova tabela — `whatsapp_automation_runs_v1`

Objetivo: idempotência e auditoria.

Campos mínimos:

- `id uuid primary key`;
- `rule_id uuid`;
- `event_key text`;
- `customer_id uuid`;
- `conversation_id uuid`;
- `status text`;
- `result jsonb`;
- `started_at`;
- `finished_at`;
- `last_error text`.

Índice único por regra + evento quando a regra for one-shot.

---

### 6.12 Nova tabela — `whatsapp_campaigns_v1`

Objetivo: definição e execução de campanhas.

Campos mínimos:

- `id uuid primary key`;
- `name text`;
- `whatsapp_account_id uuid`;
- `template_id uuid`;
- `audience_definition jsonb`;
- `scheduled_at timestamptz`;
- `status text` — `draft`, `scheduled`, `resolving`, `sending`, `completed`, `cancelled`, `failed`;
- `resolved_at timestamptz`;
- `started_at timestamptz`;
- `completed_at timestamptz`;
- `created_at`;
- `updated_at`;
- `metadata jsonb`.

---

### 6.13 Nova tabela — `whatsapp_campaign_recipients_v1`

Objetivo: fotografia auditável do público no momento real do envio.

Campos mínimos:

- `id uuid primary key`;
- `campaign_id uuid not null`;
- `customer_id uuid`;
- `conversation_id uuid`;
- `phone_e164 text`;
- `eligibility_status text`;
- `blocked_reason text`;
- `outbox_id uuid`;
- `resolved_at timestamptz`;
- `sent_at timestamptz`;
- `metadata jsonb`.

Índice único por campanha + cliente/telefone.

---

## 7. Regras da ANA V1

### 7.1 Objetivo da ANA

A ANA V1 não tenta manter uma conversa longa nem vender por IA. Ela deve resolver o básico e levar o cliente ao catálogo de forma natural.

### 7.2 Ordem de decisão

Para cada inbound:

1. validar conta e contato;
2. persistir mensagem;
3. atualizar conversa;
4. detectar opt-out/`NAO_CONTATAR`;
5. verificar handoff humano;
6. verificar evento estruturado/Flow;
7. aplicar regra determinística;
8. se regra pedir catálogo, emitir/reutilizar `catalogo_####`;
9. se não houver regra e fallback estiver habilitado, usar IA restrita;
10. se confiança insuficiente, encaminhar para humano.

### 7.3 Regras determinísticas mínimas

- saudação;
- “quero comprar”;
- “quero cesta”;
- preço/catálogo;
- pagamento;
- entrega;
- cidades atendidas;
- pedido mínimo;
- cadastro/endereço faltante;
- horário/entrega do dia seguinte;
- pedido/status quando existir integração segura;
- pedido de atendente humano;
- opt-out;
- áudio.

### 7.4 Resposta da ANA

Padrão:

- português simples;
- resposta curta;
- sem linguagem de robô;
- no máximo uma pergunta por mensagem;
- sem repetir nome do cliente desnecessariamente;
- emoji moderado;
- sempre que adequado, oferecer o catálogo personalizado.

### 7.5 IA fallback

A IA V1 pode:

- classificar intenção;
- reformular resposta curta;
- responder FAQ a partir de regras/dados conhecidos;
- compreender transcrição de áudio.

A IA V1 não pode:

- inventar preço;
- inventar estoque;
- criar ou alterar pedido sem fluxo canônico;
- conceder desconto;
- decidir regra fiscal;
- ignorar opt-out;
- enviar campanha por iniciativa própria.

---

## 8. Handoff humano

A tabela `conversations` já possui campos suficientes para suportar handoff.

Estados funcionais V1:

- `auto` — ANA pode responder;
- `human` — ANA pausada;
- `paused` — sem automação até retomada;
- `closed` — conversa encerrada operacionalmente.

Regras:

- mensagem humana pausa resposta automática por janela configurável;
- pedido explícito de atendente ativa humano;
- erro repetido ativa humano;
- assuntos fora de escopo ativam humano;
- retomada da ANA deve ser explícita/segura.

Não criar uma nova tabela de handoff na V1 se os campos atuais atenderem.

---

## 9. Templates Meta

### 9.1 Sincronização

O sistema terá ação sob demanda e sincronização controlada dos templates da conta/WABA.

Dados espelhados:

- ID Meta;
- nome;
- idioma;
- categoria;
- componentes;
- status;
- qualidade quando disponível.

### 9.2 Criação/edição

A V1 poderá preparar e enviar criação/edição pela API oficial quando as credenciais Meta estiverem homologadas.

A interface deve mostrar claramente:

- rascunho local;
- enviado à Meta;
- em análise;
- aprovado;
- rejeitado/pausado quando aplicável.

### 9.3 Envio

Template só gera outbox quando:

- canal está habilitado;
- template está apto;
- cliente não está bloqueado;
- parâmetros obrigatórios estão completos.

---

## 10. Campanhas

### 10.1 Regra de público dinâmico

Uma campanha programada não deve congelar o público no momento de sua criação.

Fluxo:

1. salvar `audience_definition`;
2. chegar `scheduled_at`;
3. recalcular clientes elegíveis;
4. aplicar opt-in e `NAO_CONTATAR`;
5. validar telefone;
6. validar duplicidade;
7. gravar `whatsapp_campaign_recipients_v1`;
8. gerar outbox;
9. despachar em lote controlado.

Isso garante que alterações feitas antes do horário real sejam respeitadas.

### 10.2 Recompra de 10 dias

Não reconstruir a lógica atual.

Usar `marketing_repurchase_state_v1` como fonte de elegibilidade.

A nova camada apenas:

- consulta os elegíveis;
- revalida opt-in;
- cria outbox idempotente;
- registra envio/status;
- marca o ciclo como enviado somente após aceite de envio válido.

### 10.3 `NAO_CONTATAR`

O bloqueio deve ser canônico, não dependente de etiqueta PapoAI.

Fonte V1:

- `customers.marketing_opt_in=false`;
- eventos de opt-out;
- bloqueios administrativos quando houver.

Etiqueta PapoAI pode ser lida na transição, mas não será a fonte definitiva.

---

## 11. Scheduler / dispatcher

A V1 terá apenas um mecanismo agendado central, usado para:

- campanhas programadas;
- recompra pronta;
- retries de outbox permitidos;
- automações realmente dependentes de tempo.

Diretriz:

- evitar um cron por função;
- usar um único dispatcher pequeno;
- intervalo inicial recomendado: até 5 minutos para marketing;
- ações críticas de conversa continuam event-driven por webhook.

O dispatcher deve apenas reivindicar trabalho vencido de forma transacional e delegar envio; não deve varrer tabelas gigantes nem processar IA desnecessariamente.

---

## 12. Interface Vitrine/Admin

### 12.1 Organização

Criar seção principal **WhatsApp**.

Subseções V1:

1. Visão Geral;
2. Conversas;
3. Templates;
4. Automações;
5. Campanhas;
6. Configurações / ANA.

### 12.2 Visão Geral

Mostrar por número:

- 0975 / 1018;
- provider inbound;
- provider outbound;
- webhook saudável;
- último inbound;
- último outbound;
- fila pendente;
- falhas recentes;
- ANA ligada/desligada;
- campanhas ligadas/desligadas;
- estado de homologação Meta.

Não mostrar métricas decorativas sem ação operacional.

### 12.3 Conversas

Lista:

- cliente/nome;
- telefone;
- número usado;
- última mensagem;
- horário;
- origem;
- estado ANA/humano;
- pendência.

Ao abrir:

- histórico cronológico;
- texto;
- áudio + transcrição;
- imagens/documentos;
- status de mensagem outbound;
- vínculo com cliente;
- vínculo com pedidos;
- botão `Abrir catálogo do cliente` / gerar link;
- campo de resposta humana;
- assumir/devolver à ANA.

### 12.4 Templates

Lista simples com:

- nome;
- idioma;
- categoria;
- status;
- última sincronização;
- ação editar/sincronizar.

### 12.5 Automações

V1 mostra automações conhecidas em cards, não um editor visual complexo.

Exemplos:

- cadastro;
- pós-venda;
- recompra 10 dias;
- opt-out;
- link catálogo;
- handoff.

Cada card mostra:

- ligada/desligada;
- gatilho;
- ação;
- último uso;
- último erro.

### 12.6 Campanhas

Fluxo de criação:

1. nome;
2. canal;
3. público;
4. template;
5. data/horário;
6. estimativa de elegíveis;
7. salvar/programar.

Após execução:

- total resolvido;
- bloqueados;
- enviados;
- entregues;
- lidos;
- falhas;
- respostas quando correlacionáveis.

### 12.7 Configurações / ANA

Somente controles realmente operacionais:

- ANA ativa;
- transcrição de áudio;
- fallback IA;
- horários;
- mensagem de handoff;
- comportamento de catálogo;
- regras básicas editáveis.

---

## 13. Modularização do Admin

`vitrine/admin/index.html` já é monolítico e muito grande.

O módulo WhatsApp não deve ser adicionado como centenas de linhas novas nesse arquivo.

Diretriz:

- criar módulo frontend separado, por exemplo `vitrine/admin/modules/whatsapp/`;
- CSS e JS específicos separados;
- shell do Admin apenas registra rota/menu e carrega o módulo;
- preservar estilo visual atual;
- não iniciar refatoração total do Admin como pré-requisito.

Objetivo: modularizar somente a área nova e criar um padrão reutilizável para futuras extrações.

---

## 14. Backend

### 14.1 Funções alvo

Evitar uma Edge Function por ação.

Arquitetura alvo inicial:

- `whatsapp-webhook-v1` — entrada Meta pública e verificada;
- `whatsapp-dispatch-v1` — envio/outbox server-side;
- `admin-whatsapp-v1` — gateway operacional do módulo do Admin;
- funções SQL internas para normalização, idempotência e claims de fila.

Se uma função existente canônica puder absorver uma responsabilidade sem virar monólito, isso será decidido na implementação. O design não autoriza crescer `admin-products-live-v1` indefinidamente.

### 14.2 Webhook

Fluxo:

1. responder desafio de verificação quando aplicável;
2. validar autenticidade;
3. resolver conta por `phone_number_id`;
4. persistir evento bruto idempotente;
5. responder rapidamente ao provedor;
6. processar normalização fora do trecho crítico;
7. registrar mensagem/status;
8. acionar motor ANA/automação somente depois da persistência.

### 14.3 Dispatch

Fluxo:

1. claim transacional de outbox;
2. validar runtime do canal;
3. validar opt-out quando finalidade for marketing;
4. resolver provider;
5. enviar;
6. guardar retorno externo;
7. criar/atualizar mensagem canônica;
8. aguardar webhooks de status;
9. retry apenas em falhas classificadas como temporárias.

---

## 15. Segurança

### 15.1 Meta

- access token somente em segredo server-side;
- nunca em tabela pública;
- nunca no HTML/JS do Admin;
- webhook verifica autenticidade;
- IDs Meta podem ser armazenados, tokens não.

### 15.2 Banco

Novas tabelas operacionais:

- RLS habilitada quando estiverem em schema exposto;
- sem acesso `anon` direto;
- mutações via backend/gateway;
- views administrativas com `security_invoker` quando aplicável;
- funções privilegiadas fora do acesso público ou com grants mínimos.

### 15.3 Admin

A V1 não reintroduz senha digitada no Vitrine/Admin.

Porém:

- nenhuma credencial Meta será entregue ao browser;
- ações externas de envio passam por backend;
- gates `send_enabled`, `campaigns_enabled` e homologação impedem ativação acidental;
- segurança do perímetro atual do Admin será respeitada e pode ser endurecida sem exigir senha digitada.

### 15.4 Dados pessoais

- telefone e mensagem são dados operacionais;
- mídia fica em bucket privado;
- logs não devem imprimir tokens nem payloads sensíveis desnecessariamente;
- exportações devem evitar segredos.

---

## 16. Observabilidade

Métricas mínimas por canal:

- último webhook recebido;
- webhooks nas últimas 24h;
- eventos com falha;
- mensagens inbound;
- mensagens outbound;
- outbox pendente;
- outbox falha;
- `sent`;
- `delivered`;
- `read`;
- `failed`;
- última falha e código;
- latência média simples de envio quando útil.

Logs devem permitir responder:

- qual cliente;
- qual conta;
- qual mensagem;
- qual `wamid`;
- qual automação/campanha;
- qual tentativa;
- qual erro.

---

## 17. Idempotência

### 17.1 Inbound

Chave preferida:

`whatsapp_account_id + provider_message_id`

Fallback:

`provider + provider_event_id` ou hash controlado.

### 17.2 Outbound

Toda intenção recebe `idempotency_key` determinística.

Exemplos:

- recompra: `repurchase:{customer}:{order}`;
- campanha: `campaign:{campaign}:{customer}`;
- resposta automática a mensagem: `ana:{rule}:{inbound_message}`.

### 17.3 Status

Webhook repetido do mesmo status não cria efeitos duplicados.

### 17.4 Automação

Regra one-shot não executa duas vezes para o mesmo evento.

---

## 18. Tratamento de erros

### 18.1 Webhook inválido

- não processar regra de negócio;
- registrar mínimo necessário para diagnóstico quando seguro;
- responder conforme contrato do provedor.

### 18.2 Cliente ambíguo

- não fazer merge automático;
- conversa pode existir sem `customer_id`;
- marcar para revisão.

### 18.3 Mensagem sem conversa

- criar/reusar conversa pela combinação segura conta + telefone;
- evitar aproximação por nome.

### 18.4 Mídia indisponível

- mensagem continua existindo;
- mídia recebe estado `failed`;
- ANA não inventa conteúdo.

### 18.5 Falha Meta

- salvar código/descrição;
- classificar retryable vs permanente;
- não fazer loop infinito.

### 18.6 Falha de IA

- nenhuma perda de mensagem;
- usar fallback determinístico ou humano;
- não bloquear webhook.

---

## 19. Compatibilidade PapoAI durante a transição

### 19.1 Regra principal

PapoAI continua sendo transporte produtivo até o gate de cada número.

### 19.2 Dual-write controlado

Durante desenvolvimento, eventos PapoAI podem alimentar as novas tabelas canônicas em modo sombra.

Modo sombra significa:

- grava histórico;
- executa validações internas;
- não envia mensagem duplicada;
- não muda comportamento do cliente.

### 19.3 Backfill

Não inventar histórico que não exista.

Pode-se importar do legado:

- mensagens inbound confiáveis;
- vínculo de conversa;
- timestamps;
- referências externas existentes.

Outbound histórico só será backfillado quando houver evidência confiável.

Itens importados recebem `provider='papoai_legacy'`/metadata equivalente.

---

## 20. Migração para Meta nativo

A migração é por canal, não big bang.

### Fase A — Fundação

- tabelas canônicas;
- runtime por canal;
- mensagens;
- status;
- media;
- outbox;
- Admin em modo leitura/teste;
- PapoAI continua normal.

### Fase B — Shadow

- eventos PapoAI entram no núcleo canônico;
- ANA V1 pode ser executada em dry-run;
- comparação de decisões;
- sem envio Meta.

### Fase C — Meta homologação técnica

Por número:

- credenciais válidas;
- `phone_number_id`;
- WABA;
- webhook Meta;
- recebimento de teste;
- envio para contato de teste;
- status `sent/delivered/read/failed` correlacionado por `wamid`;
- mídia;
- template.

### Fase D — Outbound piloto

- manter inbound PapoAI se necessário;
- habilitar Meta apenas para cenário controlado e contato de teste;
- provar outbox e status.

### Fase E — Cutover de um número

Somente após checklist verde:

- provider inbound -> Meta;
- provider outbound -> Meta;
- PapoAI daquele número deixa de ser caminho principal;
- rollback preparado.

### Fase F — Segundo número

Repetir processo sem presumir que o comportamento/configuração seja idêntico.

### Fase G — Retirada do legado

Somente depois dos dois números estáveis:

- desabilitar bindings PapoAI;
- preservar dados históricos;
- remover funções/tabelas realmente órfãs após logs e smoke tests;
- atualizar `RUNTIME-INVENTORY.md`.

---

## 21. Rollback

Rollback deve ser possível por canal usando `whatsapp_channel_runtime_v1`.

Em caso de problema Meta:

1. `send_enabled=false` para Meta;
2. restaurar outbound provider PapoAI quando ainda disponível;
3. restaurar inbound provider conforme configuração operacional;
4. manter eventos/mensagens já gravados;
5. não apagar dados da tentativa;
6. investigar por `wamid`, evento e outbox.

Não usar rollback que dependa de desfazer migrations destrutivas.

---

## 22. Testes

### 22.1 Banco

Testar:

- idempotência inbound;
- idempotência outbound;
- criação/reuso de conversa;
- associação exata de cliente;
- status fora de ordem;
- opt-out;
- campanha com cliente elegível e bloqueado;
- claim concorrente de outbox;
- retry;
- rollback transacional.

### 22.2 Adapter PapoAI

- evento real conhecido normaliza uma vez;
- não gera envio;
- preserva conversa/cliente;
- não altera pedido.

### 22.3 Meta

Usar contato controlado antes de cliente real:

- texto inbound;
- texto outbound;
- template;
- áudio inbound;
- imagem inbound;
- status enviado;
- entregue;
- lido;
- falhou;
- webhook duplicado.

### 22.4 ANA

Conjunto fixo de frases reais:

- saudação;
- cesta;
- pagamento;
- entrega;
- cidade;
- catálogo;
- cadastro;
- humano;
- opt-out;
- perguntas desconhecidas.

Validar:

- resposta correta;
- uma pergunta no máximo;
- nenhum preço inventado;
- nenhum pedido automático.

### 22.5 Campanha

Teste principal:

1. criar campanha futura com segmento;
2. adicionar/remover elegibilidade antes do horário;
3. disparar resolução;
4. comprovar que público foi recalculado no momento do envio;
5. comprovar que `NAO_CONTATAR` não recebeu outbox.

---

## 23. Critérios de aceitação da V1

A V1 é considerada tecnicamente pronta quando:

1. 0975 e 1018 aparecem no painel com estado independente;
2. conversas e mensagens são canônicas e pesquisáveis;
3. inbound duplicado não duplica mensagem;
4. outbound duplicado não duplica envio;
5. `wamid` é persistido e correlacionado;
6. status `sent/delivered/read/failed` atualizam histórico corretamente;
7. áudio pode ser ouvido no Admin e possui transcrição quando habilitada;
8. ANA responde casos básicos sem depender sempre de IA;
9. humano consegue assumir/devolver conversa;
10. templates são sincronizados e estado Meta é visível;
11. recompra 10 dias usa estado canônico já existente;
12. campanha reavalia público no momento real do envio;
13. opt-out bloqueia marketing;
14. PapoAI pode continuar funcionando sem duplicidade durante shadow;
15. um canal pode ser migrado e revertido sem afetar o outro;
16. nenhum segredo Meta aparece no frontend;
17. testes de integração passam antes do cutover.

---

## 24. Fora de escopo da V1

Não construir agora:

- omnichannel Instagram/Messenger dentro da mesma caixa;
- chatbot visual de arrastar e soltar;
- IA autônoma de vendas;
- treinamento automático complexo;
- múltiplas equipes/filas avançadas;
- SLA de call center;
- billing interno;
- CRM paralelo;
- scoring sofisticado de leads;
- bot que fecha pedido livremente por texto;
- substituição simultânea dos dois números.

A arquitetura deixa espaço para esses recursos, mas eles não justificam complexidade na V1.

---

## 25. Sequência de implementação proposta

1. migrations do núcleo canônico;
2. testes SQL/idempotência;
3. adapter PapoAI -> canônico em shadow;
4. API Admin WhatsApp somente leitura;
5. módulo frontend WhatsApp — visão geral/conversas;
6. mídia/transcrição;
7. ANA determinística + dry-run;
8. templates;
9. outbox;
10. automações/recompra;
11. campanhas;
12. adapter Meta + webhook;
13. homologação técnica com contato controlado;
14. piloto por número;
15. cutover 1;
16. observação/rollback gate;
17. cutover 2;
18. limpeza de legado comprovadamente órfão.

A ordem detalhada, arquivos exatos e testes de cada tarefa serão definidos no plano de implementação após aprovação desta especificação.

---

## 26. Decisões definitivas deste design

- Supabase canônico permanece único.
- `conversations` permanece e será reaproveitada.
- será criada uma tabela canônica de mensagens; não usar inbox PapoAI como histórico definitivo.
- PapoAI e Meta serão adaptadores do mesmo núcleo.
- envio sempre passa por outbox.
- status Meta é append-only e correlacionado por `wamid`.
- campanha resolve elegibilidade no momento do disparo.
- recompra atual será reaproveitada.
- opt-out será canônico.
- ANA V1 é rule-first e AI-fallback.
- áudio será armazenado de forma privada e transcrito.
- Admin WhatsApp será modularizado fora do monólito principal.
- migração será individual por número.
- nenhuma retirada PapoAI acontece antes de homologação.

---

## 27. Referências internas

- `docs/ARCHITECTURE.md`
- `docs/RUNTIME-INVENTORY.md`
- `docs/projects/dona-antonia-operations-2/PROJECT-MASTER.md`
- `docs/projects/dona-antonia-operations-2/R8-PAPOAI-WHATSAPP-CHECKPOINT.md`
- `supabase/sql/20260930_marketing_repurchase_10d_canonical_v1.sql`

Referência externa validada na data desta especificação:

- Meta WhatsApp Business Platform / Cloud API — webhooks e status de mensagens, incluindo correlação por identificador de mensagem e estados de entrega.

---

## 28. Gate

Este documento define arquitetura e comportamento esperado.

Ele **não autoriza cutover**, desconexão do PapoAI, envio para clientes reais nem ativação de Meta outbound em produção.

A próxima etapa, após revisão deste design, é criar o plano de implementação detalhado e executável.
