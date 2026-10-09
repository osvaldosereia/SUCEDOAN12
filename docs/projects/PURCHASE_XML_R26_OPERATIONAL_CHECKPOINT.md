# Checkpoint R26 — Compras e Catálogo XML — 09/10/2026

**Repositório:** `osvaldosereia/SUCEDOAN12`  
**Branch:** `agent/xml-catalog-operational-gates-r26-20261009`  
**PR draft empilhada:** [#1025](https://github.com/osvaldosereia/SUCEDOAN12/pull/1025), base R25 [#1022](https://github.com/osvaldosereia/SUCEDOAN12/pull/1022), que depende de R24 #1018 → R23 #1012 → R18–R22.  
**Head técnico verificado antes deste checkpoint:** `c92241ed76f1ce5f0fcd222e2f2bf55d4f9f50f6`.

## Resultado comprovado: suite R26 3/3 SUCCESS, **homologação Supabase real pendente**

[GitHub Actions R26 — run 37972261768](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37972261768), **3 jobs SUCCESS**:
1. `preflight-and-gateway`: scanner fail-closed de versões remotas, deduplicação de migration, bloqueios de liberação, testes de gateway/ator R21 e R24, dossiê fiscal R25, integração do roteador principal R23 e integridade de XML R19.
2. `edge-typecheck`: `deno check` completo de ambos os `purchase-xml-v1/index.ts`, parser real e regressão de importação em Deno.
3. `integrated-postgres`: PostgreSQL 17 efêmero; no **mesmo banco** roda o gatilho de lote obtido do esquema produtivo e aplica as migrations SQL R23 e R24 já commitadas, nessa ordem. Exercita vínculo atômico → proposta/decisão → prévia read-only → aplicação somente do nome de produto inativo → rollback CAS. Confere owner/admin, operador/viewer, proprietário desativado, `anon`/`authenticated` sem EXECUTE, RLS em cinco ledgers, auditoria e nenhuma alteração de estoque, lotes, preço, custo, NCM ou tributos. O teste não chama Bling nem finance.

**Correção de CI:** a primeira run [37972178740](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37972178740) teve PostgreSQL e Edge aprovados, mas Node falhou ao importar `npm:` no teste R19. O teste foi movido para Deno, sem alterar regras de negócio. A run final 37972261768 ficou integralmente verde.

## Arquivos gravados na R26

- `scripts/test-xml-catalog-integration-r26.pg.sql`: sequência R23 → R24 integrada com gatilho real reproduzido e teste transacional de identidade, aprovação e reversão.
- `scripts/xml-release-preflight-r26.mjs`: avaliação de liberação **somente leitura** e fail-closed; exige snapshot explícito do histórico remoto e evidências de seis gates operacionais, não executa migrations ou deploy.
- `scripts/test-xml-release-preflight-r26.mjs`: regressão de versões e rejeição de migração duplicada, divergência de ordem, ausência de sessão de homologação e segredo elevado em UI.
- `.github/workflows/xml-catalog-operational-r26.yml`: jobs do CI acima, sem segredo de produção.

## Supabase confirmado em consulta exclusivamente de leitura

- Projeto **produtivo canônico**: `ssbesxgaijknwsjbsbcz`; `main` verificada: `d5f3f16b5b6b8ba27823406de0c43628e62d4a78`.
- Histórico remoto de 09/10 termina em `20261009155231_separation_ready_reservation_idempotence_20261009`.
- Não existem no histórico remoto as migrations `20261009145919_purchase_xml_identity_atomic_r23` ou `20261009155445_purchase_xml_field_approval_r24`. A R23 tem versão **anterior** a uma já aplicada. **Não executar `db push`, `migration repair` nem migration via produção sem reversionamento pela Supabase CLI e prova em projeto isolado.**
- Projetos conectados consultados: `ssbesxgaijknwsjbsbcz` ativo, os demais `ijquzclfijwfgwupoxmg` e `qxstkwshuvplmmftrctj` inativos e não identificados como homologação deste projeto. Não há branch de homologação Supabase criada. **Nenhum projeto novo foi criado**.
- A UI monolítica `vitrine/admin/index.html` continua sem controle para prévia/aplicar/reverter R24 nem visualização do dossiê fiscal R25; houve bloqueio de edição anterior. Não alegar disponibilidade no Admin.

## Gates que permanecem abertos (não foram simulados como aprovação real)

1. **Novo ambiente de homologação dedicado e isolado**, sem usar produção nem reaproveitar indevidamente outro projeto. Verificar custo/permissão antes da criação.
2. **Reconcile migrations para liberação:** gerar versões cronologicamente posteriores à última instalada por meio da **Supabase CLI**, mantendo dependência R23 antes de R24; atualizar referências de testes e impedir aplicação dupla do SQL de separação já instalado. Testar `migration list` e rollback em staging. Não registrar versões como aplicadas sem executar.
3. **Auth/RLS reais**: owner/admin, operator/viewer, usuário desativado, token interno, token vencido; JWT do roteador pai, grants na PostgREST real, sessão Supabase.
4. **UI Admin**: integração permitida, controles pequenos e lazy, preview/dupla confirmação, rollback CAS, dossiê fiscal como evidência read-only, testes de celular/desktop e mensagens de escopo parcial; não contornar bloqueios de ferramenta.
5. **Fluxo operacional em staging**: XML de teste sem dados pessoais, importação e releitura, falhas de rede, Bling simulado, desempenho, concorrência, idempotência, recebimento físico apartado; preservar conteúdo de Compra/XML legado.
6. **Gate de publicação R27:** backup/restauração testados, alertas e plano de rollback, implantação DB→Edge→UI somente após todos gates.

## Segurança e preservação

Nenhum merge na `main`, deploy Edge, alteração em esquema ou dados do Supabase real, criação de produto, alteração de estoque, preço, NCM/CEST, Bling, financeiro, WhatsApp ou cron foi efetuado pela R26. Os testes usam apenas fixture do gatilho de produção em **PostgreSQL descartável**. A nova suíte constitui um avanço verificável, mas **não certifica homologação real nem autoriza deploy**.

### Orientação para próxima janela

> CONTINUAR DONA ANTÔNIA — COMPRAS/CATÁLOGO XML após R26. Leia integralmente `docs/projects/PURCHASE_XML_R26_OPERATIONAL_CHECKPOINT.md` e o handoff longitudinal na branch `agent/xml-catalog-operational-gates-r26-20261009`, PR draft #1025, CI 37972261768 3/3 verde. Avance diretamente os gates de staging real, reversionamento canônico de migrations via CLI e integração de UI por caminho permitido. Não tocar produção nem `main` antes da prova de Auth/Edge/RLS/browser, backup e validação de release. Não reimplantar R18–R25.


## Atualização de concorrência na main — pós-CI R26

Depois da suite R26 aprovada, a `main` avançou em **um commit alheio ao XML**, de `d5f3f16b5b6b8ba27823406de0c43628e62d4a78` para `a9289d04b23fcd595e3ba0ac37bcd2876a3dc962` (recuperação fiscal manual Bling e rechecagem NF-e). Arquivos modificados na `main`: `supabase/functions/admin-products-live-v1/index.ts`, `supabase/functions/admin-service-intelligence-v1/index.ts`, `vitrine/admin/index.html` e teste fiscal novo. **A branch R26 não incorpora esse commit novo**. Não usar o `index.html` ou o roteador pai antigos da branch R26 para substituir os atuais da `main`. Antes de qualquer PR final destinada à `main`, reconciliar essas modificações e repetir CI + testes fiscais. Nenhuma tentativa de merge automático ou force-push foi realizada.
