# Dona Antônia — Simples Nacional: pré-apuração e fechamento mensal

Data: 2026-09-30
Status: design aprovado conceitualmente; aguardando revisão do documento antes do plano de implementação
Repositório canônico: `osvaldosereia/SUCEDOAN12`
Supabase canônico: `ssbesxgaijknwsjbsbcz`

## 1. Objetivo

Criar no Vitrine/Admin um módulo **Fiscal → Simples Nacional** que transforme os dados fiscais e operacionais já existentes em um fechamento mensal simples, auditável e seguro.

O módulo deve permitir que a Dona Antônia reduza a dependência operacional do contador para a apuração mensal do Simples Nacional, sem assumir riscos desnecessários durante a transição.

Nesta primeira etapa, o sistema **não transmite PGDAS-D, não gera DAS por automação externa e não efetua pagamento**. Ele prepara, reconcilia, classifica, calcula e documenta a competência, deixando o usuário apto a conferir e transmitir a apuração oficial. A integração oficial para transmissão poderá ser ativada somente após homologação contábil e nova autorização explícita.

## 2. Princípios obrigatórios

1. **Uma única fonte canônica de dados locais**: projeto Supabase `ssbesxgaijknwsjbsbcz`.
2. **Bling continua sendo o ERP operacional e a principal evidência externa das NF-e emitidas**.
3. **Pedidos locais não substituem documentos fiscais**. Eles servem para conciliação e detecção de divergências.
4. **Nenhuma classificação fiscal incerta pode entrar silenciosamente no fechamento**.
5. **Nenhuma transmissão oficial ou pagamento será automático na primeira fase**.
6. **Toda competência fechada preserva memória de cálculo e evidências**.
7. **Regras tributárias devem ser versionadas por vigência**, evitando lógica fiscal fixa espalhada no frontend/backend.
8. **O módulo deve reaproveitar as estruturas fiscais existentes** e não criar um ERP ou cadastro fiscal paralelo.
9. **Automação deve reduzir trabalho manual sem ocultar pendências**.

## 3. Estado atual que será reaproveitado

O sistema já possui estruturas úteis para este módulo, incluindo:

- `products`;
- `product_fiscal_profiles`;
- `product_fiscal_evidence`;
- `product_fiscal_review_items`;
- `fiscal_rule_sets`;
- `fiscal_st_rules_mt`;
- `fiscal_source_documents`;
- `orders` e `order_items`;
- `order_fiscal_controls`;
- `dispatch_fiscal_jobs`;
- `purchase_xml_documents` e `purchase_xml_items`;
- vínculos e auditoria do Bling Hub.

O fechamento do Simples será uma camada de consolidação sobre essas fontes, não uma duplicação delas.

## 4. Escopo da primeira versão

### 4.1 Competência mensal

O usuário acessa **Fiscal → Simples Nacional** e seleciona uma competência, por exemplo `09/2026`.

A competência possui estados explícitos:

- `draft` — aberta e recalculável;
- `review_required` — existem divergências ou itens sem classificação suficiente;
- `ready` — todos os gates de fechamento passaram;
- `locked` — competência homologada/fechada internamente;
- `superseded` — substituída por uma nova versão de fechamento.

Não haverá alteração silenciosa de uma competência `locked`. Qualquer correção posterior cria nova versão auditável.

### 4.2 Evidência de receita

A apuração deve priorizar, nesta ordem:

1. NF-e de saída autorizada no Bling/SEFAZ;
2. eventos de cancelamento, devolução e retorno que alterem a receita fiscal;
3. pedido local e seus itens para reconciliação;
4. demais evidências fiscais persistidas no Supabase.

Pedidos locais sem NF-e correspondente aparecem como pendência. NF-e sem pedido local correspondente também aparece como pendência, sem ser descartada automaticamente.

### 4.3 Segregação das receitas

Cada linha fiscal deve ser classificada em uma categoria tributária de fechamento. A primeira versão deve suportar, no mínimo:

- revenda de mercadoria sem segregação especial comprovada;
- receita sujeita a ICMS-ST quando comprovado pelas regras/evidências vigentes;
- receita com tributação monofásica quando comprovada por regra fiscal versionada;
- cancelamentos;
- devoluções/retornos com efeito na receita da competência;
- linha `manual_review` para qualquer caso sem evidência suficiente.

A classificação deve guardar:

- regra aplicada;
- versão da regra;
- produto;
- documento fiscal de origem;
- valor considerado;
- evidência utilizada;
- nível de confiança;
- motivo de eventual bloqueio.

Nenhum item `manual_review`, `blocked`, `conflict`, `unknown` ou equivalente pode ser tratado como receita segregada automaticamente.

### 4.4 Monofásicos

Não será inferido tratamento monofásico apenas por nome comercial, categoria do produto ou similaridade textual.

Será criada uma camada de regra fiscal versionada para monofásicos baseada em evidência legal/cadastral verificável. Produtos sem evidência suficiente permanecem em revisão.

O cadastro deve permitir reaproveitar uma regra validada por família fiscal quando a identidade tributária for realmente equivalente e a regra permitir esse tipo de propagação.

### 4.5 ICMS-ST

O sistema reutiliza `product_fiscal_profiles`, `fiscal_st_rules_mt`, `product_fiscal_evidence` e respectivas revisões.

Somente perfis com evidência suficiente para a competência podem ser usados automaticamente. Estados como `candidate`, `unknown`, `conflict`, `pending` ou `blocked` continuam visíveis como pendência antes do fechamento.

### 4.6 Receita bruta acumulada e alíquota efetiva

O fechamento deve manter os valores necessários para reconstruir a memória de cálculo da competência, incluindo:

- receita do mês;
- receitas segregadas por tratamento;
- receita bruta acumulada relevante para a apuração;
- faixa/anexo aplicável conforme regra vigente;
- alíquota nominal;
- parcela a deduzir;
- alíquota efetiva;
- valor estimado do DAS;
- componentes informativos usados no cálculo.

As fórmulas e faixas não ficarão hardcoded no frontend. Serão armazenadas em conjuntos de regras com início e fim de vigência.

## 5. Novas estruturas de dados

Os nomes abaixo são o contrato de design; o plano de implementação poderá ajustar detalhes físicos sem alterar a semântica.

### `simples_periods`

Representa uma competência e sua versão de fechamento.

Campos principais:

- `id`;
- `competence_month`;
- `version`;
- `status`;
- `rule_set_id`;
- `gross_revenue_month`;
- `segregated_revenue` JSONB;
- `rbt12`;
- `effective_rate`;
- `estimated_das_amount`;
- `blocking_issue_count`;
- `warning_count`;
- `calculated_at`;
- `locked_at`;
- `locked_by`;
- `metadata`;
- timestamps.

Restrição: `(competence_month, version)` único.

### `simples_revenue_lines`

Snapshot das linhas fiscais que compõem uma versão da competência.

Campos principais:

- `period_id`;
- `source_type`;
- `source_document_id`;
- `access_key` quando existente;
- `order_id` quando existente;
- `product_id`;
- `gross_amount`;
- `recognized_amount`;
- `tax_bucket`;
- `classification_status`;
- `classification_rule_id`;
- `classification_rule_version`;
- `evidence` JSONB;
- `blocking_reason`;
- `metadata`.

### `simples_reconciliation_issues`

Fila de exceções do fechamento.

Tipos mínimos:

- `order_without_invoice`;
- `invoice_without_order`;
- `cancel_status_mismatch`;
- `return_status_mismatch`;
- `product_without_fiscal_profile`;
- `st_unresolved`;
- `monophase_unresolved`;
- `document_value_mismatch`;
- `duplicated_document`;
- `rule_not_effective_for_date`;
- `other`.

Cada item deve possuir severidade, status, evidências, resolução e trilha de auditoria.

### `simples_rule_sets`

Conjunto versionado das regras de apuração do Simples.

Deve conter vigência e parâmetros necessários para o cálculo, sem permitir alteração retroativa silenciosa.

### `simples_tax_classification_rules`

Regras versionadas para segregação de receita, incluindo tratamento normal, ST, monofásico e demais tratamentos que venham a ser necessários.

