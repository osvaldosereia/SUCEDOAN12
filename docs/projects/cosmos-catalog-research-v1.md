# Cosmos — Catálogo Mestre / pesquisa segura por EAN (v1)

## Objetivo
Pesquisa progressiva do catálogo da Dona Antônia e preparação para famílias de variantes (fragrância, sabor e tamanhos), sem alteração automática de produtos, estoque, preços ou Bling.

## Modelo de compartilhamento
- Agrupamento `candidate_cohort_key` é **heurístico**, baseado em marca, subcategoria e apresentação. Pode unir produtos diferentes. Não é família confirmada.
- `cosmos_catalog_families` e `cosmos_catalog_family_members` permitem revisão e confirmação explícitas. A view `cosmos_family_attribute_preview_v1` sugere herança apenas após família e vínculo confirmados, sem copiar NCM, CEST, preço, estoque ou peso bruto.
- Dados compartilháveis, **apenas após prova de equivalência**: marca, linha, categoria, forma de embalagem; altura/largura/comprimento da unidade embalada quando comprovadamente igual.
- Dados exclusivos da variante: EAN/GTIN, fragrância/sabor, fórmula/composição, foto, estoque, preço, validade e vínculos operacionais.
- Peso bruto pode variar entre fragrâncias, por isso é sugestão mesmo quando volume e formato são iguais.
- NCM, CEST e tratamento fiscal **não são copiados automaticamente**; exigem enquadramento específico e validação fiscal.

## Implementação proposta
1. Revisar o SQL em `supabase/migrations/20261008233000_cosmos_catalog_research_v1.sql` e aplicar por migration aprovada.
2. Verificar os [Termos de Uso](https://cosmos.bluesoft.com.br/termos_de_servico) e [licenças](https://cosmos.bluesoft.com.br/licenses) antes de coletar ou usar os resultados comerciais.
3. Configurar segredos no Supabase Edge: `COSMOS_API_TOKEN`, `COSMOS_USER_AGENT` e `COSMOS_WORKER_SECRET`. **Nunca no GitHub nem no navegador.**
4. Publicar `supabase/functions/cosmos-catalog-research-v1/index.ts` com `verify_jwt=true`.
5. Testar `mode:preview`; então ativar manualmente em `cosmos_research_config` e executar um piloto autenticado de 1–5 GTINs.
6. Conferir identidade, licença, unidades físicas, dados fiscais e resultados; só então planejar agendamento de até 25 consultas/dia. Não há Cron criado por esta versão.

## Controles
- Reserva atômica da franquia por dia local de Cuiabá (máximo 25); cada HTTP consome uma vaga independentemente do sucesso.
- Erros HTTP 429/401/403 interrompem ou adiam, sem pressionar a API.
- Dados externos ficam **apenas como propostas internas** com origem e revisão; nenhuma escrita em `products`, `product_fiscal_profiles` ou Bling.
- Necessário confirmar com o fornecedor se armazenamento e reutilização dos atributos obtidos são permitidos pelo plano/licença; por precaução nenhum uso público está habilitado.
- Queries de produtos com GTIN ausente ou inválido não consomem franquia.

## Próxima etapa após piloto
Implementar classificação de famílias pela IA/rules, revisão no Vitrine/Admin e herança explícita por atributo apenas para membros confirmados e apresentação verificada.
