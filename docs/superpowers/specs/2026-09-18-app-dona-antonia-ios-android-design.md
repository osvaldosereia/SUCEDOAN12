# App Dona Antônia — iOS, Android e PWA — Design do Projeto

Data: 18/09/2026  
Status: projeto arquitetural para revisão antes da implementação  
Repositório: `osvaldosereia/SUCEDOAN12`  
Núcleo existente: `comprar/` + Supabase  
Nome de trabalho do app: **Dona Antônia**  
Bundle/Application ID proposto: `br.com.donaantonia.app`

## 1. Objetivo

Transformar o Chat Comprar atual em uma experiência de aplicativo instalável e publicável, mantendo uma única lógica comercial e um único backend.

O projeto deve entregar:

- Web atual em `donaantonia.com.br/comprar`;
- PWA instalável;
- aplicativo Android distribuído pelo Google Play;
- aplicativo iOS distribuído pela App Store;
- mesma fonte de verdade no Supabase;
- mesma regra de preços, estoque, cestas, checkout, clientes e pedidos;
- recursos nativos suficientes para que o aplicativo tenha utilidade própria e não seja apenas um site encapsulado;
- baixo custo operacional e mínimo uso de serviços pagos;
- implementação por etapas, sem interromper o Comprar atual.

O aplicativo será voltado inicialmente ao Brasil e continuará atendendo comercialmente **Cuiabá e Várzea Grande**. A loja de aplicativos não permite limitar a distribuição por cidade; portanto a disponibilidade inicial será Brasil e a área de entrega será validada pelo próprio sistema.

---

## 2. Estado atual analisado

O `comprar/` atual já oferece uma boa base:

- interface própria de atendimento em formato conversacional;
- fluxo de cestas;
- catálogo e busca;
- carrinho;
- checkout;
- persistência de pedidos;
- integração com Supabase Edge Functions;
- identificação oriunda do PapoAI por token opaco;
- recompra/histórico em evolução;
- foto e áudio no atendimento;
- desenho mobile-first;
- `viewport-fit=cover`;
- módulos independentes como `app.js`, `baskets.js`, `products.js`, `checkout.js`, `conversation.js`, `papo-identity-ui.js`, `repeat-purchase-v1.js` e `frequent-purchases-v1.js`.

O que ainda não existe no `comprar/`:

- manifesto PWA;
- service worker específico;
- shell nativo iOS;
- shell nativo Android;
- armazenamento seguro nativo de identidade;
- push notifications do app;
- Universal Links / Android App Links;
- central de privacidade do aplicativo;
- fluxo de vinculação segura de um aparelho a um cliente;
- projeto de publicação App Store / Google Play.

O repositório já possui experiências PWA em outros módulos, como `driver-app/`, então podemos aproveitar padrões internos sem misturar as responsabilidades.

---

## 3. Decisão arquitetural

### 3.1 Abordagem escolhida

Usar **Capacitor** como runtime nativo sobre o nosso front web existente.

Arquitetura:

```
                      ┌────────────────────────┐
                      │      Supabase          │
                      │ DB / Edge / Vault      │
                      │ clientes / pedidos     │
                      │ estoque / push / sessão│
                      └───────────┬────────────┘
                                  │ HTTPS
                  ┌───────────────┼────────────────┐
                  │               │                │
         ┌────────▼───────┐ ┌────▼──────────┐ ┌──▼──────────────┐
         │ Comprar Web    │ │ PWA           │ │ App Capacitor   │
         │ navegador      │ │ tela inicial  │ │ iOS + Android  │
         └────────────────┘ └───────────────┘ └─────────────────┘
```

Não criar React Native, Flutter, Swift e Kotlin separados nesta primeira versão.

### 3.2 Motivo

Capacitor permite inserir uma camada nativa em uma aplicação HTML/CSS/JavaScript existente e acessar recursos do aparelho quando necessário. Em setembro de 2026 a documentação oficial está na versão 8.

O objetivo é **uma base comercial compartilhada**, e não três sistemas independentes.

### 3.3 Regra importante de produção

O aplicativo de produção **não deve ser apenas um WebView apontando para `https://donaantonia.com.br/comprar`**.

Os assets de interface usados pelo app serão empacotados no binário. APIs, imagens, dados e configurações comerciais continuam remotos.

Em desenvolvimento/homologação poderá existir modo de live reload, mas não será a arquitetura de produção.

Isso reduz:

