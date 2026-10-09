# Dona Antônia — WhatsApp Meta Native V1 — Design Técnico

Data: 2026-09-30  
Status: especificação arquitetural para revisão  
Repositório: `osvaldosereia/SUCEDOAN12`  
Supabase canônico: `ssbesxgaijknwsjbsbcz`

---

## 1. Objetivo

Construir dentro do Vitrine/Admin uma base própria para WhatsApp, simples de operar e preparada para evolução, mantendo o PapoAI funcionando durante todo o desenvolvimento e substituindo-o somente depois de homologação real.

A V1 cobre:

- 0975 e 1018;
- histórico de conversas e mensagens;
- texto, áudio, imagem e documentos;
- áudio com transcrição;
- ANA básica baseada primeiro em regras e IA apenas como fallback;
- link personalizado `catalogo_####`;
- handoff humano;
- templates Meta;
- automações simples;
- pós-venda e recompra de 10 dias;
- campanhas segmentadas;
- estados `sent`, `delivered`, `read` e `failed`;
- migração gradual PapoAI -> Meta.

A V1 não é um CRM completo, ERP, omnichannel nem clone do PapoAI.

---

## 2. Decisões obrigatórias

1. PapoAI continua em produção durante o desenvolvimento.
2. Nenhum número será desconectado antecipadamente.
3. Todo runtime novo usa apenas o Supabase canônico `ssbesxgaijknwsjbsbcz`.
4. `customers`, `customer_phones`, `conversations`, `orders`, `storefront_identity_tokens` e a recompra atual serão reaproveitados.
5. PapoAI e Meta serão adaptadores do mesmo núcleo canônico.
6. Texto livre não cria pedido automaticamente.
7. Todo envio externo passa por uma outbox idempotente.
8. Todo webhook é persistido antes de acionar regra de negócio.
9. Nenhum token Meta chega ao navegador.
10. Migração e rollback são independentes por número.
11. Legado só é removido depois de prova de não uso.
12. A interface V1 deve ser pequena; a estrutura interna deve ser completa o suficiente para não exigir reconstrução futura.

---

## 3. Baseline observado em 2026-09-30

No Supabase canônico existem hoje:

- 2 registros em `whatsapp_accounts`;
- 864 conversas;
- 1183 eventos em `papoai_webhook_inbox_v2`;
- 10 eventos de Flow em `papoai_customer_flow_events_v1`;
- 19 intents outbound PapoAI;
- estrutura de `catalogo_####`;
- clientes, telefones e pedidos canônicos;
- recompra de 10 dias em `marketing_repurchase_state_v1`;
- opt-out legado em `marketing_optout_events_v1`.

O 0975 possui binding PapoAI ativo, mas ainda não possui identificação Meta completa no cadastro canônico. O 1018 já possui identificação Meta histórica, porém envio direto Meta continua desabilitado e não homologado.

As funções antigas `whatsapp-meta-direct-v1` e `admin-whatsapp-direct-v1` estão aposentadas com HTTP 410. Elas não serão reativadas.

---

## 4. Arquitetura

```text
0975 / 1018
    |
    v
Adaptador de entrada
(PapoAI hoje / Meta depois)
    |
    v
Núcleo WhatsApp canônico
    |
    +-- Cliente
    +-- Conversa
    +-- Mensagem
    +-- Mídia / transcrição
    +-- Status
    +-- ANA / humano
    +-- Automação
    +-- Campanha
    +-- Outbox
    |
    v
Adaptador de saída
(PapoAI durante transição / Meta após homologação)
```

Regra central: nenhuma regra comercial depende de ID específico do PapoAI. IDs externos são bindings ou metadados; as chaves internas são `customer_id`, `conversation_id`, `whatsapp_account_id` e IDs canônicos de mensagem/envio.

---

## 5. Dados existentes que permanecem

### `whatsapp_accounts`

Cadastro dos canais 0975 e 1018. Continua guardando IDs públicos Meta como `phone_number_id` e `waba_id`, mas nunca access token.

