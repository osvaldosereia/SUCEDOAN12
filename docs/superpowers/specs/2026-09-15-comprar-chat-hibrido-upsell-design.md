# Dona Antônia — Comprar em chat híbrido com upsell suave

Data: 2026-09-15
Status: design aprovado em conversa, aguardando revisão final do documento antes da implementação

## 1. Objetivo

Transformar o Comprar da Dona Antônia em uma experiência de atendimento comercial fluida, com linguagem de chat, sem imitar o WhatsApp e sem parecer uma loja virtual tradicional.

A pessoa vem principalmente de uma conversa no WhatsApp. Ao entrar no Comprar, deve sentir que continua sendo atendida pela Ana, mas agora com ferramentas visuais mais poderosas: grade de cestas, composição editável, vitrine de produtos, resumo do pedido, cadastro, endereço e pagamento.

O princípio central é:

**fala da Ana → ferramenta visual → ação do cliente → resumo da ação → próxima fala da Ana**

O atendimento não deve parecer um wizard de formulário, uma sequência de páginas ou um e-commerce comum.

## 2. Princípios de UX

1. **Chat primeiro.** A conversa organiza a experiência. Ferramentas aparecem dentro do fluxo, não como páginas independentes.
2. **Uma ação principal por momento.** Botão verde preenchido representa sempre o próximo passo mais importante.
3. **Ferramentas recolhem depois do uso.** Blocos grandes devem virar resumos compactos quando a etapa termina.
4. **Menos esforço cognitivo.** Evitar conteúdo escondido por carrossel quando a comparação lado a lado é melhor.
5. **Sem excesso de persuasão.** Upsell deve ajudar a completar a compra, nunca interromper ou pressionar.
6. **Checkout sem distrações.** Depois que o cliente inicia o fechamento, não existem novas ofertas.
7. **Mensagens operacionais determinísticas.** Frases como “Escolha sua cesta”, “Confira seu cadastro” e “Como deseja pagar?” vêm do front, sem custo de IA.
8. **IA apenas quando agrega.** Texto livre, áudio e foto continuam podendo usar inteligência do atendimento.
9. **Mobile-first.** O celular é a referência principal de layout e interação.
10. **Preservar regras comerciais atuais.** Backend, pedido, pagamento, sessão, Admin e integração WhatsApp não serão redesenhados nesta etapa, salvo o necessário para suportar a apresentação visual.

## 3. Linguagem visual

### 3.1 Identidade

Manter:
- verde escuro atual como cor principal;
- branco como fundo dominante;
- logo e identidade Dona Antônia;
- tipografia simples e legível;
- cantos arredondados moderados.

Reduzir:
- sombras profundas;
- caixas grandes dentro de caixas;
- bordas excessivas;
- numeração explícita de “Etapa 1, 2, 3”;
- botões grandes competindo entre si.

### 3.2 Papéis visuais dos controles

**Ação principal**
- fundo verde;
- uma por contexto;
- exemplos: “Quero esta cesta”, “Finalizar pedido”, “Confirmar e enviar pedido”.

**Ação secundária**
- fundo branco, borda leve;
- exemplos: “Voltar às cestas”, “Alterar”, “Ver composição”, “+ Produtos”.

**Chips de navegação/filtro**
- pequenos, leves, horizontais;
- exemplos: “Cestas Básicas”, “Para Você”, “Para Casa”, “Ofertas”, “Todos”, categorias e subcategorias.

**Controles utilitários**
- compactos;
- exemplos: +, −, ×, voltar.

## 4. Fluxo completo do atendimento

### 4.1 Entrada

A Ana apresenta uma mensagem curta de boas-vindas. Exemplo de intenção:

“Olá! Como posso ajudar na sua compra?”

Logo abaixo aparecem chips:
- Cestas Básicas
- Para Você
- Para Casa
- Ofertas

Esses chips funcionam como respostas rápidas da conversa, não como menu tradicional.

### 4.2 Escolha de cestas

Ao tocar em “Cestas Básicas”, a Ana apresenta uma frase curta e aparece uma **grade de duas colunas no celular**.

Cada cesta mostra:
- foto;
- nome;
- preço;
- botão “Ver produtos”.

Não usar carrossel horizontal para a seleção principal de cestas.

Motivo: a grade facilita comparação e não depende de o usuário perceber que há conteúdo escondido lateralmente.

### 4.3 Composição da cesta

Ao tocar “Ver produtos”:
- a grade de cestas deixa de ser o foco e pode ser recolhida;
- aparece um bloco maior dentro da conversa;
- mostra foto, nome, preço e composição;
- itens editáveis mantêm controles − quantidade + conforme as regras já existentes da cesta.

Ações no final:
- “Voltar às cestas” — secundária;
- “Quero esta cesta” — principal.

### 4.4 Confirmação da cesta

Depois de “Quero esta cesta”:
- a composição grande é recolhida;
- aparece uma confirmação curta no fluxo;
- a Ana responde algo equivalente a “Certo! Sua cesta já está no pedido. Quer acrescentar alguma coisa?”;
- a cesta vira um resumo compacto.