- risco de rejeição da Apple por "site reempacotado";
- tela branca caso o site esteja indisponível;
- inconsistência entre versão revisada pela loja e interface remota;
- risco de carregar conteúdo inesperado dentro do container.

---

## 4. Regras das lojas que influenciam diretamente o projeto

### 4.1 Apple — funcionalidade mínima

A regra 4.2 exige que o aplicativo ofereça recursos, conteúdo e interface mais sofisticados que um site reempacotado.

Portanto o app Dona Antônia terá valor nativo próprio no MVP:

1. identificação persistente e segura do aparelho;
2. acompanhamento de pedido;
3. notificações push transacionais;
4. histórico/recompra quando a identidade estiver verificada;
5. deep links que abrem diretamente cestas, ofertas ou pedidos;
6. câmera/foto e áudio integrados ao atendimento;
7. central de preferências e privacidade;
8. estado de rede e tratamento nativo de ausência de internet.

### 4.2 Apple — aplicativo deve funcionar sozinho

A Apple exige que o app funcione por conta própria e não obrigue a instalação de outro app.

Consequência:

- WhatsApp/PapoAI poderá **ajudar a reconhecer a cliente**, mas não poderá ser requisito para navegar ou comprar;
- visitante poderá comprar sem WhatsApp instalado;
- integração com WhatsApp será opcional;
- nunca bloquear o app porque o WhatsApp não está disponível.

### 4.3 Produtos físicos e pagamento

A Dona Antônia vende bens físicos.

Apple: bens/serviços utilizados fora do app devem usar meios diferentes do In-App Purchase.  
Google Play: mantimentos, roupas, artigos domésticos e outros bens físicos não usam Google Play Billing.

Portanto:

- não implementar Apple In-App Purchase;
- não implementar Google Play Billing;
- manter pagamento na entrega;
- PIX, dinheiro, cartão de crédito, alimentação/refeição continuam regras comerciais próprias;
- se futuramente houver pagamento online por PSP, continuará sendo compra de bem físico e poderá usar meios externos permitidos para esse tipo de transação.

### 4.4 Push notifications

Push não pode ser obrigatório para o app funcionar.

Separar duas finalidades:

**Transacional**
- pedido confirmado;
- pedido em separação;
- saiu para entrega;
- atualização relevante do pedido.

**Marketing**
- ofertas;
- recompra;
- campanhas;
- lembretes promocionais.

No iOS, marketing por push precisa de consentimento explícito dentro do app e mecanismo de cancelamento.

O sistema deverá guardar consentimentos separadamente:

- `push_transactional_enabled`;
- `push_marketing_opt_in`;
- `push_marketing_opt_in_at`;
- `push_marketing_opt_out_at`.

Não colocar CPF, endereço, forma de pagamento ou outro dado privado no texto visível da tela bloqueada.

Exemplo seguro:

> Seu pedido teve uma atualização. Toque para acompanhar.

### 4.5 Conta e exclusão

Apple e Google exigem recursos de exclusão quando o aplicativo oferece criação de conta.

Nossa decisão para V1:

- não obrigar criação de conta para navegar/comprar;
- visitante pode concluir uma compra;
- identidade persistente será opcional;
- mesmo assim disponibilizar uma **Central de Privacidade** e canal de solicitação de exclusão/correção;
- se a evolução passar a ser formalmente uma conta criada no app, ativar exclusão completa dentro do app e página web externa exigida pelo Google.

### 4.6 Login social

Não usar Google Login, Facebook Login ou outros logins sociais no MVP.

Assim evitamos dependência desnecessária e a regra Apple 4.8 de serviço equivalente de login.

### 4.7 Privacidade

A App Store exige URL pública de Política de Privacidade e declaração App Privacy.

O Google Play exige Política de Privacidade e formulário Segurança dos Dados.

Dados que o nosso projeto pode tratar e deverão ser declarados corretamente, conforme a versão publicada:

- nome;
- telefone;
- endereço;
- CPF/documento;
- histórico de compras;
- mensagens do atendimento;
- fotos enviadas;
- gravações de voz;
- identificador de cliente;
- identificador do dispositivo/sessão de app;
- token de push;
- interação com produtos se métricas forem coletadas;
- diagnósticos, se forem ativados.

Regra: declarar somente o que realmente existe, mas nunca omitir o que for coletado por SDK, plugin ou backend.

### 4.8 LGPD

O CPF, telefone, endereço e outros dados são dados pessoais segundo a LGPD.

