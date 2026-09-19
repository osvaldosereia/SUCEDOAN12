# App Dona Antônia — Ações Humanas Finais

**Estado:** PROGRAMATICAMENTE ESGOTADO / NÃO HOMOLOGADO NATIVAMENTE / NÃO PUBLICADO

Este documento lista somente ações que exigem pessoa, credencial, console, quota, aparelho, toolchain ou decisão operacional. Não autoriza produção.

## 1. Runner e dependências
- instalar/restaurar dependências do `app-dona-antonia/` em runner confiável;
- executar a suíte, typecheck, isolamento e checks de efeitos de produção no HEAD final;
- guardar logs vinculados ao SHA; não declarar verde sem evidência real.

## 2. Android
- disponibilizar SDK/JDK/Gradle compatíveis;
- executar sync/build nativo e testes em aparelho/emulador real;
- validar permissões, lifecycle, teclado, back/deep links, offline/recovery, mídia e armazenamento seguro;
- validar assinatura/release somente com credenciais apropriadas;
- não publicar nem subir AAB/APK sem autorização explícita posterior.

## 3. iOS
- usar macOS/Xcode compatível;
- executar build/testes nativos em simulador e iPhone real;
- validar Keychain, permissões, universal/deep links, lifecycle, offline/recovery, mídia, VoiceOver e armazenamento seguro;
- validar assinatura/provisioning somente com credenciais apropriadas;
- não enviar IPA/TestFlight/App Store sem autorização explícita posterior.

## 4. Acessibilidade e UX reais
- testar 320 px/zoom 200%, teclado/foco, leitor de tela (TalkBack/VoiceOver), contraste, reduced motion e áreas de toque em browser/aparelhos reais;
- medir performance/bundle/runtime com artefato real e registrar evidências.

## 5. Backend HML
- resolver quota operacional sem apagar Edge Functions e sem aumentar plano/spend cap sem decisão humana explícita;
- revisar migrations/rollback e executar somente em HML autorizado;
- validar idempotência, rate limit, pairing, bootstrap/catalog/checkout e telemetria com fixtures `TEST-*`;
- não conectar produção nem dados reais.

## 6. Push, links, mídia e sessão
- validar FCM/APNs apenas em ambiente de homologação autorizado e com destinatários de teste;
- validar links nativos e associação de domínio sem apontar para fluxo real de clientes;
- validar Photo Picker/câmera/microfone, stripping EXIF efetivo e revogação de permissões;
- validar Keychain/Keystore e expiração/replay de sessão/pairing.

## 7. Stores e release
- revisar metadata, screenshots, privacy/Data Safety e informações de reviewer com dados de teste;
- gerar artefatos assinados somente quando houver autorização;
- Play Store, App Store e TestFlight permanecem proibidos nesta fase.

## 8. Integração/produção
Continuam fora desta conclusão autônoma: `comprar/`, pedidos reais, push real, Bling, Meta, PapoAI, logística, dados reais e qualquer executor externo. A ativação exige rodada/decisão humana futura fora do plano A1–A9.

## 9. Branch/PR
A branch está divergente de `main` e o PR #396 permanece Draft/não mergeável no checkpoint A9. Não fazer merge automático. Qualquer sincronização/rebase deve preservar trabalho paralelo e ser revisada por humano antes de alterar a história da branch.
