# Operations 2.0 — Revisão pré-homologação humana

Data: 2026-09-26

## Decisão revisada
Ainda existe trabalho autônomo seguro antes dos testes físicos. O novo fato operacional fornecido pelo proprietário é que o Supabase representa hoje o catálogo ativo, preço de venda e estoque mais próximos da realidade, enquanto o Bling contém saldo desatualizado e produtos históricos fora de venda.

Até o novo balanço físico:
- Supabase é baseline de migração para ativo/preço/estoque;
- Bling permanece shadow para estoque;
- não permitir Bling sobrescrever estoque atual do Supabase;
- produto existente no Bling não implica produto ativo na vitrine;
- novo balanço físico será o marco para homologar Bling como autoridade definitiva de estoque.

## Auditoria do catálogo
Snapshot:
- 1.630 produtos ativos;
- 1.630 com preço de venda > 0;
- 0 ativos com preço inválido;
- 0 ativos com estoque negativo;
- 1.607 com GTIN;
- products.bling_product_id ainda não materializado nos 1.630 ativos;
- bling_stock_mirror_v2 possui 1.630 produtos e 1.630 IDs Bling distintos;
- 0 conflitos entre IDs materializados e mirror;
- 1.091 estoques Supabase = physical_total do mirror;
- 539 divergem do physical_total;
- 1.087 = virtual_total;
- 543 divergem do virtual_total.

Conclusão: o mirror já fornece uma identidade Bling única para cada ativo, mas o vínculo precisa ser tratado como evidência operacional e não escrito cegamente. O estoque divergente do Bling não deve vencer o baseline Supabase.

## Programação segura feita nesta revisão
Migration: ops2_pre_human_catalog_readiness_v1.

Criados:
- ops2_pre_human_catalog_readiness_v1 (security_invoker, sem grants anon/authenticated);
- ops2_pre_human_catalog_readiness_summary_v1() (security invoker, sem grants públicos).

Resumo:
- 1.630 ativos;
- 1.630 identidades Bling disponíveis no mirror;
- 0 conflitos;
- 1.091 já alinhados fisicamente;
- 539 classificados ready_to_push_supabase_baseline.

Nenhum produto, preço, estoque, pedido ou Bling foi alterado.

## Trabalho autônomo ainda recomendado antes da presença humana
1. Construir snapshot versionado do catálogo ativo pré-sync, incluindo preço/estoque/GTIN/SKU/ID Bling e timestamp.
2. Materializar vínculo product->Bling somente onde a identidade puder ser provada pelo mirror/import anterior e unicidade; registrar evento de binding/idempotência.
3. Criar plano dry-run Supabase->Bling para preço e estoque, com before/after e rollback por item; não executar writes externos no mesmo passo.
4. Separar preço de venda, estoque físico e status comercial em operações independentes para rollback granular.
5. Garantir que produtos inativos no Supabase nunca sejam reativados na vitrine por import do Bling.
6. Criar reconciliador pós-write para confirmar que o Bling recebeu exatamente o baseline esperado antes de avançar.
7. Criar modo canário/lote pequeno antes do batch completo.
8. Consolidar observabilidade na Central: planejado, aplicado, confirmado, divergente, falhou, rollback.
9. Revisar referências das Edge Functions históricas e classificá-las; não remover sem janela de observação e prova de ausência de chamadas externas.
10. Atualizar HANDOFF/HOMOLOGATION com a nova regra de autoridade transitória.

## Trabalho que continua exigindo humano
- leaked-password protection no painel Auth;
- hardware EAN/tablet/impressora;
- canário fiscal/SEFAZ/DANFE;
- entregador/celular;
- pagamento real/split;
- XMLs reais e conversão física;
- Flow PapoAI real;
- balanço físico final;
- validação contábil/fiscal aplicável.

## Gate
PASS para continuar programação pré-humana.
FAIL/PROIBIDO para cutover global neste momento.

Rollback atual: nenhuma mudança de dado operacional foi feita; basta remover/ignorar o read model se necessário.
