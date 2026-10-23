# Dona Antônia — Prioridade 3: organização, legado e modularização

**Data:** 18/10/2026 · **GitHub:** `osvaldosereia/SUCEDOAN12` · **Supabase:** projeto `ssbesxgaijknwsjbsbcz` · **Git tree:** `07106da02b649b67bb880caa83424e767ab74e09`.

## Escopo e segurança da execução

Auditoria **exclusivamente de leitura** do código operacional e do banco. Estes documentos são colocados em uma branch independente, sem merge, sem deploy e sem mudanças na lógica de produção. Não foram apagados arquivos nem removidos serviços, tabelas ou funções.

Método: árvore Git completa (SHA e tamanhos), leitura dos pontos de entrada HTML, carregadores de script e imports diretos/indiretos; leitura do catálogo de Edge Functions; análise do catálogo de rotinas PostgreSQL, triggers e dependências detectáveis; amostra de logs Edge das **últimas 24 horas**. Verificações são estáticas; elas não demonstram execução real em todos os caminhos.

## Inventário verificado

| Inventário | Resultado |
|---|---:|
| Arquivos na árvore Git | 1180 |
| Arquivos em `vitrine/admin/` | 63, 1545892 bytes |
| Módulos com cadeia de referência detectável no grafo construído | 63 / 63 |
| Edge Functions implantadas | 138 |
| Com arquivo `supabase/functions/<nome>/index.ts` na árvore principal | 37 |
| Sem fonte nesse diretório **convencional** | 101 |
| Funções SQL em `public` e `private` inventariadas | 570 |
| Funções SQL com referência à tabela ausente `public.cart_items` | 7 |
| Famílias versionadas com mais de uma função | 15 (total 40 variantes) |
| Grupos de blobs com SHA idêntico | 66 |

Arquivos auxiliares exportados: [inventario_admin_63.csv](inventario_admin_63.csv), [edge_functions_138.csv](edge_functions_138.csv), [rotinas_sql.csv](rotinas_sql.csv), [duplicacoes_exatas.csv](duplicacoes_exatas.csv), [familias_sql.csv](familias_sql.csv).

## 1. O Vitrine Admin não contém 47 arquivos soltos descartáveis

O `index.html` carrega `basket-lot-image.js`, `basket-guided-builder.js`, `basket-admin-section.js`, e importa `ana/ana-admin.js` sob demanda. O `basket-admin-section.js` carrega outros oito módulos de cestas e pedidos dinamicamente. O `basket-lot-image.js` inicia a cadeia de módulos de marketing; alguns desses carregam CSS em tempo de execução. A Central de Atendimento possui seu próprio `index.html`, com uma cadeia de imports para autorização, perfil de clientes, envio de produtos, mídia, áudio e biblioteca; o adaptador de áudio carrega até um `AudioWorklet` separado.

Todos os 63 arquivos têm uma **referência estática rastreável a partir de uma das interfaces** no grafo reconstruído. Isso é evidência contra exclusão imediata, **não** prova que cada rota tenha uso real por clientes/operadores. Para desativar qualquer arquivo será preciso acompanhar o navegador e o tráfego em homologação, com testes.

### Recomendações por domínio

| Domínio | Critério | Decisão |
|---|---|---|
| Separação / pedidos | Fluxo comprovado de valores, estoque, Bling e fiscal | **Congelar contrato e preservar** |
| Vitrine Admin central | HTML ~775 KB, 9.180 linhas, 519 funções declaradas e ~631 KB de scripts inline | Modularizar **incrementalmente**, não reescrever |
| `admin-products-live-v1` | ~346 KB, 4.043 linhas, 222 funções, 114 referências a `.rpc(...)` | Fatiamento gradual por domínio só após contrato/testes |
| `admin-service-intelligence-v1` | ~565 KB, 10.353 linhas, 215 funções, 183 referências a `.rpc(...)` | Separar domínios sem quebrar compatibilidade; maior risco de regressão |
| Atendimento e ANA | Já possuem módulos e imports | **Preservar** organização existente |
| Cestas, moldes e kits | Carregamento dinâmico pelo componente `basket-admin-section.js` | Não remover módulos por ausência de tags diretas no HTML |
| Marketing | Encadeamento de imports dinâmicos por `basket-lot-image.js`, `campaign-entry.js` e `marketing-polish.js` | Documentar carregadores, não deduzir desuso |

**Observações de qualidade:** o arquivo principal declara 519 nomes de função distintos; **não** houve repetição literal de nomes nessa contagem. Há 204 atribuições a `innerHTML` e 29 blocos `catch{}` ou equivalentes muito simples: revisão futura dirigida ao risco, sem substituir mecanicamente. Os dois grandes serviços backend somam dezenas de milhares de linhas, e apresentam múltiplos tratamentos de falha simplificados.

## 2. Duplicações reais — classificação e restrição de remoção

Os 66 grupos idênticos pelo SHA Git ocupam 1312100 bytes repetidos além da primeira cópia. Distribuição:

- **empacotamento_edge**: 10 grupos.
- **espelho_site**: 1 grupos.
- **espelho_imagens**: 8 grupos.
- **espelho_sql**: 46 grupos.
- **outros**: 1 grupos.