### `customers` e `customer_phones`

Fonte da identidade comercial e telefones normalizados.

### `conversations`

Permanece como conversa canônica. Os campos atuais de conta, cliente, telefone, estado, modo, handoff e janelas de atendimento serão reaproveitados. Campos antigos não usados não serão removidos na primeira fase.

### `storefront_identity_tokens`

Permanece como base do `catalogo_####`.

### `marketing_repurchase_state_v1`

Permanece como fonte da elegibilidade da recompra de 10 dias.

---

## 6. Novas estruturas canônicas

### 6.1 `whatsapp_channel_runtime_v1`

Controla cada número independentemente.

Campos principais:

- `whatsapp_account_id` PK;
- `inbound_provider`: `papoai` ou `meta`;
- `outbound_provider`: `papoai`, `meta` ou `disabled`;
- `capture_enabled`;
- `send_enabled`;
- `ana_enabled`;
- `campaigns_enabled`;
- `human_send_enabled`;
- `homologated_at`;
- `updated_at`;
- `metadata`.

Meta começa com `send_enabled=false` até homologação.

### 6.2 `whatsapp_webhook_events_v1`

Inbox neutro para PapoAI e Meta.

Campos principais:

- `id`;
- `whatsapp_account_id`;
- `provider`;
- `provider_event_id`;
- `event_type`;
- `provider_message_id`;
- `phone_e164`;
- `received_at`;
- `payload_hash`;
- `payload`;
- `status`;
- `processed_at`;
- `last_error`;
- `metadata`.

Idempotência:

- único por `(provider, whatsapp_account_id, provider_event_id)` quando houver ID externo;
- fallback por `(provider, whatsapp_account_id, payload_hash)` quando necessário.

### 6.3 `whatsapp_messages_v1`

Histórico canônico.

Campos principais:

- `id`;
- `conversation_id`;
- `whatsapp_account_id`;
- `customer_id`;
- `direction`;
- `message_type`;
- `provider`;
- `provider_message_id` (`wamid` quando Meta);
- `provider_conversation_id`;
- `reply_to_message_id`;
- `text_body`;
- `status_current`;
- `sender_kind`: `customer`, `ana_rule`, `ana_ai`, `human`, `automation`, `campaign`, `system`;
- `sender_ref`;
- `sent_at`;
- `received_at`;
- `created_at`;
- `metadata`.

Índice único externo: `(whatsapp_account_id, provider, provider_message_id)` quando `provider_message_id` não for nulo.

### 6.4 `whatsapp_message_status_events_v1`

Trilha append-only dos estados da mensagem.

Campos principais:

- `id`;
- `message_id`;
- `provider`;
- `provider_message_id`;
- `status`;
- `occurred_at`;
- `received_at`;
- campos de erro;
- `payload`.

Estados V1: `queued`, `sending`, `accepted`, `sent`, `delivered`, `read`, `failed`, `cancelled`.

`status_current` na mensagem é projeção do último evento válido por timestamp. Webhooks podem chegar fora de ordem; por isso não se usa ordem de chegada como verdade.

### 6.5 `whatsapp_media_v1`

Mídia privada associada à mensagem.

Campos principais:

- `id`;
- `message_id`;
- `provider_media_id`;
- `media_type`;
- `mime_type`;
- `file_size`;
- `storage_bucket`;
- `storage_path`;
- `sha256`;
- `transcription`;
- `transcription_status`;
- `created_at`;
- `metadata`.

Arquivos ficam em bucket privado e são exibidos no Admin por URL assinada temporária.

### 6.6 `whatsapp_templates_v1`

Espelho dos templates Meta relevantes.

Campos principais:

- `id`;
- escopo WABA/conta;
- `meta_template_id`;
- `name`;
- `language`;
- `category`;
- `status`;
- `components`;
- `quality_rating` quando disponível;
- `last_synced_at`;
- timestamps e metadata.

Template só pode ser enviado quando estiver em estado permitido pela Meta.

