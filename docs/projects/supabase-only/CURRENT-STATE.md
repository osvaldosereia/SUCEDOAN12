# Supabase Only — Current State

Data do checkpoint: 2026-09-21
Branch: `supabase-only-admin-migration-20260921`
Rodada atual: R3 EXECUTADA → próxima R4 final

## Estado geral

Migração controlada para Supabase-only em andamento. `public.products` é a única fonte operacional autorizada para produtos Dona Antônia. Firebase ainda NÃO deve ser desligado fisicamente: o gate zero-runtime ainda precisa da auditoria final e o projeto Firebase possui consumidores do projeto separado Caneca Fácil, que está explicitamente fora deste trabalho.

## Automações Supabase

Estado solicitado pelo proprietário: PAUSADAS. Nenhum pg_cron foi reativado nesta rodada. Os 9 jobs preservados continuam definidos somente para eventual retomada seletiva posterior. Gatilhos internos de integridade, segurança, auditoria e `updated_at` não são automações de negócio e permanecem preservados.

## Concluído até R3

### R1
- auditoria GitHub + Supabase e congelamento da autoridade em `public.products`;
- inventory-fast, Balanço rápido, Validades, Cestas mobile, Kits mobile e workers principais convertidos para catálogo Supabase-only;
- `admin-products-live-v1` consolidada como API administrativa autenticada;
- automações, cron, outbound e IA automática pausados.

### R2
- Cadastro rápido convertido para sessão Supabase + `admin_users` e `admin-products-live-v1`;
- criação/edição não usa Firebase, Make nem token GitHub no runtime novo;
- produto novo nasce inativo para revisão;
- `basket_templates` / `basket_template_items` confirmados como estrutura canônica já existente.

### R3
- configuração da Contagem v2 deixou de expor URL/nó Firebase e declara explicitamente `catalogAuthority: supabase` (commit `ba1aee6`);
- configuração do Admin/Produção v2 deixou de instalar Firebase como fonte oficial e passou a declarar Supabase + `admin-products-live-v1` como autoridade (commit `d526aa9`);
- ativação do Admin agora descarta coordenadas Firebase e webhooks Make eventualmente persistidos no `localStorage`, evitando que configuração histórica volte a participar do runtime;
- rótulos do Admin foram corrigidos para não afirmar que Firebase é fonte oficial;
- integração Bling no config legado passa a apontar para Supabase, sem reativar automações;
- auditoria encontrou referências Firebase ainda presentes em módulos legados de Contagem, scripts antigos e consumidores Caneca Fácil. Referências Caneca Fácil foram apenas classificadas e NÃO alteradas.

## Segurança / economia

- nenhuma Edge Function nova foi criada nesta rodada;
- configuração antiga deixa de reintroduzir credenciais/endpoints Firebase/Make no runtime;
- publishable key continua client-side; service role permanece server-side;
- IA/imagens e cron continuam pausados, evitando consumo automático;
- não houve limpeza destrutiva de Storage, tabelas, campos históricos ou Firebase.

## Gate e bloqueadores para R4

R4 deve executar a auditoria final por escopo e distinguir: (a) runtime Dona Antônia realmente carregado; (b) arquivos históricos/compatibilidade não carregados; (c) Caneca Fácil, que deve permanecer intocado. Antes de declarar zero-Firebase, revisar especialmente `contagem/`, `producao-v2/` módulos que ainda leem chaves antigas, Compra Rápida/Estoque/Orçamento e workflows/scripts Firebase. Remover ou neutralizar somente dependências operacionais Dona Antônia comprovadas.

Persistência de Cestas/Kits já possui estrutura Supabase e leitura de catálogo Supabase-only, mas qualquer troca de escrita/publicação GitHub deve continuar transacional e compatível; não substituir fluxo em produção sem evidência de equivalência.

## Próxima execução — R4 final

1. auditoria zero-Firebase por runtime Dona Antônia e contracts;
2. neutralizar referências operacionais restantes sem tocar Caneca Fácil/App Dona Antônia isolado;
3. classificar/arquivar workflows e scripts Firebase legados em vez de executar exclusão destrutiva;
4. revisar segurança/custo/Storage e registrar política recomendada;
5. manter todos os pg_cron/IA/outbound pausados;
6. executar smoke/contracts disponíveis;
7. somente se o gate zero-runtime passar, documentar ação humana exata para desligamento físico — sem desligar o projeto compartilhado enquanto houver consumidor Caneca Fácil.
