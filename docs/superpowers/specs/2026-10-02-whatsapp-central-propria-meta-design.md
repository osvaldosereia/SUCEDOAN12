# Central WhatsApp Própria via Meta Cloud API — Design

**Data:** 2026-10-02  
**Status:** aprovado para planejamento técnico; implementação ainda não iniciada  
**Escopo:** Central de Atendimento do Vitrine/Admin, canais 0975 e 1018  
**Fora de escopo desta fase:** checkout público, criação de pedidos, Bling, separação, estoque e demais fluxos comerciais

## 1. Decisão executiva

A Central de Atendimento atual será preservada como interface e como base operacional. Não será reconstruída do zero.

A migração proposta substitui, de forma gradual e reversível, o transporte de mensagens humanas atualmente dependente do PapoAI por uma integração própria com a **Meta WhatsApp Cloud API**.

Arquitetura-alvo:

```text
Admin Dona Antônia
       ↕
Supabase (verdade canônica)
       ↕
Meta WhatsApp Cloud API
       ↕
WhatsApp 0975 / 1018
       ↘
        ANA própria, controlada pelo Supabase

PapoAI = sombra/fallback temporário durante a migração; removido apenas ao final.
```

A migração deve ser feita por **adapters + feature gates por canal**, com testes automáticos, canário controlado e rollback simples. Não haverá corte grande de uma vez.

## 2. Evidência que mudou a decisão técnica

Em 2026-10-02 foi feita uma homologação controlada usando o número 1018 como emissor e o 0975 como destinatário, ambos pertencentes à Dona Antônia.

Fatos comprovados:

1. O app Meta próprio `cell principal` conseguiu acessar a WABA real do 1018 usando usuário de sistema autorizado.
2. O POST oficial da Cloud API para o Phone Number ID do 1018 foi aceito pela Meta e retornou um `wamid`.
3. A mensagem `TESTE META DIRETO 1018` chegou ao WhatsApp 0975.
4. O PapoAI do lado receptor 0975 recebeu a mensagem normalmente.
5. O Admin/Supabase do lado receptor registrou a mensagem normalmente.
6. O PapoAI do lado emissor 1018 **não** exibiu a mensagem enviada diretamente pela Meta.
7. O Supabase também não possuía, automaticamente, o registro de saída do 1018, pois hoje a captura de outbound depende do `message.sent` do PapoAI.

Conclusão: o envio Meta direto é tecnicamente viável, mas **o PapoAI não pode continuar sendo a fonte canônica do histórico do emissor** quando a Dona Antônia começar a enviar pelo próprio app.

Portanto, em todo envio próprio aceito pela Meta, o backend Dona Antônia deverá persistir imediatamente a mensagem outbound canônica usando o `wamid` retornado e depois reconciliar `sent`, `delivered`, `read` e `failed` pelos webhooks da Meta.

## 3. Ativos Meta confirmados

### Business Portfolio

- Nome: `Super Cestas Cuiabá`
- Business ID: `1055822571753443`
- Empresa verificada

### Canal 0975

- Número: `+5565998150975`
- WABA ID: `1497253794754816`
- Phone Number ID: `945659128620084`
- Plataforma: `CLOUD_API`
- Qualidade observada: alta/green
- App inscrito observado: Papo AI

### Canal 1018

- Número: `+5565984491018`
- WABA ID: `840102181903253`
- Phone Number ID: `1218939807961094`
- Plataforma: `CLOUD_API`
- Qualidade observada: alta/green
- Apps inscritos observados: Papo AI + `cell principal`

### App Meta próprio

- Nome: `cell principal`
- App ID: `1547249776748513`
- Permissões relevantes confirmadas:
  - `whatsapp_business_management`
  - `whatsapp_business_messaging`
- Usuário de sistema da empresa possui acesso aos ativos necessários.

**Regra de segurança:** nenhum token, App Secret, verify token ou URL secreta deve ser versionado no GitHub, inserido em documentação ou exposto no frontend.

## 4. Estado atual da Central

A Central v2 já possui uma base reaproveitável significativa:

- seletor independente 0975 / 1018;
- fila de conversas;
- histórico cronológico;
- inbound e outbound capturados quando passam pelo PapoAI/mobile;
- janela de atendimento de 24h;
- etiquetas;
- respostas rápidas;
- contexto de cliente/pedidos;
- composer de resposta;
- gateway autenticado `admin-whatsapp-ops-v1`;
- outbox e idempotência já desenhados;
- botão Enviar com bloqueio de homologação;
- fallback `Copiar resposta` + `Abrir PapoAI`.

