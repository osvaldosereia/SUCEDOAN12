# Cosmos — Catálogo Mestre / pesquisa por família (v1–v3)

## Objetivo
Pesquisa progressiva do catálogo da Dona Antônia e preparação para famílias de variantes (fragrância, sabor e tamanhos), sem alteração automática de produtos, estoque, preços ou Bling.

## Modelo de compartilhamento
- Agrupamento `candidate_cohort_key` é **heurístico**, baseado em marca, subcategoria e apresentação. Pode unir produtos diferentes. Não é família confirmada.
- `cosmos_catalog_families` e `cosmos_catalog_family_members` permitem revisão e confirmação explícitas. A view `cosmos_family_attribute_preview_v1` sugere herança apenas após família e vínculo confirmados, sem copiar NCM, CEST, preço, estoque ou peso bruto.
- Dados compartilháveis, **apenas após prova de equivalência**: marca, linha, categoria, forma de embalagem; altura/largura/comprimento da unidade embalada quando comprovadamente igual.
- Dados exclusivos da variante: EAN/GTIN, fragrância/sabor, fórmula/composição, foto, estoque, preço, validade e vínculos operacionais.
- Peso bruto pode variar entre fragrâncias, por isso é sugestão mesmo quando volume e formato são iguais.
- NCM, CEST e tratamento fiscal **não são copiados automaticamente**; exigem enquadramento específico e validação fiscal.

## Estado confirmado no Supabase canônico — 08/10/2026 (Cuiabá)
- Estruturas v1, auditoria v2 e piloto por representante v3 instalados; Edge Function `cosmos-catalog-research-v1` publicada na versão 2.
- 1.580 produtos na fila, 7 GTINs dessa fila com dígito verificador inválido (outras pendências sem GTIN fora dessa fila).
- 16 famílias **candidatas** de quatro tipos estudados; 61 produtos cobertos; 16 EANs representativos.
- 2 grupos candidatos têm NCMs divergentes e requerem análise fiscal individual.
- `enabled=false`, `research_mode=representatives_only`, `daily_limit=25`, `max_batch=5`; nenhuma solicitação externa realizada.
- A visão `cosmos_family_representatives_v2` aponta os EANs de estudo; não cria nem aprova automaticamente vínculos `cosmos_catalog_family_members`.

## Regras adicionais de segurança
1. Códigos de barras GTIN-8/12/13/14 precisam passar no dígito verificador antes de consumir franquia.
2. `representatives_only`: consultar somente um produto exemplar por grupo, **não consultar irmãos automaticamente**. O modo `full` exige alteração explícita da configuração após homologação.
3. Famílias semelhantes podem ter fórmulas, tamanhos reais de frasco, peso bruto, dimensões, NCM e CEST diferentes; qualquer herança demanda prova do atributo na apresentação específica.
4. Os demais produtos continuam pendentes até evidência direta ou confirmação suficiente; nenhuma variante recebe estado de validada apenas porque o representante foi pesquisado.
5. O Cosmos não está configurado para executar sem `COSMOS_API_TOKEN`, `COSMOS_USER_AGENT` e `COSMOS_WORKER_SECRET`.

## Implementação proposta
1. Revisar o SQL em `supabase/migrations/20261008233000_cosmos_catalog_research_v1.sql` e aplicar por migration aprovada.
2. Verificar os [Termos de Uso](https://cosmos.bluesoft.com.br/termos_de_servico) e [licenças](https://cosmos.bluesoft.com.br/licenses) antes de coletar ou usar os resultados comerciais.
3. Configurar segredos no Supabase Edge: `COSMOS_API_TOKEN`, `COSMOS_USER_AGENT` e `COSMOS_WORKER_SECRET`. **Nunca no GitHub nem no navegador.**
4. Publicar `supabase/functions/cosmos-catalog-research-v1/index.ts` com `verify_jwt=true`.
5. Testar `mode:preview`; então ativar manualmente em `cosmos_research_config` com `research_mode=representatives_only` e executar um piloto autenticado de 1–5 GTINs.
6. Conferir identidade, licença, unidades físicas, dados fiscais e resultados; só então planejar agendamento de até 25 consultas/dia. Não há Cron criado por esta versão.

## Controles
- Reserva atômica da franquia por dia local de Cuiabá (máximo 25); cada HTTP consome uma vaga independentemente do sucesso.
- Erros HTTP 429/401/403 interrompem ou adiam, sem pressionar a API.
- Dados externos ficam **apenas como propostas internas** com origem e revisão; nenhuma escrita em `products`, `product_fiscal_profiles` ou Bling.
- Necessário confirmar com o fornecedor se armazenamento e reutilização dos atributos obtidos são permitidos pelo plano/licença; por precaução nenhum uso público está habilitado.
- Queries de produtos com GTIN ausente ou inválido não consomem franquia.

## Próxima etapa após piloto
Expandir a classificação candidata para outras famílias; implementar validação por IA/regras, revisão no Vitrine/Admin e herança explícita por atributo apenas para membros confirmados e apresentação verificada.
