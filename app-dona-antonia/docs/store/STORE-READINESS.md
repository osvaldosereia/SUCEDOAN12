# App Dona Antônia — Store / Beta Readiness

**Estado:** DRAFT / HOMOLOGAÇÃO / NÃO PUBLICAR
**Data de revisão:** 18/09/2026

Este documento prepara a Rodada 24 sem abrir publicação, TestFlight externo, Play closed/open testing ou produção.

## Gate local

O código `src/platform/releaseReadiness.ts` impede tratar um beta interno como pronto se faltar:
- artefato nativo validado;
- armazenamento de sessão nativo validado;
- deep links nativos validados;
- revisão de segurança;
- revisão de privacidade;
- metadados de loja;
- manutenção de todos os efeitos reais OFF.

Neste checkpoint Android e iOS continuam bloqueados por ausência de artefatos nativos reais, portanto o resultado operacional atual é **NÃO PRONTO**.

## Google Play — pontos atuais relevantes

- A partir de 31/08/2026, novos apps e atualizações de apps comuns devem mirar Android 16 / API 36 ou superior.
- Compras de bens físicos, inclusive mantimentos, não usam Google Play Billing.
- A seção Data Safety deve refletir práticas reais do app e SDKs de terceiros.
- Apps exclusivamente na faixa de internal testing não precisam da seção Data Safety naquele estágio; isso não elimina a obrigação antes de tracks/publicação que a exijam.

Fontes oficiais:
- https://developer.android.com/google/play/requirements/target-sdk
- https://support.google.com/googleplay/android-developer/answer/10281818
- https://support.google.com/googleplay/android-developer/answer/10787469

## Apple / App Store — pontos atuais relevantes

- Bens físicos/serviços consumidos fora do app devem usar métodos de pagamento diferentes de In-App Purchase.
- App Store Connect exige Privacy Policy URL para iOS e declaração das práticas de coleta/uso de dados.
- TestFlight interno existe, mas nenhum build deve ser enviado antes de existir build iOS nativo realmente validado.
- Qualquer configuração de beta/publicação continua proibida neste checkpoint.

Fontes oficiais:
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers

## Artefatos de preparação já criados

- `APP-STORE-CHECKLIST.md`;
- `PLAY-STORE-CHECKLIST.md`;
- `REVIEW-PROFILE.md` com identidade exclusivamente `TEST-*`;
- gate automático `releaseReadiness.ts`;
- testes que exigem estado DRAFT/OFF e ausência de contato real no perfil de review.

Nenhum desses artefatos representa submissão ou criação de conta de loja.

## Bloqueios atuais da R24

- Android APK/AAB real inexistente;
- projeto/build iOS real inexistente;
- Keychain/Keystore reais não homologados;
- App Links/Universal Links nativos não homologados;
- push nativo não homologado;
- Photo Picker/câmera/microfone nativos não homologados;
- screenshots e metadados finais ainda não produzidos;
- Privacy/Data Safety finais só podem ser fechados após o comportamento real do build estar congelado.

## Regras

- não criar listing público;
- não enviar build;
- não convidar testers;
- não alterar produção;
- não ligar pedidos/push/executores reais;
- revalidar políticas oficiais imediatamente antes de submissão.