O aplicativo precisa oferecer:

- política clara;
- finalidade da coleta;
- retenção;
- informação sobre compartilhamentos;
- canal para acesso/correção/exclusão quando aplicável;
- coleta mínima;
- proteção contra exposição;
- dados pessoais nunca em URLs;
- dados sensíveis/identificáveis nunca em logs desnecessários.

A exclusão de dados não pode apagar registros que a empresa tenha obrigação legal de conservar; a política deve informar as exceções de retenção.

### 4.9 Android 2026

Para nova publicação no Google Play após 31/08/2026, o app mobile deve segmentar **Android 16 / API 36 ou superior**.

Esse requisito deve ser tratado como gate de publicação.

### 4.10 Fotos e arquivos no Android

Não solicitar acesso amplo à biblioteca.

Para foto enviada no atendimento:

- câmera quando a cliente escolher tirar foto;
- seletor de fotos do próprio sistema para escolher imagem existente;
- não pedir `READ_MEDIA_IMAGES` de modo amplo se o Photo Picker resolver;
- não pedir `MANAGE_EXTERNAL_STORAGE`.

---

## 5. Conta de desenvolvedor e identidade da empresa

### 5.1 Recomendação

Publicar como **organização**, se a situação jurídica da Dona Antônia for aceita dessa forma pelas lojas.

Motivo:

- nome da pessoa jurídica aparece como vendedor na App Store;
- marca fica separada do nome pessoal do proprietário;
- melhor continuidade administrativa;
- equipe pode receber funções e acessos.

### 5.2 Apple

Para organização, a Apple exige:

- entidade jurídica reconhecida;
- D-U-N-S;
- autoridade para aceitar os contratos;
- e-mail corporativo;
- site público ativo.

Se a forma jurídica não for aceita como organização, será necessário avaliar inscrição individual; nesse caso o nome civil poderá aparecer como vendedor.

### 5.3 Google Play

Conta de organização também exige D-U-N-S e dados de verificação.

A conta pessoal criada depois de 13/11/2023 possui requisitos adicionais de teste antes de poder liberar produção. Por isso organização é preferível quando juridicamente possível.

### 5.4 Custos de conta

- Apple Developer Program: taxa anual vigente;
- Google Play Console: taxa única de registro vigente;
- sem contratação de Appflow/OneSignal no MVP.

Confirmar valores e requisitos novamente no momento do cadastro, pois podem mudar.

---

## 6. Identidade da cliente no aplicativo

### 6.1 Regra central

**Nunca liberar histórico de uma cliente apenas porque alguém digitou o número de telefone dela.**

Telefone é identificador comercial, não prova de posse.

### 6.2 Visitante

Sem identidade verificada:

- navegar;
- escolher cesta;
- adicionar produtos;
- checkout;
- fazer pedido;
- acompanhar o pedido recém-criado com token específico daquele pedido.

Não mostrar:

- histórico completo de outra pessoa;
- endereços antigos;
- recompra pessoal;
- dados cadastrais existentes.

### 6.3 Vinculação opcional via WhatsApp

Fluxo proposto e de baixo custo:

1. cliente toca **"Reconhecer meu cadastro"**;
2. app cria `pairing_challenge` no Supabase;
3. gera código curto e um segredo forte mantido no aparelho;
4. app oferece botão **"Confirmar pelo WhatsApp"**;
5. abre mensagem pré-preenchida para Dona Antônia, por exemplo: `Conectar meu aplicativo: ABC123`;
6. PapoAI/Meta entrega telefone real + mensagem ao nosso webhook;
7. Supabase encontra o challenge;
8. vincula o número verificado ao cliente;
9. app consulta o challenge usando o segredo privado;
10. Supabase troca o challenge por uma sessão de dispositivo;
11. sessão é guardada em armazenamento seguro nativo.

O WhatsApp é opcional. Se a cliente não tiver ou não quiser usar, continua como visitante.

### 6.4 Segurança do challenge

- TTL: 10 minutos;
- código humano nunca será suficiente para resgatar sessão;
- app mantém um segredo aleatório adicional de pelo menos 128 bits;
- challenge é uso único;
- webhook precisa ser autenticado;
- resposta nunca inclui CPF/endereço;
- auditoria de tentativas;
- rate limit;
- revogação após sucesso.

### 6.5 Sessão do dispositivo

Não guardar sessão persistente em `localStorage`.

Criar bridge nativa de armazenamento seguro:

- iOS: Keychain;
- Android: Keystore/armazenamento criptografado;
- web: manter estratégia atual de tokens opacos e sessão efêmera.

Servidor guarda somente hash do token persistente.

Sessão:

- revogável;
- vinculada ao dispositivo;
- expira por inatividade;
- pode ser derrubada pela cliente;
- nunca contém CPF/endereço dentro do token.

---

## 7. Estrutura de código proposta

Sem reescrever o Comprar inteiro.

```
comprar/
  ... núcleo web atual ...
  platform.js                 # detecção web/PWA/Capacitor
  app-links.js                # roteamento de links
  push-client.js              # interface única para push
  privacy-center.js           # preferências e direitos
  network-state.js            # online/offline

mobile/
  customer/
    package.json
    capacitor.config.ts
    www/                      # GERADO, não editado manualmente
    ios/
    android/
    native/
      secure-session/         # bridge de sessão segura

scripts/
  build-customer-mobile.mjs   # copia/valida assets do comprar
  test-customer-mobile-contract.mjs
```

Regra importante:

- `mobile/customer/www` não vira uma segunda fonte de verdade;
- é gerado a partir do `comprar/`;
- alterações de negócio continuam no núcleo;
- diferenças de plataforma ficam em adapters/bridges.

---

## 8. Build e atualização

### 8.1 Web

Deploy atual continua independente.

### 8.2 PWA

Usa o mesmo `comprar/`.

Service worker:

- cacheia somente assets estáticos seguros;
- nunca cacheia POST de API;
- nunca cacheia token de sessão;
- nunca cacheia URL contendo dados pessoais;
- catálogo/estoque/preço continuam network-first;
- sem internet: mostrar tela clara, sem aceitar pedido offline.

### 8.3 Apps

O build gera `mobile/customer/www` e depois executa sync do Capacitor.

Produção usa assets locais.

Configuração comercial continua remota no Supabase:

- recursos habilitados;
- textos dinâmicos;
- cestas;
- produtos;
- ofertas;
- status de manutenção;
- versão mínima suportada.

Não baixar JavaScript arbitrário para substituir o aplicativo já revisado pela loja.

---

## 9. Backend mobile no Supabase

Novas estruturas serão criadas somente quando a etapa correspondente for autorizada.

### 9.1 Tabelas previstas

`customer_app_devices`
- id;
- customer_id nullable;
- platform;
- device_public_id;
- session_hash;
- session_expires_at;
- app_version;
- revoked_at;
- created_at;
- last_seen_at.

`customer_app_pairing_challenges`
- id;
- public_code_hash;
- device_secret_hash;
- expires_at;
- phone_normalized nullable;
- customer_id nullable;
- verified_at;
- consumed_at;
- attempt_count.

`customer_app_push_tokens`
- id;
- device_id;
- provider;
- token_hash/secure token field;
- enabled;
- last_seen_at;
- invalidated_at.

`customer_notification_preferences`
- customer_id/device_id;
- transactional_enabled;
- marketing_enabled;
- marketing_opt_in_at;
- marketing_opt_out_at;
- updated_at.

`privacy_requests`
- id;
- customer_id nullable;
- request_type;
- status;
- requested_at;
- resolved_at;
- legal_retention_notes.

### 9.2 Edge Functions previstas

- `customer-app-bootstrap-v1`;
- `customer-app-pairing-v1`;
- `customer-app-session-v1`;
- `customer-app-order-access-v1`;
- `customer-app-push-register-v1`;
- `customer-app-notification-dispatch-v1`;
- `customer-app-privacy-v1`.

### 9.3 Regras

- `service_role` nunca entra no app;
- Vault para credenciais;
- RLS em todas as tabelas aplicáveis;
- funções server-side para operações sensíveis;
- idempotência em pairing, push e pedidos;
- logs sem CPF/endereço/áudio/foto;
- rate limits;
- origem permitida para web e Capacitor;
- somente HTTPS.

---

## 10. Push: tecnologia e custo

### Estratégia

Usar **Firebase Cloud Messaging (FCM)** como transporte de push.

Android:
- FCM direto.

iOS:
- FCM integrado ao APNs.

Servidor:
- Edge Function do Supabase chama FCM HTTP v1.

Não contratar OneSignal no MVP.

### Fluxo

```
pedido muda status
      ↓
outbox/evento Supabase
      ↓
notification-dispatch
      ↓
valida preferência
      ↓
FCM
   ↙     ↘
Android  APNs → iPhone
```

