# Dona Antônia Operations 2.0 — Balanço / Conferência de Estoque (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Requisito
A ferramenta de balanço é crítica para a operação.

Necessidade:
- tela mobile/tablet;
- uso rápido com leitor EAN;
- evitar abrir teclado virtual;
- mostrar produto lido;
- informar quantidade física;
- confirmar e voltar imediatamente para a próxima leitura;
- atualizar o saldo REAL, não somar/subtrair por engano;
- manter rastreabilidade;
- funcionar dentro da arquitetura Bling como fonte oficial de estoque.

## Estado atual da tela Dona Antônia
O Admin atual já possui uma boa UX de balanço:
- listener global para leitor EAN no modo teclado/HID;
- acumula dígitos e usa Enter para concluir a leitura;
- busca produto por GTIN;
- mostra nome, EAN, estoque atual e gôndola;
- teclado numérico próprio na tela;
- não depende do teclado virtual do tablet;
- botão "Confirmar e ler próximo";
- histórico das últimas contagens da sessão;
- integração com lista de faltas dos pedidos.

### Problema arquitetural atual
O backend atual `balance_confirm` faz:
- UPDATE direto em `products.stock`;
- define `last_counted_at`;
- define `physically_verified=true`.

Ele NÃO cria atualmente um lançamento de balanço no Bling e NÃO usa o Bling como fonte oficial.

Portanto:
**a UX atual é boa; a persistência atual não é adequada ao novo projeto.**

Se mantivermos essa tela, ela deve deixar de escrever saldo diretamente como verdade principal no Supabase.

## Função legada
A Edge Function `inventory-count-v2` ainda está implantada, mas está aposentada e retorna HTTP 410 `retired_outside_site_vitrine_admin`.

Não é a função ativa do balanço atual.
Pode ser removida em cleanup futuro depois dos gates, mas não durante a fase de análise.

## Capacidade nativa do Bling encontrada
Fonte oficial:
https://ajuda.bling.com.br/hc/pt-br/articles/360050781314-Confer%C3%AAncia-de-estoque-por-leitura-de-c%C3%B3digo

O Bling já possui **Estoque > Conferência de estoque**.

Recursos confirmados:
- leitura de código de barras ou SKU;
- uso recomendado pelo aplicativo Bling no celular;
- câmera do smartphone como leitor;
- escolha do depósito;
- quantidade por leitura;
- informar quantidade total e ler uma vez;
- ou ler cada unidade individualmente;
- mostra imagem;
- mostra localização;
- mostra quantidade lida;
- mostra estoque atual;
- mostra diferença;
- log de leituras;
- permite excluir leitura individual;
- gera lançamento do tipo Balanço;
- permite balanço apenas dos produtos conferidos;
- opcionalmente pode zerar os produtos ativos não lidos;
- pode sincronizar o saldo com lojas;
- pode imprimir relatório;
- sessão/histórico da conferência fica salvo na nuvem;
- Bling recomenda até 500 produtos por conferência.

### Significado para Dona Antônia
O Bling nativo já resolve quase exatamente o requisito funcional de balanço.

Isso é um forte argumento para NÃO manter um segundo motor de inventário se a experiência com nossos tablets/leitores for suficientemente rápida.

## Compatibilidade com leitor EAN externo
A documentação oficial confirma:
- código pode ser digitado e confirmado com Enter;
- câmera móvel pode ler código.

Ela não documenta explicitamente cada leitor Bluetooth/USB externo.

Um leitor configurado como teclado/HID normalmente envia os dígitos + Enter e tende a funcionar nos campos de leitura, mas isso precisa ser tratado como **POC**, não como fato homologado.

Testes obrigatórios com os leitores reais da Dona Antônia:
1. Tablet Android + Bluetooth/HID;
2. computador + USB;
3. velocidade de leitura;
4. foco permanece no campo;
5. Enter é reconhecido;
6. nenhuma abertura indesejada do teclado virtual;
7. sequência de 50-100 leituras sem perda.

## Risco da opção "Todos os produtos ativos"
No Bling, ao gerar balanço é possível escolher:
- apenas produtos conferidos;
- todos os produtos ativos.

A segunda opção zera produtos ativos que não foram lidos.

Para Dona Antônia:
**padrão sempre deve ser "Apenas produtos conferidos".**

A opção de zerar todos não deve fazer parte do fluxo normal de funcionário.
Somente Owner, em inventário total intencional, com confirmação reforçada.

## Estratégia recomendada

### Plano A — Preferido: usar Bling nativo
Se a POC for aprovada:
- Tablet abre diretamente `Estoque > Conferência de estoque`;
- usuário Bling restrito ao necessário;
- seleciona depósito Geral;
- lê EAN;
- informa quantidade ou multiplica leitura;
- ao final gera Balanço apenas dos itens conferidos;
- Bling registra lançamento oficial;
- webhook de estoque atualiza nosso espelho/site;
- Control Tower registra/mostra que houve balanço.