### 6.7 `whatsapp_outbox_v1`

Única fila de saída.

Campos principais:

- `id`;
- `idempotency_key` único;
- `whatsapp_account_id`;
- `conversation_id`;
- `customer_id`;
- `to_phone_e164`;
- `message_id`;
- `purpose`;
- `message_type`;
- `template_id`;
- `payload`;
- `provider`;
- `status`: `queued`, `claimed`, `sent`, `failed`, `cancelled`;
- `attempt_count`;
- `available_at`;
- `claimed_at`;
- `sent_at`;
- `provider_message_id`;
- `last_error`;
- timestamps.

ANA, humano, campanha e automação nunca chamam a Meta diretamente.

### 6.8 `whatsapp_ana_settings_v1`

Configuração pequena e estruturada da ANA:

- ativa/desativada;
- horário;
- comportamento de catálogo;
- transcrição;
- fallback IA;
- handoff;
- estilo de resposta;
- versão e metadata.

Regras críticas não ficarão escondidas apenas em um prompt gigante.

### 6.9 `whatsapp_automation_rules_v1`

Regras V1 explícitas com `event_type`, prioridade, condições, ações, cooldown e estado ativo. Não será criado um construtor visual genérico.

### 6.10 `whatsapp_automation_runs_v1`

Auditoria e idempotência das execuções, incluindo regra, evento, conversa, cliente, resultado e erro.

### 6.11 `whatsapp_campaigns_v1`

Definição da campanha:

- canal;
- template;
- `audience_definition`;
- agendamento;
- estado;
- timestamps;
- metadata.

### 6.12 `whatsapp_campaign_recipients_v1`

Fotografia do público no momento real da execução, contendo cliente, telefone, elegibilidade, bloqueio, outbox e status.

---

## 7. Opt-out canônico

A tabela atual `marketing_optout_events_v1` é ligada diretamente a `papoai_webhook_inbox_v2` por `capture_id`, portanto não pode ser a trilha definitiva após a entrada Meta.

A implementação criará `marketing_optout_events_v2` como trilha provider-neutral, com:

- `id` PK;
- `customer_id`;
- `phone_e164`;
- `whatsapp_message_id` opcional;
- `provider`;
- `source_event_key`;
- `reason_code`;
- `occurred_at`;
- `metadata`.

`marketing_optout_events_v1` permanece somente para histórico legado durante a migração. Eventos confiáveis podem ser migrados para v2 idempotentemente.

A fonte operacional de bloqueio continua simples:

- `customers.marketing_opt_in=false` bloqueia marketing;
- `marketing_optout_events_v2` mantém a evidência;
- `NAO_CONTATAR` do PapoAI pode ser importado durante a transição, mas não é a fonte definitiva.

---

## 8. ANA V1

A ANA V1 é `rule-first` e `AI-fallback`.

Fluxo por inbound:

1. validar conta;
2. persistir webhook;
3. normalizar/persistir mensagem;
4. resolver conversa e cliente por identidade exata;
5. detectar opt-out;
6. respeitar handoff humano;
7. processar Flow/evento estruturado;
8. aplicar regra determinística;
9. emitir/reutilizar `catalogo_####` quando adequado;
10. usar IA somente se não houver regra segura;
11. encaminhar ao humano quando a confiança for insuficiente.

Regras mínimas:

- saudação;
- quero comprar/cesta;
- catálogo;
- pagamento;
- entrega e cidades;
- pedido mínimo;
- cadastro/endereço;
- horário e entrega do dia seguinte;
- pedido/status quando houver dado seguro;
- pedido de atendente;
- opt-out;
- áudio.

Estilo:

- português simples;
- curto;
- no máximo uma pergunta por mensagem;
- sem repetir nome desnecessariamente;
- emoji moderado;
- sem inventar preço, estoque, desconto ou regra fiscal.

A IA pode classificar intenção, compreender transcrição e reformular resposta. Não pode criar pedido, conceder condição comercial ou disparar marketing por iniciativa própria.

