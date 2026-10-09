# Rodada 5 — Separação protegida pela confirmação Meta (08/10/2026)

**Projeto:** Dona Antônia · repositório `osvaldosereia/SUCEDOAN12` · plano [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · PR draft [#970](https://github.com/osvaldosereia/SUCEDOAN12/pull/970).

## O que foi efetivamente programado
1. **Servidor Admin:** `supabase/functions/admin-products-live-v1/index.ts` passa a verificar `ops2_order_meta_confirmation_status_v1` antes de qualquer leitura que possa iniciar a separação, atribuição do funcionário, marcação de SEPARADO/FALTOU ou conclusão do pedido. O status comercial `orders.status='confirmed'` não substitui o comprovante do clique.
2. **Falha fechada:** `ORDER_META_CONFIRMATION_GUARD_ENABLED=false` por padrão. Quando habilitada, erro na consulta da prova retorna 503 (`meta_confirmation_readiness_unavailable`) e impede o processamento. Se existe prova pendente, retorna 409 (`meta_customer_confirmation_required`).
3. **Contrato SQL draft (não aplicado):** `supabase/sql/orders-r5-separation-meta-gates-v1.sql` expande os gatilhos da R04 para bloquear tanto `INSERT` quanto `UPDATE/UPSERT` na atribuição, marcação dos itens, quantidades e conclusão; preserva o guard já existente de `orders.status`.
4. **Fila `/montar`:** consulta em lote `manual_pick_queue_meta_feed_v1`, com identificação de pedidos sem prova para mostrar **NÃO MONTAR ESSE PEDIDO**, sem botão de montagem. Fallback da fila anterior fica identificado como **VERIFICAR CONFIRMAÇÃO**, exige autorização em novo endpoint `order_separation_meta_status` antes do redirecionamento, e não confere autoridade à UI.
5. **Compatibilidade e usabilidade:** número original histórico (`AA001` ou quatro dígitos) e formato R03 (`DD|MM|AAAA - 001`), sem gerar nova identidade. Barra de progresso, colaboradores, cards, pop-up **ANOTE O NÚMERO DO PEDIDO NA EMBALAGEM** e separação independente da NF-e são preservados.
6. **Acesso à fila:** novo wrapper `manual_pick_queue_meta_feed_v1` tem `auth.uid()` e validação de usuário ativo em `admin_users`, `EXECUTE` revogado de `anon/PUBLIC` e concedido a `authenticated`. A consulta do ledger pelo servidor não libera acesso direto às tabelas sensíveis.

## Cobertura de testes
O workflow `.github/workflows/orders-r5-meta-separation-ci.yml` executa apenas em GitHub Actions com PostgreSQL 17 efêmero e Node 22, segredos e transportes desligados:
- Recusa resposta Meta não assinada, texto livre, WAMID/canal incorreto e repetição (regressão R04).
- Gatilho em atribuição (`INSERT` e `UPDATE/UPSERT`), item marcado (`INSERT` e `UPDATE`), alteração de quantidade já marcada, conclusão (`INSERT`, `UPDATE phase`, `UPDATE completed_at`) e avanço direto do `orders.status`.
- Aceita as mesmas ações **depois** da prova assinada no ledger, sem duplicar confirmação.
- Testa a fila com pedido pendente e outro confirmado nos dois canais e impede acesso via roles públicos.
- Valida os contratos do Admin e o tratamento visual da fila, incluindo preflight de servidor antes de abrir `vitrine/admin?montar=1`.

**Resultado:** conferir a execução do CI correspondente ao último SHA da branch (não confundir teste sintético com homologação de produção). Testes PostgreSQL são com tabelas fictícias e não cobrem todos os triggers e integrações Bling/Meta/SEFAZ reais.

## Dependências de merge e release
- **R04 [PR #969](https://github.com/osvaldosereia/SUCEDOAN12/pull/969)** é a base deste PR; jamais integrar R05 sozinho. R04 ainda exige modelos Meta Utility aprovados com botão `CONFIRMADO` para 0975 e 1018.
- **R03 [PR #968](https://github.com/osvaldosereia/SUCEDOAN12/pull/968)** tem a proposta de número semanal; resolver a integração dessa stack antes de aplicar a migration em `main`. Não fazer merge do antigo PR #953 isoladamente.
- **R02 [PR #966](https://github.com/osvaldosereia/SUCEDOAN12/pull/966)**: pendente de clone canônico completo. Executar E2E com funções reais de atribuição/separação, finalização física e fila antes de liberar produção.
- O arquivo SQL R05 está em `supabase/sql` **apenas como draft**; revisão e migration gerada pelo Supabase CLI em ambiente de homologação precedem qualquer deploy.
- No rollout, instalar banco/RPCs primeiro, depois a Edge Function/Admin, depois o frontend; habilitar o envio do botão Meta e as flags do banco apenas após teste canário com pedido fictício. Flags padrão permanecem desligadas.
- Não alterar estoque real nem usar o clique para registrar entrega, pagamento ou autorização SEFAZ. NF-e só passa para expedição após autorização real confirmada.

## Estado em produção
**Nenhum deploy, merge, SQL aplicado, contato WhatsApp enviado, nota fiscal emitida ou baixa de estoque realizada pela R05.** Toda a programação está isolada em `agent/orders-r5-separation-meta-gate-20261008`.

**Continuação:** resolver clone R02 e templates R04; depois validar a sequência ponta a ponta R05 na vitrine do Admin e avançar R06 (sincronização Bling/itens separados com falta, NF-e assíncrona sem duplicidade).
