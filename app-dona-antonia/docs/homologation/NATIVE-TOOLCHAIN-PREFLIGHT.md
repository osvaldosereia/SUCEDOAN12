# Native Toolchain Preflight — App Dona Antônia

**Estado:** HOMOLOGAÇÃO / NÃO É BUILD NATIVO
**Data:** 18/09/2026

O preflight foi criado para impedir que R10/R11 sejam marcadas como concluídas sem toolchain real.

## Comandos

```bash
npm run native:preflight
npm run native:require:android
npm run native:require:ios
```

- `native:preflight` apenas relata o estado;
- `native:require:android` termina com erro enquanto os requisitos Android estiverem incompletos;
- `native:require:ios` termina com erro enquanto os requisitos iOS estiverem incompletos.

## Resultado observado no ambiente de validação

Disponível:
- Node 22.16.0;
- npm 10.9.2;
- Java 21.

Ausente/bloqueado:
- dependências Capacitor instaladas em `node_modules`;
- Android SDK configurado;
- ADB;
- Xcode.

Resultado:
- Android: `readyForNativeBuild=false`;
- iOS: `readyForNativeBuild=false`.

## Regra

Este preflight não substitui:
- `cap add android` / `cap add ios`;
- build Gradle/Xcode;
- APK/AAB/IPA;
- emulador;
- aparelho real;
- smoke test;
- teste de Keychain/Keystore/App Links/Universal Links.

Ele existe para **falhar fechado** e impedir homologação fictícia.
