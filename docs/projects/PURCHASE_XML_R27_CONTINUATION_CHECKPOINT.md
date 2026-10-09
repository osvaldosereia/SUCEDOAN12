# Dona Antônia — Compras/Catálogo XML — Checkpoint R27 (09/10/2026)

**Branch de continuidade:** `agent/xml-catalog-ui-release-r27-20261009`  
**PR draft:** [#1027](https://github.com/osvaldosereia/SUCEDOAN12/pull/1027) → R26 [#1025](https://github.com/osvaldosereia/SUCEDOAN12/pull/1025) → R25 #1022 → R24 #1018 → R23 #1012 → cadeia R18–R22.  
**CI R27 final aprovada:** [run #37977436091](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37977436091): **4/4 jobs SUCCESS**, `cli-version-probe`, `admin-ui`, `xml-edge`, `combined-database`.  
**Status:** trabalho técnico R27 gravado e testes descartáveis concluídos; **nenhum deploy, migração produtiva, merge na main ou homologação real Supabase/browser**.

## 1. UI XML implementada na branch

Arquivo `vitrine/admin/index.html` atualizado pelo fluxo normal de gravação do GitHub, com commit `d3fe11aef36e61c2f79570b55fe9a95c74cdc9ee`. Não foi necessário contornar bloqueio de ferramenta, e não se substituiu arquivo da `main`.

- Novo controle **Consultar dossiê fiscal** na ficha XML com chamada sob demanda à action R25 `xml_catalog_fiscal_dossier`. Exibe NCM, CEST, EAN comercial/tributável, `uCom/uTrib`, conflitos e aviso explícito de histórico parcial. Sem alteração fiscal ou inferência de tributação.
- Revisão humana existente é mantida. Após carregar decisões de um produto vinculado, o Admin consulta também `xml_field_apply_list` de forma segregada, com erro de aplicação visível e sem quebrar revisão preexistente.
- Prévia read-only via `xml_field_apply_preview` para revisão aprovada de **nome**. Botão de aplicação só surge se o servidor retornar `can_apply=true`. Exige confirmação e digitação exata de `APLICAR_NOME_APROVADO_XML`, enviando a revisão esperada ao SQL CAS.
- Histórico de aplicações, com rollback exclusivamente de aplicação ainda ativa e confirmação/digitação de `REVERTER_NOME_APLICADO_XML`. O servidor bloqueia se houve mudança concorrente ou ativação do produto.
- Busca/detalhe continuam lazy e carregamentos tardios são descartados ao trocar de candidato. Nenhuma chave service_role no HTML. Nenhum controle altera NCM, CEST, GTIN, preço, estoque, Bling ou financeiro.
- `scripts/test-xml-admin-r27.mjs`: compila todos os scripts inline via `node:vm` (sintaxe real) e verifica rotas, bloqueios, mensagens, confirmação, escopo e segredo.

**Limite:** o teste do HTML é estático/compilação; ainda falta navegador autenticado real desktop/mobile com API e Supabase isolados. Não alegar UI pronta para operação.

## 2. R23/R24 reversionadas pela Supabase CLI (sem executar SQL remoto)

CI inicial [#37976359262](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37976359262) executou `supabase migration new` na **CLI 2.84.2** e produziu, sem escrita em produção:
- `20261009185312_purchase_xml_identity_atomic_r27.sql`
- `20261009185314_purchase_xml_field_approval_r27.sql`

Na branch R27, copiados os conteúdos **idênticos** das migrations antes versionadas R23 e R24 para esses nomes gerados pela CLI. Os dois arquivos anteriores (`20261009145919_...`, `20261009155445_...`) foram excluídos da árvore da R27, para não criar duplicidades. O histórico de SQL em docs permanece intocado. Scripts e workflows R23/R24/R25/R26 foram atualizados para os caminhos R27. A migration de separação aplicada `20261009155231` continua preservada e `20261009160000` não existe na branch.

R27 CI confirma o conteúdo idêntico por `diff/cmp`, a ordem das versões via Supabase CLI, gatilho real de lote reproduzido e aplicação R27 → revisão → prévia → nome inativo → rollback CAS em PostgreSQL 17 **efêmero**. Não aplicou qualquer migration ao Supabase.

## 3. Divergência maior do histórico detectada (bloqueador real)

Leitura read-only via Supabase `list_migrations` do projeto canônico `ssbesxgaijknwsjbsbcz` confrontada com a árvore R27:

| Métrica | Valor |
|---|---:|
| Migrations SQL locais nesta branch | **136** |
| Entradas no histórico remoto Supabase | **1.186** |
| Versões presentes nos dois lados | **31** |
| Arquivos locais sem a mesma versão no histórico remoto | **105** |
| Versões remotas sem arquivo correspondente nesta branch | **1.155** |
| Arquivos locais cujos nomes existem remotamente em versões diferentes | **92** |
| Arquivos locais com prefixo não canônico de 14 dígitos | **5** |

Exemplos que afetam o próprio XML: `20261009051500_purchase_xml_catalog_observations_v1.sql` tem homônimo remoto `20261009023146`; `20261009071500_purchase_xml_catalog_details_v2.sql` tem homônimo remoto `20261009025849`. Orçamento/Bling também difere local `20261009133000` vs remoto `20261009133642`. **Não assumir que o SQL dos homônimos é idêntico sem comparação de texto e revisão.**

Consequência: **NÃO executar `supabase db push` global, `migration repair`, `supabase db reset`, tampouco sincronizar toda a pasta de migrations em produção.** O reversionamento XML R27 resolve a ordem de **duas novas migrations**, mas não resolve a história global do repositório. A futura implantação deve ter plano autorizado de migrations **explicitamente selecionadas e testadas** em staging real, com verificação de versões, SQL, rollback e impacto, em vez de aplicar as 105 locais descontroladamente.

Novo `scripts/xml-migration-drift-guard-r27.mjs` compara histórico completo e falha fechado (`ok_for_global_db_push=false`) quando há drift. Testes `scripts/test-xml-migration-drift-r27.mjs` cobrem replay, nome/timestamp divergente, arquivo inválido, duplicidade e lado remoto incompleto. O `scripts/xml-release-preflight-r26.mjs` agora incorpora esse bloqueio, impedindo liberação automática diante de divergência global.

## 4. Compatibilidade do schema vivo (consulta exclusivamente de leitura)

Consulta `information_schema.columns` de **64 pares tabela/coluna** necessários a identity/review/apply R23/R24: **64 presentes, 0 ausentes**. Inclui `products`, `purchase_xml_items`, `product_identifiers`, `admin_users`, recibos e lotes, `product_fiscal_profiles` e view de evidências XML. É verificação estrutural, não equivale a aplicar migrations, Auth real, performance, gatilhos em ambiente remoto ou browser.

## 5. Estado da main e preservação

`main` verificada no começo da R27: `a9289d04b23fcd595e3ba0ac37bcd2876a3dc962`, com alteração paralela de recuperação fiscal Bling e controles NF-e. Este commit **não foi incorporado à branch R27**. Em especial `supabase/functions/admin-service-intelligence-v1/index.ts`, `vitrine/admin/index.html`, `admin-products-live-v1/index.ts` e `scripts/test-admin-fiscal-recovery-v1.mjs` devem ser conciliados com essas alterações antes da integração na main. Nenhuma sobrescrita da main ocorreu.

## 6. Próximo trabalho — R28/R29

1. Preparar Supabase **isolado de homologação**; verificar custo antes de criação. Não reutilizar projeto de outro negócio nem aplicar SQL produtivo. Separar Auth/DB/Edge/Storage de produção e usar dados de teste não pessoais.
2. **Validar estratégia de migrations selecionadas:** comparação do SQL dos homônimos XML já aplicados, `R27 identity` → `R27 field approval` na ordem, RLS/grants reais, role ativo/desativado, trigger de lote, idempotência, rollback, sem rodar a pasta histórica inteira. Não registrar versões como aplicadas sem execução.
3. Conciliar o novo commit fiscal da `main` sem perder UI XML nem mudanças de pedidos; CI conjunto e teste fiscal.
4. Executar testes navegador (celular/desktop), caso sem GTIN, EAN comercial/tributável divergentes, embalagem/fator, XML corrompido, duplicação, histórico parcial, Bling simulado, corrida de duas pessoas, timeout, aplicação do nome inativo e rollback CAS.
5. Só depois preparar **R29 / release controlada** com backup e restauração, monitoramento, observabilidade e verificação DB→Edge→UI. Não alterar produtos fiscais/estoque/financeiro automaticamente.

## Resumo de segurança

R27 não realizou mutações em Supabase canônico, compras, lotes, produtos, preço, NCM/CEST, Bling, financeiro, WhatsApp, cron ou `main`. CI 4/4 e 64 campos existentes **não autorizam deploy**. PR #1027 deve permanecer draft até homologação real, plano de migração seletiva e revisão de segurança.

### Comando para nova janela

> CONTINUAR PROJETO DONA ANTÔNIA — COMPRAS/CATÁLOGO XML — R28. GitHub `osvaldosereia/SUCEDOAN12`, branch `agent/xml-catalog-ui-release-r27-20261009`, PR draft #1027. Leia INTEGRALMENTE `docs/projects/PURCHASE_XML_R27_CONTINUATION_CHECKPOINT.md` e `docs/projects/HANDOFF_COMPRAS_CATALOGO_XML_2026-10-08.md`. R27 implementou UI fiscal e aplicação/rollback de nome inativo e reversionou migrations pela Supabase CLI, CI #37977436091 4/4 verde. Global `db push` está BLOQUEADO por drift estrutural entre 136 SQL locais e 1.186 remotos; não usar `migration repair`. Concilie main fiscal `a9289d04`, prepare staging real isolado, Auth/Edge/UI e estratégia de migrations selecionadas, sem tocar produção antes dos gates. Atualize PR e handoff ao final.
