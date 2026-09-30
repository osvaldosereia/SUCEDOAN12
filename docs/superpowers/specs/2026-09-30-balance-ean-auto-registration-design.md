# Dona Antônia — Balanço EAN com cadastro automático de produtos

Data: 2026-09-30
Status: design aprovado em conversa; aguardando revisão do documento antes do plano de implementação
Escopo: Vitrine/Admin + Supabase canônico + Bling Hub + pipeline atual de imagem de produto

## 1. Objetivo

Transformar o Balanço do Vitrine/Admin em uma ferramenta operacional completa para conferência física por EAN, de modo que o funcionário consiga resolver o produto durante a própria contagem.

Fluxo desejado:

1. ler EAN;
2. localizar o produto em todas as fontes canônicas disponíveis;
3. se existir e estiver ativo, continuar a contagem;
4. se existir e estiver inativo, restaurar o uso operacional e reativar comercialmente quando os requisitos de segurança estiverem completos;
5. se não existir em `products`, pesquisar fontes internas e Bling;
6. se ainda não for identificado com segurança, solicitar foto real do produto;
7. cadastrar automaticamente o produto;
8. registrar/atualizar estoque físico, gôndola e validade;
9. garantir vínculo com o Bling e sincronizar o saldo oficial;
10. preparar imagem no padrão da Dona Antônia sem travar a próxima leitura.

A experiência precisa ser simples para funcionário, rápida em tablet/celular e compatível com leitor EAN HID/USB/Bluetooth.

## 2. Restrições e decisões já tomadas

- `Bling` continua como autoridade oficial de estoque quando `ops2_stock_authority = bling`.
- Não criar um segundo banco de estoque paralelo.
- Não reativar Edge Functions aposentadas (`inventory-product-research-v1`, `inventory-fast-balance-v3`, `product-name-normalizer-v1`, etc.).
- Não criar uma nova Edge Function apenas para esta feature; a orquestração entra no gateway canônico `admin-products-live-v1`.
- Reutilizar `product-image-openai-v1` para upload da foto original e padronização da imagem.
- Reutilizar o Bling Hub já existente para lookup exato por GTIN, criação/vínculo de produto e atualização de estoque.
- EAN/GTIN é a identidade primária. Matching aproximado por nome nunca cria vínculo automaticamente.
- NCM/CEST não podem ser inventados por IA. Evidência fiscal vem de XML/evidência fiscal/Bling; na falta, fica pendente para o fluxo fiscal existente.
- Produto com preço ausente ou identidade insuficiente pode existir operacionalmente, mas não deve aparecer no site com preço zero ou informação ruim.

## 3. Estado atual encontrado

### 3.1 Frontend do Balanço

O `vitrine/admin/index.html` já possui:

- aba `Balanço` dentro de `Estoque`;
- leitor EAN global;
- `handleBalanceScan(ean)` usando `ean_lookup`;
- teclado numérico próprio;
- botão `Confirmar e ler próximo`;
- histórico da sessão;
- modo separado para avaria/vencido/retorno;
- fluxo de folhas A4 por foto/QR;
- pendências de OCR/IA;
- integração com faltas de pedidos e fila de recontagem.

Hoje o scanner simples só consulta `products.gtin`. Se o EAN não existir em `products`, o funcionário recebe erro e o fluxo termina.

### 3.2 Backend do Balanço manual

`balance_confirm` chama `ops_record_inventory_count_v1` e, quando há atenção de reconciliação, `ops_apply_stock_recount_result_v1`.

Com autoridade Bling, a contagem manual não altera `products.stock` diretamente. O saldo diferente vira reconciliação.

### 3.3 Backend do Balanço A4

O fluxo A4 já consegue:

- registrar contagem física;
- criar/reativar gôndola;
- alterar localização;
- enfileirar `set_stock` no Bling;
- verificar conclusão do job;
- marcar a linha como aplicada/erro;
- aceitar releitura da mesma folha.

Isso cria hoje uma diferença de comportamento entre o scanner manual e a folha A4. O novo desenho elimina essa divergência.

### 3.4 Estruturas já existentes úteis

`inventory_unknown_eans` já guarda:

- `ean` único;
- status;
- contagem de ocorrências;
- quantidade observada;
- gôndola observada;
- `research` JSONB;
- modelo/resposta/tentativas de pesquisa;
- erro de pesquisa;
- `linked_product_id`.

