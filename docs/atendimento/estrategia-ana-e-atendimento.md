# Estratégia de atendimento da ANA

Data: 2026-10-06  
Escopo: atendimento WhatsApp do Admin da Dona Antônia, checkout assistido e automações de operação e marketing.

## Objetivo

Manter o atendimento humano no controle e usar a ANA para acolher, responder dúvidas seguras e encaminhar exceções. Gatilhos determinísticos cuidam de cadastro, etiquetas e avisos de pedido. A IA não altera cadastros, não cria pedidos e não decide consentimento.

## Jornada recomendada

1. Cliente inicia conversa no WhatsApp conectado ao Admin.
2. O sistema localiza a conversa por canal e telefone normalizado e associa o cadastro somente quando a correspondência for única. Em conflito ou duplicidade, deixa sem vínculo e pede escolha humana.
3. No primeiro contato do dia, a ANA cumprimenta com o primeiro nome somente se vier de um cadastro vinculado e confirmado. Sem nome confirmado, usa saudação neutra. A resposta pode oferecer o catálogo com link identificado, se a saudação for um cumprimento simples; reclamações, pedidos e perguntas mantêm prioridade.
4. O link de catálogo é individual, de curta duração e uso único. O número não é exposto no endereço. No checkout, o telefone pode ser preenchido e o cadastro existente localizado; o cliente ainda confirma os dados e o pedido.
5. Se o cliente preferir não usar o site, o atendente abre ou busca o cadastro na própria conversa. Nome é obrigatório; CPF/CNPJ, e-mail e endereço são opcionais no cadastro. Telefone vem da conversa e fica bloqueado para edição. Para concluir um pedido, o atendente confirma itens, quantidades, endereço/retirada, data, pagamento e total no fluxo operacional do Admin.

## Limites da ANA

- Pode acolher, esclarecer como navegar no catálogo e coletar uma intenção simples para o atendente.
- Só usa o nome quando obtido do cadastro vinculado. Não deduz gênero, nome ou dados sensíveis pelo telefone, foto ou jeito de escrever.
- Não confirma preço, estoque, entrega, pagamento ou pedido sem dados operacionais atuais apresentados pelo sistema.
- Não registra pedido, não muda cadastro, não solicita CPF/CNPJ ou endereço completo pelo chat e não declara uma ação concluída.
- Passa para atendimento humano em reclamação, cancelamento, troca, atraso, divergência de cadastro, dúvida sem informação confiável ou pedido explícito de pessoa.
- O atendente pode assumir ou devolver o controle da IA pelo estado da conversa já existente.

## Gatilhos e etiquetas

| Evento confiável | Ação automática | Controle |
|---|---|---|
| Pedido com data de entrega estruturada | Atualizar a etiqueta do dia da semana da conversa | Remover somente etiquetas automáticas antigas; preservar etiquetas manuais |
| Pedido recebido/preparado/ajustado | Enviar aviso transacional quando o evento e o template utility aprovado estiverem habilitados | Idempotência por pedido/evento; sem depender do PapoAI |
| Cliente pede autorização para ofertas | Registrar solicitação e enviar o template de consentimento aprovado | Somente na janela de atendimento; não inscrever sem resposta afirmativa |
| Cliente responde sim/não ou pede para parar | Atualizar o livro de consentimento | Opt-out imediato; campanhas só para consentimento atual |
| Interesse por categoria declarado ou compra de produto categorizado | Usar filtro por categoria/produto para segmentação | Interesse ou compra não substitui consentimento de marketing |
| Cadastro ambíguo/telefone conflitante | Não associar automaticamente; encaminhar para busca humana | Nunca criar vínculo por aproximação ambígua |
| Reclamação, exceção ou baixa confiança | Marcar necessidade humana e interromper resposta automática | Requer decisão do atendente |

Etiquetas de dia da semana ajudam a fila operacional. Etiquetas como `MULHER` não devem ser inferidas pela IA nem usadas como prova de consentimento ou preferência. Para marketing feminino, use interesse declarado ou categoria de produto efetivamente comprada, com consentimento vigente.

## Mensagens e templates Meta

Usar templates aprovados por finalidade e conta WhatsApp. Um template com variáveis serve para todos os clientes daquela finalidade; não se cria um por destinatário. Reaproveitar templates utility aprovados para eventos reais de pedido e o template MARKETING já aprovado para pedir autorização. A classificação deve acompanhar o conteúdo e o objetivo da mensagem: atualização de pedido permanece operacional; ofertas e campanhas dependem de opt-in verificável.

Mensagens livres de atendimento e automação de suporte ficam na janela de atendimento aberta pelo cliente. Fora dela, iniciar contato exige template aprovado. A automação sempre mantém caminho de transferência rápida para pessoa. Marketing só é disparado para clientes com consentimento registrado e respeita opt-out. Essas regras seguem a [política oficial do WhatsApp Business](https://business.whatsapp.com/policy/preview?lang=pt_BR).

## Gestão e evolução

- Uma fonte de conhecimento curta, revisada no repositório, para tom, catálogo, limites, encaminhamentos e perguntas frequentes. Preço, estoque e pedido vêm de dados atuais, nunca de memória do modelo.
- Revisar semanalmente métricas da ANA: respostas enviadas, handoffs, falhas, mensagens rejeitadas e avaliações humanas. Ajustar conhecimento com exemplos reais sem copiar dados pessoais.
- Manter a ANA em canário por canal e ampliar somente após observar conversas reais. Modo humano sempre vence modo IA.
- Acompanhar templates por conta, idioma, categoria, status de aprovação, finalidade e variáveis; não enviar mensagens de teste para clientes reais.

## Cadastro assistido sem site

O Admin já oferece cadastro e busca sem sair do atendimento. Use o telefone real da conversa como identificador, nome como campo obrigatório e documento como opcional. Busque antes de criar; se houver correspondências ambíguas, selecione manualmente. Endereço pode ser adicionado depois e deve ser confirmado pelo cliente antes de entrega. O pedido é criado pelo fluxo existente de orçamento/venda/pedido, com resumo final lido ao cliente e confirmação humana. A mensagem transacional de confirmação depende do evento de pedido confirmado, não da criação de um contato.

