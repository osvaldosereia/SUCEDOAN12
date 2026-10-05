# SUCEDOAN12: atribuição Meta, rastreamento de carrinho e recuperação via WhatsApp

**Data:** 2026-10-05  
**Status:** proposta para revisão  
**Repositório:** `osvaldosereia/SUCEDOAN12`

## Objetivo

Permitir que a equipe identifique de onde vêm os contatos e pedidos, acompanhe carrinhos do site com consentimento e recupere carrinhos elegíveis por WhatsApp sem violar as regras de janela, template, opt-in e opt-out da Meta.

## Estado verificado

- O site Vitrine persiste o carrinho no navegador (`localStorage`); o backend só recebe os dados na finalização.
- A tabela `carts` representa sessões de carrinho ligadas a atendimento/conversa e não registra todo visitante do site.
- O webhook Meta atualmente não preserva a referência de anúncio (referral/CTWA) na mensagem canônica.
- O checkout já pede telefone e tem preferência `marketing_opt_in`; para novo cadastro, essa opção aparece marcada por padrão.
- `storefront-v2` recebe contexto de campanha no pedido, mas não armazena atualmente um histórico completo de atribuição do site.
- A ANA do Admin permanece em modo preview/dry-run; o atendimento em produção segue pelo fluxo PapoAI existente. Esta entrega não muda automaticamente o provedor do atendimento.

## Regras de produto e Meta

1. Carrinho abandonado é mensagem de Marketing, segundo a classificação publicada pela Meta.
2. Iniciar conversa no WhatsApp requer template aprovado. Respostas sem template podem ser enviadas na janela de 24h desde a última mensagem recebida do usuário.
3. A janela de entrada gratuita de 72h só pode ser marcada quando o evento/referral confirmar um ponto de entrada elegível (anúncio Click-to-WhatsApp ou CTA elegível da Página do Facebook); visitar o site ou clicar no botão comum de WhatsApp do site não basta.
4. O opt-in deve ser explícito, explicar que abrange recuperação de carrinho por WhatsApp e ser revogável. Respeitar opt-out global e por categoria.
5. A elegibilidade comercial, a janela e a categoria são dimensões separadas: janela aberta não transforma lembrete promocional em mensagem de serviço.
6. Não enviar automaticamente para contatos sem telefone válido, opt-in registrável, template aprovado quando necessário, nem para eventos/pedidos ambíguos.

## Desenho proposto

### A. Atribuição de conversas Meta

- Preservar o objeto `referral` recebido no webhook, inclusive `source_type`, `source_id`, URL, headline/body e `ctwa_clid`, no registro canônico ou em tabela relacionada.
- Registrar o evento bruto com IDs de mensagem e timestamps para auditoria/idempotência; não descartar dados de origem ao normalizar.
- Derivar `origin_type`, `service_window_expires_at` (última mensagem recebida + 24h) e `free_entry_window_expires_at` apenas a partir dos eventos confirmados.
- Mostrar no Admin a origem, anúncio/campanha quando identificável, hora da última mensagem e prazos. Exibir “origem desconhecida” quando não houver evidência, sem inferir.

### B. Eventos do site e associação do carrinho

- Preservar UTMs e identificadores de campanha disponíveis na visita e encaminhá-los ao backend com minimização e prazo de retenção definido.
- Registrar eventos `view_item`, `add_to_cart`, `remove_from_cart`, `begin_checkout`, `checkout_phone_captured`, `purchase` (pedido confirmado) com horário, sessão, IDs de produto/quantidade e valor necessário; evitar dados sensíveis.
- Manter carrinhos anônimos como sessão pseudônima. Associar a cliente apenas quando a pessoa informar telefone e consentir com a finalidade de mensagens.
- Fazer o backend reconciliar uma finalização de pedido com carrinho/eventos para cancelar a recuperação pendente e evitar duplicidade.
- Distinguir pedido criado, confirmado, cancelado e devolvido para atribuição; enviar conversão de compra somente no marco de negócio escolhido (pedido confirmado).

### C. Consentimento

- Alterar a opção nova para desmarcada por padrão, com texto específico: mensagens de ofertas e/ou recuperação de carrinho, com frequência/canal explicados.
- Salvar estado, finalidade/categoria, momento, origem/tela e versão do texto aceito; não sobrescrever evidência histórica nem considerar aceites antigos genéricos como consentimento para novo propósito sem revisão.
- Manter a revogação no Admin/canal e impedir novos envios a partir dela. Mensagens de opt-out devem atualizar estado idempotentemente.

