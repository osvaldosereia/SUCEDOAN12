# Dona Antônia — Pedidos somente pelo site, cadastro próprio e PapoAI simplificado

**Data:** 2026-09-30

## 1. Objetivo

Eliminar o Flow do cadastro e tornar o site/Supabase a única origem operacional para cadastro e criação de pedidos. O WhatsApp/PapoAI passa a ser somente atendimento básico, direcionamento para o site, apoio a clientes que preferem atendimento humano e marketing pós-compra nativo do PapoAI.

## 2. Princípios fixos

- Nenhum novo pedido deve depender de Flow.
- Nenhum pedido de venda deve ser criado diretamente pelo PapoAI/WhatsApp.
- Todo pedido que altera estoque/venda nasce no site e usa o motor canônico já existente.
- O telefone é a chave prática de reconhecimento do cliente.
- O cliente pode se cadastrar sem comprar por um link próprio de cadastro.
- O cadastro avulso não cria pedido, não reserva estoque e não movimenta venda.
- Histórico antigo de Flow pode permanecer somente para auditoria; não será apagado nesta mudança.
- PapoAI não usará funil, CRM operacional nem kanban para este fluxo.
- Não usar Make ou outro orquestrador para o fluxo principal.

## 3. Identificação do cliente no site

### 3.1 Entrada vinda do WhatsApp

Manter o mecanismo atual de link/identidade que reconhece o telefone quando o cliente entra a partir do WhatsApp. Ao abrir o checkout, o site consulta automaticamente o cadastro pelo telefone.

### 3.2 Cliente encontrado

O checkout mostra de forma clara:

- nome;
- telefone;
- CPF/CNPJ quando disponível;
- endereço atual de entrega;
- botão **Confirmar este endereço**;
- botão **Alterar endereço**.

O cliente não deve redigitar dados válidos já cadastrados.

Se faltar algum dado obrigatório para o novo modelo, o checkout pede apenas o campo faltante antes de permitir finalizar.

## 4. Cliente novo no checkout

Se o telefone não localizar cadastro, o checkout abre um cadastro curto e obrigatório dentro da própria finalização.

### Campos obrigatórios

- Nome completo
- CPF (ou CNPJ quando aplicável)
- WhatsApp/telefone
- Rua/logradouro
- Número
- Bairro
- Cidade

### Campos opcionais

- Complemento
- Referência
- CEP

### Regras

- Cidade permitida para entrega: Cuiabá ou Várzea Grande.
- CPF/CNPJ deve passar pela validação já usada pelo backend.
- O telefone reconhecido pelo link deve vir preenchido e ser reaproveitado.
- Sem cadastro válido, o pedido não é criado.
- O cadastro é salvo antes/na mesma transação lógica da criação do pedido, evitando pedido órfão.

## 5. Link de cadastro avulso

Criar uma página pública específica, preferencialmente:

`https://donaantonia.com.br/cadastro`

Ela serve para o cliente que não quer fazer o pedido sozinho pelo site, mas aceita se cadastrar para que o atendente faça a venda depois.

### Comportamento

- Se houver identidade/telefone vindo de link personalizado do WhatsApp, preencher automaticamente o telefone.
- Se não houver, permitir digitar o WhatsApp.
- Usar os mesmos campos e as mesmas validações do cadastro do checkout.
- Não criar pedido.
- Não reservar estoque.
- Não alterar carrinho.
- Criar ou atualizar o mesmo cadastro canônico do cliente no Supabase.
- Após sucesso, mostrar: **Cadastro concluído. Agora a Dona Antônia já consegue localizar você pelo seu WhatsApp.**
- Opcionalmente oferecer botão **Ver cestas no site**.

### Link personalizado

Reaproveitar o mecanismo atual de identidade para permitir um link de cadastro com telefone reconhecido, sem expor o telefone na URL. O backend pode emitir um token/código curto específico para cadastro, usando a mesma infraestrutura segura de resolução de identidade já existente.

