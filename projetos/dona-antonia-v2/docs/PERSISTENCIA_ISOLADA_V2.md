# Persistência isolada — Dona Antônia V2

## Estado da R03

A cadeia canônica está em `supabase/migrations/`, gerada com Supabase CLI e validada no PostgreSQL WASM descartável (`@electric-sql/pglite`). R02 criou quatro migrações/21 tabelas; R03 acrescenta duas migrações (preços privados, papéis e leitura segura do próprio papel), totalizando seis migrações e 24 tabelas. A cadeia foi aplicada ao projeto novo e isolado `hjudhofluihkxykwekir` (`https://hjudhofluihkxykwekir.supabase.co`, região São Paulo). Nenhum banco Supabase existente foi acessado ou alterado. O projeto Pro tem estimativa confirmada de US$ 10/mês de compute para o tamanho padrão, cobrada por hora.

O schema `da_next` permanece fora dos schemas expostos pelo Data API. Todas as 24 tabelas têm RLS habilitado e 64 policies. `anon` não possui `USAGE` em `da_next`; `authenticated` recebe grants mínimos e policies por papel. `public.get_my_staff_role()` é a única função pública de consulta de papel: sem argumentos, retorna apenas o papel ativo de `auth.uid()`, e só `authenticated` pode executá-la. O helper e a função não confiam em `user_metadata`. `service_role` é somente backend e nunca pode ir ao browser. A matriz está em `docs/MATRIZ_ACESSO_V2.md`.

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

`npm run test:db` inicia um PostgreSQL em memória sem rede, cria roles e Auth fixtures temporários, aplica as seis migrações e verifica relações, constraints, grants, RLS/RBAC positivo e negativo, privacidade, RPC do papel e rollback de transação. `db/001_schema.sql` a `db/004_bling_product_profiles.sql` eram propostas não aplicadas e foram removidas para evitar dois históricos concorrentes; `db/README.md` explica o fluxo.

As migrações aplicadas devem ser tratadas como forward-only. Corrigir schema com nova migração aditiva/compensatória, não editar histórico já aplicado. Em desenvolvimento local, somente um banco descartável pode ser recriado por `supabase db reset`. O projeto V2 está ativo; as migrações foram aplicadas e verificadas. O convite do primeiro ADMIN foi aceito, o e-mail confirmado e a atribuição está ativa; falta validar login pela UI, ensaiar backup/restore e testar recuperação de senha. Não habilitar novos schemas expostos nem configurar integrações operacionais nesta rodada.

## Limites e pendências

Há um projeto Supabase V2 isolado com seis migrações aplicadas e cliente de login Supabase Auth conectado ao admin. A atribuição de funcionários está vazia; sem um e-mail de operador cadastrado não é possível testar login real nem liberar ADMIN. CRUD persistente, checkout, consumidor da outbox e integrações operacionais continuam ausentes. RLS/RBAC foram testados localmente e a configuração remota foi verificada por SQL. O schema não valida sozinho mínimo/área/cutoff de pedido nem cálculo tributário. Campos fiscais e tratamento do ajuste interno exigem revisão contábil antes de faturar.