Resumo compacto da cesta:
- nome;
- quantidade de itens;
- valor;
- “Ver composição”;
- “Alterar”.

A lista completa de produtos não deve permanecer aberta durante o restante da compra.

### 4.5 Primeira oportunidade de upsell

Logo após confirmar a cesta, pode aparecer uma sugestão suave com até **4 produtos**.

Mensagem deve soar como ajuda, por exemplo:

“Separei algumas coisas que podem completar sua compra.”

Critérios possíveis, em ordem de relevância:
1. complemento da cesta;
2. item frequentemente comprado junto;
3. oferta relevante;
4. produto recorrente do histórico do cliente, quando disponível;
5. disponibilidade/estoque;
6. preço compatível com o pedido.

O cliente pode ignorar sem precisar responder “não”.

### 4.6 Produtos extras

A vitrine de produtos continua em **grade de duas colunas no celular**.

Cada produto mantém:
- foto;
- nome;
- marca/embalagem quando útil;
- preço;
- controle − quantidade +.

Categorias e subcategorias permanecem em chips horizontais compactos.

A paginação deve ser manual por **“Ver mais”**. Não usar carregamento automático por rolagem.

### 4.7 Barra inferior do pedido

Simplificar a barra fixa inferior.

Formato desejado:
- resumo: “29 itens · R$ 240,80”;
- ação principal: “Ver pedido”.

Opcionalmente pode existir “+ Produtos” de forma discreta, desde que não concorra visualmente com “Ver pedido”.

Evitar duplicar simultaneamente grandes botões de “Adicionar produtos”, “Ver pedido” e “Finalizar pedido”.

### 4.8 Ver pedido

Ao abrir o pedido, a Ana apresenta uma fala curta, por exemplo:

“Confira seu pedido antes de finalizar.”

O resumo mostra:
- cesta escolhida;
- produtos extras;
- total;
- possibilidade de expandir itens quando necessário.

Ação principal:
- “Finalizar pedido”.

### 4.9 Segunda e última oportunidade de upsell

Antes de iniciar o checkout pode aparecer uma última sugestão com no máximo **3 produtos de alta relevância**.

Exemplo de intenção:

“Antes de finalizar, tem algo que costuma faltar em casa?”

Regras:
- não repetir os mesmos produtos já sugeridos sem interação positiva;
- não sugerir item já presente em quantidade suficiente;
- priorizar baixo atrito e baixo valor relativo ao pedido;
- o cliente pode ignorar e finalizar imediatamente.

Ao tocar “Finalizar pedido”, **todo upsell é encerrado**.

## 5. Checkout conversacional

### 5.1 Identificação

Remover a sensação de “Etapa 1”.

A Ana pergunta o WhatsApp com DDD para localizar o cadastro.

Depois do telefone:
- se encontrar cliente, mostrar os dados imediatamente;
- se não encontrar, mostrar os mesmos campos vazios para preenchimento;
- nunca exibir CPF.

### 5.2 Cadastro e endereço

Mostrar em uma ferramenta única dentro da conversa:
- nome;
- WhatsApp;
- rua;
- número;
- bairro;
- complemento;
- referência;
- cidade;
- UF;
- CEP;
- endereços salvos quando houver;
- opção de localização quando disponível.

Os campos são editáveis.

### 5.3 Pagamento

A Ana pergunta de forma natural:

“Como você prefere pagar na entrega?”

Opções atuais:
- PIX;
- Cartão de crédito;
- Alimentação / refeição;
- Dinheiro.

A opção selecionada fica destacada em verde.

### 5.4 Confirmação final

Mostrar resumo curto:
- endereço;
- forma de pagamento;
- total.

Ação principal única:
- “Confirmar e enviar pedido”.

O comportamento de backend continua sendo:
1. salvar eventual atualização de cliente;
2. salvar eventual alteração de endereço;
3. salvar pagamento;
4. criar pedido e itens;
5. somente após confirmação de persistência abrir o WhatsApp da empresa;
6. fallback não pode duplicar pedido.

## 6. Ajuda integrada ao chat

O botão flutuante “Fechar ajuda” deixa de existir quando o composer estiver aberto.

Comportamento desejado:
- botão “Ajuda” abre o composer;
- composer contém texto, foto, áudio e envio;
- pequeno “×” dentro do próprio composer fecha a ajuda;
- nenhum botão deve ficar sobre outro;
- no checkout, a ajuda continua respeitando o modo já definido para não competir com o fechamento.

## 7. Sistema de blocos recolhíveis

Depois que uma decisão foi concluída, o bloco grande deve virar um resumo compacto.

Exemplos:
- grade de cestas → cesta escolhida;
- composição completa → “Cesta Grande · 18 itens · R$ X”;
- produtos extras → resumo de quantidade/valor;
- cadastro → resumo do endereço;
- pagamento → forma escolhida.

Objetivo: impedir uma timeline enorme com todos os controles antigos ainda abertos.