O bloqueio atual é correto e deve permanecer até o novo transporte Meta estar homologado.

## 5. Reaproveitar x substituir

| Componente | Decisão | Observação |
| --- | --- | --- |
| `vitrine/admin/atendimento/*` | Reaproveitar | UI existente continua sendo a Central |
| `whatsapp_messages_v1` | Reaproveitar/evoluir | permanece histórico canônico |
| `conversations` | Reaproveitar | janela 24h, modo humano/IA, cliente e canal |
| `whatsapp_accounts` | Reaproveitar | WABA e Phone Number IDs corretos |
| `whatsapp_outbox_v1` | Reaproveitar/evoluir | tornar provider-neutral via RPC v3 |
| `whatsapp_channel_runtime_v1` | Reaproveitar/evoluir | gates por canal e provider `meta` |
| `admin-whatsapp-ops-v1` | Reaproveitar | gateway continua; transport adapter muda |
| `_shared/whatsapp-core-v1.mjs` | Reaproveitar | já possui normalização Meta e status |
| captura `message.received/message.sent` do PapoAI | Sombra temporária | útil na transição, não canônica após corte |
| RPCs `*_attendance_*_v2` PapoAI-hardcoded | Substituir por v3 | não alterar destrutivamente antes do canário |
| `whatsapp-meta-direct-v1` legado | Não usar | função aposentada intencionalmente (HTTP 410) |
| `admin-whatsapp-direct-v1` legado | Não usar | função aposentada intencionalmente (HTTP 410) |
| `conversation-worker-v3` legado | Não usar | IA antiga aposentada (HTTP 410) |
| `dona-antonia-agent-core-v1` legado | Não usar | agente antigo aposentado (HTTP 410) |
| `admin-service-intelligence-*` | Reaproveitar como copiloto | não confundir com ANA conversacional |
| checkout/site público | Não tocar | isolado desta migração |

## 6. Arquitetura de outbound própria

### 6.1 Fluxo humano

```text
Admin composer
  -> admin-whatsapp-ops-v1
  -> RPC enqueue v3 (provider-neutral)
  -> outbox queued
  -> claim v3
  -> adapter Meta
  -> POST /{phone_number_id}/messages
  -> Meta retorna wamid
  -> persistir outbound canônico imediatamente
  -> marcar outbox accepted/sent-pending-status
  -> webhook de status reconcilia sent/delivered/read/failed
```

### 6.2 Propriedades obrigatórias

- idempotência por tentativa do cliente/Admin;
- validação da conversa e do canal;
- validação do destino contra `wa_contact_e164` da conversa;
- bloqueio de texto livre fora da janela de 24h;
- rate limit;
- timeout curto e sem retry cego quando o resultado for incerto;
- persistência do `wamid` antes de sinalizar sucesso definitivo à UI;
- dedupe por `provider_message_id=wamid`;
- logs estruturados sem conteúdo sensível desnecessário;
- audit trail de operador quando disponível.

### 6.3 Estados sugeridos da outbox

O esquema existente deve ser preservado quando possível, mas o fluxo precisa distinguir no mínimo:

- `queued`
- `claimed`
- `accepted` (Meta respondeu com wamid)
- `sent`
- `delivered`
- `read`
- `failed`
- `uncertain` (timeout após possível envio; exige reconciliação, não retry automático cego)
- `cancelled`

Se alterar enum/status existente for arriscado, mapear esses estados em metadata/status event sem quebrar consumidores atuais.

## 7. Histórico canônico e deduplicação

A identidade externa canônica é o `wamid`.

Regras:

1. Mensagem enviada pelo nosso backend deve ser inserida em `whatsapp_messages_v1` logo após resposta Meta bem-sucedida.
2. `provider='meta'` para envios próprios.
3. `sender_kind='human'` quando disparada pelo operador autenticado; para ANA própria, `sender_kind='ai'`.
4. O mesmo `wamid` nunca pode criar duas mensagens.
5. Webhook posterior de status só atualiza o estado da mensagem existente.
6. Se, durante a coexistência, o PapoAI reportar o mesmo `wamid`, ele deve ser reconciliado/deduplicado, não duplicado.
7. Mensagens mobile/coexistência devem continuar podendo entrar como eventos Meta/PapoAI, com origem registrada em metadata.

## 8. Webhook Meta próprio

Criar uma função nova e limpa, por exemplo:

`supabase/functions/whatsapp-meta-webhook-v1/index.ts`

Responsabilidades:

