# Dona Antônia — R30/R31 — Consolidação e liberação segura

**Data:** 09/10/2026  
**PR direta para main:** [#1034](https://github.com/osvaldosereia/SUCEDOAN12/pull/1034) (`agent/xml-catalog-final-integration-r28-20261009`, draft, **não publicada**).

## Evidências reais e verificadas

- **R28:** todos os 24 workflows passaram na versão funcional `e4a944b05583cb106de365e9c85f92fb2811f96e`. As alterações fiscais R1/R2 posteriores também foram trazidas à branch por cópias exatas dos blobs modificados da `main`; não sobrescrever o roteador fiscal ou o Admin com versões antigas.
- **R29:** [CI 37980712665](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980712665) **SUCCESS**: Supabase Auth/PostgREST local + SQL exato de duas migrations R27, negação anônima de RPC privado HTTP 404 e rollback CAS de nome de produto inativo. Containers excluídos.
- **R30 Chromium:** [CI 37982219283](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37982219283) **SUCCESS**. O script `scripts/test-xml-admin-browser-r30.mjs` extrai funções **reais** da fonte do Admin, exercita comportamento em Chromium 1366px e 390px, com fonte fiscal lazy, prévia obrigatória, confirmação digitada, aplicação nome, reversão e bloqueio produto ativo. **Nenhuma chamada externa** feita no navegador. Os cenários são simulados; isso não substitui sessão humana real conectada ao Bling/Supabase.
- **R30 release plan:** `scripts/xml-selective-release-planner-r30.mjs` e `scripts/test-xml-selective-release-r30.mjs` inspecionam snapshot explícito remoto, duas versões geradas pela Supabase CLI acima do topo remoto, hash SHA-256 de SQL e seis gates de aceite; nenhum `db push`, `migration repair` ou conexão produtiva. O script **nunca** autoriza aplicar SQL (`can_apply_to_production=false`).
- **R31 autenticação Edge local:** novo workflow `xml-r31-authenticated-edge.yml` cria usuário sintético no GoTrue local e verifica acesso da Edge independente `purchase-xml-v1` para owner e proibição de viewer, owner desativado e anônimo, sem comunicação com Bling. **Consultar resultado do workflow**, não alegar homologação até concluir.

## Bloqueios de liberação não negociáveis

1. **Histórico SQL global:** no último snapshot confiável do projeto produtivo, 1.187 migrations remotas versus 136 arquivos locais; **não rodar `supabase db push` global nem `migration repair`**. Selecionar exclusivamente R27 identity e R27 field approval e verificar a versão máxima remota no momento da instalação.
2. **Versões atuais da branch R27 são provisórias:** `20261009185312_purchase_xml_identity_atomic_r27.sql` e `20261009185314_purchase_xml_field_approval_r27.sql` têm SQL testado, mas **timestamps anteriores** a `20261009190052_fiscal_nfe_autorecovery_v1_20261009`, aplicado em produção. Congelar demais implantações, consultar `list_migrations`, gerar dois novos nomes CLI **posteriores** ao maior timestamp e atualizar os caminhos de testes e CI, sem alterar corpo do SQL, com novo ciclo de CI.
3. **Supabase preview tradicional bloqueado por migration WhatsApp antiga:** a versão remota `20260908200932_whatsapp_sales_official_resources_homologation_v1` exige `whatsapp_release_mode=live`; reprodução em branch isolada falha em `live_mode_required` depois de 145 versões. A branch de teste paga criada na rodada anterior **foi excluída** com sucesso. Não ativar live, pular SQL ou adulterar histórico para passar.
4. **Release operacional:** validar backups e restauração do projeto canônico; testar autenticação e autorização da Edge, HTTP Admin/browser com credenciais de homologação, logs, limites e retorno seguro. Não emitir NF-e ou movimentar estoque/financeiro em testes. Confirmar publicação DB seletivo → Edge → Admin, com monitoramento e rollback aplicativo (não sair apagando tabelas fiscais de produção).

## Roteiro objetivo para janela de publicação

1. **Paralisar merges SQL concorrentes** na janela de release e fixar SHAs da `main`, PR #1034 e histórico `supabase_migrations`. Não criar outro serviço em produção.
2. Regerar pela **Supabase CLI** dois nomes cronologicamente superiores à última versão do projeto; conferir os SHA-256 dos SQLs contra a R27 já testada, não reaplicar arquivos históricos.
3. Homologar dois SQLs em Postgres/Supabase isolado com Auth, funções, RLS e teste do navegador + rede. R29/R30/R31 são camadas de evidência, não a publicação.
4. Confirmar backup/restauração/monitoramento e preparar reversão por feature flag e revert de código. Somente após todos os gates positivos, aplicar **as duas migrations selecionadas** pela integração Supabase (não global db push), publicar Edge e validar Admin.
5. Smoke antes de habilitar público; conferir fila, dossiê, retorno 401/403, nenhum efeito fiscal/estoque/financeiro, endpoints de compra e emissão NF-e da main. Registrar resultados, versão e commits no handoff.

**A produção permanece inalterada pelas rodadas R28–R31.**