Tokens inválidos devem ser desativados automaticamente.

---

## 11. Deep links

Usar prioritariamente links HTTPS verificados.

Exemplos conceituais:

- `https://donaantonia.com.br/app/ofertas`
- `https://donaantonia.com.br/app/cestas/<slug>`
- `https://donaantonia.com.br/app/pedido/<token-opaco>`
- `https://donaantonia.com.br/app/conectar/<token-opaco>`

iOS:
- Associated Domains;
- Universal Links.

Android:
- intent filters;
- `assetlinks.json`;
- Android App Links.

Se app estiver instalado, abre o app.  
Se não estiver, cai na experiência web correspondente.

Nenhum link carrega CPF, telefone ou endereço.

---

## 12. Câmera, foto e áudio

### Foto

- solicitar câmera somente após ação explícita;
- permitir seletor do sistema;
- não ler a galeria inteira;
- comprimir antes do upload;
- remover metadados EXIF desnecessários quando possível;
- validar MIME/tamanho no servidor.

### Áudio

- pedir microfone apenas ao tocar em gravar;
- exibir estado visual claro de gravação;
- manter botão cancelar;
- limitar duração/tamanho;
- validar upload server-side.

A Apple exige indicadores/consentimento explícito para gravação.

---

## 13. Localização

**Não pedir localização no MVP.**

A cliente digita/seleciona endereço.

Motivos:

- menos permissões;
- menor risco de revisão;
- menos dados coletados;
- não é necessária para a função principal.

No futuro pode existir "usar minha localização" como recurso opcional, sempre com alternativa manual.

---

## 14. Recursos do App V1

### Essenciais para lançamento

1. Comprar conversacional;
2. cestas;
3. catálogo;
4. ofertas;
5. carrinho;
6. checkout;
7. acompanhamento do pedido atual;
8. push transacional;
9. identificação segura opcional;
10. histórico/recompra para cliente verificada;
11. deep links;
12. foto e áudio;
13. preferências de notificações;
14. central de privacidade;
15. suporte/contato;
16. tratamento de offline;
17. política e termos acessíveis dentro do app.

### Fora do V1

- pagamento digital dentro do app;
- geolocalização;
- mapa do entregador;
- App Clip;
- Android Instant App;
- login social;
- programa de pontos;
- carteira digital;
- assinatura;
- publicidade de terceiros;
- SDK de anúncios;
- tracking cross-app.

---

## 15. Experiência inicial

### Visitante

```
Abrir app
  ↓
Olá! Como posso ajudar?
  ↓
Cestas | Ofertas | Para Você | Para Casa
  ↓
Compra
  ↓
Checkout
  ↓
Pedido confirmado
  ↓
Acompanhar este pedido
```

### Cliente reconhecida

```
Abrir app
  ↓
Olá, Maria
  ↓
Repetir última cesta
Minha última compra
Cestas
Ofertas
Para Você
  ↓
Checkout simplificado
```

Nunca mostrar dado pessoal no primeiro frame antes de confirmar uma sessão segura válida.

---

## 16. Central de Privacidade

Tela própria:

**Privacidade e seus dados**

- Política de Privacidade;
- Termos;
- quais dados principais são usados;
- preferência de ofertas por push;
- acesso aos dados;
- corrigir cadastro;
- solicitar exclusão;
- desconectar este aparelho;
- revogar identificação deste dispositivo;
- contato de privacidade.

Para conta formal, o fluxo de exclusão deve cumprir tanto Apple quanto Google.

O Google exige também recurso web externo para exclusão quando existe criação de conta.

---

## 17. Analytics e rastreamento

### MVP

Não incluir:

- Facebook SDK;
- Google Ads SDK;
- IDFA;
- tracking entre apps/sites;
- SDK publicitário.

Métricas operacionais podem ficar no nosso Supabase:

- app_open;
- seção aberta;
- busca;
- cesta selecionada;
- checkout_started;
- checkout_completed;
- push_opened;
- reorder_started.

Não registrar texto livre de conversa em analytics.

Não registrar CPF/endereço/telefone como propriedade de evento.

Se dados de interação forem coletados e vinculados à cliente, declarar corretamente nas lojas.

---

## 18. Store metadata

### Nome

**Dona Antônia**

Alternativa se houver conflito na loja: **Dona Antônia Compras**.

### Descrição principal

Deixar explícito:

- compras de cestas básicas e produtos;
- entrega somente em Cuiabá e Várzea Grande;
- pagamento na entrega;
- app oficial da Dona Antônia.

### Região inicial

Brasil.

### Público

Não direcionado a crianças.

Responder questionários de classificação etária conforme o conteúdo real da versão.

### URLs obrigatórias

Preparar no domínio:

- política de privacidade;
- suporte;
- exclusão/privacidade;
- termos de uso.

---

## 19. Processo de revisão das lojas

### Apple

Preparar:

- App Store Connect;
- Bundle ID definitivo;
- certificados/assinatura;
- privacy labels;
- política;
- screenshots;
- descrição;
- contato de revisão em formato internacional;
- notas de revisão;
- instruções para testar checkout;
- dados fictícios para screenshots;
- cenário seguro para App Review criar um pedido sem gerar uma entrega real.

### Google Play

Preparar:

- organização/verificação;
- applicationId definitivo;
- App Bundle AAB;
- target API 36+;
- política;
- Segurança dos Dados;
- target audience;
- classificação de conteúdo;
- declaração de anúncios = não;
- instruções de acesso;
- fluxo de exclusão, quando aplicável;
- testes internos/fechados conforme tipo da conta.

### Perfil de teste de revisão

Criar cliente/pedido de teste controlado.

Regras:

- reconhecido apenas por credencial informada aos revisores;
- pedidos marcados `store_review_test=true`;
- nunca entram em separação, Bling, entrega ou automação real;
- produtos/cestas simulam comportamento real;
- sem dados de pessoa real.

---

## 20. Build, assinatura e CI/CD

### Regra de custo

Não criar pipeline caro que rode a cada commit.

### Inicial

- testes JS existentes continuam no CI normal;
- build mobile local/manual;
- Android Studio para Android;
- Xcode para iOS;
- release manual.

### Automação futura

Se necessária:

- workflow `workflow_dispatch`;
- nunca build iOS em todo push;
- GitHub Secrets para signing;
- ambientes separados de homologação/produção;
- nenhum certificado/chave no repositório.

Em setembro de 2026, Capacitor 8 requer Node 22+ e Xcode 26+ para iOS. Android deve ter SDK compatível e o app publicado agora precisa target API 36+.

---

## 21. Observabilidade e segurança operacional

Mínimo antes de produção:

- health de Edge Functions;
- contagem de erros por endpoint;
- taxa de checkout concluído;
- push enviado/entregue/invalidado;
- versão do app;
- sistema operacional;
- falha de deep link;
- falha de pairing;
- sessão revogada;
- kill switch server-side.

Não registrar conteúdo de áudio/foto nos logs.

### Runtime config

Prever configuração server-side:

- `mobile_app_enabled`;
- `mobile_pairing_enabled`;
- `mobile_push_transactional_enabled`;
- `mobile_push_marketing_enabled`;
- `minimum_supported_ios_version`;
- `minimum_supported_android_version`;
- `maintenance_message`.

---

## 22. Critérios de aprovação técnica do V1

O V1 só poderá ser submetido às lojas quando:

1. Comprar Web continuar funcionando sem regressão;
2. Android e iOS usarem a mesma regra comercial;
3. app funcionar sem WhatsApp;
4. nenhuma pessoa conseguir acessar histórico apenas digitando telefone;
5. sessão nativa não estiver em localStorage;
6. sem service role no binário;
7. PII não estiver em URLs;
8. target Android for API 36+;
9. política estiver pública e acessível no app;
10. Data Safety e App Privacy corresponderem ao comportamento real;
11. foto usar seletor/câmera sem acesso amplo desnecessário;
12. microfone for solicitado somente no momento de gravação;
13. push transacional funcionar sem conteúdo privado;
14. marketing push depender de opt-in explícito;
15. cliente conseguir revogar o aparelho;
16. fluxo de direitos/exclusão estiver disponível;
17. reviewer conseguir testar sem criar operação real;
18. app abrir e comprar sem localização;
19. app responder corretamente a offline/reconexão;
20. testes em aparelhos reais Android e iPhone estiverem aprovados.

---

# ROADMAP DE IMPLEMENTAÇÃO

A implementação deve ocorrer em etapas independentes. Nenhuma etapa deve ser iniciada automaticamente sem autorização.

## Etapa 0 — Preparação administrativa e compliance

Objetivo: remover bloqueios que não dependem de programação.