`products` já possui `UNIQUE (gtin)` e campos suficientes para produto operacional/comercial, imagem, fiscalidade e auditoria.

Fontes internas relevantes por GTIN:

- `products`;
- `purchase_xml_items.commercial_gtin` / `tax_gtin`;
- `product_fiscal_evidence.gtin`;
- catálogo/vínculos do Bling Hub;
- snapshots/paridade já existentes quando úteis como evidência auxiliar.

## 4. Arquitetura escolhida

### 4.1 Um único fluxo canônico de Balanço

Adicionar ao `admin-products-live-v1` um conjunto pequeno de ações internas do módulo de balanço, sem criar nova função:

- `inventory_balance_resolve_ean`
- `inventory_balance_prepare_unknown`
- `inventory_balance_commit`
- `inventory_balance_status`

As ações podem ser implementadas como funções internas no mesmo arquivo e expostas na allowlist existente.

A interface não deve coordenar várias tabelas diretamente. Ela conversa apenas com o gateway.

### 4.2 Resolver EAN

`inventory_balance_resolve_ean` executa em ordem:

1. normalizar EAN para dígitos;
2. procurar `products.gtin` sem filtrar `is_active`;
3. se encontrado, retornar o produto e readiness comercial;
4. se não encontrado, procurar XMLs por GTIN comercial/tributável;
5. agregar evidência fiscal existente por GTIN;
6. consultar Bling Hub por GTIN exato;
7. consolidar um candidato sem misturar identidades;
8. se houver evidência suficiente, criar/atualizar o cadastro canônico;
9. caso contrário, registrar/atualizar `inventory_unknown_eans` e retornar `photo_required`.

Nenhum passo faz matching automático por semelhança de nome.

### 4.3 Prioridade de dados

Identidade e dados comerciais devem respeitar precedência por campo, não uma única fonte global.

#### Nome / SKU / preço de venda

1. cadastro canônico existente;
2. Bling com match exato do GTIN;
3. XML/evidência interna quando aplicável;
4. leitura visual da foto;
5. valor pendente.

#### Custo / NCM / CEST / fornecedor

1. XML de entrada mais recente e confiável;
2. consenso/evidência fiscal existente;
3. Bling quando o campo for confiável;
4. pendente.

#### Marca / embalagem

1. cadastro existente;
2. Bling/XML;
3. foto real analisada por visão;
4. pendente.

#### Categoria

Só pode receber um dos grupos canônicos do site:

- `mercearia`
- `limpeza_lavanderia`
- `higiene_beleza`
- `casa_pet`

A classificação automática pode usar nome, marca, embalagem e foto, mas nunca cria uma categoria fora dessa enumeração.

### 4.4 Produto provisório e corrida concorrente

Se o GTIN não existir, o sistema pode criar um produto provisório para receber foto e auditoria, mas deve usar `products_gtin_key` como trava definitiva contra duplicidade.

Regra:

- tenta inserir;
- se houver conflito de GTIN, relê o produto vencedor;
- nunca duplica produto por retry, dupla leitura ou dois operadores simultâneos.

Metadados devem registrar:

- origem `balance_auto_registration`;
- EAN lido;
- operador;
- data/hora;
- fontes usadas;
- confiança da identificação;
- se houve foto real;
- se preço foi herdado, calculado ou ficou pendente.

## 5. Foto e imagem IA

### 5.1 Quando pedir foto

Foto não é obrigatória para produto já identificado com segurança e com imagem válida.

Foto deve ser solicitada quando:

- GTIN não é encontrado em nenhuma fonte confiável;
- cadastro existe sem identidade visual suficiente;
- imagem atual está ausente e o operador deseja concluir o saneamento durante o balanço.

Para EAN realmente desconhecido, a tela deve tornar a foto o caminho principal: `Tirar foto do produto`.

### 5.2 Uso da foto

A foto original serve para duas finalidades diferentes:

1. identificação visual: nome comercial, marca, variante e embalagem visível;
2. padronização de catálogo pela `product-image-openai-v1`.

A análise visual não pode inventar NCM, CEST, custo ou preço.

### 5.3 Não bloquear a contagem pela imagem final