---

## 9. Áudio e mídia

Fluxo de áudio:

1. receber metadata;
2. backend obtém a mídia;
3. salva em Storage privado;
4. transcreve;
5. persiste transcrição;
6. passa a transcrição pelo mesmo motor de regras de texto.

Falha de mídia não perde a mensagem. A mídia fica marcada como falha e a conversa pode ir ao humano.

---

## 10. Handoff humano

Usar os campos já existentes em `conversations` sempre que suficientes.

Modos funcionais:

- `auto`;
- `human`;
- `paused`;
- `closed`.

Mensagem humana pausa automação por janela configurável. Pedido explícito de atendente, erro repetido ou assunto fora de escopo ativa humano. Retomada da ANA deve ser controlada.

Não criar tabela nova de handoff na V1 sem necessidade comprovada.

---

## 11. Templates

O Admin sincroniza estado Meta sob demanda e, quando a integração estiver homologada, poderá criar/editar templates pela API oficial.

A interface diferencia claramente:

- rascunho local;
- enviado;
- em análise;
- aprovado;
- rejeitado/pausado conforme o estado retornado pela Meta.

Nenhum template não apto gera outbox.

---

## 12. Campanhas e recompra

### Público dinâmico

Campanha programada guarda a definição de público, não uma lista congelada antecipadamente.

No horário:

1. recalcular elegíveis;
2. aplicar `marketing_opt_in` e bloqueios;
3. validar telefone;
4. congelar `whatsapp_campaign_recipients_v1`;
5. gerar outbox idempotente;
6. despachar em lote.

Antes de cada envio de marketing, a outbox revalida opt-out para cobrir mudanças ocorridas depois da resolução do público.

### Recompra de 10 dias

Não reconstruir a regra atual. Usar `marketing_repurchase_state_v1` e apenas transformar cada elegível em outbox idempotente.

Chave sugerida:

`repurchase:{customer_id}:{last_purchase_order_id}`

O ciclo só é marcado como enviado após retorno válido do transporte.

---

## 13. Scheduler

Ações de conversa continuam event-driven por webhook.

Para campanhas/recompra, usar um único dispatcher pequeno em vez de vários crons. Cadência inicial máxima necessária: até 5 minutos para marketing.

O dispatcher apenas reivindica trabalho vencido de forma transacional. Não executa IA em varredura nem cria polling geral do sistema.

---

## 14. Vitrine/Admin

Criar seção principal **WhatsApp** com:

1. Visão Geral;
2. Conversas;
3. Templates;
4. Automações;
5. Campanhas;
6. Configurações / ANA.

### Visão Geral

Por canal:

- 0975/1018;
- provider inbound/outbound;
- webhook;
- último inbound/outbound;
- fila;
- falhas;
- ANA;
- campanhas;
- homologação Meta.

### Conversas

Lista simples com cliente, telefone, canal, última mensagem, horário, estado ANA/humano e pendência.

Ao abrir:

- histórico cronológico;
- áudio + transcrição;
- mídia;
- status outbound;
- cliente;
- pedidos;
- link do catálogo;
- resposta humana;
- assumir/devolver à ANA.

### Automações

Cards para cadastro, pós-venda, recompra, opt-out, catálogo e handoff. Cada card mostra estado, gatilho, ação, último uso e último erro.

### Campanhas

Criação em poucos passos: nome, canal, público, template, agendamento e programação. Depois mostra resolvidos, bloqueados, enviados, entregues, lidos e falhas.

---

## 15. Modularização do frontend

`vitrine/admin/index.html` já é monolítico. O módulo novo não será colocado inteiro dentro dele.

Diretriz:

- `vitrine/admin/modules/whatsapp/` para JS/CSS/módulo;
- shell principal apenas registra menu/rota e carrega o módulo;
- manter visual atual;
- não tornar uma refatoração total do Admin pré-requisito desta V1.

---

## 16. Backend alvo

Inicialmente três superfícies:

- `whatsapp-webhook-v1` — entrada Meta pública validada;
- `whatsapp-dispatch-v1` — outbox/transporte server-side;
- `admin-whatsapp-v1` — gateway do módulo administrativo.

Funções SQL internas cuidam de idempotência, normalização e claims transacionais.

### Webhook

1. validar requisição;
2. resolver conta por `phone_number_id`/binding;
3. persistir evento idempotente;
4. responder rapidamente ao provedor;
5. normalizar;
6. persistir mensagem/status;
7. só então acionar ANA/automação.

### Dispatch

1. claim transacional;
2. validar runtime;
3. revalidar opt-out para marketing;
4. resolver provider;
5. enviar;
6. persistir retorno externo e `wamid`;
7. aguardar webhooks para estados posteriores;
8. retry apenas quando a falha for temporária.

---

## 17. Segurança

- token Meta somente server-side;
- webhook com validação de autenticidade;
- bucket de mídia privado;
- novas tabelas operacionais com RLS quando expostas;
- sem grants diretos a `anon` para mutações;
- nenhuma credencial em HTML/JS;
- logs sem tokens;
- envio Meta bloqueado por runtime até homologação.

A V1 não reintroduz senha digitada no Vitrine/Admin. Ações externas continuam passando por backend e pelo perímetro operacional do Admin; eventual endurecimento desse perímetro deve respeitar o requisito de não exigir senha digitada.

---

## 18. Idempotência

Inbound Meta/PapoAI:

- preferir `(conta, provider, provider_message_id)`;
- usar provider event ID/hash para o envelope do webhook.

Outbound:

- toda intenção possui `idempotency_key` determinística.

Exemplos:

- `ana:{rule}:{inbound_message}`;
- `campaign:{campaign}:{customer}`;
- `repurchase:{customer}:{order}`.

Status repetido não produz efeitos duplicados. Regra one-shot não executa duas vezes para o mesmo evento.

---

## 19. Erros

- webhook inválido não aciona negócio;
- cliente ambíguo não é mesclado automaticamente;
- conversa pode existir temporariamente sem `customer_id`;
- identidade usa telefone exato, nunca aproximação por nome;
- falha de mídia não perde mensagem;
- falha de IA cai para regra/humano;
- retry externo é limitado;
- falha permanente não entra em loop.

---

## 20. Coexistência com PapoAI

Durante a construção, o PapoAI segue como transporte produtivo.

Eventos PapoAI passam a alimentar o núcleo canônico em **shadow mode**:

- grava histórico;
- testa normalização e ANA em dry-run;
- não envia segunda resposta;
- não altera comportamento do cliente.

Não haverá dois motores respondendo simultaneamente à mesma conversa.

Backfill só importa informação comprovável. Mensagens outbound antigas não serão inventadas. Registros importados serão identificados como origem legada.

---

## 21. Migração

### Fase A — Fundação

Tabelas canônicas, RLS, idempotência, adapter PapoAI shadow e Admin leitura.

### Fase B — Histórico e ANA dry-run

Mensagens, mídia, transcrição e comparação de decisões sem envio novo.

### Fase C — Templates, outbox, automações e campanhas

Tudo ainda com gates desligados para Meta produtivo.

### Fase D — Meta homologação

Por número:

- credenciais;
- IDs corretos;
- webhook;
- inbound controlado;
- outbound para contato de teste;
- template;
- mídia;
- correlação `wamid`;
- estados `sent/delivered/read/failed`.

### Fase E — Cutover de um número

Somente com checklist verde. Alterar `whatsapp_channel_runtime_v1` para Meta naquele canal.

### Fase F — Segundo número

Repetir homologação e cutover independentemente.

### Fase G — Limpeza

Só depois dos dois canais estáveis e com logs demonstrando ausência de dependência PapoAI.

---

## 22. Rollback

Por canal:

1. desligar Meta outbound;
2. restaurar provider PapoAI enquanto disponível;
3. restaurar inbound conforme configuração operacional;
4. preservar todos os eventos/mensagens gravados;
5. investigar usando conta, mensagem, `wamid` e outbox.

