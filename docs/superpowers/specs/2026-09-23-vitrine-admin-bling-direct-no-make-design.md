# Vitrine/Admin + Bling direto, sem Make — Design

**Data:** 2026-09-23  
**Status:** design aprovado em conversa; aguardando revisão deste documento antes do plano de implementação.

## 1. Objetivo

Conectar o `vitrine/admin` diretamente ao Bling, sem Make em nenhuma parte do runtime da Dona Antônia, cobrindo:

- atualização de produtos;
- atualização de estoque;
- cadastro e atualização de clientes;
- envio e atualização de pedidos;
- preparação e emissão fiscal no Bling;
- webhooks de retorno do Bling;
- visibilidade operacional e retry no `vitrine/admin`;
- remoção segura de estruturas antigas sem uso nos Supabases.

A implementação deve preservar simplicidade no front-end, idempotência, auditoria, segurança e possibilidade de rollback.

## 2. Regra arquitetural obrigatória: Make = zero

Make deixa de ser componente permitido na arquitetura operacional.

Regras:

1. Nenhuma nova chamada para `hook.*.make.com`.
2. Nenhum novo cenário Make.
3. Nenhuma integração Bling via Make.
4. Nenhum fluxo WhatsApp, produto, cliente, pedido, estoque, fiscal ou marketing pode depender de Make.
5. Referências antigas no repositório só podem permanecer em documentação histórica quando claramente marcadas como legado; código/runtime ativo deve ser migrado ou removido.
6. Secrets, IDs de conexão e colunas específicas de Make no Supabase devem ser removidos somente depois que toda dependência ativa tiver sido migrada e validada.
7. A remoção de Make não autoriza alterar a integração atual com PapoAI. O provider ativo de WhatsApp observado na auditoria é `papoai`; a migração Make deve preservar esse caminho.

## 3. Estado encontrado na auditoria inicial

### 3.1 Supabase canônico `ssbesxgaijknwsjbsbcz`

Já contém a infraestrutura madura de Bling:

- credenciais Bling no Vault;
- `bling_commands`;
- `order_sync_jobs`;
- `bling_contact_id` em clientes;
- `bling_order_id` em pedidos;
- `bling_product_id` em produtos;
- funções de claim/finalização e geração de draft;
- infraestrutura fiscal: `fiscal_runtime_config`, `order_fiscal_controls`, `fiscal_issue_jobs`;
- funções de elegibilidade e preparação fiscal;
- importação e reconciliação de histórico Bling.

Estado operacional observado antes de qualquer implementação:

- `bling_order_sync_enabled = false`;
- `bling_order_homologation_only = true`;
- fiscal desativado;
- emissão fiscal desativada;
- 330 comandos Bling antigos pendentes;
- 25 jobs antigos de pedidos pendentes;
- 269 clientes já possuem `bling_contact_id`;
- 27 pedidos já possuem `bling_order_id`;
- 1.814 produtos canônicos, 1.787 com GTIN e 0 atualmente com `bling_product_id`.

Essas filas antigas não devem ser executadas automaticamente.

### 3.2 Supabase da Vitrine `qxstkwshuvplmmftrctj`

É a base operacional da Vitrine atual.

Estado observado:

- 1.670 produtos ativos;
- 1.646 com GTIN;
- 1.670 com SKU;
- 8 pedidos atuais;
- nenhuma estrutura Bling própria.

O `vitrine/admin` já usa o Supabase canônico para clientes/histórico, portanto não haverá duplicação de CRM no `qxst`.

### 3.3 Make ainda presente

No Supabase canônico ainda existem artefatos Make:

- secret Vault `dona_antonia_whatsapp_outbound_make_webhook`;
- `system_secrets.key_name = make_whatsapp_ingest`, ativo;
- `whatsapp_accounts.make_connection_id`;
- métricas `automation_usage.make_operations`;
- limites `automation_config.max_make_operations_per_event` e `daily_make_operations_soft_limit`;
- Edge Function `whatsapp-ingest-make-v1`;
- referências e testes no repositório.

Também foram encontrados webhooks Make hardcoded em áreas legadas do repositório, inclusive `cadastro`, `app-next`, `producao-v2` e partes de Caneca Fácil.

O provider WhatsApp ativo observado é `papoai` com status `temporary_active`. A remoção de Make deve preservar essa integração.

## 4. Arquitetura alvo

### 4.1 Autoridade por domínio

**Vitrine Supabase (`qxst`)**
- catálogo e estoque operacional da Vitrine;
- pedidos da Vitrine;
- separação/gôndolas/balanço;
- UI/ações do `vitrine/admin`.

**Supabase canônico (`ssbes`)**
- CRM e identidade de clientes;
- Hub de integração Bling;
- credenciais OAuth;
- filas de integração;
- auditoria;
- IDs externos;
- fiscal;
- webhooks Bling;
- rate limit global;
- reconciliação.

