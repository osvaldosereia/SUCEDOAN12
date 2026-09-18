# Customer & Marketing OS — CM-1.2 Identity Resolver

Atualizado em 18/09/2026.

Status: **IMPLEMENTAÇÃO V1 ATIVA EM OBSERVE / FAIL-CLOSED**.

## Objetivo

Unificar a identificação do cliente entre WhatsApp, Comprar, Bling e canais futuros sem criar CRM paralelo e sem unir pessoas apenas por nome.

## Implementado

### 1. Resolver determinístico

Função canônica:

`resolve_customer_identity_v1`

Sinais suportados:

- telefone normalizado;
- CPF/CNPJ;
- Bling contact id;
- identidade externa de canal;
- conta canônica do canal.

Decisões:

- `matched`;
- `unmatched`;
- `conflict`.

O resolver **não cria cliente, não faz merge e não confirma identidade sozinho**.

Conflitos são fail-closed.

### 2. Auditoria de resolução

Tabela:

`customer_identity_resolution_evaluations`

Armazena:

- decisão;
- customer_id quando há match único;
- confiança;
- escopo de confiança;
- origem;
- canal;
- fingerprint SHA-256 dos sinais;
- evidências estruturadas;
- timestamp.

A tabela é server-only com RLS e sem policies para anon/authenticated.

### 3. Confidence v1

Regras iniciais determinísticas:

- canal verificado já ligado: 1.00;
- documento exato: 0.99;
- Bling contact id exato: 0.99;
- telefone exato/variante única: 0.92;
- identidade de canal observada já ligada: 0.90;
- dois ou mais sinais concordantes: pequeno reforço limitado a 1.00;
- conflito: 0.00.

Esses valores são confiança de **resolução de identidade**, não score comercial.

### 4. Conta canônica do WhatsApp

`channel_accounts` agora possui uma conta WhatsApp canônica projetada do cadastro operacional existente.

Gates mantidos:

- inbound = true;
- AI = false;
- auto reply = false;
- outbound = false;
- canary = 0;
- Meta direct ready = false.

Criar a conta canônica **não ativa envio nem troca o provedor atual**.

### 5. Identity Graph inicial

Os telefones WhatsApp primários já canônicos foram projetados para `customer_channel_identities`.

Regras:

- `identity_kind = e164`;
- `verification_status = observed`;
- vínculo preserva o customer_id já conhecido pelo cadastro;
- não é marcado como `verified` só porque existe no CRM.

A verificação de provedor continuará sendo uma etapa distinta.

### 6. Observer de identidade

Função:

`observe_customer_channel_identity_v1`

Responsabilidade:

- observar/atualizar identidade externa;
- preservar vínculos existentes;
- registrar evidence/source;
- nunca promover para verified automaticamente.

### 7. PapoAI integrado ao Identity Resolver

`papo-comprar-webhook-v1` agora:

1. valida o webhook;
2. identifica a conta canônica WhatsApp;
3. resolve o cliente pelo Identity Resolver;
4. observa a identidade WhatsApp;
5. grava o id da identidade no contexto;
6. continua abrindo a Sala de Compra.

A versão implantada permanece com autenticação própria por token de webhook.

Se houver conflito de identidade, o resolver não escolhe arbitrariamente um cliente.

## Smoke tests executados

Cenários testados no banco:

- telefone real com um único match → matched;
- telefone + documento pertencentes a clientes diferentes → conflict;
- Bling id inexistente → unmatched;
- telefone + identidade de canal observada concordantes → matched com dois sinais.

O último teste retornou o mesmo customer_id esperado e confiança 0.93.

## Correção durante a implantação

O primeiro bootstrap usou o rótulo `whatsapp_user`, mas o contrato existente de `customer_channel_identities` aceita `e164/igsid/psid/web_subject/email/other`.

A tentativa falhou por constraint e foi revertida automaticamente pela migration.

Foi criada a correção `cm_1_2_identity_kind_compat_v2` e o bootstrap final usa `e164`.

Nenhum dado parcial da tentativa inválida permaneceu.

## Próximos passos

1. adicionar monitor de conflitos no Admin seguro;
2. trazer avaliações de identidade para o Customer 360;
3. observar eventos PapoAI/Meta no event core;
4. criar confirmação segura de identidade usando evidência real do provedor;
5. usar o resolver também nos adapters futuros da Meta direta;
6. não migrar para automerge por IA.