Nenhum rollback depende de migration destrutiva.

---

## 23. Testes obrigatórios

### Banco

- inbound duplicado;
- outbound duplicado;
- criação/reuso de conversa;
- identidade ambígua;
- status fora de ordem;
- opt-out;
- claim concorrente de outbox;
- retry;
- rollback transacional.

### PapoAI shadow

Evento real normaliza uma vez sem gerar envio duplicado.

### Meta controlado

- texto inbound/outbound;
- template;
- áudio;
- imagem;
- `sent`;
- `delivered`;
- `read`;
- `failed`;
- webhook duplicado.

### ANA

Teste fixo com frases de saudação, cesta, pagamento, entrega, catálogo, cadastro, humano, opt-out e pergunta desconhecida.

### Campanha dinâmica

1. criar campanha futura;
2. mudar elegibilidade antes do horário;
3. resolver público no disparo;
4. comprovar inclusão/exclusão correta;
5. comprovar que opt-out não recebe outbox.

---

## 24. Critérios de aceitação da V1

1. 0975 e 1018 têm estado independente no Admin.
2. Conversas e mensagens estão em estrutura canônica.
3. Duplicidade inbound/outbound é bloqueada.
4. `wamid` é persistido e correlacionado.
5. Estados Meta aparecem corretamente no histórico.
6. Áudio é reproduzível no Admin e transcrito quando habilitado.
7. ANA resolve o básico sem depender sempre de IA.
8. Humano pode assumir/devolver conversa.
9. Templates têm status Meta visível.
10. Recompra reutiliza o estado atual.
11. Campanha reavalia público no momento do envio.
12. Opt-out bloqueia marketing inclusive entre resolução e dispatch.
13. PapoAI pode permanecer ativo durante shadow sem resposta duplicada.
14. Cada canal pode migrar e voltar independentemente.
15. Nenhum segredo Meta aparece no frontend.
16. Cutover só ocorre após testes controlados.

---

## 25. Fora de escopo da V1

- omnichannel Instagram/Messenger;
- editor visual de chatbot;
- IA autônoma de vendas;
- CRM paralelo;
- lead scoring complexo;
- múltiplas filas de call center;
- fechamento automático de pedido por texto livre;
- migração simultânea obrigatória dos dois números.

---

## 26. Ordem de implementação

1. núcleo de dados e segurança;
2. testes SQL/idempotência;
3. adapter PapoAI shadow;
4. Admin WhatsApp leitura;
5. histórico + mídia + transcrição;
6. ANA determinística dry-run;
7. templates;
8. outbox;
9. automações/recompra;
10. campanhas;
11. adapter Meta/webhook;
12. homologação controlada;
13. piloto do primeiro número;
14. cutover do primeiro número;
15. observação e gate;
16. segundo número;
17. limpeza de legado comprovadamente órfão.

Arquivos, migrations, testes e commits exatos serão definidos no plano de implementação após aprovação desta especificação.

---

## 27. Referências internas

- `docs/ARCHITECTURE.md`
- `docs/RUNTIME-INVENTORY.md`
- `docs/projects/dona-antonia-operations-2/PROJECT-MASTER.md`
- `docs/projects/dona-antonia-operations-2/R8-PAPOAI-WHATSAPP-CHECKPOINT.md`
- `supabase/sql/20260930_marketing_repurchase_10d_canonical_v1.sql`

Referência externa validada em 2026-09-30: documentação oficial Meta WhatsApp Business Platform / Cloud API para webhooks e estados de mensagens.

---

## 28. Gate

Este documento aprova apenas o desenho técnico.

Ele não autoriza:

- desconectar PapoAI;
- mudar provider produtivo;
- enviar mensagem para cliente real;
- habilitar Meta outbound;
- apagar legado.

Após revisão desta especificação, a próxima etapa é criar o plano de implementação detalhado e executável.