A regra deve indicar se permite aplicação automática ou exige revisão humana.

### `simples_validation_runs`

Registra cada recalculo/homologação:

- entradas consideradas;
- hash/resumo dos dados;
- resultado;
- contagens;
- diferenças;
- duração;
- erros;
- operador/origem.

## 6. Backend

O módulo deve ficar atrás do gateway administrativo existente, evitando criar um conjunto desconectado de funções públicas.

A implementação deve ser dividida em unidades pequenas:

### Serviço de coleta fiscal

Responsável por reunir documentos fiscais de saída, cancelamentos e devoluções do período, preferindo o Bling como origem operacional e persistindo evidência suficiente para auditoria.

### Serviço de reconciliação

Compara:

- NF-e × pedidos;
- totais de documentos × itens;
- documentos autorizados × cancelados/devolvidos;
- produtos fiscais × perfis tributários.

Não corrige silenciosamente divergências; abre pendências.

### Serviço de classificação tributária

Recebe linhas já reconciliadas e aplica somente regras vigentes e suficientemente validadas.

### Serviço de cálculo do Simples

Recebe apenas linhas classificadas, parâmetros de regra e histórico necessário para calcular a pré-apuração. Não consulta UI nem executa side effects externos.

### Serviço de fechamento

Executa gates, cria snapshot imutável da competência e impede lock quando existirem bloqueios.

## 7. Interface do Vitrine/Admin

Menu:

`Fiscal` → `Simples Nacional`

### Tela inicial

Cards:

- competência;
- receita fiscal identificada;
- documentos autorizados;
- cancelamentos/devoluções;
- receita normal;
- receita com ST;
- receita monofásica;
- outras segregações;
- valor estimado do DAS;
- quantidade de bloqueios e avisos.

### Status principal

Exemplo:

`Ainda não pode fechar — 8 pendências bloqueantes`

ou

`Pronto para conferir no PGDAS-D`

### Área de pendências

Tabela filtrável por:

- tipo;
- produto;
- NF-e;
- pedido;
- valor;
- severidade;
- situação.

O usuário deve poder abrir cada pendência e ver a explicação em linguagem simples, além da evidência técnica.

### Memória de cálculo

A tela deve mostrar, de forma legível:

- como a receita foi formada;
- como foi segregada;
- RBT12 utilizada;
- regra/faixa aplicada;
- fórmula;
- valor estimado;
- diferenças em relação a versões anteriores.

### Exportação

Na primeira fase o sistema deve gerar um relatório de conferência em PDF/CSV ou formato equivalente contendo os valores a informar no PGDAS-D e a memória de cálculo.

## 8. Modo de homologação contábil

A primeira fase opera em **homologação obrigatória**.

Para cada competência, o usuário poderá registrar os valores apurados pelo contador e comparar com a pré-apuração do sistema.

O sistema apresenta:

- valor calculado pelo sistema;
- valor informado pelo contador;
- diferença absoluta;
- diferença percentual;
- divergências por segregação;
- observações.

O objetivo é obter competências consecutivas sem divergências relevantes antes de considerar automação de transmissão.

A quantidade mínima de competências de homologação não será hardcoded agora. A mudança de modo exigirá decisão explícita posterior.

## 9. Gates para marcar uma competência como `ready`

Todos devem passar:

1. documentos fiscais da competência coletados;
2. nenhum documento duplicado não resolvido;
3. cancelamentos/devoluções reconciliados;
4. nenhum documento fiscal relevante sem classificação;
5. nenhum produto usado na segregação com perfil fiscal bloqueado/conflitante;
6. nenhuma regra fora da vigência;
7. receita mensal conciliada;
8. RBT12 calculável com histórico suficiente;
9. cálculo reproduzível e auditável;
10. nenhum erro técnico pendente.

Avisos não bloqueantes devem ser separados de erros bloqueantes.

## 10. Segurança

