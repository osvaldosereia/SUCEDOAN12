# Persistência isolada — Dona Antônia V2

## Estado da R02

A cadeia canônica está em `supabase/migrations/`, gerada com Supabase CLI e validada, em sequência, num PostgreSQL WASM descartável (`@electric-sql/pglite`). R02 criou quatro migrações e 21 tabelas; R03 adiciona a quinta migração e três tabelas de autorização/preço privado. A cadeia **não foi aplicada a qualquer Supabase remoto**. PGlite comprova sintaxe e comportamento PostgreSQL coberto pelos testes, mas não substitui homologação em uma instância Supabase.

O schema `da_next` permanece fora dos schemas expostos pelo Data API. Todas as 24 tabelas têm RLS habilitado. `anon` e `public` não recebem acesso; `authenticated` recebe `USAGE`, grants mínimos e policies por papel. A função auxiliar consulta atribuição no banco; não confia em `user_metadata`. `service_role` é somente backend e nunca pode ser exposta no browser. A matriz está em `docs/MATRIZ_ACESSO_V2.md`.

## Conteúdo do modelo

- Catálogo: produtos/SKUs, tipos, vínculo tipo-produto e cinco tamanhos configuráveis de cesta com composição ordenada.
- Dados pessoais e pedido: clientes/endereço, pedido, snapshot da cesta, tipos selecionados e linhas de itens. Cada pedido preserva os dados e preços vigentes no momento da compra.
- Estoque e concorrência: reservas consolidadas por SKU, movimentos imutáveis, recibos idempotentes de comandos, versão otimista e eventos do pedido.
- Operação e integrações futuras: conversas e mensagens, perfil fiscal privado Bling, documentos fiscais, auditoria e outbox transacional. A outbox não ativa worker ou envio.
- Valores são armazenados em centavos. A composição da cesta não carrega preço por item. Extras guardam valor unitário e subtotal; ajustes internos estão em `basket_size_private_pricing` e `order_basket_private_pricing`, fora das tabelas visíveis a operadores de catálogo/separação.

O diagrama das entidades está em `docs/DIAGRAMA_ERD_V2.md`; os tipos de linha gerados para o contrato estão em `src/server/persistence/database.types.ts`.

## Transação de checkout futura (ainda não implementada)

Um adaptador servidor deverá, dentro de uma única transação: validar idempotência e fingerprint; bloquear/consultar produtos e estoque; recalcular preço e regras comerciais no servidor; consolidar consumo repetido de SKU entre composição e extras; rejeitar indisponibilidade; persistir pedido, cliente/endereço quando aplicável, snapshots e itens; reservar estoque e gravar evento/outbox. Repetir a mesma chave com o mesmo fingerprint deve retornar o resultado registrado; chave igual com conteúdo diferente deve falhar. `src/application/persistence-contracts.ts` descreve contratos, sem conexão real ou endpoint.

## Migrações, validação e reversão

`npm run test:db` inicia um PostgreSQL em memória sem rede, cria roles e Auth fixtures temporários, aplica as cinco migrações e verifica relações, constraints, grants, RLS/RBAC positivo e negativo, privacidade e rollback de transação. `db/001_schema.sql` a `db/004_bling_product_profiles.sql` eram propostas não aplicadas e foram removidas para evitar dois históricos concorrentes; `db/README.md` explica o fluxo.

As migrações aplicadas devem ser tratadas como forward-only. Corrigir schema com nova migração aditiva/compensatória, não editar histórico já aplicado. Em desenvolvimento local, somente um banco descartável pode ser recriado por `supabase db reset`. Para homologação remota, falta provisionar um projeto V2 isolado, ensaiar backup/restore, configurar Supabase Auth e rever Data API/grants antes de qualquer aplicação. Nenhum destino remoto foi configurado nesta rodada.

## Limites e pendências

Não há projeto Supabase V2 criado, migration remota, cliente/adapter conectado, login real, CRUD persistente, checkout, consumidor da outbox nem integração ativa. R03 entrega modelo de ator, RBAC e policies testados localmente; a conexão com Supabase Auth depende do projeto isolado. O schema não valida sozinho mínimo/área/cutoff de pedido nem cálculo tributário. Campos fiscais e tratamento do ajuste interno exigem revisão contábil antes de faturar.