O funcionário não deve ficar aguardando geração/validação de imagem para ler o próximo EAN.

Assim que a foto original estiver persistida:

- ela pode ser usada temporariamente como `image_url`;
- o cadastro e a contagem seguem;
- a padronização IA muda `image_ai_status`;
- ao concluir, a imagem padronizada substitui `image_url`;
- se a padronização falhar, a original continua disponível e o erro fica visível no cadastro do produto.

A implementação deve usar o mecanismo de processamento/recovery suportado pelo runtime atual, sem criar cron permanente desnecessário.

## 6. Ativação e segurança comercial

O significado de `is_active=true` no site atual é comercial: `storefront-v2` lista produtos ativos. Logo, reativar cegamente qualquer produto poderia publicar item com preço zero ou cadastro incompleto.

### 6.1 Readiness comercial

Um produto pode ser publicado automaticamente quando:

- nome não é placeholder;
- GTIN válido;
- `price > 0`;
- categoria canônica definida;
- imagem utilizável existe;
- não está vencido;
- identidade não possui conflito.

### 6.2 Produto existente inativo

- se estava inativo por vencimento e o operador informa validade válida/futura: reativar automaticamente;
- se estava inativo por outro motivo, atualizar estoque/gôndola/validade e reativar somente se o readiness comercial estiver completo;
- se ainda houver bloqueador comercial, manter fora do site e mostrar exatamente o que falta.

### 6.3 Produto novo

- cadastrar sempre no sistema operacional;
- ativar no site automaticamente quando readiness estiver completo;
- caso contrário, manter `is_active=false` até a automação ou uma revisão completar o dado faltante;
- estoque físico continua podendo ser registrado, pois cadastro operacional e publicação comercial são responsabilidades distintas.

### 6.4 Preço ausente

Ordem para preço:

1. preço canônico existente;
2. preço do Bling em match exato;
3. preço histórico confiável;
4. se houver custo confiável e nenhum preço, usar a regra comercial já adotada no recebimento como sugestão automática de 40% sobre custo e registrar a origem;
5. se não houver custo nem preço, não inventar preço — produto fica fora da vitrine com `preço pendente`.

## 7. Estoque: regra unificada scanner + A4

### 7.1 Problema atual

Scanner manual e A4 possuem semânticas diferentes. Isso precisa acabar.

### 7.2 Nova semântica

`inventory_balance_commit` recebe:

- `product_id`
- `ean`
- `counted_quantity`
- `gondola_number`
- `expiration_date` ou referência de lote
- `operator`
- `source` (`scanner_ean` | `sheet_a4` | `manual_pending`)

Sequência:

1. reler o produto e validar GTIN;
2. garantir gôndola;
3. aplicar localização;
4. aplicar validade de forma compatível com lotes;
5. registrar `ops_inventory_counts`;
6. calcular diferença contra saldo oficial atual;
7. se autoridade for Bling, chamar a rotina oficial de set stock/vínculo e verificar o resultado;
8. só considerar `stock_synced=true` após verificação do Bling;
9. atualizar espelho/cache pelo fluxo canônico já existente;
10. se houve diferença, manter trilha de reconciliação fiscal/origem mesmo depois da correção física do saldo.

Isso permite que o estoque vendável reflita a contagem física sem apagar a necessidade de explicar perdas/sobras quando aplicável.

### 7.3 Divergência de estoque

Uma divergência não deve simplesmente desaparecer do controle operacional.

Estados esperados:

- `matched` — contagem = saldo oficial;
- `stock_synced` — saldo físico foi corrigido e verificado;
- `stock_synced_review_pending` — saldo foi corrigido, mas diferença exige classificação/evidência;
- `sync_error` — não foi possível confirmar o Bling.

O funcionário pode continuar o balanço quando o saldo foi verificado. A revisão de causa fica para supervisão quando necessária.

## 8. Gôndola

Ao confirmar:

1. validar número 1..9999;
2. se `vitrine_gondolas` não existir, criar;
3. se existir inativa, reativar;
4. gravar `products.gondola`;
5. manter `shelf` quando compatível ou limpar apenas quando a mudança de gôndola tornar a prateleira anterior inválida.

A tela deve pré-preencher a gôndola atual e oferecer `Manter` para reduzir digitação.