- Todas as novas tabelas em schema exposto devem ter RLS habilitado.
- Nenhuma chave de serviço ou credencial fiscal vai para o frontend.
- Ações de cálculo e fechamento exigem sessão administrativa válida.
- Fechamento/lock deve registrar operador e timestamp.
- Funções privilegiadas não serão expostas indiscriminadamente como RPC pública.
- Qualquer futura integração oficial de transmissão terá credenciais isoladas, auditoria e autorização explícita do operador.

## 11. Idempotência e reprocessamento

Recalcular uma competência em `draft` deve ser idempotente para o mesmo conjunto de entradas e regras.

Documentos fiscais devem ser deduplicados por chave de acesso ou identificador oficial equivalente.

Competência fechada não é sobrescrita. Correção posterior gera nova versão.

## 12. Tratamento de erros

Erros de integração com Bling não podem produzir cálculo parcial apresentado como pronto.

Estados possíveis de coleta devem distinguir pelo menos:

- completa;
- incompleta;
- falha;
- desatualizada.

Quando a coleta estiver incompleta, a competência permanece bloqueada.

Falhas devem informar:

- etapa;
- documento quando aplicável;
- código/descrição técnica;
- ação recomendada ao operador;
- possibilidade segura de tentar novamente.

## 13. Testes

### Unitários

- classificação normal/ST/monofásico;
- vigência de regra;
- cancelamento/devolução;
- RBT12;
- cálculo de faixa/alíquota efetiva;
- arredondamento;
- deduplicação;
- lock/versionamento.

### Integração

- coleta Bling → persistência;
- NF-e × pedido;
- produto × perfil fiscal;
- cálculo completo de competência;
- geração de pendências.

### Casos de regressão

Devem existir fixtures com competências conhecidas e resultado esperado. Quando possível, usar meses já encerrados pelo contador como golden cases, sem reprocessar ou alterar os dados operacionais históricos.

### Homologação

Antes de qualquer transmissão automática futura:

- comparar pelo menos competências reais já fechadas;
- explicar toda diferença;
- zerar divergências não justificadas;
- validar cancelamentos, devoluções, ST e monofásicos;
- registrar aprovação humana.

## 14. Fases de entrega

### Fase A — fundação e leitura

- tabelas/snapshots;
- importação das evidências de saída;
- reconciliação;
- tela de competência;
- nenhuma transmissão externa.

### Fase B — classificação e pré-apuração

- regras versionadas;
- segregações;
- RBT12;
- cálculo estimado;
- memória de cálculo;
- relatório para PGDAS-D.

### Fase C — homologação com contador

- comparação sistema × contador;
- correção de lacunas fiscais;
- golden cases;
- fechamento interno confiável.

### Fase D — transmissão oficial, somente após nova aprovação

Fora do escopo deste primeiro plano. Poderá integrar serviço oficial compatível para PGDAS-D/DAS, desde que exista autorização, credenciais adequadas e homologação prévia.

## 15. Fora de escopo nesta etapa

- substituir obrigações acessórias que não sejam o fechamento mensal projetado;
- efetuar pagamento bancário;
- transmitir PGDAS-D automaticamente;
- alterar classificação fiscal de produto sem evidência;
- criar contabilidade completa, folha, livro-caixa ou ERP paralelo;
- automatizar decisões fiscais ambíguas por IA.

## 16. Critério de sucesso

A primeira versão será considerada bem-sucedida quando, para uma competência real:

1. reunir todas as NF-e relevantes;
2. reconciliar documentos com pedidos e eventos fiscais;
3. segregar receitas apenas com evidência suficiente;
4. bloquear automaticamente qualquer incerteza material;
5. calcular a pré-apuração de modo reproduzível;
6. gerar uma memória de cálculo compreensível;
7. comparar o resultado com a apuração do contador;
8. explicar toda diferença existente;
9. permitir ao usuário levar os números ao PGDAS-D sem montar planilhas ou somas manualmente.

## 17. Decisão arquitetural

A implementação seguirá o modelo **assistido e auditável primeiro**.

Não será adotado um modelo de transmissão automática desde o início. A automação total só será considerada depois que o sistema provar, com competências reais, que os dados, segregações e cálculos batem com a apuração contábil e que as exceções estão cobertas.
