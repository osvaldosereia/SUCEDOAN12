# HANDOFF ATUALIZADO — DA6 Etiquetas Térmicas e Balanço Fotográfico
**Data:** 09/10/2026 — continuação em outra janela  
**Repositório:** `osvaldosereia/SUCEDOAN12`  
**Branch de trabalho:** `agent/gondola-labels-balance-20261009`  
**PR:** [#987](https://github.com/osvaldosereia/SUCEDOAN12/pull/987) — OPEN, DRAFT, **não mesclado**  
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`  
**Estado de publicação:** **BLOQUEADO; DA6 NÃO ESTÁ PUBLICADO NA PRODUÇÃO.**

> ESTE é o documento de retomada atualizado. O arquivo `HANDOFF_ETIQUETAS_BALANCO_DA6_2026-10-09.md` contém um estado inicial desatualizado (citava ausência de worker/aba e dependência de CDN); não usar aquele documento como checkpoint atual.

## 1. Estado conferido ao registrar este handoff
- Último HEAD conferido: `0e379997b29a3ffb1506a80e92d9bbee3d59bccf`. **Sempre refaça a leitura de HEAD/SHA**, porque há programação concorrente e uma automação horária ativa.
- Diferença frente à `main` nessa consulta: **201 commits à frente e 1 atrás**; diff de 82 arquivos. O GitHub informou `mergeable=true` naquele instante, mas isso pode mudar; não assumir merge sem nova inspeção.
- DA6 CI da versão do HEAD acima: **run #37970953744 em andamento** (5 jobs aprovados, `local-supabase-storage` ainda em execução ao consultar).
- Último CI **inteiramente** aprovado documentado: [run #37970603286](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37970603286), **6/6 jobs SUCCESS, 74/74 testes determinísticos** no commit `773274c57bf181066bf4ee016d6dd92f65765f0f`. Confirmar resultado do run mais novo antes de concluir qualquer nova rodada.
- O CI **Admin and Baskets Guard** do mesmo HEAD estava `failure`; o relatório da R7 explica falha preexistente `channel_origin` em `pedido/index.html`, com SHA igual na main e na branch. Não alterar pedidos/cestas sem examinar o projeto responsável.
- **NÃO** há fotos ou impressora reais homologadas nem Edge/cron remotos em staging. A inexistência dessas provas mantém o PR draft e a publicação bloqueada.

## 2. Escopo funcional aprovado
- Impressão térmica vertical **100 × 150 mm**: produto individual, selecionados, lote e gôndola; GTIN válido como código real ou Code128 interno; QR DA6 da etiqueta; quatro marcadores; seis registros independentes (ATIVAR + dezenas 0–9 + unidades 0–9), sem data pré-agendada.
- Cards e edição rápida de gôndolas 1–9999; preserve carregamento e UX mobile.
- `Estoque > Balanço`: manter o balanço A4 e a aba de fotos. Fotos em lote para Storage privado, hash SHA-256, confirmação por arquivo, recuperação de upload, fila independente do navegador, até **3 tentativas por foto**, OMR geométrico clássico **SEM IA**, revisão humana com auditoria e progresso/erros.
- Fotos produzem **contagens históricas**, não sobrescrevem o estoque vigente. **Nenhuma atualização automática no Bling** sem confirmação explícita pelo fluxo canônico.

## 3. Trabalho já feito — NÃO refazer
- **R1:** impressão/cards/gôndolas; Code128, QR, quatro fiduciais, seis balanços e leitura digital 203 dpi.
- **R2:** OMR digital com rotação, perspectiva, sombras e desfoque, fallback QR no raster completo, rejeição segura de leituras incertas.
- **R3:** envio 10/50/100, upload assinado, retomada no mesmo lote e função transacional de reserva sem ultrapassar capacidade.
- **R4:** worker Deno, processamento independente, locks `SKIP LOCKED`, lease/token, recuperação e máximo três tentativas, 100 registros com quatro workers PostgreSQL simultâneos.
- **R5:** revisão e auditoria com valores 0–99, rejeição/correção, histórico sob demanda, ACL/RLS, indicadores e controles mobile.
- **R6:** Supabase CLI **local** real e descartável: Auth, Storage privado/PostgREST, 10+50+100=160 uploads reais assinados, deduplicação, fila processada pelo worker, QR e seis OMR reais em imagem DIGITAL, um evento de revisão. Isso **não é homologação física ou Edge hospedado**.
- **R7:** regressões de balanço A4, alternância com a aba de fotos e corrida de polling; confirmação de upload CAS concorrente, Chrome mobile, Deno e CI 6/6 verde na evidência [#37954882564](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37954882564).
- **R8 (EM PREPARAÇÃO, não publicada):** bibliotecas QR/Code128 locais (sem CDN), testes de impressão offline, plano de migração/rollback, manifesto de gates, fingerprint do código que invalida evidências físicas/remotas após mudanças. Os testes cresceram para 74 determinísticos na última execução concluída. **Nunca converter preparação em deploy por conta própria.**

## 4. DOCUMENTOS MAIS IMPORTANTES
1. `docs/projects/DA6_RODADA_07_REGRESSOES_SEGURANCA_CONCLUIDA_2026-10-09.md` — auditoria/regressões A4/concorrência.
2. `docs/projects/DA6_RODADA_08_PREPARACAO_RELEASE_2026-10-09.md` — procedimentos, riscos, reversão.
3. `docs/projects/DA6_RODADA_08_FINGERPRINT_RELEASE_SEGURO_2026-10-09.md` — SHA/fingerprint e últimas evidências 74 testes.
4. `docs/projects/DA6_RELEASE_GATES_2026-10-09.json` — **fonte de verdade do bloqueio de release**; `release_status: blocked`, `release_candidate_fingerprint: null`.
5. `docs/projects/DA6_QA_PROTOCOLO_FISICO_PENDENTE_2026-10-09.md` — ensaio físico 203 dpi e fotos reais, critérios zero falso positivo.
6. `.github/workflows/da6-inventory-labels-ci.yml`, `scripts/da6-release-gate.mjs`, `scripts/da6-release-fingerprint.mjs` — testes e proteções.
7. Checkpoints detalhados R1–R6 sob `docs/projects/DA6_RODADA_0*.md`.

## 5. Pendências reais antes de publicar
- **Gate físico:** imprimir em impressora térmica real **203 dpi**, papel 100×150 mm; fotografar etiquetas com celular real, anotar quantidades 0/1/7/10/23/99; testar sombra, inclinação, rotação, dupla marca e QR ilegível. Exigir **zero falsas identidades/contagens** e documentar evidências sem dados pessoais.
- **Staging remoto separado:** homologar Edge Function hospedada, Storage, Vault/URL por ambiente, `pg_cron+pg_net`, timeout/memória com lote 100 e teste de rollback. Não usar o Supabase canônico como staging; não criar ambiente pago sem a devida condição/autorizações.
- **Release:** inspecionar a `main` atual; resolver possíveis conflitos concorrentes sem sobrescrever trabalho; tratar CI geral de cestas/pedidos no projeto responsável; confirmar backup, reversão e fingerprint exato da versão física/remotamente homologada.
- **Produção:** só após TODOS os gates aprovados de maneira verificável: aplicar migrações em ordem segura, distribuir Edge/Admin com liberação gradual, observar logs/erros/consumo, confirmar A4 e estoque/Bling intactos. Depois relatório final e **desativar a automação horária**, nunca antes.

## 6. Procedimento para a próxima janela / próximo agente
1. Leia integralmente ESTE handoff e os documentos do item 4 via conector GitHub.
2. Consulte `main`, HEAD da branch, PR #987 e CI #37970953744 (ou execução mais recente); recupere SHA **antes de qualquer gravação**.
3. **Não continue da R7 como se estivesse pendente:** R7 já foi encerrada; R8 é preparação de release com bloqueios físicos/remotos. Priorize concluir as verificações seguras possíveis, corrigir regressões encontradas e preparar homologação, sem afirmar que o sistema está publicado.
4. Faça commits pequenos na branch `agent/*`; não substituir arquivos enormes de outros projetos e não fazer deploy/migrações de produção prematuras.
5. Rode os seis jobs do CI até verde; confira `node scripts/da6-release-gate.mjs --report` e saiba que `--enforce` **deve falhar** enquanto faltarem provas. Não forjar evidências nem marcar o manifesto como aprovado.
6. Mantenha a tarefa horária ativa, preservando o estado para a próxima execução; só desative quando o release estiver plenamente homologado/publicado e entregar relatório final.

## 7. Comando de retomada
> Continue o projeto DA6 Etiquetas e Balanço da Dona Antônia no repositório GitHub `osvaldosereia/SUCEDOAN12`. **Primeiro leia INTEIRAMENTE** `docs/projects/HANDOFF_DA6_CONTINUACAO_JANELA_2026-10-09.md` na branch `agent/gondola-labels-balance-20261009`; leia também R7, R8, manifesto de gates e protocolo de QA físico, confira main/PR #987/CI. Atue como engenheiro sênior autônomo, trabalhe com commits pequenos, teste e documente. **R1–R7 já concluídas em código e CI; R8 em preparação, release bloqueado por fotos/impressão físicas e staging Edge/cron hospedado. Não publicar nem mexer em estoque/Bling sem homologação segura.** Continue os ajustes seguros e informe impedimentos reais, sem pedir confirmações operacionais intermediárias.

**Nota:** valores de ahead/behind, SHA e CI são fotografia do instante do handoff; sempre revalidar, porque há automação e outras gravações.

## 8. ATUALIZAÇÃO POSTERIOR — R8 / 09-10-2026 (continuação após abrir nova janela)

**Correção concreta do CI, sem deploy:**
- O workflow [#37971328394](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37971328394) reprovou apenas `local-supabase-storage` por `rate limit exceeded` na consulta `version: latest` da action `supabase/setup-cli@v1`; os outros cinco jobs passaram. A limpeza também falhava se a instalação não havia criado o diretório.
- Commit [`3477422a3f9c824dd71ebe41102b2ffb2644a321`](https://github.com/osvaldosereia/SUCEDOAN12/commit/3477422a3f9c824dd71ebe41102b2ffb2644a321): action oficial Supabase setup-cli v3.0.1 imutável (`45a513f8c64c0bc8e0e3dfe572b5c95be85f6359`), CLI `2.120.0` via npm, etapa `supabase --version` e limpeza condicional segura. Sem alteração de gateway, impressora, estoque ou Bling.
- **CI DA6 [#37971817863](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37971817863) APROVADO: 6/6 jobs SUCCESS, 74 PASS e 0 FAIL**; todos os testes Deno/PostgreSQL/Storage local passaram. O código de origem validado era o commit `3477422a3f9c824dd71ebe41102b2ffb2644a321`. As alterações de documentação subsequentes não mudam arquivos críticos de execução.
- Manifesto de release atualizado com o CI mais recente, **sete gates permanecem `passed:false`**, `release_candidate_fingerprint:null` e `release_status:blocked`. Nenhum teste digital é prova física.

**Supabase canônico consultado em leitura somente:**
- `ssbesxgaijknwsjbsbcz` está saudável. `inventory_label_batches=0`, `inventory_label_photos=0`, `inventory_label_counts=0`, bucket `inventory-label-photos` privado existente; não foi encontrada a tabela `inventory_label_review_events` da migração de auditoria nova.
- Agendador `inventory-label-worker-da6-v1` está ativo no banco, embora não haja fotos. NÃO o alterar durante esta preparação sem auditoria/rollout aprovado.
- A API de branches Supabase mostrou apenas `main` no projeto canônico, **nenhum staging remoto DA6 separado**. Nada foi provisionado ou testado em Edge/cron remoto.

**Conflitos e concorrência:**
- A `main` avançou após o PR e incorporou alterações de recuperação fiscal e reservas na separação, inclusive em `vitrine/admin/index.html` e `supabase/functions/admin-products-live-v1/index.ts` (arquivos também presentes no diff DA6). O PR passou a exibir `mergeable:false` na nova consulta e deve permanecer draft. Não resolver por sobrescrita dos arquivos grandes, nem fazer merge automático.
- Descrição do PR #987 foi atualizada para refletir as R1–R7, R8, CI e gates reais, mantendo aberto em draft e sem merge.

**Automação horária:** tarefa “Etiquetas e Balanço Dona Antônia” já encontrada **ATIVA**, em recorrência a cada hora. Preservar; não duplicar.

**PRÓXIMO PASSO:** continuar apenas verificações de release seguras, conciliação não destrutiva da `main`, e preparação do QA. Não publicar antes de imprimir em hardware real 203 dpi, testar fotos com celular real e homologar Edge + cron remotos em staging isolado, além de backup e rollback documentados. Não forjar evidências nem alterar balanços A4, estoque ou Bling.

## 9. R8 — RECONCILIAÇÃO CONCORRENTE DA MAIN E TESTE DE REGRESSÃO (09/10/2026)

**Ponto de partida:** PR #987 não mesclável (2 commits atrás de main); a main adicionou 6 arquivos modificados/novos relacionados a recuperação fiscal Bling, novas telas de fiscal e idempotência de reserva na separação. Os arquivos sobrepostos eram somente `vitrine/admin/index.html` e `supabase/functions/admin-products-live-v1/index.ts`. Merge ingênuo dos dois arquivos grandes não seria seguro.

**Execução efetiva:**
1. Commit [`8ecc026054ab2ac2a9d2b4137cfcb7cc4784ac17`](https://github.com/osvaldosereia/SUCEDOAN12/commit/8ecc026054ab2ac2a9d2b4137cfcb7cc4784ac17): MERGE EXCLUSIVAMENTE da main `a9289d04b23fcd595e3ba0ac37bcd2876a3dc962` na branch DA6 (primeiro pai `29f4ef070204c862c96b23232e1e5319ce5d32bc`). O procedimento comparou três versões de cada arquivo e reconstruiu 3 hunks DA6 do HTML e 5 do gateway. No gateway, reconciliou explicitamente a união dos conjuntos `LOCAL` e `WRITE_ACTIONS` e preservou simultaneamente rota autenticada do worker DA6 e novas rotas de recuperação fiscal da main. Os outros 4 arquivos da main foram mantidos por SHA de blob original. Validações de integridade e marcadores passaram. **NÃO houve merge do PR na main nem deploy.**
2. Após o merge, GitHub informou **PR draft `mergeable=true`, ahead da main e `behind=0`**, na consulta registrada. Isso não representa aprovação de release: main continua em desenvolvimento concorrente.
3. Commit [`87b7833b290c70127a6e3b0870be7011bb7e828d`](https://github.com/osvaldosereia/SUCEDOAN12/commit/87b7833b290c70127a6e3b0870be7011bb7e828d): teste de regressão em `tests/da6-main-integration-gate.test.cjs` exige simultaneamente as oito operações DA6, as duas operações fiscais novas, seis rotas de escrita restritas a não-viewers, ordem worker/operador/revisão/viewer/fiscal e presença das telas. Inspeção direta dos arquivos combinados **PASS**: 10 rotas, 6 bloqueios de escrita, 3 operações históricas read-only, sequência de autenticação e marcadores na UI.
4. Commit [`eed26e1c1cdf40901404599a51e7956360cc6889`](https://github.com/osvaldosereia/SUCEDOAN12/commit/eed26e1c1cdf40901404599a51e7956360cc6889): removido o gatilho duplicado `push` do CI específico DA6, conservado `pull_request` em `main`. Antes disso um push+PR com mesmo SHA produzia duas execuções no mesmo grupo de concorrência, cancelamentos e gasto desnecessário. Agora a execução única por PR valida a branch draft.

**CI no instante deste registro:**
- Código anterior da R8: [run #37971817863](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37971817863) PASS 6/6 jobs e 74 testes.
- Commit final reconciliado `eed26e1c1cdf40901404599a51e7956360cc6889`: [run #37976498877](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37976498877) **QUEUED na consulta**, NÃO marcar como aprovado antes de conferir resultados finais. Próxima execução deve verificar todos os seis jobs e contagem de testes.
- CI geral Admin and Baskets Guard segue com falha pré-existente `channel_origin` em `pedido/index.html`; o teste falho identificado foi `scripts/test-admin-pending-data-baskets-public-v1.mjs`, linha 39. Não modificar código de pedidos fora do projeto responsável nem silenciar CI.

**Segurança e invariantes:** as sete provas de release continuam pendentes; `release_status=blocked` e `release_candidate_fingerprint=null`. Nada de impressora física, fotos de celular real, Edge/pg_net remoto ou rollback foi homologado. Não aplicar migrações em produção, não fazer merge do PR na main e não alterar estoque ou Bling via contagem histórica. A4 preservado. Automação horária DA6 permanece ativa.

**Próximo checkpoint:** confirmar run #37976498877; se vermelho, identificar e corrigir somente regressões DA6. Se verde, atualizar manifesto `verified_software` com o run e contagem de testes, preservando os sete gates em `false`. Verificar SHA atual da main/PR antes de mais reconciliações. Aguardar homologações físicas e staging sem criar evidências fictícias.

## 10. FECHAMENTO DA RODADA DE RECONCILIAÇÃO — CI FINAL VERDE

- **EVIDÊNCIA MAIS RECENTE:** [DA6 CI #37976498877](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37976498877), commit fonte `eed26e1c1cdf40901404599a51e7956360cc6889`, **COMPLETED SUCCESS 6/6 jobs**: `deterministic-tests` **75 PASS, 0 FAIL**, `edge-types`, `postgres-review`, `postgres-upload`, `postgres-worker` e `local-supabase-storage` todos SUCCESS.
- O manifesto `docs/projects/DA6_RELEASE_GATES_2026-10-09.json` foi atualizado no commit `9315e001c84b870ac1457cc2074cc6c1d6c5c8d1` com essa evidência, **sem modificar** os sete gates `passed:false`, `release_status:blocked` ou `release_candidate_fingerprint:null`.
- As alterações de documentação posteriores ao commit testado não modificam o código da implementação nem o workflow. PR #987 continua **DRAFT / NÃO MESCLADO**; nenhum deploy/SQL/estoque/Bling foi alterado.
- **Próximo responsável:** confira a `main` e o último HEAD do PR antes de agir. Se main avançou, repita conciliação cuidadosa; se não, avance exclusivamente homologação física/staging remoto seguro, backup/rollback e proteção de publicação. Não substitua as provas pendentes por testes sintéticos.

## 11. R8 — HARDENING DE HOMOLOGAÇÃO E STAGING (09/10/2026)

**Execução real nesta rodada — todos os commits somente na branch DA6; NENHUM merge para a main, deploy ou alteração produtiva:**

1. `scripts/da6-release-attestation.mjs`: novo parser estrito de atestados de QA no primeiro bloco de um arquivo `DA6_QA_*.md`. Exige `DA6_ATTESTATION_V1`, `gate` exato, `source_fingerprint` SHA-256 exato do código e `result: PASS`. Rejeita atestado reutilizado de outro gate/versão, ausente, duplicado ou informal. Integrado ao `scripts/da6-release-gate.mjs` **depois** de validar o hash SHA-256 do documento. Commits `b76e4051`, `db877d8f`. Essa verificação **não** atesta a autenticidade física ou aprovação humana; continua necessário verificar fotos, impressora, executor, staging e rollback reais.
2. `tests/da6-release-attestation.test.cjs`: seis cenários (incluindo divergência de gate, versão antiga, marcação FAIL, duplicação e quebras CRLF), commits `128c599b` e `aca229d3`. O protocolo `docs/projects/DA6_QA_PROTOCOLO_FISICO_PENDENTE_2026-10-09.md` foi atualizado com cabeçalho exigido para documentos futuros; commit `6538743c`. **Nenhum documento foi marcado como PASS.**
3. `scripts/da6-staging-preflight.mjs`: validação **offline / sem rede / sem deploy**, exigindo `DA6_TARGET_ENV=staging`, projeto ref explícito e confirmação independente idêntica, URL exata do worker no projeto escolhido. Recusa expressamente os projetos existentes `ssbesxgaijknwsjbsbcz` (canônico) e `qxstkwshuvplmmftrctj` (Vitrine/Admin). Não usa credenciais nem contata serviços. Commit `2570c66d`.
4. `tests/da6-staging-preflight.test.cjs`: seis testes para staging distinto, bloqueio dos dois projetos existentes, URL alterada/adversarial, confirmação ausente ou divergente, CLI fail-closed e relatório sem mutações. Commit `b60aad23`. Procedimento documentado em `docs/projects/DA6_RODADA_08_PREPARACAO_RELEASE_2026-10-09.md`, commit `4748c736`.
5. `scripts/da6-release-fingerprint.mjs` agora cobre os próprios controles `da6-release-fingerprint`, `da6-release-gate`, `da6-release-attestation` e `da6-staging-preflight`: alterar proteções também invalida o código congelado. Teste de fingerprint atualizado com fixture e asserções correspondentes, commits `7e66e90b` e `b5ace799`.

**Prova CI DA6 após todo código novo:** GitHub Actions [#37977663100](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37977663100) **COMPLETED SUCCESS** no commit `b5ace799aa18c955823d34687a256f41ba7401ac`; **6/6 jobs SUCCESS, 87/87 testes determinísticos PASS, zero falhas**; tipagem Edge, PostgreSQL (review/upload/worker) e Supabase local (Storage/Auth + upload 160 imagens digitais) verde. Manifesto atualizado com estes resultados no commit `33449d02592a3a0cab8c9ffcbab699c708e4482b`. Arquivos de documentação posteriores não mudam os fontes já testados.

**Runtime consultado apenas para auditoria:** projeto Supabase canônico `ssbesxgaijknwsjbsbcz` está ACTIVE_HEALTHY; tabelas antigas `inventory_label_batches`, `inventory_label_photos`, `inventory_label_counts` têm RLS ativado e nenhuma política em `public` (deny-by-default para Data API); bucket `inventory-label-photos` é privado, 10 MiB, aceita image/jpeg, image/png e image/webp. API de branches retornou apenas o projeto principal, sem staging DA6 isolado. Nada foi alterado no banco.

**Divergência concorrente ainda não reconciliada:** após concluir código seguro, a `main` avançou mais um commit relativo à versão `a9289d04`, adicionando automação fiscal e alterando novamente `supabase/functions/admin-products-live-v1/index.ts` e `vitrine/admin/index.html`. O PR permaneceu `mergeable=true` na última consulta mas `behind=1`; NÃO fazer merge cego nem declarar `latest_main_conflict_review` aprovado.

**Gate de produção:** `docs/projects/DA6_RELEASE_GATES_2026-10-09.json` continua **`release_status=blocked`**, sete gates `passed:false`, `release_candidate_fingerprint:null`. Faltam hardware 203dpi e fotos de celular reais, Edge/cron remotos em staging separado, backup e ensaio de rollback. CI digital verde não prova isso. Preservar A4 e contagens históricas; não alterar estoque/Bling. Automação horária continua ativa.

**PRÓXIMO:** verificar HEAD da `main`, PR #987 e CI mais novo. Reconciliar o commit fiscal novo da `main` com merge 3-way controlado em branch DA6, preservando ambas as funcionalidades, se continuar seguro, e repetir CI. Preparar QA física e staging isolado, mas não provisionar serviço pago, não usar canônico como staging e não aprovar gates sem evidências reais.

## 12. R8 — CONCLUSÃO TÉCNICA PREPARADA; HOMOLOGAÇÃO FÍSICA/REMOTA PENDENTE

**Pedido:** concluir rapidamente com o mínimo de intervenções e sem impactar negócios paralelos.

**Mudanças efetivamente executadas (sem tocar produção):**
1. Revalidada `main` no commit `168558b6b8710ee7feda1b7c6a9360357357b0d3`, dois commits à frente do ponto de integração DA6 anterior `a9289d04b23fcd595e3ba0ac37bcd2876a3dc962`. Essa nova main agregava recuperação fiscal automatizada de NF-e, gap remoto NCM e edições em dois arquivos também usados no DA6.
2. Conciliação 3-way por **hunks disjuntos** nos arquivos `supabase/functions/admin-products-live-v1/index.ts` (4 hunks main + 5 DA6) e `vitrine/admin/index.html` (2 hunks main + 3 DA6). Zero sobreposições; preservar todos os acréscimos originais de main e marcadores DA6, além dos demais seis arquivos fiscais por SHA exato. Merge **DA MAIN PARA A BRANCH**, commit [`5c75b7f2ae84baf235064727a042ce87040631d3`](https://github.com/osvaldosereia/SUCEDOAN12/commit/5c75b7f2ae84baf235064727a042ce87040631d3), pais `8ef28d0798669fe7feab0829057e89f6212e67bf` e `168558b6b8710ee7feda1b7c6a9360357357b0d3`. O PR #987 retornou **draft, mergeable=true e behind=0** na verificação logo após a reconciliação (fotografia transitória).
3. [CI DA6 #37978738727](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37978738727) **COMPLETED SUCCESS — 6/6 jobs, 87 testes determinísticos PASS/0 FAIL**, incluindo Supabase local e PgSQL/Edge. Commit fonte do teste é o merge `5c75b7f2`. Manifesto atualizado com este run no commit `20e95a840672ecab5cea39e66c9333d04f6ff20c`.
4. Criado guia operacional único `docs/projects/DA6_GUIA_EXECUCAO_EXPRESSA_PARA_HOMOLOGACAO_2026-10-09.md` no commit `adfe4970eb6494469fd423b6f0a62d22ca16e1d2`. Contém preparação de staging sem usar projetos existentes, checklist 203 dpi, 6 registros 0/1/7/10/23/99, 10/50/100 fotos reais, casos ambíguos, histórico, A4, backup e rollback, todos **PENDENTES**, não aprovados.
5. Conferidos via Supabase conector os projetos disponíveis: canônico `ssbesxgaijknwsjbsbcz` ACTIVE_HEALTHY, `qxstkwshuvplmmftrctj` INACTIVE (pertence a outra parte da operação), `ijquzclfijwfgwupoxmg` Caneca Fácil INACTIVE (outro negócio, não reutilizar). Organização está no plano Pro; preview branches são cobradas por uso e não contam com proteção do Spend Cap segundo documentação do Supabase. **Não há staging independente DA6 e nenhum novo projeto/branch foi criado**. Antes de provisionar recurso com custo, exige decisão explícita de organização, custo e confirmação pela integração.
6. PR #987 segue **DRAFT / NÃO MESCLADO**. A falha do workflow geral Admin and Baskets Guard em `channel_origin` (pedido/index.html) é preexistente e não pertence ao DA6; não alterar arquivos de pedidos silenciosamente.

**ESTADO FINAL TÉCNICO desta rodada:** software validado em CI 6/6, 87/87. Ainda **não está em produção**; `release_status=blocked`, `release_candidate_fingerprint=null`, **sete** requisitos físicos/remotos/release ainda `passed:false`. As fotografias históricas não alteram estoque/Bling, e o balanço A4 permanece preservado.

**CAMINHO CURTO DE CONCLUSÃO:** (a) obter staging remoto Supabase SEPARADO e aprovado em custo, (b) implantar somente staging e homologar Edge/cron/Storage privados/worker, (c) testar com impressora térmica REAL 203dpi 100×150 e celular REAL com seis quantidades e casos difíceis, (d) formalizar backup e executar rollback no staging, (e) repetir CI/fingerprint e resolver CI geral relevante, (f) revisão protegida, rollout gradual e observação. Não afirmar aprovação física/remota sem provas e não alterar manualmente os sete gates.

**Automação horária:** manter ativa com este checkpoint até conclusão realmente homologada/publicada. Não repetir as 12 rodadas antigas.

## 13. R9 — STAGING SUPABASE REMOTO REAL CRIADO, COM HOMOLOGAÇÃO PARCIAL (09/10/2026)

**Autorização expressa do usuário para preparar staging na organização atual.** Conector Supabase consultou preço antes de provisionar: **US$ 0,01344 por hora** para branch temporária (alternativa US$ 10/mês por projeto). Custos podem incluir uso adicional; branch não é coberta por Spend Cap. Confirmação de custo realizada pelo conector.

**Ambiente efetivamente criado:**
- Branch `da6-qa-20261009` ID `812c1d56-1e8a-4236-8382-b127faac5b0e`, ref de projeto hospedado `jxfxyqcpxoykdxbapswi`; parent canônico `ssbesxgaijknwsjbsbcz` e `with_data=false`.
- Quatro cron legados foram desativados **apenas** nesse staging. Base DA6 criada por migração staging-only: 3 tabelas, RLS deny-by-default e bucket `inventory-label-photos` privado de 10 MiB JPEG/PNG/WebP.
- Cinco migrações DA6 reais aplicadas na branch: fila/RPC, segredo do worker em Vault, revisão auditável, reserva transacional e cron pg_net. URL e projeto do worker no Vault apontam à própria branch. **Nunca credenciais em código.**
- Edge `admin-products-live-v1` versão **163** implantado no staging, com `index.ts` + 3 módulos DA6. `verify_jwt=false` preserva autenticação explícita própria do gateway e chave interna no worker, somente na branch.
- Cron DA6 criado mas **mantido desativado**; `SELECT public.da6_worker_dispatch_tick_v1()` com fila vazia resultou `{"ok":true,"no_op":true,"reason":"queue_empty"}`. Não houve pg_net HTTP enviado nem processamento remoto de foto.
- Verificação real de RLS/grants: RPCs DA6 sem EXECUTE para anon/authenticated, somente service_role; bucket não público. Quatro tabelas DA6 da branch contêm zero linhas. Produção permanece com zero lotes/fotos/contagens DA6, e o cron canônico não foi alterado.

**ATENÇÃO — gates ainda bloqueados:**
- A API de branches mostra `preview_project_status=ACTIVE_HEALTHY` mas `status=MIGRATIONS_FAILED`. As migrações aplicadas manualmente foram bem-sucedidas, porém o pipeline geral do branch acusa falha; investigar antes de dar homologação como concluída.
- Acesso HTTP do executor desta rodada à URL do staging não foi possível (DNS/ambiente de ferramenta); sem teste real de autenticação por HTTP, signed uploads hospedados 10/50/100, retorno Edge/pg_net, retries, logs ou fila com fotos reais.
- A impressora térmica 203 dpi 100×150 mm, celular real, backup e rollback continuam **pendentes**. Sete gates `passed:false`, release bloqueado, PR #987 DRAFT e sem merge/deploy à produção.
- Documentação completa e estado das ações: **`docs/projects/DA6_STAGING_REMOTO_AUDITORIA_2026-10-09.md`**, commit `871101f19a77ce7147f77f164a56d83193da5b13`.

**Próxima rodada:** conferir status da branch e solucionar o `MIGRATIONS_FAILED` sem rebase/reset destrutivo; testar por executor HTTP real staging separado com conta e produtos artificiais, autorizando apenas cron DA6 de forma temporária em homologação; preparar impressora/celular. Não usar produto/estoque de clientes, nem copiar credenciais produtivas. Observar custo horário **US$0,01344/h** e **excluir a branch ao terminar a homologação**. NÃO reabrir R1–R8, código local já aprovado no CI 6/6 e 87/87 da versão `5c75b7f2`.