- confirmar pessoa jurídica que será usada;
- verificar/solicitar D-U-N-S;
- preparar conta Apple Developer;
- preparar conta Google Play de organização, se possível;
- reservar bundle/application ID;
- criar e-mails corporativos de suporte e privacidade;
- garantir site público ativo;
- definir URLs de política/suporte;
- inventariar todos os dados tratados no Comprar.

**Saída:** checklist administrativo pronto.

## Etapa 1 — Contrato multiplataforma do Comprar

Objetivo: preparar o código atual sem alterar a experiência da cliente.

- criar adapter de plataforma;
- definir interfaces web/PWA/native;
- identificar APIs incompatíveis com WebView;
- validar CORS;
- definir build dos assets;
- criar testes de contrato;
- não criar projeto nativo ainda.

**Saída:** Comprar continua igual, mas pode ser consumido por mais de uma plataforma.

## Etapa 2 — PWA segura

Objetivo: instalar o Comprar pela tela inicial antes das lojas.

- manifest;
- ícones;
- service worker;
- offline shell;
- cache apenas de assets;
- testes de instalação;
- política de atualização.

**Saída:** PWA funcional sem afetar checkout.

## Etapa 3 — Shell Capacitor Android

Objetivo: primeira execução nativa real.

- criar `mobile/customer`;
- Capacitor;
- Android project;
- assets locais;
- status/navigation;
- safe areas;
- external browser handling;
- API 36+;
- primeiro APK/AAB de homologação.

**Saída:** Comprar abre como app Android sem depender do site para o shell.

## Etapa 4 — Shell Capacitor iOS

Objetivo: equivalência no iPhone.

- projeto Xcode;
- safe areas;
- ATS;
- permissões básicas;
- navegação externa;
- build em aparelho real;
- TestFlight interno futuramente.

**Saída:** Comprar executa nativamente no iPhone.

## Etapa 5 — Segurança e sessão de dispositivo

Objetivo: criar identidade persistente segura.

- Secure Session bridge;
- tabelas de device session;
- bootstrap;
- revogação;
- expiração;
- testes de roubo/replay;
- nenhuma PII no aparelho.

**Saída:** dispositivo pode ter uma sessão segura sem localStorage.

## Etapa 6 — Vinculação opcional pelo WhatsApp

Objetivo: reconhecer cliente sem senha/SMS pago.

- pairing challenge;
- botão confirmar pelo WhatsApp;
- integração com webhook existente;
- vínculo telefone → cliente;
- exchange de sessão;
- timeout/retry;
- visitante continua funcionando.

**Saída:** cliente pode conectar cadastro com poucos toques.

## Etapa 7 — Deep Links

Objetivo: criar continuidade entre WhatsApp, web, campanhas e app.

- Universal Links;
- Android App Links;
- rotas;
- fallback web;
- pedido/oferta/cesta;
- segurança dos tokens.

**Saída:** links oficiais abrem o destino correto.

## Etapa 8 — Push transacional

Objetivo: acompanhamento real do pedido.

- FCM;
- APNs;
- registro de device tokens;
- Supabase dispatcher;
- eventos de pedido;
- abrir pedido ao tocar;
- invalidação de token;
- preferências.

**Saída:** pedido atualizado gera push seguro.

## Etapa 9 — Foto, áudio e permissões

Objetivo: experiência de atendimento equivalente/melhor que web.

- câmera;
- photo picker;
- microfone;
- gravação;
- compressão;
- uploads;
- disclosure/permissions;
- testes Android/iOS.

**Saída:** anexos funcionam nativamente sem permissões excessivas.

## Etapa 10 — Recursos exclusivos de app

Objetivo: aumentar utilidade e cumprir com folga a expectativa das lojas.

- acompanhamento de pedido;
- histórico verificado;
- repetir última cesta;
- preferências;
- estado de conexão;
- atalhos internos;
- home personalizada para cliente reconhecida.

**Saída:** aplicativo oferece utilidade além de um site encapsulado.

## Etapa 11 — Privacidade e direitos

Objetivo: fechar requisitos Apple, Google e LGPD.

- central de privacidade;
- política;
- preferências de push;
- revogar dispositivo;
- corrigir dados;
- solicitar acesso;
- solicitar exclusão;
- URL web de exclusão;
- retenções legais.

**Saída:** privacy compliance funcional.

## Etapa 12 — Marketing push opcional

Objetivo: somente depois de transacional estável.

- consentimento separado;
- opt-in explícito;
- opt-out;
- segmentação server-side;
- limites de frequência;
- não enviar sem autorização.