O PapoAI deve poder enviar esse link quando o cliente disser que não quer concluir o pedido pelo site, mas aceitar que o atendente faça a venda manualmente depois.

## 6. Venda manual pelo atendente

Depois que o cliente concluir o cadastro avulso:

- o atendente usa o site/admin com o telefone do cliente;
- o sistema encontra o cadastro canônico;
- a venda manual deve seguir o mesmo motor de pedido/estoque das vendas normais;
- nenhuma venda deve ser registrada apenas como mensagem no WhatsApp;
- estoque, pedido, cliente e integração Bling continuam coerentes.

## 7. Data de entrega no checkout

Alterar a regra atual de corte de 12h para **11h, horário de Cuiabá**.

### Regras

- Segunda a sábado: atendimento normal.
- Domingo: fechado.
- Feriados nacionais: fechado.
- Até 10:59:59, a primeira data possível pode ser o mesmo dia, se for dia aberto.
- A partir de 11:00:00, a primeira data possível é o próximo dia aberto.
- Se hoje estiver fechado, a primeira data possível é o próximo dia aberto.
- O cliente poderá escolher entre a primeira data possível e os **dois próximos dias de atendimento**, totalizando até três datas operacionais disponíveis.
- Dias fechados são pulados, não exibidos como opção.
- A data escolhida deve ser validada novamente no backend na criação do pedido.
- A data escolhida fica gravada no pedido/checkout snapshot e aparece no resumo enviado ao WhatsApp/admin.

## 8. Finalização do pedido

O botão final somente fica disponível quando:

- mínimo do pedido atingido;
- cadastro obrigatório válido;
- endereço confirmado;
- data de entrega escolhida;
- forma de pagamento escolhida;
- estoque ainda disponível.

Ao concluir:

1. backend valida novamente cadastro, estoque e data;
2. cria o pedido canônico;
3. vincula o cliente pelo telefone/customer_id;
4. grava endereço e data escolhida;
5. abre o WhatsApp apenas com o resumo do pedido já criado.

A mensagem enviada ao WhatsApp deixa de ter qualquer função de completar cadastro ou disparar Flow.

## 9. Desativação do Flow

### Supabase/backend

- Desativar gatilhos de processamento automático do Flow ligados ao cadastro.
- Desativar geração de intenções de outbound que pedem Flow para completar cadastro.
- Manter funções/tabelas históricas somente para compatibilidade/auditoria inicialmente.
- Para novos pedidos, `flow_required` não deve controlar o fluxo de compra.
- Novo pedido sem cadastro obrigatório completo deve ser recusado pelo checkout/backend.

### PapoAI

- Desativar/remover automações de cadastro que enviam Flow.
- Não criar outro Flow substituto.

## 10. PapoAI simplificado

O PapoAI deve atuar somente como recepção e orientação curta.

### Regras da ANA

- Respostas simples, curtas e naturais.
- Dúvidas sobre cestas/produtos: responder brevemente e direcionar ao site.
- Quando a pessoa quiser comprar: enviar o link do site e orientar a montar/finalizar o pedido por lá.
- Se insistir em fazer o pedido no WhatsApp: explicar educadamente que os pedidos são registrados somente pelo site para garantir preço, estoque e entrega corretos.
- Se a pessoa não quiser usar o site, mas quiser que um atendente faça o pedido: enviar o **link de cadastro avulso**. Depois do cadastro, um atendente pode fazer a venda pelo sistema usando o telefone do cliente.
- Não montar carrinho pelo PapoAI.
- Não criar pedido pelo PapoAI.
- Não usar Flow.
- Não depender de funil, CRM ou kanban.
- Permitir encaminhamento para humano quando necessário.

## 11. Marketing nativo do PapoAI

Objetivo: reengajamento após compra sem Make e sem rotina externa de marketing.

### Regras