**Bling**
- ERP oficial;
- cadastro ERP;
- pedido oficial;
- estoque ERP;
- contato fiscal;
- documento fiscal.

**PapoAI**
- provider atual do atendimento WhatsApp, independente do Bling.

**GitHub**
- código, migrations, testes e CI;
- não deve ser o runtime normal das integrações.

**Make**
- inexistente no runtime alvo.

### 4.2 Fluxo base

```text
vitrine/admin
    ↓
Supabase qxst
    ↓ bridge server-side autenticada/idempotente
Supabase ssbes — Bling Integration Hub
    ↓ fila única / throttle / retry
API oficial Bling
    ↓
Webhooks Bling assinados
    ↓
Supabase ssbes
    ↓ reconciliação
Supabase qxst + vitrine/admin
```

## 5. OAuth e cliente Bling

Uma única implementação de OAuth deve atender todos os módulos.

Requisitos:

- `client_id`, `client_secret` e `refresh_token` ficam somente server-side;
- nunca em JavaScript público;
- refresh token rotacionado deve ser persistido atomicamente;
- um lock impede duas renovações concorrentes;
- todas as chamadas passam por um único cliente Bling;
- limite global de chamadas compartilhado por produto, estoque, cliente, pedido e fiscal;
- `429` e `5xx` usam retry com backoff e `Retry-After`;
- erros ambíguos após POST nunca geram retry cego: primeiro ocorre reconciliação.

O fluxo antigo de GitHub Actions deixa de ser o runtime primário. Os scripts existentes servem como referência para portar comportamento comprovado para o Hub server-side.

## 6. Etapa 0 — isolamento e reconciliação

Antes de qualquer escrita no Bling:

1. congelar logicamente as filas antigas;
2. classificar os 330 `bling_commands` antigos;
3. classificar os 25 `order_sync_jobs` antigos;
4. não executar automaticamente nenhum deles;
5. mapear produtos Vitrine ↔ Bling por GTIN exato;
6. mapear clientes canônicos ↔ Bling por `bling_contact_id` ou CPF/CNPJ exato;
7. validar OAuth atual;
8. validar depósito;
9. validar unidade de negócio;
10. validar situações de pedido;
11. ler configuração fiscal necessária;
12. produzir relatório de divergências.

Nenhuma associação por nome aproximado.

## 7. Produtos

Ao salvar produto no `vitrine/admin`:

1. salvar no `qxst`;
2. criar evento de integração;
3. Hub tenta usar `bling_product_id`;
4. sem ID: procurar por GTIN exato;
5. correspondência única: vincular;
6. nenhuma correspondência: marcar como `not_found`;
7. criação de produto no Bling exige ação explícita para itens realmente novos;
8. mais de uma correspondência: `review_required`.

Campos iniciais:

- nome;
- SKU/código;
- GTIN;
- preço;
- unidade;
- situação;
- NCM;
- marca;
- descrição;
- imagem quando suportada e necessária.

Atualização deve preservar campos fiscais do Bling não administrados pela Vitrine.

Não criar "shadow product" automaticamente durante envio de pedido.

## 8. Estoque

O `qxst` é a verdade operacional da Vitrine.

Eventos que alteram saldo:

- balanço;
- impressão de separação/baixa;
- cancelamento com devolução;
- ajuste manual autorizado;
- recebimento futuro.

Estratégia:

- enviar saldo absoluto ao depósito Bling sempre que possível;
- consolidar múltiplos comandos pendentes do mesmo produto;
- última verdade operacional substitui comando antigo ainda não enviado;
- vínculo por `bling_product_id` ou GTIN exato;
- divergência recebida por webhook vira alerta, não sobrescrita silenciosa.

## 9. Clientes

Clientes continuam no Supabase canônico.

Ao salvar:

1. persistir localmente;
2. usar `bling_contact_id` quando existente;
3. senão procurar CPF/CNPJ exato;
4. correspondência única é vinculada;
5. não associar por nome parecido;
6. cliente novo pode ser criado no Bling somente após validações mínimas.

Campos:

- nome;
- CPF/CNPJ;
- telefone;
- e-mail;
- endereço;
- CEP;
- município/UF;
- configuração de e-mail fiscal quando aplicável.

## 10. Pedidos

O pedido nasce na Vitrine e só entra no Bling quando passa do estado de intenção para operação real.

Ponto inicial escolhido: **primeira entrada efetiva em separação**, atualmente compatível com a ação de imprimir separação que já baixa estoque.

Antes de enviar:

- pedido persistido;
- cliente identificado;
- endereço completo;
- pagamento conhecido;
- itens resolvidos;
- produtos vinculados ao Bling;
- totais fecham;
- estoque já foi materializado operacionalmente.