- responder ao challenge de verificação GET da Meta;
- validar assinatura de POST usando App Secret (`X-Hub-Signature-256`);
- identificar conta por `phone_number_id`, nunca apenas por telefone textual;
- normalizar inbound usando `canonicalMessagesFromMeta(...)` já existente;
- normalizar status usando `statusEventsFromMeta(...)` já existente;
- deduplicar pelo `wamid`/chave do evento;
- persistir mensagens e status de forma transacional/idempotente;
- não executar IA dentro da request do webhook;
- enfileirar trabalho de IA separadamente;
- responder rapidamente 200 após validação/persistência mínima.

### Ordem de inscrição

1. preparar endpoint e testes;
2. configurar segredo e verify token server-side;
3. homologar primeiro no 1018, que já possui `cell principal` inscrito;
4. só depois inscrever o app próprio na WABA 0975;
5. manter PapoAI inscrito durante período de sombra;
6. retirar PapoAI somente na fase final.

## 9. Tokens e segurança

Tokens temporários foram visíveis em capturas durante a investigação e devem ser tratados como comprometidos.

Antes de produção:

- revogar/invalidar tokens temporários expostos;
- gerar token de usuário de sistema apropriado para produção;
- armazenar somente server-side em secret store apropriada do Supabase;
- armazenar App Secret e verify token server-side;
- nunca enviar token ao navegador;
- nunca escrever token em logs;
- rotação documentada;
- princípio de menor privilégio;
- webhook com validação de assinatura obrigatória;
- rotas administrativas continuam autenticadas;
- mensagens de erro não revelam segredo, token ou payload sensível.

## 10. Templates e janela de 24 horas

Texto livre continua permitido somente na janela de atendimento aplicável.

Fora da janela:

- o composer de texto livre deve permanecer bloqueado;
- operador escolhe template aprovado;
- templates são consultados/sincronizados por WABA;
- idioma, nome, categoria, status e parâmetros são validados antes do envio;
- não duplicar templates por conveniência se um aprovado já atende ao caso.

A Central deve exibir claramente por que texto livre está bloqueado e oferecer templates quando aplicável.

## 11. Mídia

### Inbound

Suportar gradualmente:

- imagem;
- áudio/voz;
- documento;
- vídeo;
- sticker;
- localização;
- contato, quando necessário.

Metadados canônicos devem ficar no banco; bytes devem ser baixados server-side e armazenados de forma privada quando precisarmos de retenção própria.

### Outbound

Fluxo:

1. Admin faz upload para backend privado;
2. backend valida MIME/tamanho;
3. backend envia/upload pela Meta;
4. mensagem canônica é registrada com `wamid`;
5. URL/arquivo privado é apresentado ao Admin por rota autenticada.

Não tornar buckets de mídia pública apenas para simplificar a UI.

## 12. Atendimento humano e ANA própria

O banco já possui campos úteis em `conversations`, incluindo:

- `mode`;
- `human_takeover_at`;
- `ai_resume_at`;
- `assigned_admin_user_id`;
- `last_human_message_at`.

Eles devem virar o contrato oficial de controle humano/IA.

Estados mínimos:

- `ai`: ANA pode responder;
- `human`: ANA não responde;
- `paused`: nenhuma automação responde até ação explícita;
- opcional `hybrid/suggest`: IA só sugere resposta ao operador.

Ações visíveis na Central:

- **Assumir atendimento**;
- **Voltar para ANA**;
- indicação clara de quem está controlando a conversa.

### ANA própria

A ANA não deve ser implementada como extensão do copiloto administrativo.

Criar um agente conversacional próprio, com:

- persona ANA;
- regras comerciais Dona Antônia;
- contexto de cliente;
- histórico canônico da conversa;
- catálogo/preço/estoque;
- pedidos e status;
- respostas curtas e simples;
- no máximo uma pergunta por vez quando necessário;
- anti-loop;
- idempotência;
- bloqueio absoluto quando `mode='human'`;
- saída sempre pela mesma outbox Meta, nunca por atalho paralelo.

As funções antigas de IA aposentadas não devem ser reativadas.

## 13. Estratégia de migração

### Fase A — sombra

- PapoAI continua operando.
- Webhook próprio captura Meta e mede paridade.
- Nenhum cliente real recebe mensagens do novo transporte sem canário explícito.

### Fase B — envio humano 1018

- habilitar Meta outbound apenas no 1018;
- manter fallback;
- monitorar erro, duplicidade, latência e status;
- Admin/Supabase já é fonte canônica dos próprios sends.

### Fase C — envio humano 0975

- inscrever app próprio na WABA 0975;
- repetir homologação;
- habilitar gate apenas após aceite.

### Fase D — templates e mídia

- substituir dependências restantes do PapoAI para operação humana.