O cliente deve poder reabrir apenas quando fizer sentido (“Ver composição”, “Alterar”, “Ver itens”).

## 8. Motor de upsell suave

### 8.1 Objetivo

Aumentar o ticket médio sem prejudicar conversão, confiança ou fluidez.

### 8.2 Limites

- no máximo 2 intervenções de upsell por compra;
- primeira após escolha da cesta;
- segunda antes de “Finalizar pedido”;
- máximo 4 produtos na primeira;
- máximo 3 produtos na segunda;
- nenhuma oferta durante cadastro/endereço/pagamento;
- nenhuma interrupção obrigatória;
- nenhuma contagem regressiva, modal agressivo ou confirmação “não quero”.

### 8.3 Regras de elegibilidade

Produto sugerido deve estar:
- ativo;
- vendável;
- com estoque;
- com preço válido.

Excluir:
- produto já presente em quantidade suficiente;
- duplicação desnecessária;
- produto indisponível;
- sugestão sem relação clara quando houver opções melhores.

### 8.4 Pontuação inicial

O primeiro motor deve ser barato e previsível, baseado em regras/dados, não em chamada de IA a cada sugestão.

Pontuação conceitual:

`relevância de complemento + compra conjunta + oferta + histórico + estoque + adequação de preço - repetição - excesso de quantidade`

A arquitetura deve permitir evoluir depois para:
- histórico de compras do cliente;
- produtos comprados em conjunto;
- sazonalidade;
- margem;
- afinidade por categoria;
- inteligência de IA offline ou pré-calculada.

### 8.5 “Complete sua cesta”

Uma abordagem preferencial é sugerir categorias ausentes ou pouco representadas.

Exemplo:
- cesta forte em mercearia → sugerir limpeza/higiene;
- macarrão → molho;
- sabão em pó → amaciante;
- shampoo → condicionador.

Isso deve parecer assistência, não pressão de venda.

## 9. Componentes esperados

Sem definir ainda a implementação final de arquivos, o sistema visual deve ter componentes conceituais claros:

- mensagem da Ana;
- resposta/ação confirmada do cliente;
- chips de intenção;
- grade de cestas;
- editor de cesta;
- resumo compacto de cesta;
- micro-vitrine de upsell;
- grade de produtos;
- barra compacta do pedido;
- resumo do pedido;
- identificação por telefone;
- formulário de cadastro/endereço;
- seletor de pagamento;
- confirmação final;
- composer de ajuda integrado.

## 10. Estados e comportamento

### Carregamento

Usar estados locais e discretos. Não bloquear a tela inteira se apenas um produto está salvando.

### Erro

Erros devem aparecer próximos à ação que falhou, com linguagem simples.

### Pedido concluído

Depois da confirmação:
- o pedido antigo não permanece editável;
- a sala é marcada como encerrada;
- uma nova compra cria uma nova sala limpa;
- nunca reaproveitar token/carrinho de pedido já confirmado.

### Admin test mode

`admin_test=1` continua protegido e nunca cria pedido real nem abre WhatsApp real.

## 11. Preservações obrigatórias

Não alterar sem necessidade:
- regras comerciais de cesta;
- cálculo de total;
- estoque;
- endpoints que já funcionam, salvo adaptação estritamente necessária à UX;
- segurança do modo de teste;
- persistência de pedido;
- pagamento na entrega;
- WhatsApp final da empresa: +55 65 99815-0975;
- Admin de pedidos já implantado.

## 12. Critérios de aceitação visual e funcional

A implementação só será considerada pronta quando:

1. o atendimento parecer uma conversa contínua, não um wizard;
2. cestas forem comparáveis em grade de 2 colunas no celular;
3. “Ver produtos” abrir composição editável;
4. “Quero esta cesta” recolher composição para resumo compacto;
5. produtos extras permanecerem em grade com “Ver mais” manual;
6. barra inferior estiver simplificada;
7. checkout não usar numeração visual de etapas;
8. telefone encontrado mostrar cadastro/endereço no próprio fluxo;
9. pagamento aparecer no mesmo fechamento;
10. ajuda aberta não sobrepor botão/composer;
11. no máximo duas intervenções de upsell existirem;
12. upsell cessar completamente no início do checkout;
13. pedidos continuarem sendo gravados antes do WhatsApp;
14. Admin test continuar sem pedido real;
15. mobile de largura semelhante a iPhone 14 Pro estiver visualmente consistente;
16. desktop não quebrar a experiência, mantendo largura de chat controlada;
17. testes existentes de Comprar, checkout, Admin test e site público continuarem verdes.

## 13. Fora de escopo desta primeira implementação

Não incluir agora:
- IA generativa para escolher cada upsell em tempo real;
- programa de fidelidade;
- descontos dinâmicos individuais;
- gamificação;
- QR Code;
- novos meios de pagamento;
- mudança de backend fiscal;
- redesign completo do Admin;
- automação de pós-venda.

Esses itens podem evoluir depois sem mudar o conceito do chat híbrido.
