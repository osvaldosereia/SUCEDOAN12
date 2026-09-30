# PapoAI — Handoff para operação somente pelo site

**Data:** 2026-09-30

## Decisão operacional

- NÃO usar Flow para cadastro.
- NÃO montar carrinho nem criar pedido no WhatsApp/PapoAI.
- Pedidos de venda são registrados somente pelo site da Dona Antônia.
- Não usar funil, CRM operacional ou kanban para este fluxo.
- Não usar Make ou n8n.
- Manter atendimento humano quando necessário.

## Links oficiais

- Catálogo/pedido: https://donaantonia.com.br/
- Cadastro avulso: https://donaantonia.com.br/cadastro

O cadastro avulso serve para o cliente que não quer montar o pedido no site. Depois que ele se cadastrar, a equipe localiza o cliente pelo telefone e faz a venda pelo sistema, preservando estoque, pedido e integração Bling.

## Prompt final para executar no Work/PapoAI

Revise a conta PapoAI da Dona Antônia e simplifique o atendimento conforme as regras abaixo.

1. Desative as automações `cadastro 0975`, qualquer automação equivalente de cadastro/Flow e qualquer disparo que envie Flow para completar nome, CPF ou endereço. NÃO altere integrações não relacionadas a cadastro, atendimento básico ou marketing. NÃO envie mensagem de teste para cliente real.
2. NÃO usar Flow como substituto. Cadastro passa a ser feito pelo site.
3. Não usar funil, CRM operacional nem kanban.
4. Configure a ANA para respostas curtas, simples, naturais e em português do Brasil.
5. Para perguntas sobre cestas, produtos, preços ou ofertas, responda brevemente e direcione para https://donaantonia.com.br/.
6. Quando a pessoa disser que quer comprar, envie o site e diga que o pedido deve ser finalizado por lá para garantir preço, estoque e entrega corretos.
7. Se insistir em fazer o pedido diretamente no WhatsApp, explique com educação que os pedidos são registrados somente pelo site.
8. Se a pessoa não quiser montar o pedido no site, ofereça https://donaantonia.com.br/cadastro. Explique que ela faz apenas o cadastro e depois um atendente poderá fazer a venda pelo sistema usando o telefone dela.
9. Não montar carrinho, não criar pedido, não reservar estoque e não alterar pedido pelo PapoAI.
10. Mantenha encaminhamento para atendimento humano quando necessário.
11. Marketing: somente clientes com opt-in. Cada nova compra reinicia a contagem. Enviar mensagem de marketing 10 dias após a última compra usando recurso nativo do PapoAI. Fora da janela de 24h, usar somente template oficial Meta aprovado; preferir template com imagem/header de mídia e CTA para https://donaantonia.com.br/.
12. Se houver nova compra antes do disparo de marketing, cancelar/reiniciar a contagem de 10 dias. Se o cliente pedir para não receber marketing, interromper os próximos envios.
13. Use somente recursos nativos disponíveis na conta do PapoAI: automações, follow-up, campanhas, templates oficiais e mídia.
14. Antes de salvar, verifique os números 0975 e 1018 e garanta que não exista automação duplicada disparando a mesma mensagem/campanha.
15. Ao terminar, entregue relatório objetivo com: automações desativadas, automações criadas/alteradas, prompt final da ANA, template/campanha usado, regra de 10 dias, número(s) em que ficou ativo e qualquer limitação real encontrada.

## Respostas-base da ANA

**Quer comprar**
> Você consegue ver as cestas e fazer o pedido rapidinho pelo nosso site: https://donaantonia.com.br/ 😊

**Insiste em pedir pelo WhatsApp**
> Para garantir que preço, estoque e entrega fiquem certinhos, os pedidos são registrados pelo nosso site. É bem simples e rápido: https://donaantonia.com.br/

**Não quer montar o pedido no site**
> Sem problema. Faça só o seu cadastro aqui: https://donaantonia.com.br/cadastro. Depois conseguimos localizar você pelo WhatsApp e fazer a venda pelo nosso sistema.

## Critério de conclusão no PapoAI

- Flow de cadastro desativado.
- Nenhum pedido é criado pelo PapoAI.
- ANA direciona compras para o site.
- Cadastro avulso direciona para `/cadastro`.
- Marketing de 10 dias usa opt-in e template oficial Meta quando necessário.
- Nenhuma duplicidade entre 0975 e 1018.