## 9. Validade e lotes

Não sobrescrever controle por lote com uma única data global.

Regras:

- produto sem `lot_tracking_complete`: atualizar `products.validity_date`;
- produto novo com uma única validade informada: criar/atualizar um lote inicial quando o modelo de lotes estiver sendo usado;
- produto com um único lote ativo: permitir atualizar a validade desse lote;
- produto com múltiplos lotes ativos: mostrar seletor de lote ou `Nova validade`; não escolher silenciosamente;
- validade vencida nunca ativa o produto para venda;
- validade futura pode retirar um bloqueio `expired` quando houver estoque vendável.

## 10. UX do Balanço

### 10.1 Estrutura da página

Dentro de `Estoque > Balanço`:

- subaba `Leitor EAN`;
- subaba `Folhas A4`;
- ação secundária `Avaria / Vencido / Retorno` sem misturar o fluxo de contagem normal.

No mobile, cada subaba ocupa a largura inteira e não depende de scroll horizontal.

### 10.2 Leitor EAN — produto conhecido

Após leitura:

- foto;
- nome;
- EAN;
- status ativo/inativo;
- estoque oficial atual;
- gôndola atual;
- validade atual;
- quantidade contada em destaque;
- gôndola editável;
- validade editável;
- botão `Salvar e ler próximo`.

O teclado numérico customizado permanece para quantidade.

Depois do sucesso:

- feedback visual/sonoro curto;
- produto entra no histórico da sessão;
- campos zeram;
- foco lógico retorna ao leitor imediatamente.

### 10.3 Leitor EAN — produto desconhecido

Estado visual em etapas:

1. `Procurando EAN…`
2. `Encontrado no cadastro/XML/Bling` ou `Produto novo`
3. se necessário: `Tire uma foto da frente do produto`
4. `Identificando produto…`
5. `Cadastro preparado`
6. quantidade/gôndola/validade
7. `Salvo`

Sempre mostrar a fonte do dado em linguagem simples quando isso ajudar a conferência: `Bling`, `Nota de entrada`, `Foto`.

### 10.4 Erro recuperável

Se cadastro, imagem ou Bling falhar:

- não apagar o EAN;
- não perder quantidade/gôndola/validade já digitadas;
- persistir `inventory_unknown_eans`/estado do produto;
- oferecer `Tentar novamente`;
- permitir `Salvar cadastro pendente` quando o bloqueio for apenas comercial, não de identidade/estoque.

## 11. Estado de UI sugerido

Adicionar ao `state` do Admin apenas o necessário:

- `balanceSourceMode: 'scanner' | 'a4'`
- `balanceResolveState`
- `balanceProduct`
- `balanceQty`
- `balanceGondola`
- `balanceExpiration`
- `balancePhotoFile`
- `balanceBusy`
- `balanceHistory`

Evitar duplicar estados que já existem no módulo A4.

## 12. Observabilidade e auditoria

Registrar eventos operacionais para:

- `inventory.ean_resolved`
- `inventory.unknown_ean_seen`
- `inventory.product_auto_registered`
- `inventory.product_reactivated`
- `inventory.product_photo_uploaded`
- `inventory.balance_committed`
- `inventory.balance_stock_synced`
- `inventory.balance_sync_failed`

Cada evento inclui, quando aplicável:

- product_id;
- EAN;
- operador;
- fonte;
- quantidade anterior/contada;
- diferença;
- gôndola;
- validade;
- origem da identificação;
- ID do job Bling;
- estado de revisão.

## 13. Segurança e permissões

- todas as ações continuam exigindo sessão Admin válida;
- `viewer` não pode cadastrar, reativar nem alterar estoque;
- service role continua apenas no servidor;
- upload aceita somente JPEG/PNG/WebP e mantém limite de tamanho existente;
- não aceitar URL arbitrária de imagem do cliente para evitar SSRF;
- nenhuma função SQL privilegiada nova deve ser criada em `public` sem necessidade e sem revisão explícita de grants/RLS.

## 14. Idempotência

Casos obrigatórios:

- mesmo EAN lido duas vezes durante pesquisa;
- retry após timeout;
- dois funcionários lendo o mesmo EAN desconhecido;
- produto já criado no Bling, mas vínculo local ausente;
- job de estoque retornando estado incerto;
- releitura/correção da mesma contagem.

