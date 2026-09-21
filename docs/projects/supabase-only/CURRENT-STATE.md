# Supabase Only — Current State

Data do checkpoint: 2026-09-21
Branch: `supabase-only-admin-migration-20260921`
Rodada atual: R2 EXECUTADA → próxima R3

## Estado geral

Migração controlada para Supabase-only em andamento. `public.products` é a única fonte operacional autorizada para produtos Dona Antônia. Firebase ainda NÃO deve ser desligado fisicamente: há runtimes legados fora do escopo concluído e o projeto Firebase também possui consumidores do projeto separado Caneca Fácil.

## Automações Supabase

Estado solicitado pelo proprietário: PAUSADAS. Verificação desta rodada manteve filas de IA abertas em zero; nenhum cron foi reativado. Os 9 pg_cron preservados permanecem definidos para retomada seletiva posterior, não para execução agora. Gatilhos internos de integridade, segurança, auditoria e updated_at permanecem ativos.

## Concluído até R2

### R1
- auditoria real de GitHub + Supabase;
- `public.products` definido como fonte única operacional;
- backfill seguro de gôndola/prateleira e fonte de imagem a partir do histórico Supabase;
- inventory-fast, Balanço rápido, Validades, Cestas mobile, Kits mobile e workers de imagem principais convertidos para catálogo Supabase-only;
- `admin-products-live-v1` consolidada como API administrativa autenticada;
- cliente compartilhado `admin-secure-api-v1.js` criado;
- automações, cron, outbound e IA automática pausados.

### R2
- Cadastro rápido deixou de executar o runtime Firebase/Make: `cadastro-v10.js` agora é somente bootstrap de compatibilidade para `cadastro-supabase-v1.js`;
- consulta de EAN usa `admin-products-live-v1/lookup`;
- atualização de estoque usa `save_product` no Supabase;
- criação usa `create_product`, nasce inativa e fisicamente verificada, exigindo revisão antes de publicação;
- autenticação usa a sessão administrativa compartilhada e `admin_users`;
- token Firebase, webhook Make e token GitHub deixam de participar do runtime novo;
- exclusão destrutiva no Cadastro foi deliberadamente bloqueada; desativação/revisão deve ocorrer pelo Admin auditável;
- foto capturada no Cadastro permanece somente como conferência local enquanto automações de IA/imagem estão pausadas, evitando custo e upload acidental;
- `basket_templates` e `basket_template_items` foram confirmadas existentes no Supabase (9 templates atuais); persistência canônica completa das Cestas permanece para R3 para não substituir publicação GitHub sem migração transacional e teste de compatibilidade.

## Inventário de referência

- 1.814 produtos no checkpoint R1;
- 1.746 ainda guardavam `firebase_key`/snapshot histórico — estes campos são somente auditoria, não autoridade;
- `basket_templates` / `basket_template_items` existem e já possuem dados;
- bucket `product-image-batches` permanece alvo de retenção econômica, sem limpeza destrutiva automática nesta fase.

## Segurança / economia

Cadastro agora herda o gate sessão Supabase + `admin_users`; service role continua somente server-side. Nenhuma nova Edge Function foi criada: foi reutilizada a API administrativa consolidada. IA/imagens automáticas continuam pausadas, portanto o Cadastro não dispara custo de IA nesta fase.

## Próxima execução — R3

1. migrar persistência de Cestas para `basket_templates` / `basket_template_items` com escrita transacional/autenticada e compatibilidade de leitura;
2. concluir persistência canônica dos Kits no Supabase sem tocar Caneca Fácil;
3. auditar e retirar Firebase dos runtimes Dona Antônia restantes (Contagem legada, Produção/Admin antigo, Compra Rápida, Estoque, Orçamento conforme aplicável);
4. ampliar contracts zero-Firebase;
5. manter todos os cron/automação pausados;
6. testar e atualizar checkpoint antes da R4.