Exemplos: `index.html` e `vitrine/index.html` são idênticos; o processamento de XML e utilitários `papoai-*` possuem cópias em `_shared` e diretórios de empacotamento; scripts SQL aparecem tanto em `supabase/migrations/` quanto em `supabase/sql/`; oito imagens são duplicadas entre `img/` e `site/img/`.

**Ação segura:** determinar o papel de cada cópia no build/deploy; só então unificar a fonte com garantia de bundling, caminhos de publicação e testes. Não confundir cópia intencional com código inútil. Nenhuma exclusão foi realizada.

## 3. Legado comprovadamente incompatível no SQL

A tabela `public.cart_items` não existe, enquanto estas 7 funções fazem referência nominal a ela:

- `apply_basket_cart_selection_v2`
- `confirm_cart_order`
- `confirm_cart_order_v2`
- `get_cart_aware_recommendations`
- `recalculate_cart`
- `set_cart_addon_quantity`
- `start_basket_cart`

**Conclusão:** essas rotinas são candidatas fortes a uma geração obsoleta/incompleta do carrinho. Não devem ser invocadas nem reutilizadas no futuro checkout WhatsApp antes de análise das dependências. **Não é seguro removê-las apenas com esta evidência**: as referências podem estar em caminhos condicionais, em integrações não inventariadas ou em histórico necessário.

## 4. Famílias SQL com versões coexistentes

Há 15 famílias de nomes de funções SQL com múltiplos sufixos `_vN`. Exemplos: `ops2_admin_attendance_queue_v1` a `v4`, `create_basket_kit_lot_v1` a `v4`, `admin_save_basket_mold_v1` a `v3`, `create_vitrine_cart_order_v1` e `v3`. A presença de `v1` não significa que essa função esteja inativa, pois triggers, jobs e clientes antigos podem chamá-la.

**Limitação central:** `track_functions=none` no PostgreSQL. As estatísticas `pg_stat_user_functions` estão vazias, então **não é possível provar desuso das rotinas apenas olhando contadores SQL**. Não habilitei instrumentação na produção. A evidência de chamadas pode vir da análise de código e logs dos endpoints; para desativação confiável, preparar medição em homologação ou observabilidade autorizada.

## 5. Edge Functions: implantação diferente de fonte canônica

Existem 138 funções implantadas. 101 não possuem `index.ts` correspondente em `supabase/functions/<slug>/` na versão principal do GitHub. Elas **não devem** ser chamadas de inexistentes ou sem uso: podem estar em commits anteriores, wrappers ou deploys diretos. O CSV marca individualmente qual função possui fonte no diretório convencional e quantos acessos foram vistos na janela **limitada a 24 horas**.

Casos concretos: `whatsapp-flow-data-exchange-v1` permanece implantada, devolvendo HTTP 410 em chamadas recentes; `papo-external-agent-v1` foi chamado com respostas HTTP 401. Ambas têm tráfego e **não podem ser simplesmente excluídas**.

## 6. Condições para remoção futura

Uma função ou arquivo só será classificado como **REMOVÍVEL** quando **todos** os itens abaixo forem verdadeiros:

1. Zero consumidores conhecidos no código Git e na implantação (incluindo imports dinâmicos, triggers, jobs, webhooks e aplicativos antigos).
2. Comprovação de ausência de uso em uma janela operacional adequada, **não só 24 horas**.
3. Testes em homologação cobrindo pedidos, itens, reserva/consumo, separação, abatimentos, Bling e fiscal.
4. Dependências fiscais, auditoria e retenção histórica preservadas.
5. Backup, procedimento de reversão e aprovação específica antes da alteração.

## 7. Sequência de implementação recomendada

| Etapa | Trabalho | Mudança operacional permitida agora? |
|---|---|---|
| P3-A | Inventários, mapa do carregamento, hashes de duplicação e SQL/Edge Function | **Concluído em leitura** |
| P3-B | Verificadores automáticos de referências quebradas e regressões; registrar contrato canônico de cada domínio | Apenas após revisão de proposta; zero exclusões |
| P3-C | Reconciliar os 101 endpoints não localizados no diretório convencional | Análise/recuperação de fonte, não exclusão |
| P3-D | Auditar sete funções SQL de carrinho e instrumentar uso em homologação | Sem drops em produção |
| P3-E | Extrair utilitários da página monolítica por lotes pequenos, sem alterar fluxo da separação | Precisa testes e autorização posterior |
| P3-F | Consolidar fontes de duplicações sob build/deploy determinístico | Só após testes e prova de caminhos equivalentes |

## 8. Veredito

**A Prioridade 3 de mapeamento e classificação está concluída; a refatoração e remoção não foram executadas por falta de prova de segurança operacional.** Nenhum dos 63 arquivos do Admin foi comprovado dispensável. O maior risco hoje é acoplamento e histórico difícil de reconstruir, não excesso óbvio de arquivos descartáveis.

**Não alterar o login:** conforme decisão do responsável pelo sistema. Preservar `SEPARAR AGORA`, estoque, Bling e NF-e; futuras mudanças deverão ser isoladas e testadas.