Chaves naturais:

- cadastro: `products.gtin` único;
- desconhecido: `inventory_unknown_eans.ean` único;
- Bling: lookup/vínculo exato por GTIN + idempotency key existente;
- stock write: chave contendo origem da contagem/count_id, não apenas quantidade.

Nunca repetir POST de estoque cegamente quando o primeiro resultado é incerto; primeiro consultar/verificar.

## 15. Testes obrigatórios

### 15.1 Backend unit/contract

- resolve produto ativo por GTIN;
- resolve produto inativo;
- resolve XML por commercial_gtin;
- resolve XML por tax_gtin;
- consolida NCM/custo sem sobrescrever dado melhor;
- lookup Bling exato;
- GTIN ausente cria unknown;
- corrida de criação resulta em um único produto;
- reativação de expirado com nova validade válida;
- produto incompleto não aparece na vitrine;
- preço zero não ativa produto;
- commit cria gôndola quando necessário;
- commit registra contagem;
- commit usa Bling como autoridade;
- retry é idempotente;
- diferença mantém revisão de causa;
- erro do Bling não é apresentado como sucesso.

### 15.2 Imagem

- upload real persiste original;
- arquivo inválido é rejeitado;
- imagem original fica disponível se padronização falhar;
- padronização concluída substitui `image_url`;
- produto não é duplicado enquanto imagem está processando.

### 15.3 Frontend

- scanner HID não abre teclado virtual;
- Enter conclui leitura;
- produto conhecido aparece imediatamente;
- desconhecido entra no fluxo de pesquisa/foto;
- formulário preserva dados após erro;
- `Salvar e ler próximo` volta ao scanner;
- leitura rápida não duplica submits;
- layout mobile 360/390/430 px;
- desktop continua funcional;
- A4 continua funcionando após unificação do commit.

### 15.4 Teste real de operação

Canário controlado:

1. EAN ativo conhecido;
2. EAN inativo conhecido;
3. EAN existente no Bling mas não local;
4. EAN presente em XML mas não local;
5. EAN completamente desconhecido + foto;
6. produto com estoque igual;
7. produto com diferença;
8. produto com validade vencida;
9. produto com múltiplos lotes;
10. duas leituras consecutivas rápidas.

Não usar cliente/pedido real para testar o balanço.

## 16. Rollout

### Etapa 1 — resolver/UX sem alterar estoque

- novo resolver de EAN;
- cadastro automático/provisório;
- foto;
- gôndola/validade;
- testes de contrato.

### Etapa 2 — commit canônico de balanço

- unificar scanner e A4 no mesmo serviço;
- estoque Bling com verificação;
- auditoria e reconciliação de diferenças.

### Etapa 3 — homologação física

- tablet Android;
- leitor Bluetooth/HID;
- leitor USB;
- sequência de 50–100 leituras;
- foto de produto novo;
- correção/retry.

## 17. Fora de escopo desta rodada

- alterar regras de pedidos;
- alterar Meta/PapoAI/WhatsApp;
- automação fiscal completa de NCM/CEST;
- inventar preços com pesquisa aberta na internet;
- apagar funções antigas durante a mesma mudança;
- novo cron de catálogo;
- refatoração ampla do Admin fora da tela de Balanço.

## 18. Critérios de aceite

A feature é considerada pronta quando:

1. nenhum EAN simplesmente termina em `product_not_found` sem opção de resolução;
2. produto conhecido ativo é contado em poucos toques;
3. produto conhecido inativo é saneado e reativado quando seguro;
4. produto ausente é pesquisado automaticamente nas fontes internas e Bling;
5. produto realmente novo pode ser cadastrado usando EAN + foto;
6. foto original nunca é perdida se IA falhar;
7. estoque oficial é escrito/verificado no Bling, não apenas no Supabase;
8. gôndola e validade são persistidas corretamente;
9. lotes não são corrompidos por uma validade global;
10. nenhum produto incompleto aparece no site com preço zero;
11. retries não geram produto duplicado nem dupla escrita de estoque;
12. scanner e A4 passam a obedecer à mesma regra de commit;
13. o funcionário consegue continuar para o próximo EAN sem esperar a imagem final da IA;
14. todo erro relevante fica recuperável e auditável.