Benefícios:
- zero motor paralelo;
- histórico nativo;
- depósito correto;
- lançamento oficial;
- imagem/localização/diferença já prontas;
- sessão na nuvem;
- menos código;
- menos funções;
- menos risco de divergência.

### Plano B — Fallback: manter tela Dona Antônia ultrarrápida
Somente se o Bling nativo não tiver UX adequada com os leitores/tablets.

Nesse caso, preservar a UX atual, mas mudar a arquitetura:

EAN -> resolver produto/vínculo Bling -> consultar saldo Bling -> operador informa saldo físico -> POST de estoque Bling com operação `B` -> verificar saldo no Bling -> ledger -> webhook/espelho local.

O código do Hub atual já possui suporte a:
- leitura `/estoques/saldos`;
- POST `/estoques`;
- operação `B` para balanço;
- depósito selecionado;
- verificação pós-escrita;
- tratamento de mismatch/retry.

Portanto, se precisarmos do fallback, não é necessário inventar um novo protocolo de estoque.

## O que NÃO deve acontecer no projeto final
- balanço escrever apenas no Supabase;
- Supabase e Bling serem duas fontes independentes de saldo;
- cron para sincronizar balanço;
- funcionário informar entrada/saída quando intenção é saldo final;
- usar "Todos produtos ativos" no fluxo normal;
- repetir POST de estoque de forma cega se resultado for incerto;
- alterar estoque sem depósito explícito;
- perder histórico de quem/qual estação contou.

## Modelo de evento
Independentemente de Plano A ou B, o ledger deve receber evento conceitual:
- stock_count_started;
- stock_count_item;
- stock_balance_posted;
- stock_balance_verified;
- stock_balance_failed.

Campos:
- product_id interno;
- bling_product_id;
- EAN;
- depósito;
- saldo anterior;
- saldo contado;
- diferença;
- estação;
- operador quando identificado;
- origem: bling_native | dona_antonia_mobile;
- timestamp;
- referência do lançamento Bling.

Não precisamos guardar uma cópia completa do estoque; apenas trilha operacional.

## Relação com gôndola/prateleira
Bling nativo mostra localização se cadastrada.

Como hoje apenas parte dos produtos possui gôndola/prateleira, completar localização física passa a beneficiar:
1. picking;
2. balanço;
3. recebimento;
4. procura de produto;
5. relatórios.

Recomendação operacional:
fazer balanço por gôndola/prateleira, em lotes menores, em vez de tentar 1.600+ produtos numa única sessão.

## Balanço por gôndola — direção preferida
Exemplo:
- Gôndola 01 -> conferir itens -> gerar balanço apenas conferidos;
- Gôndola 02 -> nova sessão;
- etc.

Vantagens:
- menos risco de esquecer área;
- menos de 500 itens por sessão;
- localização pode ser saneada simultaneamente;
- fácil retomar;
- Control Tower mede cobertura da contagem.

## Cobertura de inventário
A Control Tower deve mostrar:
- produtos contados hoje;
- produtos contados últimos 7/30 dias;
- gôndolas concluídas;
- produtos nunca contados;
- grandes divergências;
- itens sem localização;
- itens sem GTIN;
- contagens com falha de sincronização.

## Fonte oficial
No projeto final:
**Bling = saldo físico oficial por depósito.**

Supabase/site:
- pode manter espelho/cache necessário à vitrine;
- recebe webhook/atualização;
- não decide o saldo oficial após balanço.

## Decisão provisória
1. NÃO remover a função Balanço do conceito do Admin.
2. Primeiro fazer POC do módulo nativo Bling com os leitores e tablets reais.
3. Se for rápido e simples, o botão "Balanço" do Admin pode apenas abrir/deep-linkar o módulo Bling, e a Control Tower acompanhar resultado.
4. Se não for adequado, preservar a excelente UX atual e trocar somente o backend para lançar Balanço no Bling.
5. Em ambos os casos, evitar banco paralelo e polling.

## Gates antes de implementar
1. confirmar depósito oficial (atualmente o Hub resolveu "Geral");
2. testar Conferência de Estoque Bling em tablet;
3. testar leitor Bluetooth/HID;
4. testar leitor USB em computador;
5. testar 100 leituras contínuas;
6. testar quantidade total + uma leitura;
7. testar sessão salva na nuvem;
8. testar geração apenas produtos conferidos;
9. conferir lançamento `Balanço` no histórico de estoque;
10. confirmar webhook stock refletindo no site;
11. comparar velocidade Bling nativo x tela Dona Antônia;
12. escolher Plano A ou Plano B com evidência.