- Apenas clientes com opt-in de marketing.
- Cada nova compra reinicia a contagem.
- Após **10 dias da última compra**, enviar uma mensagem de marketing.
- Fora da janela de 24 horas, usar somente template oficial previamente aprovado pela Meta.
- Preferir template com imagem/header de mídia quando o construtor do PapoAI permitir.
- CTA principal: voltar para `https://donaantonia.com.br/` e ver cestas/ofertas.
- Se o cliente pedir para não receber marketing, interromper novos envios.
- Usar somente recursos nativos disponíveis na conta do PapoAI (automações, follow-up, campanhas, templates oficiais e mídia). Não usar Make, n8n, CRM/funil/kanban para implementar a cadência.

### Estratégia nativa recomendada

No PapoAI, usar o evento/mensagem de pedido concluído que chega do site como sinal de nova compra quando essa informação estiver disponível para a automação nativa. A automação deve cancelar/reiniciar a cadência anterior e programar o contato de +10 dias. Se a interface atual do PapoAI oferecer um gatilho nativo melhor de “última compra” ou campo/data atualizável, preferir esse mecanismo.

A configuração final deve ser feita após inspeção da conta real para usar exatamente os recursos que a versão atual do PapoAI oferece, sem inventar campos ou recursos inexistentes.

## 12. Prompt para executar no Work/PapoAI

> Revise a conta PapoAI da Dona Antônia e simplifique o atendimento. NÃO use mais Flow. Desative/remova as automações de cadastro que enviam Flow, sem alterar integrações que não estejam relacionadas a cadastro/atendimento/marketing. Não use funil, CRM operacional nem kanban. Configure a ANA para atendimento básico, respostas curtas e simples. Para qualquer intenção de compra, cesta ou produtos, responda brevemente e direcione o cliente para https://donaantonia.com.br/. Se o cliente insistir em fazer pedido diretamente pelo WhatsApp, informe com educação que os pedidos são registrados somente pelo site para garantir estoque, preço e entrega corretos. Se o cliente não quiser fazer o pedido pelo site, ofereça o link de cadastro avulso da Dona Antônia; depois que ele se cadastrar, um atendente fará a venda pelo sistema usando o telefone. Não monte carrinho nem crie pedido pelo PapoAI. Mantenha opção de atendimento humano. Configure também uma automação nativa de marketing para clientes com opt-in: a cada nova compra, reinicie a contagem e, 10 dias após a última compra, envie template oficial Meta aprovado, preferencialmente com imagem/header de mídia e CTA para https://donaantonia.com.br/. Se houver nova compra antes do disparo, cancelar/reiniciar a contagem. Se o cliente pedir para não receber marketing, interromper os envios. Use somente recursos nativos disponíveis no PapoAI — automações, follow-up, campanhas, templates oficiais e mídia — sem Make, n8n ou outros sistemas. Antes de salvar qualquer automação, verifique para não criar disparos duplicados entre os números 0975 e 1018. Não envie mensagem de teste para cliente real. Ao terminar, entregue um relatório objetivo com: automações desativadas, automações criadas/alteradas, prompt final da ANA, template/campanha usada, gatilho de 10 dias e qualquer limitação real encontrada na conta.

## 13. Critérios de aceitação

1. Nenhum pedido novo depende de Flow.
2. Cliente vindo do WhatsApp é reconhecido pelo telefone quando o link possui identidade válida.
3. Cliente existente confirma/edita endereço sem refazer cadastro inteiro.
4. Cliente novo não consegue criar pedido sem os campos obrigatórios.
5. Existe cadastro avulso público sem criação de pedido.
6. Atendente consegue localizar o cliente cadastrado pelo telefone e fazer a venda pelo sistema.
7. Corte de entrega é 11h de Cuiabá.
8. Checkout oferece até três datas operacionais válidas: primeira possível + dois próximos dias abertos.
9. Domingo/feriado não aparece como data de entrega.
10. Pedido grava a data escolhida.
11. PapoAI não cria pedidos e não envia Flow.
12. Marketing de +10 dias usa recurso nativo do PapoAI, opt-in e template Meta fora da janela de 24h.
13. Não há automações duplicadas entre 0975 e 1018.
