# Customer & Marketing OS — CM-1.1 Security Plan

Atualizado em 18/09/2026.

Status: **PLANO TÉCNICO APROVADO AUTOMATICAMENTE PELA GOVERNANÇA DO PROJETO — AINDA SEM ALTERAR ACESSO DE PRODUÇÃO**.

## Prioridade 1 — Customer/Marketing/Meta autenticados

O novo módulo sensível não usará endpoints públicos do Admin.

Estratégia:

1. criar endpoint autenticado específico do Customer & Marketing OS;
2. `verify_jwt=true`;
3. validar usuário em `admin_users`;
4. roles iniciais: owner/operator;
5. service role somente no backend;
6. CORS restrito;
7. frontend obtém sessão pelo fluxo de PIN/Auth existente;
8. nenhuma chave secreta no browser.

As ações iniciais protegidas serão:

- customer list/read;
- purchase intelligence/history;
- channel identities;
- consent ledger;
- timeline;
- segments;
- opportunity read;
- marketing drafts;
- Meta control-plane read.

Escritas mais sensíveis entram depois por Action Registry/policies.

## Prioridade 2 — não quebrar o Admin atual

Migração será incremental:

- primeiro adicionar endpoint autenticado;
- depois conectar nova área;
- depois retirar PII sensível dos endpoints públicos;
- manter produtos/cestas atuais funcionando durante a transição.

## Prioridade 3 — RLS das 6 tabelas

As 6 tabelas sem RLS foram confirmadas.

Não ativar ainda automaticamente.

Policy alvo provável:

- nenhuma policy para anon/authenticated;
- acesso somente backend/service role/security-definer aprovado;
- revogar grants desnecessários;
- habilitar RLS;
- smoke tests das Edge Functions consumidoras.

Antes disso, listar dependências reais de cada tabela.

## Prioridade 4 — testes

Criar testes que falhem se:

- novo endpoint Customer/Marketing usar `verify_jwt=false`;
- endpoint sensível não checar `admin_users`;
- frontend enviar service role;
- Customer OS for adicionado ao endpoint público;
- Marketing/Meta real nascer enabled por padrão;
- automation/workflow nascer LIVE;
- provider PapoAI for hardcoded no core.

## Próxima implementação

Criar a fundação de endpoint autenticado + teste contratual, sem ainda mover o Admin inteiro.