### D. Recuperação de carrinho

- Criar fila/estado de recuperação com deduplicação por carrinho e telefone, janela de espera configurável e número máximo de tentativas.
- Antes de qualquer envio, revalidar pedido concluído, valor/estoque (se mostrado), opt-in, opt-out, qualidade do telefone, template aprovado, limites de frequência e janelas vigentes.
- Usar template de categoria MARKETING aprovado para mensagem proativa. Dentro das 24h, permitir conversa natural somente quando for resposta contextual real a uma mensagem do cliente; não classificar lembrete de carrinho como serviço.
- Registrar elegibilidade, categoria, template, origem, custo/categoria da Meta quando disponível, ID do provedor e resultados delivered/read/failed. Reagendar falhas de modo limitado e idempotente.
- Começar com modo de revisão no Admin (fila sem envio); ativação automática fica atrás de configuração explícita depois da homologação com número de teste.

### E. Inteligência do atendimento no Admin

- Expor contexto atribuído e de carrinho em cartão/resumo da conversa para ajudar ANA/agente a responder (produtos consultados/adicionados, campanha, consentimento e prazos).
- Manter o provedor de atendimento em produção inalterado nesta entrega; habilitar troca PapoAI → ANA apenas em rollout independente, com comparação em dry-run, critérios de qualidade, fallback e aprovação operacional.

### F. Medição Meta

- Após validar eventos próprios e consentimento, integrar Pixel e/ou Conversions API para eventos selecionados: `ViewContent`, `AddToCart`, `InitiateCheckout`, `Lead` e `Purchase` apenas quando confirmado.
- Usar deduplicação browser/server por `event_id`, dados mínimos e política de privacidade/consentimento compatível. Nunca enviar PII sem normalização/hash onde exigido pela Meta e sem base/aviso adequados.
- Comparar eventos reportados com pedidos canônicos antes de otimizar campanhas.

## Sequência de implantação

1. **Confiabilidade de origem:** parser/webhook, persistência e Admin para referral Meta; correção do opt-in pré-marcado.
2. **Atribuição do site:** captura UTM/referrer/session e reconciliação de eventos com pedidos.
3. **Recuperação em modo revisão:** fila, painel de elegibilidade, template aprovado e auditoria, sem disparo automático.
4. **Piloto controlado:** número interno/teste, métricas e limites; depois habilitar envio automático com chave operacional.
5. **Medição e IA:** Pixel/CAPI após consistência dos dados; contexto para ANA; eventual troca de PapoAI só em rollout separado.

## Critérios de aceite

- Conversa Meta de anúncio elegível aparece no Admin com referral persistido e prazo FEP correto; conversa sem referral não recebe janela de 72h inferida.
- Prazo de serviço deriva da mensagem inbound mais recente e se renova com nova mensagem do cliente.
- Carrinho com eventos e UTM pode ser retomado no backend; carrinho não associado não gera envio.
- Opt-in inicia desmarcado para novos cadastros e grava prova/versionamento; opt-out bloqueia novas mensagens.
- Pedido convertido cancela pendências; reprocessar webhook/evento não duplica conversa, evento nem envio.
- Modo de revisão não envia mensagens; piloto/automação só envia para elegível, com template de Marketing aprovado e registro completo.
- Eventos de compra enviados à Meta correspondem ao marco de pedido confirmado e são reconciliáveis com os dados próprios.
- ANA continua dry-run até uma entrega separada definir e validar o rollout de produção.

## Riscos e dependências

- Revisar textos de consentimento, política de privacidade, retenção de eventos e base legal conforme LGPD antes de ativar rastreamento identificável e marketing.
- Confirmar templates aprovados, situação da conta/número, disponibilidade de webhook e configuração de app Meta.
- A regra de preços da Meta muda; usar a política e rate card vigentes no momento de ativação. “72h grátis” significa sem tarifa Meta nos critérios publicados, não isenção de custo de mídia/anúncio nem taxa de BSP/parceiro.
- Proteger tabelas/filas com RLS/policies e manter credenciais Meta somente no servidor.

## Fontes oficiais consultadas

- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
- [WhatsApp Business Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/)
- [Marketing messages (inclui carrinho abandonado)](https://whatsappbusiness.com/products/conversation-categories/marketing/)
- [Coleções oficiais WhatsApp Business Platform da Meta](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Meta Blueprint: Pixel e Conversions API](https://www.facebookblueprint.com/student/path/211560-tracking-events-course)

