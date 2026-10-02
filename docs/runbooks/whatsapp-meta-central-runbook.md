# Runbook — Central WhatsApp própria via Meta Cloud API

**Projeto:** Dona Antônia  
**Supabase:** `ssbesxgaijknwsjbsbcz`  
**Escopo:** migração gradual do transporte de atendimento; checkout público fora de escopo.

## 1. Princípios operacionais

- Supabase é a fonte canônica do atendimento.
- Migração por canal, começando no 1018.
- PapoAI permanece como fallback/sombra até a retirada formal.
- `human_send_enabled` e `homologated_at` permanecem fail-closed até canário.
- Nenhum token Meta, App Secret ou verify token pode aparecer no frontend, GitHub, logs ou documentação.
- `wamid` será a identidade externa canônica dos envios próprios.
- Timeout de resultado incerto nunca autoriza retry cego.
- Checkout, estoque, Bling e criação de pedido não fazem parte deste runbook.

## 2. Baseline observado em 2026-10-02

### Runtime

| Canal | send_enabled | human_send_enabled | homologated_at | inbound_provider | outbound_provider |
| --- | --- | --- | --- | --- | --- |
| 0975 | true | false | null | papoai | papoai |
| 1018 | true | false | null | papoai | papoai |

### Histórico canônico

Contagem observada no início do Task 0:

| Canal | Direção | Mensagens |
| --- | --- | ---: |
| 0975 | inbound | 1531 |
| 0975 | outbound | 146 |
| 1018 | inbound | 328 |
| 1018 | outbound | 23 |

Esses números são apenas baseline temporal e naturalmente continuarão crescendo.

### Human attendance outbox

No baseline, não havia linhas `purpose='human_attendance'` em `whatsapp_outbox_v1`.

### Constraints confirmadas

- `whatsapp_channel_runtime_v1.outbound_provider`: aceita `papoai`, `meta`, `disabled`.
- `whatsapp_channel_runtime_v1.inbound_provider`: aceita `papoai`, `meta`.
- `whatsapp_outbox_v1.provider`: aceita `papoai`, `meta`.
- status atuais de outbox: `queued`, `claimed`, `sent`, `failed`, `cancelled`.

Não é necessário alterar essas constraints no Task 1.

## 3. Segurança / secrets

### Antes de qualquer canário real

- [ ] Revogar tokens temporários Meta que apareceram em capturas durante a investigação.
- [ ] Gerar token de usuário de sistema apropriado para produção.
- [ ] Armazenar token somente em secret store server-side.
- [ ] Armazenar App Secret somente server-side.
- [ ] Gerar verify token exclusivo do webhook e armazenar server-side.
- [ ] Confirmar permissões mínimas necessárias.
- [ ] Rodar `node scripts/test-whatsapp-meta-no-secrets-v1.mjs`.
- [ ] Confirmar que logs não exibem `Authorization` nem bearer token.

**Observação:** rotação/revogação de credenciais é ação de segurança externa e não é executada automaticamente por este branch de código.

## 4. Identificadores não secretos confirmados

### 0975

- phone: `+5565998150975`
- WABA ID: `1497253794754816`
- Phone Number ID: `945659128620084`

### 1018

- phone: `+5565984491018`
- WABA ID: `840102181903253`
- Phone Number ID: `1218939807961094`

### App próprio

- app: `cell principal`
- App ID: `1547249776748513`

## 5. Gates de segurança

Antes de homologação:

```text
send_enabled=true
human_send_enabled=false
homologated_at=null
outbound_provider=papoai
```

Para canário futuro de um canal:

1. código do adapter Meta e webhook já testados;
2. secrets server-side válidos;
3. subscription correta;
4. destino de teste explicitamente autorizado;
5. mudar provider/gate somente daquele canal;
6. enviar uma única mensagem controlada;
7. confirmar `wamid`, histórico, entrega e dedupe;
8. rollback imediato se qualquer invariável falhar.

## 6. Rollback padrão por canal

```text
human_send_enabled=false
-> parar claims novos
-> preservar outbox/mensagens/logs
-> voltar ao fallback Copiar resposta + Abrir PapoAI
-> não reenviar evento uncertain
-> investigar por correlation ID/wamid
```

## 7. Verificações obrigatórias antes de promover uma fase

- testes novos PASS;
- testes existentes da Central PASS;
- nenhuma alteração no checkout;
- nenhum segredo versionado;
- runtime do canal esperado;
- nenhuma mensagem em canal errado;
- nenhuma duplicidade;
- destino derivado da conversa server-side;
- janela de 24h preservada;
- rollback disponível.

## 8. Funções legadas que não devem ser reativadas

Não usar como base de produção sem nova decisão arquitetural:

- `whatsapp-meta-direct-v1`
- `admin-whatsapp-direct-v1`
- `whatsapp-ingest`
- `whatsapp-ingest-make-v1`
- `conversation-worker-v3`
- `dona-antonia-agent-core-v1`

Algumas aparecem como `ACTIVE` no Supabase, mas o código implantado foi deliberadamente aposentado/410 em fases anteriores.

## 9. Incidente de envio

Se um operador reportar mensagem duplicada, canal errado ou envio incerto:

1. desligar `human_send_enabled` do canal afetado;
2. não apagar a outbox;
3. localizar `outbox_id`, `conversation_id`, provider e `provider_message_id`/wamid;
4. conferir status Meta/webhook;
5. não repetir manualmente até saber se a primeira tentativa foi aceita;
6. preservar logs e evidências;
7. documentar causa e correção antes de reativar.