### Fase E — ANA própria

- primeiro sugestão/dry-run;
- depois canário em conversas controladas;
- só então automação real.

### Fase F — retirada do PapoAI

Só retirar PapoAI após ambos os canais passarem por:

- inbound;
- outbound humano;
- status;
- templates;
- mídia essencial;
- takeover humano;
- ANA própria ou decisão explícita de operar somente humano;
- observabilidade e rollback testados.

## 14. Rollback

Rollback deve ser por canal, não global.

Em qualquer fase:

1. desabilitar `human_send_enabled` do canal afetado;
2. impedir novos claims Meta;
3. manter histórico já gravado;
4. reativar fallback `Copiar resposta` + `Abrir PapoAI`;
5. não apagar mensagens nem tentar reenviar automaticamente eventos `uncertain`;
6. manter PapoAI inscrito até concluir investigação;
7. documentar incidente e preservar logs/correlation IDs.

Nenhuma migração deve exigir rollback do checkout público.

## 15. Isolamento explícito do checkout

Durante as fases de transporte/atendimento, **não modificar**:

- `shopping-checkout-v2`;
- `shopping-chat-checkout-v2`;
- `storefront-v2`;
- frontend público do checkout;
- criação/registro do pedido;
- confirmação de pedido;
- estoque;
- Bling.

Integrações pós-pedido podem consumir eventos do pedido, mas a Central não deve se tornar dependência síncrona do checkout.

## 16. Não objetivos / proibições

- não reativar Edge Functions legadas que retornam 410;
- não usar Make;
- não usar endpoint privado/reverse-engineered do PapoAI;
- não armazenar token no repositório;
- não liberar botão Enviar apenas trocando boolean de gate;
- não enviar duas vezes quando houver timeout incerto;
- não inferir que uma mensagem PapoAI `message.sent` foi humana ou IA sem evidência confiável;
- não remover PapoAI da WABA antes do corte final;
- não misturar código de atendimento com checkout público;
- não executar big-bang em 0975 e 1018 ao mesmo tempo.

## 17. Observabilidade obrigatória

Métricas/eventos mínimos:

- outbound enqueued;
- outbound claimed;
- Graph accepted + wamid;
- send failed;
- send uncertain;
- delivered/read/failed;
- inbound recebido;
- webhook signature failure;
- duplicate suppressed;
- queue age;
- status sem mensagem correspondente;
- AI generated / AI suppressed by human mode;
- canal e correlation ID em todos os eventos, sem expor conteúdo desnecessário.

A Central deve ter, no mínimo, indicação operacional de falha de envio e possibilidade segura de tentar novamente quando for comprovadamente seguro.

## 18. Critérios de aceite finais

O projeto só é considerado concluído quando:

1. 0975 e 1018 enviam texto pelo Admin via Meta Cloud API.
2. Texto livre respeita janela de 24h.
3. Templates funcionam fora da janela.
4. Inbound entra diretamente da Meta e aparece uma única vez.
5. Outbound próprio aparece imediatamente no Admin, com `wamid` canônico.
6. Status sent/delivered/read/failed são reconciliados.
7. Duplicidade Meta/PapoAI/coexistência é suprimida.
8. Mídia essencial funciona nos dois sentidos.
9. Takeover humano bloqueia a ANA imediatamente.
10. ANA própria usa contexto e mesma outbox Meta.
11. Tokens/segredos ficam somente server-side e podem ser rotacionados.
12. Rollback por canal foi testado.
13. Checkout público permanece independente e sem regressão.
14. PapoAI pode ser removido sem perda do atendimento essencial.

## 19. Decisão sobre documentos anteriores

Este design **substitui apenas a conclusão antiga de que transporte Meta direto não estava homologado/disponível**. A investigação de 2026-10-02 comprovou acesso oficial às WABAs e envio real via Cloud API.

As demais decisões válidas da Central v2 continuam: Supabase como verdade canônica, dois canais separados, janela de 24h, segurança, autenticação, dedupe, etiquetas, contexto e simplicidade operacional.

## 20. Referências técnicas verificadas

Usar como autoridade durante a implementação:

- documentação oficial Meta WhatsApp Business Platform / Cloud API;
- endpoint `/{Phone-Number-ID}/messages`;
- endpoint `/{WABA-ID}/subscribed_apps`;
- endpoint `/{WABA-ID}/message_templates`;
- webhooks `messages` e status;
- documentação de assinatura/verificação de webhooks da Meta;
- estado real do projeto Supabase e testes do repositório.

Não depender de tutoriais de terceiros quando houver documentação oficial equivalente.
