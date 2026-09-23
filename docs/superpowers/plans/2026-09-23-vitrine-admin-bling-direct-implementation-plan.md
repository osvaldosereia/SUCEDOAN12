# Implementation Plan — Vitrine/Admin + Bling direto, sem Make

**Data:** 2026-09-23  
**Design:** `docs/superpowers/specs/2026-09-23-vitrine-admin-bling-direct-no-make-design.md`

## Regra de execução

- Make não será usado no novo runtime.
- Nada será apagado dentro do Make nesta fase.
- Objetos antigos do Supabase só serão removidos após migração, prova de zero dependência e janela de observação.
- Toda escrita externa no Bling começa desligada.
- Filas antigas Bling serão congeladas antes de qualquer ativação nova.
- Cada fase termina com teste, advisor e checkpoint no GitHub.

## Fase A — Fundação e isolamento

### A1. Congelar filas Bling antigas
Arquivos:
- nova migration `supabase/migrations/*_bling_hub_v2_foundation.sql`

Ações:
- criar singleton `bling_hub_runtime_v2`;
- `legacy_queues_frozen=true` por padrão;
- manter `products_enabled=false`;
- manter `stock_enabled=false`;
- manter `customers_enabled=false`;
- manter `orders_enabled=false`;
- manter `fiscal_enabled=false`;
- substituir `claim_bling_commands_by_types` para retornar erro fail-closed quando legado estiver congelado;
- substituir `claim_order_sync_jobs` para não reclamar jobs quando legado estiver congelado;
- não alterar os 330 comandos e 25 jobs existentes.

Teste:
- contagens antes/depois idênticas;
- claims retornam zero/erro controlado;
- nenhuma linha muda para processing.

### A2. Criar fila nova versionada
Criar:
- `bling_hub_jobs_v2`;
- `bling_hub_entity_links_v2`;
- `bling_hub_audit_v2`;
- índices e RLS;
- RPC de enqueue idempotente;
- RPC de claim com `FOR UPDATE SKIP LOCKED`;
- RPC de finish/retry/review;
- nenhum worker ativo ainda.

### A3. Cliente Bling server-side
Criar:
- `supabase/functions/bling-hub-v2/index.ts`;
- módulo compartilhado de OAuth/rate-limit;
- leitura de credenciais pelo RPC `get_bling_api_credentials_v1`;
- refresh JWT com `enable-jwt: 1`;
- persistência do refresh token rotacionado;
- limite global conservador;
- health/readiness sem escrita em cadastro do Bling;
- endpoints de escrita bloqueados pelos flags do runtime.

### A4. Readiness no admin
Adicionar no `vitrine/admin`:
- aba/área Integrações → Bling;
- conexão;
- credenciais presentes;
- filas antigas congeladas;
- filas novas;
- switches somente leitura inicialmente;
- nenhum botão de escrita externa nesta fase.

## Fase B — Produtos e estoque

### B1. Reconciliação read-only de produtos
- exportar GTIN/SKU dos produtos ativos qxst;
- consultar Bling por GTIN exato;
- preencher `bling_hub_entity_links_v2`;
- estados: matched, not_found, ambiguous, review;
- nunca criar produto automaticamente.

### B2. Atualização de produto canário
- montar payload mínimo;
- preservar campos fiscais não administrados pela Vitrine;
- um produto allowlisted;
- PUT no Bling;
- GET de confirmação;
- auditoria.

### B3. Cadastro de produto novo
- ação manual "Cadastrar no Bling";
- validação de GTIN duplicado;
- POST idempotente por reconciliação;
- vincular ID retornado.

### B4. Estoque
- saldo qxst é autoridade operacional;
- mapear depósito;
- enviar saldo absoluto;
- consolidar jobs do mesmo produto;
- canário de um produto;
- webhook/divergência depois.

## Fase C — Clientes

- usar CRM canônico ssbes;
- vincular por bling_contact_id, depois CPF/CNPJ exato;
- create/update;
- endereço;
- emailNotaFiscal;
- estados de sync no admin;
- canário.

## Fase D — Pedidos

- bridge qxst → Hub;
- criar job na primeira separação;
- resolver cliente/produtos;
- draft validado;
- idempotency/external key;
- POST;
- reconciliação após timeout;
- update/cancel;
- mostrar Bling ID no pedido.

## Fase E — Webhooks

- endpoint dedicado;
- HMAC X-Bling-Signature-256;
- inbox;
- dedupe;
- processamento assíncrono;
- produto/estoque/pedido/NF-e;
- evitar loops.

## Fase F — Fiscal

- descobrir/configurar modelo, série, natureza, unidade, regras tributárias;
- readiness;
- preview;
- emissão manual;
- autorização;
- captura status/chave/PDF/XML;
- canário real único.

## Fase G — Make zero

Somente depois do runtime substituto validado:
- retirar chamadas Make do código ativo;
- migrar/adaptar qualquer fluxo ainda dependente;
- manter Make externo intocado até decisão explícita;
- depois remover apenas referências locais seguras.

## Fase H — Limpeza Supabase

Para cada candidato:
1. busca GitHub;
2. dependências SQL;
3. triggers;
4. cron;
5. Edge Functions;
6. configurações;
7. contagem/dado histórico;
8. classificação KEEP/MIGRATE/DEPRECATE/DELETE/ARCHIVE_DATA;
9. migration com RESTRICT;
10. regressão + advisors.

Nunca usar DROP CASCADE na limpeza operacional.

## Ordem da execução desta rodada

1. A1 foundation + congelamento.
2. A2 fila v2.
3. A3 edge Bling Hub somente health/readiness.
4. A4 status no vitrine/admin.
5. testes e checkpoint.
