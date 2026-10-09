# SI5 Global — segunda fonte gratuita do Catálogo Mestre

## Objetivo
Integrar SI5 Global (100 consultas/dia grátis) ao processo existente de pesquisa Cosmos (25 consultas/dia grátis), sem substituir Cosmos. Evidência comparável, não publicação fiscal automática.

## Origem, autenticação e contrato
Documentação: https://global.si5.com.br (API /api/produtos/{codbar}).
Headers: Authorization: Bearer {token}; Accept: application/json.
Segredo \`SI5_API_TOKEN\` deve ser gerado na área logada. \`SI5_WORKER_SECRET\` é segredo de execução distinto, criado na infraestrutura. **Nunca registrar token no GitHub, no chat ou no browser público.**
Conta grátis: 100 consultas por dia, 1 token. Limite renova à meia-noite de Brasília. O plano varejista exibido como "em breve" não impede a API grátis já existente na conta.
Não presumir licença de redistribuição ou importação de imagens sem conferir os termos comerciais.

## Etapa implementada
- \`si5_research_config\`: enabled=false, daily_limit=100, max_batch=5, research_mode=representatives_only.
- \`si5_product_research\`: identidade, estado e propostas por produto, isoladas do catálogo mestre.
- \`si5_research_requests\`: 100 slots possíveis/dia de Brasília, reserva transacional atômica.
- \`si5_research_reserve_next\`: atende SOMENTE GTIN válido e, no piloto, apenas EAN representante da família; respeita kill switch.
- \`si5_catalog_research_progress_v1\` e \`catalog_external_evidence_compare_v1\` para inspecionar status e divergências por NCM.
- \`si5-catalog-research-v1\`: Edge Function protegida por JWT e \`SI5_WORKER_SECRET\`. Não grava em products, fiscalização, preço ou estoque. Não há cron automático.
- Dados como NCM, CEST, peso, ingredientes e nutrição são candidatos sujeitos a revisão e validação fiscal. SI5 informa que a base pode estar incompleta/desatualizada.

## Decisão por campo
SI5: nome, marca, categoria, conteúdo, embalagem, ingredientes, nutricional, NCM e CEST em revisão.
Cosmos: foto, marca, GPC, peso bruto e dimensões, também em revisão.
XML NF-e fornecedor + legislação oficial: evidência fiscal prioritária, sem aceitar NCM/CEST apenas por concordância entre bases privadas.
GTIN e fragrâncias individuais nunca se tornam idênticos só porque a marca, linha e volume são iguais.

## Como ativar depois
1. Confirmar termos de armazenamento e direitos das imagens.
2. Configurar \`SI5_API_TOKEN\`, \`SI5_WORKER_SECRET\` nos Secrets da Edge Function.
3. Confirmar que o worker desativado não gasta requisições.
4. Habilitar temporariamente \`si5_research_config.enabled=true\`, executar piloto com 1–5 EANs representativos e rever retorno.
5. Medir cobertura real: identificado, NCM, CEST, peso aproveitável, imagem, ingredientes/nutrição.
6. Só então decidir por agendamento (100/dia) e ampliação para produtos sem famílias classificadas.