Payload:

- contato;
- linhas individualizadas;
- componentes de cesta individualizados;
- quantidades;
- preços;
- endereço;
- pagamento;
- total dos produtos;
- outras despesas;
- desconto;
- chave externa baseada no UUID do pedido.

Regra de cestas:

- componentes vão individualmente;
- valor comercial da cesta não é redefinido pela soma dos componentes;
- diferença positiva vai em outras despesas;
- diferença negativa usa desconto;
- jamais despesa negativa.

Idempotência:

- um pedido Vitrine possui no máximo um pedido Bling;
- timeout de POST gera `review_required` e reconciliação;
- nunca retry cego de criação.

## 11. Webhooks Bling

Criar endpoint dedicado no Hub.

Requisitos:

- validar assinatura `X-Bling-Signature-256`;
- registrar evento bruto de forma segura;
- deduplicar por event/provider id + fingerprint;
- responder rapidamente;
- processar assíncrono;
- aceitar eventos suportados de produto, estoque, pedido e fiscal;
- reconhecer eventos originados pelo próprio Hub;
- impedir loops;
- atualizar read model de integração;
- divergência relevante vira `review_required`.

## 12. Fiscal

A emissão fiscal não é consequência automática de criar pedido.

Fluxo:

```text
PEDIDO
→ ENTREGA CONFIRMADA
→ PAGAMENTO CONFIRMADO/CONCILIADO
→ FISCAL_READY
→ PREVIEW
→ EMITIR
→ AUTORIZAR
→ webhook/status Bling/SEFAZ
→ ISSUED ou REVIEW_REQUIRED
```

Antes da primeira emissão real devem ser confirmados:

- modelo fiscal usado pela operação;
- série;
- natureza da operação;
- tributação;
- CFOP;
- NCM/CEST;
- configuração IBS/CBS vigente;
- forma de pagamento;
- regras de e-mail fiscal;
- unidade de negócio.

Primeira versão:

- emissão manual no `vitrine/admin`;
- botão só aparece para pedido fiscalmente apto;
- canário de baixo volume;
- guardar ID da nota, número, chave, status, datas e links/artefatos disponíveis;
- automação total somente depois de homologação real.

## 13. UX do vitrine/admin

Criar área simples "Bling" ou "Integrações".

Indicadores:

- conexão OAuth;
- último refresh;
- fila;
- erros;
- itens em revisão;
- webhook saudável;
- depósito;
- unidade de negócio;
- fiscal.

Nos objetos:

**Produto**
- sincronizado;
- pendente;
- divergente;
- erro;
- cadastrar no Bling;
- tentar novamente.

**Cliente**
- sincronizado;
- pendente;
- revisão;
- erro.

**Pedido**
- não enviado;
- pendente;
- Bling #ID;
- divergente;
- erro;
- fiscal bloqueado/pronto/emitido.

Nenhum detalhe técnico desnecessário para o operador.

## 14. Remoção segura de Make

A migração Make será feita antes da exclusão dos artefatos.

### 14.1 Ordem

1. localizar todos os runtimes Make;
2. identificar substituto direto;
3. implementar substituto;
4. testar substituto;
5. retirar tráfego do Make;
6. observar estabilidade;
7. desativar referência local;
8. remover secret/conexão/coluna/função/edge somente após zero dependências;
9. remover código e CI legados;
10. manter documentação histórica apenas quando útil, marcada como legado.

### 14.2 Artefatos já encontrados

Candidatos à migração/remoção após comprovação:

- `whatsapp-ingest-make-v1`;
- secret `dona_antonia_whatsapp_outbound_make_webhook`;
- `system_secrets.make_whatsapp_ingest`;
- `whatsapp_accounts.make_connection_id`;
- métricas `make_operations`;
- limites Make em `automation_config`;
- `ops/dona-antonia/make-scenarios-v1.json`;
- scripts/testes exclusivos do adapter Make;
- webhooks hardcoded em frontends legados.

Nenhum desses será apagado enquanto houver chamada ativa.

## 15. Limpeza segura do Supabase

Objetivo final: nenhum objeto antigo sem função operacional.

### 15.1 Classificação obrigatória

Todo objeto candidato recebe uma categoria:

- **KEEP** — usado e necessário;
- **MIGRATE** — usado, mas deve mudar de arquitetura;
- **DEPRECATE** — substituído, aguardando janela de observação;
- **DELETE** — sem referências e sem uso operacional;
- **ARCHIVE_DATA** — estrutura pode sair, mas dados históricos têm valor.

### 15.2 Critério para DELETE

Somente excluir se todos forem verdadeiros:

1. nenhuma referência no GitHub atual;
2. nenhuma dependência SQL;
3. nenhum trigger;
4. nenhum cron;
5. nenhuma Edge Function depende;
6. nenhuma configuração ativa aponta para o objeto;
7. não contém dado histórico que precise ser preservado;
8. substituto, quando necessário, já passou em homologação;
9. migration de remoção contém preflight que falha fechado;
10. há rollback documentado.

### 15.3 Estratégia

- gerar inventário antes de cada rodada;
- usar migrations pequenas e focadas;
- uma categoria de objetos por migration;
- não usar `DROP ... CASCADE` para limpeza operacional;
- preferir `RESTRICT`;
- salvar contagens/estado antes da remoção;
- validar RLS, funções, triggers e advisors depois;
- executar regressão do Admin/Vitrine/CRM após cada rodada.

## 16. Filas novas

Não reutilizar cegamente as filas antigas.

Criar filas versionadas específicas do novo Hub, ou limpar e versionar formalmente as existentes somente se a auditoria provar que isso é seguro.

Estados padrão:

- `pending`;
- `processing`;
- `synced`;
- `retry`;
- `review_required`;
- `failed`;
- `cancelled`.

Cada job contém:

- idempotency key;
- entity type/id;
- operation;
- payload version;
- attempts;
- next attempt;
- correlation id;
- provider id;
- resposta resumida;
- erro sanitizado;
- timestamps.

## 17. Segurança

- segredos somente no Supabase Vault/server-side;
- nenhum service role no navegador;
- assinatura de webhook obrigatória;
- payloads validados;
- rate limit;
- locks de refresh token;
- RBAC para ações manuais;
- logs sem token/secret/PII desnecessária;
- endpoints administrativos autenticados;
- kill switch por domínio;
- fiscal com gate separado;
- todas as escritas externas auditadas.

## 18. Observabilidade

Criar read model único de integração:

`entity | operation | local_state | bling_state | last_attempt | last_success | error | needs_action`

Métricas:

- jobs pendentes;
- idade da fila;
- erros por endpoint;
- 429;
- 5xx;
- refresh OAuth;
- divergências;
- pedidos sem vínculo;
- produtos sem vínculo;
- clientes sem vínculo;
- fiscal pronto não emitido.

## 19. Testes e rollout

Ordem obrigatória:

1. OAuth read-only;
2. leitura de produto;
3. vínculo de um produto existente;
4. atualização controlada de um produto;
5. criação controlada de um produto novo;
6. leitura/vínculo de cliente;
7. atualização/criação de cliente;
8. estoque de um produto;
9. pedido único de homologação;
10. atualização/cancelamento;
11. webhook;
12. fiscal preview;
13. uma emissão fiscal real autorizada;
14. observação;
15. canário progressivo.

Nenhum domínio é habilitado em massa sem canário próprio.

## 20. Fases de implementação

### Fase A — fundação e limpeza de risco
- congelar/segregar filas antigas;
- inventário Make/Supabase;
- Bling client server-side;
- health/readiness;
- rate limit global;
- correlation/idempotency.

### Fase B — produtos e estoque
- reconciliação GTIN;
- IDs externos;
- updates;
- criação explícita;
- saldo;
- status no Admin.

### Fase C — clientes
- vínculo;
- create/update;
- endereço;
- status no Admin.

### Fase D — pedidos
- materialização;
- draft;
- envio;
- reconciliação;
- atualização/cancelamento;
- status no Admin.

### Fase E — webhooks
- assinatura;
- inbox de eventos;
- dedupe;
- reconciliação.

### Fase F — fiscal
- configuração;
- readiness;
- preview;
- emissão;
- autorização;
- retorno.

### Fase G — Make zero
- migrar qualquer runtime remanescente;
- remover secrets/IDs/adapters/edges/código Make;
- confirmar busca global sem endpoints Make em runtime.

### Fase H — limpeza Supabase
- remover objetos comprovadamente mortos;
- remover estruturas antigas substituídas;
- preservar apenas dados históricos úteis;
- regressão e advisors finais.

## 21. Critérios de conclusão

O projeto só termina quando:

1. `vitrine/admin` opera Bling sem Make;
2. produto, estoque, cliente e pedido têm estado de sincronização visível;
3. pedidos não duplicam;
4. clientes não são associados por heurística insegura;
5. estoque não cria loops;
6. webhooks são autenticados/deduplicados;
7. fiscal possui gate e auditoria;
8. nenhum segredo Bling aparece no frontend;
9. nenhum runtime Dona Antônia depende de Make;
10. artefatos Supabase antigos sem uso comprovado foram removidos com segurança;
11. filas antigas não podem disparar acidentalmente;
12. testes e CI cobrem regressões críticas;
13. rollback está documentado para cada ativação externa.
