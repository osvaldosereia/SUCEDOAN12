# R17 — Flow de compra WhatsApp (Dona Antônia V2)

**Status:** desenho para execução isolada em branch; nenhuma publicação, envio Meta ou alteração em produção.
**Alvo:** exclusivamente `projetos/dona-antonia-v2/`.

## Intenção

Permitir que o cliente monte e confirme um pedido de cesta dentro do WhatsApp, usando dados atuais do catálogo e as regras de checkout da V2. A implementação usa a Inbox R11, o catálogo público e as RPCs transacionais de checkout já existentes. O Vitrine/Admin permanece apenas uma fonte de referência em leitura; nenhum código, tabela, função, segredo ou automação dele será usado como dependência.

## Estado encontrado

- R11 já tem Inbox, conversas e fila idempotente, mas a tela declara que a fila não chama Meta/WhatsApp.
- R12 grava eventos Utility em outbox, com contas desabilitadas por padrão; o estado remoto não tem transporte Meta, credenciais, worker ou envios.
- A V2 expõe `get_storefront_catalog` e já possui `quote_storefront_order` / `create_storefront_order`; o servidor calcula preço e valida estoque, endereço e regras comerciais.
- A V2 não tem endpoint WhatsApp Flow nem recepção do resultado `nfm_reply`.

## Objetivos e aceite

1. Abrir um Flow de compra pela conversa WhatsApp e carregar tamanhos, tipos, produtos e disponibilidade atuais da V2.
2. Revalidar preço, estoque, mínimo, entrega e pagamento no servidor; o Flow nunca é fonte de preço confiável.
3. Criar no máximo um pedido por envio concluído, reutilizando a chave idempotente da V2 e criando o pedido somente após a confirmação final do cliente.
4. Receber a resposta do Flow pelo webhook Meta, validar a assinatura e associá-la à conversa/conta correta.
5. Manter contas 0975 e 1018 isoladas, credenciais somente no backend e transporte desabilitado até a configuração segura.
6. Testar localmente/CI as rotas, criptografia, assinatura, validação e idempotência sem enviar mensagem real.

## Fora desta rodada

- Migração do atendimento legado, dados de clientes ou consentimentos.
- Ativar Meta, publicar Flow, enviar mensagens a clientes, alterar a audiência da prévia ou implantar funções em Supabase.
- Ana IA, campanhas promocionais e automações de marketing. São domínios separados e terão fases próprias; Utility não poderá ser usada para conteúdo promocional.

## Abordagens consideradas

| Abordagem | Vantagem | Custo/risco |
| --- | --- | --- |
| Flow dinâmico com endpoint V2 (escolhida) | Catálogo e regras atuais; preço/estoque são sempre revalidados no servidor. | Exige endpoint HTTPS, criptografia Meta, webhook e trabalho de integração. |
| Flow estático sem endpoint | Menos código e configuração. | Lista, preço e disponibilidade ficam defasados; corre risco de confirmar pedido inválido. |
| BSP externo | Pode acelerar a operação. | Nova dependência, custo e caminho de dados fora da arquitetura própria; não atende a preferência de independência. |

## Arquitetura escolhida

- JSON do Flow versionado no repositório, sem construtor visual genérico nesta rodada.
- Endpoint Meta em Supabase Edge Function, com `x-hub-signature-256`, RSA-OAEP/SHA-256 e AES-GCM conforme o protocolo oficial de Flows. Respostas e requests são tratados sem registrar dados descriptografados em logs.
- A tela dinâmica lê somente a projeção `get_storefront_catalog`. No envio final, o webhook converte campos permitidos para o contrato de checkout da V2 e chama `create_storefront_order`; o RPC recalcula tudo e aplica idempotência.
- O `flow_token` é aleatório e não contém telefone, nome ou pedido em claro. A chave de idempotência deriva desse token.
- A confirmação Utility segue pela outbox R12, sem ativar transporte nesta rodada.
- O adaptador de envio/gerenciamento fica preparado e desligado sem segredos; publicação de Flow e envio real são etapas posteriores.

## Decisões e limites

- Dados de catálogo e preço serão dinâmicos; por isso mudanças de produto/preço não precisam alterar o JSON do Flow. Alteração estrutural do Flow muda o estado publicado para rascunho e exige nova publicação.
- Uma resposta Flow nunca cria pedido a partir de total ou preço recebido do cliente.
- Mensagem iniciada pela empresa que abrir o Flow precisa respeitar o mecanismo oficial da Meta para Flow/template e a janela aplicável.
- Nenhum segredo Meta será escrito em frontend, banco público, arquivo versionado ou log.
- Nenhuma alteração será feita fora da V2 isolada; PR permanecerá draft e sem merge.

## Referências primárias

- [Meta — Flows API](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowsapi)
- [Meta — Implementing Flows endpoints](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint)
- [Meta — Sending a Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/sendingaflow)
- [Meta — Flow lifecycle](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/lifecycle)
- [Meta — Flow webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowswebhooks)
- [Meta — Official Flow examples](https://github.com/WhatsApp/WhatsApp-Flows-Tools)
- [Supabase — Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase — Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
