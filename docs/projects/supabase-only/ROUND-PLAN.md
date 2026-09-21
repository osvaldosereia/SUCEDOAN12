# Supabase Only — Plano em 4 rodadas

Data: 2026-09-21
Branch: `supabase-only-admin-migration-20260921`

## Regra central

Supabase é a única fonte operacional da Dona Antônia. Firebase pode existir temporariamente apenas como legado de auditoria até o gate final de desligamento.

As quatro rodadas são sequenciais. Nenhuma rodada pode religar automações para testar.

## Rodada 1 — Congelar automações e consolidar a base
Status: DONE

Objetivos:
- pausar todos os jobs pg_cron sem apagar definições;
- pausar gatilhos de despacho/fila comercial automática;
- desligar switches globais de automação, outbound, atendimento automático, Agent Core e automação de imagens;
- preservar gatilhos de integridade/auditoria;
- consolidar API administrativa autenticada de produtos;
- remover autoridade Firebase de balanço rápido e workers de imagem;
- migrar Validades para Supabase autenticado;
- documentar arquitetura, custo, segurança e gate de desligamento;
- criar testes anti-regressão Firebase.

Gate R1:
- 0 pg_cron ativo;
- dispatch/fila comercial automática pausada;
- automation_config em off;
- image automation em off;
- Validades sem runtime Firebase na nova implementação;
- inventário de dependências restantes conhecido.

## Rodada 2 — Cadastro, Cestas e Kits
Status: PENDING

Objetivos:
- Cadastro rápido: lookup/criação/edição somente Supabase;
- retirar Make e Firebase do runtime do Cadastro;
- produto novo nasce controlado/inativo quando pesquisa automática não for comprovada;
- Cestas rápidas: concluir persistência canônica em basket_templates/basket_template_items (catálogo já Supabase-only);
- Kits: concluir persistência Supabase e retirar legado remanescente (catálogo já Supabase-only);
- preservar UX móvel existente;
- testes de contratos e autenticação.

Gate R2:
- Cadastro, Cestas e Kits sem chamadas runtime Firebase;
- nenhum dado de produto desses módulos depende de GitHub JSON como fonte de verdade.

## Rodada 3 — Legado operacional + organização/custo
Status: PENDING

Objetivos:
- revisar/migrar Contagem legada, Produção Admin, Compra Rápida, Estoque, Orçamento e scripts Dona Antônia que ainda leem Firebase;
- não tocar Caneca Fácil nem App Dona Antônia isolado;
- classificar tabelas/functions antigas e candidatas a arquivamento;
- corrigir segurança comprovada: search_path e grants SECURITY DEFINER quando seguro;
- revisar índices duplicados com constraints antes de remover;
- implementar retenção segura de intermediários em product-image-batches;
- manter automações pausadas.

Gate R3:
- nenhum runtime operacional Dona Antônia usa Firebase;
- limpeza econômica não remove dados ativos/referenciados;
- advisors reavaliados.

## Rodada 4 — Corte final e homologação
Status: PENDING

Objetivos:
- busca ampla por firebaseio/Firebase em runtime Dona Antônia;
- classificar referências restantes como docs/tests/legado não executável ou remover;
- desativar workflows GitHub de sincronização Firebase;
- remover dependência de secrets Firebase do runtime;
- rodar contracts/smoke tests;
- comparar branch com main e resolver conflitos;
- integrar somente se gates passarem;
- emitir checklist de desligamento físico do Firebase.

Gate final:
- zero runtime Dona Antônia consultando Firebase;
- zero automação Supabase reativada sem decisão explícita;
- testes verdes;
- backup/histórico preservado;
- somente então encerrar a dependência Firebase da Dona Antônia;
- desligamento físico do projeto `cedar-chemist-310801` exige também zero dependência de Caneca Fácil/outros consumidores compartilhados.
