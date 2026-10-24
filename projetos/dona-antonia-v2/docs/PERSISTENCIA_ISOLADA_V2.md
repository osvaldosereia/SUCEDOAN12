# Persistência isolada — Dona Antônia V2

## Estado da R02

A cadeia canônica está em `supabase/migrations/`, gerada com Supabase CLI e validada, em sequência, num PostgreSQL WASM descartável (`@electric-sql/pglite`). São quatro migrações, 21 tabelas e constraints testadas. A cadeia **não foi aplicada a qualquer Supabase remoto**. PGlite comprova sintaxe e comportamento PostgreSQL coberto pelos testes, mas não substitui homologação em uma instância Supabase.

O schema `da_next` não deve ser adicionado aos schemas expostos pelo Data API. Todas as tabelas têm RLS habilitado; não há policies ainda. `anon`, `authenticated` e `public` não recebem `USAGE` nem privilégios no schema/tabelas. A role `service_role` recebe acesso para execução backend somente. Nunca expor essa chave no browser. O conjunto de policies e papéis de operador fica para R03.

## Conteúdo do modelo

- Catálogo: produtos/SKUs, tipos, vínculo tipo-produto e cinco tamanhos configuráveis de cesta com composição ordenada.
- Dados pessoais e pedido: clientes/endereço, pedido, snapshot da cesta, tipos selecionados e linhas de itens. Cada pedido preserva os dados e preços vigentes no momento da compra.
- Estoque e concorrência: reservas consolidadas por SKU, movimentos imutáveis, recibos idempotentes de comandos, versão otimista e eventos do pedido.
- Operação e integrações futuras: conversas e mensagens, perfil fiscal privado Bling, documentos fiscais, auditoria e outbox transacional. A outbox não ativa worker ou envio.
- Valores são armazenados em centavos. A composição da cesta não carrega preço por item. Extras guardam valor unitário e subtotal; o ajuste interno da cesta é privado e não compõe projeção pública.

O diagrama das entidades está em `docs/DIAGRAMA_ERD_V2.md`; os tipos de linha gerados para o contrato estão em `src/server/persistence/database.types.ts`.

## Transação de checkout futura (ainda não implementada)

Um adaptador servidor deverá, dentro de uma única transação: validar idempotência e fingerprint; bloquear/consultar produtos e estoque; recalcular preço e regras comerciais no servidor; consolidar consumo repetido de SKU entre composição e extras; rejeitar indisponibilidade; persistir pedido, cliente/endereço quando aplicável, snapshots e itens; reservar estoque e gravar evento/outbox. Repetir a mesma chave com o mesmo fingerprint deve retornar o resultado registrado; chave igual com conteúdo diferente deve falhar. `src/application/persistence-contracts.ts` descreve contratos, sem conexão real ou endpoint.

## Migrações, validação e reversão

`npm run test:db` inicia um PostgreSQL em memória sem rede, cria roles temporárias, aplica a cadeia completa e verifica relações, constraints, privilégios, RLS fechado, idempotência e rollback de transação. `db/001_schema.sql` a `db/004_bling_product_profiles.sql` eram propostas não aplicadas e foram removidas para evitar dois históricos concorrentes; `db/README.md` explica o fluxo.

As migrações aplicadas devem ser tratadas como forward-only. Corrigir schema com nova migração aditiva/compensatória, não editar histórico já aplicado. Em desenvolvimento local, somente um banco descartável pode ser recriado por `supabase db reset`. Para homologação remota, R03 precisa definir RBAC/policies, projeto V2 isolado, backup/restore ensaiado, plano de reversão e revisão dos privilégios antes de qualquer aplicação. Nenhum destino remoto foi configurado nesta rodada.

## Limites e pendências

Não há Supabase V2 criado, migração remota, cliente Supabase, adapter de repositório, autenticação, CRUD persistente, checkout real, consumidor da outbox nem emissão/envio de integração. O schema não valida sozinho o mínimo de pedido, área de entrega, calendário/cutoff ou cálculo tributário. Antes de faturamento, os campos fiscais e tratamento do ajuste interno exigem revisão contábil. R03 implementará modelo de ator, RBAC e policies com testes de acesso.
