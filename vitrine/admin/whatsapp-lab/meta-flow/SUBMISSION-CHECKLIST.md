# Dona Antônia | WhatsApp Flow oficial — checklist de envio e go-live

**Estado verificado em 24/10/2026:** NÃO enviado à Meta. A conta do canal 1018 tem WABA e phone_number_id registrados no Supabase, mas estas conexões não oferecem uma operação autenticada para `POST /{waba-id}/flows`, carregar JSON do Flow, registrar endpoint e publicar. Não afirmar ID/status de publicação sem retorno oficial.

## Por que não publicar o protótipo estático
O arquivo `flow-quantity-prototype.json` contém 8 produtos ilustrativos, e a escolha entre 5 tamanhos/3 combinações não carrega dados reais. Publicá-lo agora criaria uma experiência comercial que não corresponde às cestas cadastradas.

## Checklist mínimo de versão operacional
- [x] Canal de homologação 1018 reconhecido no sistema
- [x] Protótipo em JSON v7.3 com escolha de tamanho, combinação e dropdowns de quantidade
- [x] Testes de integridade local do JSON
- [ ] Converter o JSON para modo dinâmico (`data_api_version: 3.0`, `data_exchange`, campos declarados em `screen.data`)
- [ ] Implementar endpoint HTTPS de Flow Data Exchange com criptografia obrigatória e chave pública do telefone configurada na Meta
- [ ] Validar de ponta a ponta o protocolo de inicialização, seleção de tamanho, combinação, retorno de opções e submissão
- [ ] Buscar do Supabase a composição efetiva das 15 alternativas, imagens permitidas, estoque e preços atuais, sem referências estáticas
- [ ] Permitir edição das quantidades por item e marcas em grupos navegáveis, respeitando o limite de componentes por tela
- [ ] Rodar cotação oficial depois de cada modificação e obrigatoriamente antes da confirmação
- [ ] Não registrar pedido enquanto o cliente não confirmar e passar na validação de dados mínimos
- [ ] Não exibir valores por item da cesta no resumo comercial (somente preço da cesta); extras podem ter preço individual
- [ ] Tratar indisponibilidade de item com alternativa, sem bloquear todos os produtos do tamanho
- [ ] Criar Flow na conta WABA Meta em estado DRAFT, obtendo ID real
- [ ] Fazer upload do arquivo, consultar erros de validação e corrigir até sucesso
- [ ] Homologar abertura e conclusão somente no número final 8360 via canal 1018
- [ ] Publicar Flow após validação, com ID + status PUBLISHED retornados pela Meta
- [ ] Implementar disparo controlado pela Central, persistir retorno `nfm_reply` e mapear pedido para Admin
- [ ] Revisar segurança, permissões, limitações de uso e monitorar falhas antes de habilitar para clientes

## Envio pela Meta
Referência oficial: https://developers.facebook.com/docs/whatsapp/flows
Coleção oficial Meta (Postman): https://www.postman.com/meta/whatsapp-business-platform/request/dxiu763/publish-flow
O ciclo Meta compreende criação do draft, upload de Flow JSON, configuração de endpoint/chave quando dinâmico, validação, publicação e envio de mensagem do tipo `interactive.flow`. Para editar estrutura após publicação, observar o ciclo de nova versão/clone conforme política vigente da Meta. **Alterar preço ou estoque não exige atualizar Flow publicado** quando todos os dados vêm do endpoint dinâmico.

## Prioridade de desenvolvimento
1. Contrato de dados: `home_size_cards`, `basket`, `basket_mold_options`, `basket_mold_quote`.
2. Data Exchange seguro e dados vinculados no Flow.
3. Testes de navegação/quantidade/alternativas.
4. Criação DRAFT na Meta e validação oficial.
5. Teste 1018→8360; publicação.
6. Integração com pedidos e ampliação gradual para clientes.

## Limites de decisão
Não utilizar a função de canário de mensagens de lista como transporte de Flow até validar suporte ao payload nativo `interactive.flow`. Não adaptar ou expor token Meta no frontend/GitHub. Não alterar atendimento ativo, webhook comercial, ANA ou banco de pedidos durante o pré-piloto.