**Saída:** canal promocional controlado.

## Etapa 13 — Hardening e testes

Objetivo: preparar review.

Testar:

- Android atual;
- Android aparelho mais simples;
- iPhone atual;
- iPhone menor;
- rede lenta;
- perda de internet;
- app encerrado;
- app em background;
- token expirado;
- sessão revogada;
- carrinho;
- checkout;
- foto;
- áudio;
- push;
- deep link;
- atualização de versão;
- acessibilidade;
- fontes grandes;
- contraste;
- teclado;
- rotação se suportada.

**Saída:** checklist de release aprovado.

## Etapa 14 — Preparação das lojas

- ícone;
- splash;
- screenshots;
- descrição;
- política;
- suporte;
- classificação;
- App Privacy;
- Data Safety;
- review test profile;
- notas de revisão;
- AAB;
- archive iOS.

**Saída:** pacotes prontos para review.

## Etapa 15 — Beta

Android:
- internal testing;
- closed testing se exigido.

iOS:
- TestFlight interno;
- TestFlight externo se necessário.

Coletar somente bugs/telemetria necessária.

**Saída:** candidata a produção.

## Etapa 16 — Publicação controlada

- distribuição Brasil;
- lançamento gradual quando disponível;
- monitorar erros;
- manter web/WhatsApp como fallback;
- kill switch;
- rollback operacional.

**Saída:** Dona Antônia publicada.

## Etapa 17 — Pós-lançamento

Somente após estabilidade:

- painel do app no Admin;
- campanhas push;
- App Clip;
- localização opcional;
- mapa de entrega;
- biometria opcional;
- melhoria de offline;
- automação de release;
- novas integrações.

---

## 23. Ordem recomendada para começarmos

Primeira rodada de programação:

**Etapa 1 — contrato multiplataforma + auditoria de compatibilidade.**

Segunda:

**Etapa 2 — PWA.**

Terceira:

**Etapa 3 — Android shell.**

Isso permite validar a arquitetura com custo muito baixo antes de envolver certificados Apple, TestFlight e publicação.

A preparação administrativa da Etapa 0 pode ocorrer paralelamente porque D-U-N-S/verificação pode levar tempo.

---

## 24. Fontes oficiais pesquisadas em 18/09/2026

Apple:
- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/br/
- App privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- App availability: https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-for-your-app-on-the-app-store
- Apple Developer enrollment/D-U-N-S: https://developer.apple.com/br/help/account/membership/program-enrollment
- D-U-N-S: https://developer.apple.com/br/help/account/membership/D-U-N-S

Google:
- Play Console registration: https://support.google.com/googleplay/android-developer/answer/6112435?hl=pt-BR
- Organization account requirements: https://support.google.com/googleplay/android-developer/answer/13628312?hl=pt-BR
- Payments policy: https://support.google.com/googleplay/android-developer/answer/10281818?hl=pt-BR
- User Data: https://support.google.com/googleplay/android-developer/answer/10144311?hl=pt-BR
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469?hl=pt-BR
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111?hl=pt-BR
- Target API: https://support.google.com/googleplay/android-developer/answer/11926878?hl=pt-BR
- Photo/video permissions: https://support.google.com/googleplay/android-developer/answer/16585319?hl=pt-BR

Capacitor:
- Documentation v8: https://capacitorjs.com/docs
- Environment setup: https://capacitorjs.com/docs/getting-started/environment-setup

Brasil / ANPD:
- Titular de Dados: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados
- Perguntas Frequentes LGPD: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes

---

## 25. Decisões congeladas neste design

Até nova decisão explícita:

1. não criar app nativo do zero em Flutter/React Native;
2. usar Capacitor;
3. manter Supabase como backend;
4. não usar Make para novas funções do app;
5. não usar login social no V1;
6. não exigir WhatsApp;
7. não pedir geolocalização no V1;
8. não usar billing Apple/Google para os produtos físicos;
9. não usar SDK de anúncios;
10. não usar OneSignal no MVP;
11. não guardar sessão persistente em localStorage;
12. não liberar histórico por simples digitação de telefone;
13. não usar permissões amplas de galeria/arquivos;
14. não enviar marketing push sem opt-in explícito;
15. app de produção empacota a interface em vez de ser apenas URL remota;
16. publicação inicial somente Brasil;
17. área comercial continua Cuiabá e Várzea Grande;
18. implementação sempre em etapas pequenas e testáveis.
